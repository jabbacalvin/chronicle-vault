import ExifReader from "exifreader";

export function isGoogleDriveAuthorizationError(error) {
  const status = Number(error?.status ?? error?.statusCode ?? error?.response?.status);
  return status === 401 || /unauthorized|invalid credentials|invalid_grant|token.*expired/i.test(String(error?.message || error || ""));
}

function createDriveApiError(action, response) {
  const error = new Error(`${action}: Google Drive API error ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`);
  error.status = response.status;
  return error;
}

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
      throw createDriveApiError("Google Drive API error", res);
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

      if (!configRes.ok) {
        throw createDriveApiError("Could not read timeline-config.json", configRes);
      }

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
    const textFiles = files.filter(
      (f) =>
        f.name?.toLowerCase().endsWith(".txt") || f.mimeType === "text/plain",
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
          if (!binaryRes.ok) {
            throw createDriveApiError(`Could not fetch image ${file.name}`, binaryRes);
          }
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
          if (isGoogleDriveAuthorizationError(exifErr)) throw exifErr;
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
          memo: override.memo ?? override.note ?? "",
          note: override.memo ?? override.note ?? "",
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

    const textItems = await Promise.all(
      textFiles.map(async (file) => {
        const override = configData.overrides?.[file.id] || {};
        let fileText = "";

        try {
          const textRes = await fetch(
            `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
          if (!textRes.ok) {
            throw createDriveApiError(`Failed to fetch note ${file.name}`, textRes);
          }
          fileText = await textRes.text();
        } catch (textErr) {
          if (isGoogleDriveAuthorizationError(textErr)) throw textErr;
          console.warn(`Could not read text note ${file.name}:`, textErr);
        }

        const timestamp = override.customDate
          ? new Date(override.customDate).getTime()
          : new Date(file.createdTime).getTime();
        const d = new Date(timestamp);
        const memo = override.memo ?? override.note ?? fileText;

        return {
          id: file.id,
          fileId: file.id,
          type: "text_note",
          mimeType: "text/plain",
          groupId: override.groupId || null,
          title: override.title || file.name.replace(/\.txt$/i, ""),
          memo,
          note: memo,
          noteContent: memo,
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
          hasGps: false,
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

    // Membership is also recorded on each member override by Drive file ID.
    // This uses the same stable key as per-file title/date overrides and works
    // for every supported file type in the timeline.
    const configuredGroups = Array.isArray(configData.groups)
      ? configData.groups
      : [];
    const groupItems = configuredGroups.map((group) => {
      const timelineFileItems = [...items, ...textItems];
      const linkedFileIds = timelineFileItems
        .filter((item) => item.groupId === group.id)
        .map((item) => item.id);
      // Group membership uses Drive file IDs for all supported file types.
      const savedFileIds = Array.isArray(group.fileIds) ? group.fileIds : [];
      const availableFileIds = new Set(
        [...timelineFileItems, ...virtualItems].map((item) => item.id),
      );
      const savedVirtualIds = savedFileIds.filter((id) =>
        virtualItems.some((item) => item.id === id),
      );
      const fileIds = linkedFileIds.length
        ? [...new Set([...linkedFileIds, ...savedVirtualIds])]
        : [...new Set(savedFileIds.filter((id) => availableFileIds.has(id)))];
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
        fileIds,
      };
    });

    return {
      items: [...items, ...textItems, ...virtualItems, ...groupItems],
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
  onConfigFileId,
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
        throw createDriveApiError("Could not read existing config file", existingRes);
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
        throw createDriveApiError("Failed to update timeline-config.json", updateRes);
      }

      onConfigFileId?.(configFileId);
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
      throw createDriveApiError("Failed to create timeline-config.json", createRes);
    }

    const createdConfig = await createRes.json();
    if (createdConfig.id) onConfigFileId?.(createdConfig.id);
    return mergedConfig;
  } catch (err) {
    console.error("Error saving config to Drive:", err);
    throw err;
  }
}

export async function createTextNoteInDrive(
  accessToken,
  folderId,
  { title, content },
) {
  const noteTitle = String(title || "").trim();
  const noteContent = String(content || "");
  if (!noteTitle) throw new Error("A note title could not be generated.");
  if (!noteContent.trim()) throw new Error("Enter text for the note.");

  const safeBaseName = noteTitle
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  const fileName = `${safeBaseName || "Incident Note"}.txt`;
  const metadata = {
    name: fileName,
    mimeType: "text/plain",
    parents: [folderId],
  };
  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" }),
  );
  form.append(
    "file",
    new Blob([noteContent], { type: "text/plain" }),
    fileName,
  );

  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,createdTime",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    },
  );

  if (!response.ok) {
    throw createDriveApiError("Failed to save note to Google Drive", response);
  }

  return { ...(await response.json()), title: noteTitle };
}

export async function updateTextNoteInDrive(
  accessToken,
  fileId,
  { title, content },
) {
  const noteTitle = String(title || "").trim();
  if (!noteTitle) throw new Error("A note title could not be generated.");

  const safeBaseName = noteTitle
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  const fileName = `${safeBaseName || "Incident Note"}.txt`;
  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify({ name: fileName })], {
      type: "application/json",
    }),
  );
  form.append(
    "file",
    new Blob([String(content ?? "")], { type: "text/plain" }),
    fileName,
  );

  const response = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&fields=id,name,mimeType`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    },
  );

  if (!response.ok) {
    throw createDriveApiError("Failed to update text note in Google Drive", response);
  }

  return response.json();
}
