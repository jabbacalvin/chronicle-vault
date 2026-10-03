import ExifReader from "exifreader";

export async function loadDriveData(accessToken, folderId) {
  try {
    const query = `'${folderId}' in parents and trashed = false`;
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,webContentLink,thumbnailLink,imageMediaMetadata,createdTime)`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (!res.ok) {
      throw new Error(`Google Drive API error: ${res.statusText}`);
    }

    const data = await res.json();
    const files = data.files || [];

    const configFile = files.find((f) => f.name === "timeline-config.json");
    let configData = { overrides: {}, virtualEntries: [], groups: [] };

    if (configFile) {
      const configRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${configFile.id}?alt=media`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );

      if (configRes.ok) {
        const text = await configRes.text();
        if (text && text.trim().length > 0) {
          try {
            configData = {
              overrides: {},
              virtualEntries: [],
              groups: [],
              ...JSON.parse(text),
            };
          } catch (parseError) {
            console.warn(
              "Could not parse timeline-config.json, falling back to default configuration.",
              parseError,
            );
          }
        }
      }
    }

    const imageFiles = files.filter(
      (f) => f.mimeType && f.mimeType.startsWith("image/"),
    );

    // Process each image file asynchronously to extract robust EXIF data
    const items = await Promise.all(
      imageFiles.map(async (file) => {
        const metadata = file.imageMediaMetadata || {};
        const override = configData.overrides?.[file.id] || {};

        let exifTimestamp = null;
        let exifLat = null;
        let exifLng = null;

        try {
          // Fetch the actual image binary to read EXIF directly via ExifReader
          const binaryRes = await fetch(
            `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
            {
              headers: { Authorization: `Bearer ${accessToken}` },
            },
          );
          if (binaryRes.ok) {
            const blob = await binaryRes.blob();
            const arrayBuffer = await blob.arrayBuffer();
            const tags = ExifReader.load(arrayBuffer);

            // 1. Look for EXIF capture date tags
            const exifDateTag =
              tags["DateTimeOriginal"] ||
              tags["DateTime"] ||
              tags["DateTimeDigitized"];

            if (exifDateTag && exifDateTag.description) {
              // EXIF standard date format is "YYYY:MM:DD HH:MM:SS" -> convert to ISO "YYYY-MM-DD HH:MM:SS"
              const formattedString = exifDateTag.description.replace(
                /^(\d{4}):(\d{2}):(\d{2})/,
                "$1-$2-$3",
              );
              const parsed = new Date(formattedString).getTime();
              if (!isNaN(parsed)) {
                exifTimestamp = parsed;
              }
            }

            // 2. Look for EXIF GPS tags if Google metadata missed them
            if (tags["GPSLatitude"] && tags["GPSLongitude"]) {
              exifLat = tags["GPSLatitude"].description;
              exifLng = tags["GPSLongitude"].description;
            }
          }
        } catch (exifErr) {
          console.warn(
            `Could not extract local EXIF for ${file.name}:`,
            exifErr,
          );
        }

        // Priority order: User Override -> Local ExifReader -> Drive API metadata -> Created Time
        const timestamp = override.customDate
          ? new Date(override.customDate).getTime()
          : exifTimestamp
            ? exifTimestamp
            : metadata.time
              ? new Date(metadata.time).getTime()
              : new Date(file.createdTime).getTime();

        const latitude = metadata.location?.latitude || exifLat || null;
        const longitude = metadata.location?.longitude || exifLng || null;

        const d = new Date(timestamp);

        return {
          id: file.id,
          fileId: file.id, // Explicitly exposed for authenticated binary fetching
          groupId: override.groupId || null,
          title: override.title || file.name,
          timestamp,
          dateFormatted: d.toLocaleDateString([], {
            month: "short",
            day: "numeric",
            year: "numeric",
          }),
          timeFormatted: d.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          imageUrl: null, // Handled dynamically via authenticated blob fetch in the component
          latitude,
          longitude,
          hasGps: !!(latitude && longitude),
        };
      }),
    );

    const virtualItems = (configData.virtualEntries || []).map((entry, idx) => {
      const timestamp = new Date(entry.customDate).getTime();
      const d = new Date(timestamp);
      return {
        id: `virtual-${idx}`,
        fileId: null,
        title: entry.title,
        description: entry.description,
        timestamp,
        dateFormatted: d.toLocaleDateString([], {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
        timeFormatted: d.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        imageUrl: null,
        latitude: entry.latitude,
        longitude: entry.longitude,
        hasGps: !!(entry.latitude && entry.longitude),
      };
    });

    // Membership is also recorded on each photo override by Drive file ID.
    // This lets the loader reconstruct a group's members from the same stable
    // key used for per-photo title/date overrides.
    const configuredGroups = Array.isArray(configData.groups)
      ? configData.groups
      : [];
    const groupItems = configuredGroups.map((group) => {
      const linkedPhotoIds = items
        .filter((item) => item.groupId === group.id)
        .map((item) => item.id);
      const savedPhotoIds = Array.isArray(group.photoIds) ? group.photoIds : [];
      const availableItemIds = new Set(
        [...items, ...virtualItems].map((item) => item.id),
      );
      const savedVirtualIds = savedPhotoIds.filter((id) =>
        virtualItems.some((item) => item.id === id),
      );
      const photoIds = linkedPhotoIds.length
        ? [...new Set([...linkedPhotoIds, ...savedVirtualIds])]
        : [...new Set(savedPhotoIds.filter((id) => availableItemIds.has(id)))];
      const rawDate = group.customDate || group.timestamp;
      const parsedTimestamp = rawDate
        ? new Date(rawDate).getTime()
        : Date.now();
      const timestamp = Number.isFinite(parsedTimestamp)
        ? parsedTimestamp
        : Date.now();
      const d = new Date(timestamp);

      return {
        id: group.id,
        type: "event_group",
        title: group.title || "Milestone Event",
        note: group.note || group.memo || "",
        memo: group.memo || group.note || "",
        timestamp,
        dateFormatted: d.toLocaleDateString([], {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
        timeFormatted: d.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        photoIds,
      };
    });

    return {
      items: [...items, ...virtualItems, ...groupItems],
      configData,
      configFileId: configFile?.id,
    };
  } catch (err) {
    console.error("Error loading drive data:", err);
    throw err;
  }
}

export async function saveConfigToDrive(
  accessToken,
  folderId,
  configFileId,
  configData,
) {
  try {
    let mergedConfig = {
      overrides: {},
      virtualEntries: [],
      groups: [],
    };

    // -------------------------------------------------------------------------
    // If the config file already exists, load its current contents first.
    // This prevents existing data from being overwritten accidentally.
    // -------------------------------------------------------------------------
    if (configFileId) {
      const existingRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${configFileId}?alt=media`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (existingRes.ok) {
        const existingText = await existingRes.text();

        if (existingText && existingText.trim().length > 0) {
          try {
            const existingConfig = JSON.parse(existingText);

            mergedConfig = {
              ...existingConfig,

              // Preserve all existing overrides and merge in the new ones.
              overrides: {
                ...(existingConfig.overrides || {}),
                ...(configData.overrides || {}),
              },

              // Preserve existing virtual entries unless the caller
              // explicitly supplies a new virtualEntries array.
              virtualEntries:
                configData.virtualEntries !== undefined
                  ? configData.virtualEntries
                  : existingConfig.virtualEntries || [],

              // A supplied group list is a full snapshot, so membership
              // changes and deleted groups persist on the next reload.
              groups:
                configData.groups !== undefined
                  ? configData.groups
                  : existingConfig.groups || [],
            };
          } catch (parseError) {
            console.warn(
              "Could not parse existing timeline-config.json. Using new config data.",
              parseError,
            );

            mergedConfig = {
              ...mergedConfig,
              ...configData,
            };
          }
        } else {
          mergedConfig = {
            ...mergedConfig,
            ...configData,
          };
        }
      } else {
        throw new Error(
          `Could not read existing config file: ${existingRes.statusText}`,
        );
      }

      // -----------------------------------------------------------------------
      // Update the existing file with the merged configuration.
      // -----------------------------------------------------------------------
      const fileContent = JSON.stringify(mergedConfig, null, 2);

      const updateRes = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${configFileId}?uploadType=media`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: fileContent,
        },
      );

      if (!updateRes.ok) {
        throw new Error(
          `Failed to update timeline-config.json: ${updateRes.statusText}`,
        );
      }

      return mergedConfig;
    }

    // -------------------------------------------------------------------------
    // No config file exists yet, so create one.
    // -------------------------------------------------------------------------
    mergedConfig = {
      ...mergedConfig,
      ...configData,

      overrides: {
        ...(configData.overrides || {}),
      },

      virtualEntries: configData.virtualEntries || [],
      groups: configData.groups || [],
    };

    const fileContent = JSON.stringify(mergedConfig, null, 2);

    const fileMetadata = {
      name: "timeline-config.json",
      mimeType: "application/json",
      parents: [folderId],
    };

    const form = new FormData();

    form.append(
      "metadata",
      new Blob([JSON.stringify(fileMetadata)], {
        type: "application/json",
      }),
    );

    form.append(
      "file",
      new Blob([fileContent], {
        type: "application/json",
      }),
    );

    const createRes = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: form,
      },
    );

    if (!createRes.ok) {
      throw new Error(
        `Failed to create timeline-config.json: ${createRes.statusText}`,
      );
    }

    return mergedConfig;
  } catch (err) {
    console.error("Error saving config to Drive:", err);
    throw err;
  }
}
