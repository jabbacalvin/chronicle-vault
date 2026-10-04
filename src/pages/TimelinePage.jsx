// src/pages/TimelinePage.jsx
import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  Clock,
  MapPin,
  Image as ImageIcon,
  Edit3,
  Check,
  X,
  Layers,
  CheckSquare,
  FileText,
} from "lucide-react";
import { heicTo } from "heic-to";
import MapModal from "../components/map/MapModal";
import GroupModal from "../components/timeline/GroupModal";
import TextNoteModal from "../components/timeline/TextNoteModal";
import AppDialog from "../components/timeline/AppDialog";
import EvidenceViewerModal from "../components/timeline/EvidenceViewerModal";

const TIMELINE_DRAG_TYPE = "application/x-chronicle-vault-item";

const toDateTimeLocalValue = (timestamp) => {
  if (!Number.isFinite(Number(timestamp))) return "";

  const date = new Date(Number(timestamp));
  const localDate = new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000,
  );
  return localDate.toISOString().slice(0, 16);
};

export default function TimelinePage({
  images,
  isLoading,
  error,
  onSaveEdit,
  accessToken,
  onAddTextNote,
  onUpdateTextNote,
}) {
  const [selectedMapLocation, setSelectedMapLocation] = useState(null);

  // App-level notifications and confirmation dialogs
  const [appDialog, setAppDialog] = useState(null);

  // Modal Evidence Carousel State
  const [modalGroup, setModalGroup] = useState(null);
  const [activeImage, setActiveImage] = useState(null);
  const [isModalImageLoading, setIsModalImageLoading] = useState(false);

  // Individual item loading state for card buttons
  const [loadingItemId, setLoadingItemId] = useState(null);
  const [isUploadingNote, setIsUploadingNote] = useState(false);
  const [draggedItemId, setDraggedItemId] = useState(null);
  const [dropTargetGroupId, setDropTargetGroupId] = useState(null);
  const [dropIndicatorX, setDropIndicatorX] = useState(null);

  const [items, setItems] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editMemo, setEditMemo] = useState("");
  const [editDate, setEditDate] = useState("");

  // Separate edit state for the evidence viewer panel.
  const [isEditingModalDetails, setIsEditingModalDetails] = useState(false);
  const [isSavingModalDetails, setIsSavingModalDetails] = useState(false);
  const [modalEditTitle, setModalEditTitle] = useState("");
  const [modalEditMemo, setModalEditMemo] = useState("");
  const [modalEditDate, setModalEditDate] = useState("");
  const [modalEditError, setModalEditError] = useState("");
  const [isEditingModalGroup, setIsEditingModalGroup] = useState(false);
  const [isSavingModalGroup, setIsSavingModalGroup] = useState(false);
  const [modalGroupEditTitle, setModalGroupEditTitle] = useState("");
  const [modalGroupEditMemo, setModalGroupEditMemo] = useState("");
  const [modalGroupEditError, setModalGroupEditError] = useState("");

  // Grouping state
  const [isGroupingMode, setIsGroupingMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showTextNoteModal, setShowTextNoteModal] = useState(false);
  const [textNoteBeingEdited, setTextNoteBeingEdited] = useState(null);

  // Existing group selected as the destination for additional photos
  const [targetGroupId, setTargetGroupId] = useState(null);

  // Selection anchor for Shift-click
  const [selectionAnchorId, setSelectionAnchorId] = useState(null);

  const containerRef = useRef(null);
  const cardRefs = useRef({});
  const objectUrlsRef = useRef(new Set());

  // Image performance caches.
  // resolvedImageCacheRef prevents re-downloading/re-converting an image that
  // has already been viewed during this page session.
  // inFlightImageCacheRef prevents duplicate work when the same image is
  // requested while an earlier request is still loading/converting.
  const resolvedImageCacheRef = useRef(new Map());
  const inFlightImageCacheRef = useRef(new Map());

  // ---------------------------------------------------------------------------
  // Cleanup generated blob URLs on unmount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch (e) {
          // Ignore cleanup errors
        }
      });
      objectUrlsRef.current.clear();
      resolvedImageCacheRef.current.clear();
      inFlightImageCacheRef.current.clear();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Parse timeline dates safely
  // ---------------------------------------------------------------------------
  const parseItemDate = (rawTimestamp, rawDateString) => {
    let dateObj = null;

    if (rawTimestamp && !isNaN(Number(rawTimestamp))) {
      dateObj = new Date(Number(rawTimestamp));
    } else if (rawDateString) {
      dateObj = new Date(rawDateString);
    }

    if (!dateObj || isNaN(dateObj.getTime())) {
      dateObj = new Date();
    }

    return {
      timestamp: dateObj.getTime(),
      dateFormatted: dateObj.toLocaleDateString([], {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      timeFormatted: dateObj.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
  };

  // ---------------------------------------------------------------------------
  // Process incoming images without dropping original JSON attributes
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!images || images.length === 0) {
      setItems([]);
      return;
    }

    const processed = images.map((item) => {
      const parsed = parseItemDate(
        item.timestamp,
        item.dateFormatted || item.createdTime,
      );

      return {
        ...item,
        timestamp: parsed.timestamp,
        dateFormatted: item.dateFormatted || parsed.dateFormatted,
        timeFormatted: item.timeFormatted || parsed.timeFormatted,
      };
    });

    setItems(processed.sort((a, b) => a.timestamp - b.timestamp));
  }, [images]);

  // Compute display timeline by clustering grouped items
  const displayItems = useMemo(() => {
    return items
      .filter((item) => {
        if (item.type === "event_group") return true;

        const isGrouped = items.some(
          (g) => g.type === "event_group" && g.fileIds?.includes(item.id),
        );

        return !isGrouped;
      })
      .map((item) => {
        if (item.type === "event_group") {
          return {
            ...item,
            photos: items.filter((i) => item.fileIds?.includes(i.id)),
          };
        }

        return item;
      })
      .sort(
        (a, b) =>
          a.timestamp - b.timestamp || String(a.id).localeCompare(String(b.id)),
      );
  }, [items]);

  const selectedImages = useMemo(
    () =>
      selectedIds
        .map((id) => items.find((item) => item.id === id))
        .filter(Boolean)
        .sort(
          (a, b) =>
            a.timestamp - b.timestamp ||
            String(a.id).localeCompare(String(b.id)),
        ),
    [items, selectedIds],
  );
  const firstSelectedImage =
    selectedImages.find(
      (item) =>
        item.type !== "text_note" &&
        item.type !== "event_group" &&
        !String(item.id).startsWith("virtual-"),
    ) || null;
  const firstSelectedTimelineItem =
    selectedImages.find((item) => !String(item.id).startsWith("virtual-")) ||
    selectedImages[0] ||
    null;
  const groupAnchorItem = firstSelectedImage || firstSelectedTimelineItem;
  const groupDefaultTimestamp =
    firstSelectedImage?.timestamp ?? firstSelectedTimelineItem?.timestamp;
  const firstImageDateTime = firstSelectedImage
    ? toDateTimeLocalValue(firstSelectedImage.timestamp)
    : firstSelectedTimelineItem
      ? toDateTimeLocalValue(firstSelectedTimelineItem.timestamp)
      : "";

  // ---------------------------------------------------------------------------
  // Create and track blob URLs
  // ---------------------------------------------------------------------------
  const createTrackedObjectUrl = (blob) => {
    const url = URL.createObjectURL(blob);
    objectUrlsRef.current.add(url);
    return url;
  };

  // ---------------------------------------------------------------------------
  // Detect HEIC / HEIF format
  // ---------------------------------------------------------------------------
  const isHeicOrHeif = (item, blob) => {
    const fileName = (item.title || item.name || "").toLowerCase();
    const extension =
      item.fileExtension?.toLowerCase() || item.extension?.toLowerCase() || "";
    const mimeType = (blob?.type || "").toLowerCase();

    return (
      fileName.endsWith(".heic") ||
      fileName.endsWith(".heif") ||
      extension === "heic" ||
      extension === "heif" ||
      mimeType.includes("image/heic") ||
      mimeType.includes("image/heif") ||
      mimeType.includes("image/heic-sequence") ||
      mimeType.includes("image/heif-sequence")
    );
  };

  // ---------------------------------------------------------------------------
  // Convert HEIC/HEIF -> JPEG
  // ---------------------------------------------------------------------------
  const convertHeicToJpeg = async (blob) => {
    const converted = await heicTo({
      blob,
      type: "image/jpeg",
      quality: 0.82,
    });

    let jpegBlob = converted;

    if (Array.isArray(converted)) {
      jpegBlob = converted[0];
    }

    if (converted?.blob instanceof Blob) {
      jpegBlob = converted.blob;
    }

    if (!(jpegBlob instanceof Blob)) {
      throw new Error(
        "HEIC conversion completed but did not return a valid Blob.",
      );
    }

    return jpegBlob;
  };

  // ---------------------------------------------------------------------------
  // Fetch image source URL for an item
  // ---------------------------------------------------------------------------
  const getImageCacheKey = (item) =>
    String(item.fileId || item.id || item.imageUrl || item.thumbnailLink || "");

  const getThumbnailUrl = (item) => {
    if (!item?.thumbnailLink) return null;
    return item.thumbnailLink.replace(/=s\d+/, "=s2000");
  };

  // ---------------------------------------------------------------------------
  // Fetch/convert an image once, then reuse it for the rest of the page session.
  // ---------------------------------------------------------------------------
  const fetchItemImageUrl = async (item) => {
    const targetFileId = item.fileId || item.id;
    const cacheKey = getImageCacheKey(item);

    if (cacheKey && resolvedImageCacheRef.current.has(cacheKey)) {
      return resolvedImageCacheRef.current.get(cacheKey);
    }

    if (cacheKey && inFlightImageCacheRef.current.has(cacheKey)) {
      return inFlightImageCacheRef.current.get(cacheKey);
    }

    if (item.imageUrl) {
      if (cacheKey) resolvedImageCacheRef.current.set(cacheKey, item.imageUrl);
      return item.imageUrl;
    }

    if (!targetFileId) {
      const thumbnailUrl = getThumbnailUrl(item);
      if (thumbnailUrl && cacheKey) {
        resolvedImageCacheRef.current.set(cacheKey, thumbnailUrl);
      }
      return thumbnailUrl;
    }

    const loadPromise = (async () => {
      try {
        const res = await fetch(
          `https://www.googleapis.com/drive/v3/files/${targetFileId}?alt=media`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        );

        if (!res.ok) {
          throw new Error(`Failed to fetch file binary: ${res.status}`);
        }

        const blob = await res.blob();

        if (!blob || blob.size === 0) {
          throw new Error("Google Drive returned an empty file.");
        }

        let finalUrl;

        if (isHeicOrHeif(item, blob)) {
          try {
            const jpegBlob = await convertHeicToJpeg(blob);
            finalUrl = createTrackedObjectUrl(jpegBlob);
          } catch (heicError) {
            finalUrl =
              getThumbnailUrl(item) || item.webContentLink || item.webViewLink;

            if (!finalUrl) throw heicError;
          }
        } else {
          finalUrl = createTrackedObjectUrl(blob);
        }

        if (cacheKey) {
          resolvedImageCacheRef.current.set(cacheKey, finalUrl);
        }

        return finalUrl;
      } finally {
        if (cacheKey) {
          inFlightImageCacheRef.current.delete(cacheKey);
        }
      }
    })();

    if (cacheKey) {
      inFlightImageCacheRef.current.set(cacheKey, loadPromise);
    }

    return loadPromise;
  };

  // Warm an image in the background. Errors are intentionally ignored because
  // prefetching must never interrupt the currently visible evidence.
  const prefetchItemImage = (item) => {
    if (!item) return;

    const cacheKey = getImageCacheKey(item);
    if (
      cacheKey &&
      (resolvedImageCacheRef.current.has(cacheKey) ||
        inFlightImageCacheRef.current.has(cacheKey))
    ) {
      return;
    }

    fetchItemImageUrl(item).catch((err) => {
      console.debug("Evidence prefetch skipped:", err);
    });
  };

  const prefetchAdjacentPhotos = (photos, currentIndex) => {
    if (!photos || photos.length <= 1) return;

    const nextIndex = (currentIndex + 1) % photos.length;
    const previousIndex = (currentIndex - 1 + photos.length) % photos.length;

    prefetchItemImage(photos[nextIndex]);

    // Avoid kicking off two expensive HEIC conversions at exactly the same
    // moment. Queue the previous image after the browser gets a chance to paint.
    window.setTimeout(() => {
      prefetchItemImage(photos[previousIndex]);
    }, 250);
  };

  // ---------------------------------------------------------------------------
  // Open evidence viewer modal
  // ---------------------------------------------------------------------------
  const handleOpenEvidenceModal = async (item) => {
    setLoadingItemId(item.id);

    let photosToView = [];

    if (item.type === "event_group") {
      photosToView = item.photos && item.photos.length > 0 ? item.photos : [];
    } else {
      photosToView = [item];
    }

    if (photosToView.length === 0) {
      setAppDialog({
        type: "alert",
        title: "No evidence to view",
        message: "No photo evidence is attached to this entry.",
      });
      setLoadingItemId(null);
      return;
    }

    const isEventGroup = item.type === "event_group";
    setModalGroup({
      photos: photosToView,
      currentIndex: 0,
      groupId: isEventGroup ? item.id : null,
      groupTitle: item.title,
      groupMemo: isEventGroup ? item.memo || item.note || "" : "",
      isEventGroup,
    });

    if (photosToView[0].type === "text_note") {
      setActiveImage(null);
      setIsModalImageLoading(false);
      setLoadingItemId(null);
      return;
    }

    try {
      const firstPhoto = photosToView[0];
      const thumbnailUrl = getThumbnailUrl(firstPhoto);

      // Paint Google's already-generated preview immediately when available.
      // Full-resolution loading/HEIC conversion continues in the background.
      if (thumbnailUrl) {
        setActiveImage(thumbnailUrl);
        setIsModalImageLoading(false);
      } else {
        setIsModalImageLoading(true);
      }

      const url = await fetchItemImageUrl(firstPhoto);
      setActiveImage(url);

      // Prepare neighboring carousel images so navigation is usually instant.
      prefetchAdjacentPhotos(photosToView, 0);
    } catch (err) {
      console.error(err);
      setAppDialog({
        type: "alert",
        title: "Could not load evidence",
        message: "Failed to load photo evidence.",
      });
    } finally {
      setIsModalImageLoading(false);
      setLoadingItemId(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Navigate photos in Evidence Viewer Modal
  // ---------------------------------------------------------------------------
  const handleModalNavigate = async (newIndex) => {
    if (!modalGroup || !modalGroup.photos[newIndex]) return;

    setModalGroup((prev) => ({
      ...prev,
      currentIndex: newIndex,
    }));

    const targetPhoto = modalGroup.photos[newIndex];
    if (targetPhoto.type === "text_note") {
      setActiveImage(null);
      setIsModalImageLoading(false);
      return;
    }
    const cacheKey = getImageCacheKey(targetPhoto);
    const cachedUrl = cacheKey
      ? resolvedImageCacheRef.current.get(cacheKey)
      : null;
    const thumbnailUrl = getThumbnailUrl(targetPhoto);

    if (cachedUrl || thumbnailUrl) {
      setActiveImage(cachedUrl || thumbnailUrl);
      setIsModalImageLoading(false);
    } else {
      setIsModalImageLoading(true);
    }

    try {
      const url = await fetchItemImageUrl(targetPhoto);
      setActiveImage(url);
      prefetchAdjacentPhotos(modalGroup.photos, newIndex);
    } catch (err) {
      console.error("Failed to load evidence at index", newIndex, err);
    } finally {
      setIsModalImageLoading(false);
    }
  };

  const handleCloseModal = () => {
    setModalGroup(null);
    setActiveImage(null);
    setIsEditingModalDetails(false);
    setModalEditError("");
    setIsEditingModalGroup(false);
    setModalGroupEditError("");
  };

  const handleStartEditingModalDetails = () => {
    const photo = modalGroup?.photos?.[modalGroup.currentIndex];
    if (!photo || photo.type === "text_note") return;

    setModalEditTitle(photo.title || photo.name || "");
    setModalEditMemo(photo.memo || photo.note || "");
    setModalEditDate(toDateTimeLocalValue(photo.timestamp));
    setModalEditError("");
    setIsEditingModalDetails(true);
  };

  const handleStartEditingModalGroup = () => {
    if (!modalGroup?.isEventGroup) return;

    setModalGroupEditTitle(modalGroup.groupTitle || "");
    setModalGroupEditMemo(modalGroup.groupMemo || "");
    setModalGroupEditError("");
    setIsEditingModalGroup(true);
  };

  const handleCancelEditingModalGroup = () => {
    setIsEditingModalGroup(false);
    setModalGroupEditError("");
  };

  const handleSaveModalGroup = async (event) => {
    event.preventDefault();

    const group = items.find(
      (item) => item.id === modalGroup?.groupId && item.type === "event_group",
    );
    if (!group) {
      setModalGroupEditError("This group could not be found.");
      return;
    }

    const updatedGroup = {
      ...group,
      title: modalGroupEditTitle.trim() || group.title || "Untitled Group",
      memo: modalGroupEditMemo,
      note: modalGroupEditMemo,
      updatedRecently: true,
    };
    const updatedItems = items.map((item) =>
      item.id === group.id ? updatedGroup : item,
    );

    setIsSavingModalGroup(true);
    setModalGroupEditError("");
    setItems(updatedItems);
    setModalGroup((previous) =>
      previous
        ? {
            ...previous,
            groupTitle: updatedGroup.title,
            groupMemo: updatedGroup.memo,
          }
        : previous,
    );

    try {
      await onSaveEdit?.(updatedItems);
      setIsEditingModalGroup(false);
    } catch (saveError) {
      console.error("Failed to save group details:", saveError);
      setModalGroupEditError("Could not save these changes. Please try again.");
    } finally {
      setIsSavingModalGroup(false);
    }
  };

  const handleSaveModalDetails = async (event) => {
    event.preventDefault();

    const photo = modalGroup?.photos?.[modalGroup.currentIndex];
    if (!photo) return;

    const timestamp = modalEditDate
      ? new Date(modalEditDate).getTime()
      : Number(photo.timestamp);
    if (!Number.isFinite(timestamp)) {
      setModalEditError("Enter a valid date and time.");
      return;
    }

    const date = new Date(timestamp);
    const updatedPhoto = {
      ...photo,
      title: modalEditTitle.trim() || photo.title || photo.name,
      memo: modalEditMemo,
      note: modalEditMemo,
      timestamp,
      dateFormatted: date.toLocaleDateString([], {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      timeFormatted: date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      updatedRecently: true,
    };
    const updatedItems = items
      .map((item) => (item.id === photo.id ? updatedPhoto : item))
      .sort((a, b) => a.timestamp - b.timestamp);

    setIsSavingModalDetails(true);
    setModalEditError("");
    setItems(updatedItems);
    setModalGroup((previous) =>
      previous
        ? {
            ...previous,
            photos: previous.photos.map((item) =>
              item.id === photo.id ? updatedPhoto : item,
            ),
          }
        : previous,
    );

    try {
      await onSaveEdit?.(updatedItems);
      setIsEditingModalDetails(false);
    } catch (saveError) {
      console.error("Failed to save evidence details:", saveError);
      setModalEditError("Could not save these changes. Please try again.");
    } finally {
      setIsSavingModalDetails(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Handle Map Location Click
  // ---------------------------------------------------------------------------
  const handleOpenMapLocation = (gpsItems) => {
    if (!gpsItems || gpsItems.length === 0) return;

    if (gpsItems.length === 1) {
      const target = gpsItems[0];

      setSelectedMapLocation({
        lat: target.latitude,
        lng: target.longitude,
        title: target.title,
      });
    } else {
      setSelectedMapLocation({
        lat: gpsItems[0].latitude,
        lng: gpsItems[0].longitude,
        title: `${gpsItems.length} Locations (${gpsItems[0].title})`,
        locations: gpsItems.map((p) => ({
          lat: p.latitude,
          lng: p.longitude,
          title: p.title,
        })),
      });
    }
  };

  // ---------------------------------------------------------------------------
  // Save Group
  // ---------------------------------------------------------------------------
  const handleSaveGroup = (groupData) => {
    const fileIds = [...new Set(selectedIds)];
    const anchorId = groupAnchorItem
      ? String(groupAnchorItem.fileId || groupAnchorItem.id)
      : null;

    if (!anchorId) return;

    const selectedDateDiffersFromDefault =
      groupData.date && groupData.date !== firstImageDateTime;
    const customTimestamp = selectedDateDiffersFromDefault
      ? new Date(groupData.date).getTime()
      : groupDefaultTimestamp;
    const timestamp = Number.isFinite(customTimestamp)
      ? customTimestamp
      : Date.now();

    const newGroup = {
      // Anchor group identity to a stable member image key, never its filename.
      id: `group_${anchorId}`,
      type: "event_group",
      title: groupData.title || "Milestone Event",
      note: groupData.note || "",
      memo: groupData.note || "",
      timestamp,
      dateFormatted: new Date(timestamp).toLocaleDateString([], {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      timeFormatted: new Date(timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      fileIds,
      updatedRecently: true,
    };

    const updated = [...items, newGroup].sort(
      (a, b) => a.timestamp - b.timestamp,
    );

    setItems(updated);
    setIsGroupingMode(false);
    setSelectedIds([]);
    setSelectionAnchorId(null);
    setTargetGroupId(null);
    setShowGroupModal(false);

    if (onSaveEdit) {
      onSaveEdit(updated);
    }
  };

  // ---------------------------------------------------------------------------
  // Add selected photos to an existing group
  // ---------------------------------------------------------------------------
  const handleAddToExistingGroup = () => {
    if (!targetGroupId || selectedIds.length === 0) return;

    const updated = items
      .map((item) => {
        if (item.id !== targetGroupId) {
          return item;
        }

        const existingFileIds = item.fileIds || [];

        // Preserve all existing photos and append the newly selected photos.
        // Set() prevents accidental duplicate photo IDs.
        const mergedFileIds = [
          ...new Set([...existingFileIds, ...selectedIds]),
        ];

        return {
          ...item,
          fileIds: mergedFileIds,
          updatedRecently: true,
        };
      })
      .sort((a, b) => a.timestamp - b.timestamp);

    setItems(updated);
    setIsGroupingMode(false);
    setSelectedIds([]);
    setSelectionAnchorId(null);
    setTargetGroupId(null);

    if (onSaveEdit) {
      onSaveEdit(updated);
    }
  };

  // ---------------------------------------------------------------------------
  // Remove the current evidence from its group. If it was the last member,
  // remove the now-empty group so the evidence returns to the timeline alone.
  // ---------------------------------------------------------------------------
  const handleUngroupCurrentEvidence = async () => {
    const group = items.find(
      (item) =>
        item.id === modalGroup?.groupId && item.type === "event_group",
    );
    const photo = modalGroup?.photos?.[modalGroup.currentIndex];
    if (!group || !photo) return;

    const currentId = String(photo.id);
    const groupFileIds = Array.isArray(group.fileIds) ? group.fileIds : [];
    const remainingFileIds = groupFileIds.filter(
      (fileId) => String(fileId) !== currentId,
    );
    if (remainingFileIds.length === groupFileIds.length) return;

    const updatedItems = items
      .flatMap((item) => {
        if (item.id === group.id) {
          return remainingFileIds.length
            ? [{ ...item, fileIds: remainingFileIds, updatedRecently: true }]
            : [];
        }
        if (String(item.id) === currentId) {
          return [{ ...item, groupId: null, updatedRecently: true }];
        }
        return [item];
      })
      .sort((a, b) => a.timestamp - b.timestamp);

    setItems(updatedItems);
    handleCloseModal();
    try {
      await onSaveEdit?.(updatedItems);
    } catch (saveError) {
      console.error("Failed to save evidence ungrouping:", saveError);
    }
  };

  // ---------------------------------------------------------------------------
  // Remove every member from this group and delete the group record.
  // ---------------------------------------------------------------------------
  const performUngroupEntireGroup = async (groupId) => {
    const group = items.find(
      (item) => item.id === groupId && item.type === "event_group",
    );
    if (!group) return;

    const memberIds = new Set(
      (Array.isArray(group.fileIds) ? group.fileIds : []).map(String),
    );
    const updatedItems = items
      .filter((item) => item.id !== group.id)
      .map((item) =>
        memberIds.has(String(item.id))
          ? { ...item, groupId: null, updatedRecently: true }
          : item,
      )
      .sort((a, b) => a.timestamp - b.timestamp);

    setItems(updatedItems);
    if (modalGroup?.groupId === group.id) {
      handleCloseModal();
    }
    try {
      await onSaveEdit?.(updatedItems);
    } catch (saveError) {
      console.error("Failed to save group ungrouping:", saveError);
      setAppDialog({
        type: "alert",
        title: "Could not ungroup evidence",
        message: "The group could not be saved. Please try again.",
      });
    }
  };

  const handleUngroupEntireGroup = (groupId = modalGroup?.groupId) => {
    const group = items.find(
      (item) => item.id === groupId && item.type === "event_group",
    );
    if (!group) return;

    setAppDialog({
      type: "confirm",
      title: "Ungroup all evidence?",
      message: `Return all evidence from "${group.title || "this group"}" to the timeline and remove the group?`,
      confirmLabel: "Ungroup All",
      onConfirm: () => performUngroupEntireGroup(group.id),
    });
  };

  // ---------------------------------------------------------------------------
  // Select an existing group as the destination for selected photos
  // ---------------------------------------------------------------------------
  const selectTargetGroup = (groupId) => {
    if (!isGroupingMode) return;

    setTargetGroupId((prev) => (prev === groupId ? null : groupId));
  };

  const resetTimelineDrag = () => {
    setDraggedItemId(null);
    setDropTargetGroupId(null);
    setDropIndicatorX(null);
  };

  const handleTimelineDragStart = (item, event) => {
    if (isGroupingMode || editingId === item.id) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.setData(TIMELINE_DRAG_TYPE, String(item.id));
    event.dataTransfer.effectAllowed = "move";
    setDraggedItemId(String(item.id));
  };

  const handleTimelineDragEnd = () => {
    resetTimelineDrag();
  };

  const handleTimelineDragOver = (event) => {
    if (!Array.from(event.dataTransfer.types).includes(TIMELINE_DRAG_TYPE)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const container = containerRef.current;
    if (container) {
      const bounds = container.getBoundingClientRect();
      setDropIndicatorX(
        event.clientX - bounds.left + container.scrollLeft,
      );
    }
  };

  const handleTimelineDragLeave = (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setDropIndicatorX(null);
      setDropTargetGroupId(null);
    }
  };

  const handleGroupDragOver = (item, event) => {
    if (item.type !== "event_group" || !draggedItemId) return;

    const draggedItem = items.find(
      (candidate) => String(candidate.id) === String(draggedItemId),
    );
    if (
      !draggedItem ||
      draggedItem.type === "event_group" ||
      String(draggedItem.id) === String(item.id)
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setDropTargetGroupId(item.id);
    setDropIndicatorX(null);
  };

  const handleGroupDrop = async (groupId, event) => {
    const draggedId = event.dataTransfer.getData(TIMELINE_DRAG_TYPE);
    const draggedItem = items.find(
      (candidate) => String(candidate.id) === String(draggedId),
    );
    const group = items.find(
      (candidate) =>
        String(candidate.id) === String(groupId) &&
        candidate.type === "event_group",
    );

    if (!draggedItem || draggedItem.type === "event_group" || !group) return;

    event.preventDefault();
    event.stopPropagation();
    const existingFileIds = Array.isArray(group.fileIds) ? group.fileIds : [];
    if (
      existingFileIds.some(
        (fileId) => String(fileId) === String(draggedItem.id),
      )
    ) {
      resetTimelineDrag();
      return;
    }

    const updatedItems = items.map((candidate) =>
      candidate.id === group.id
        ? {
            ...candidate,
            fileIds: [
              ...new Set([
                ...existingFileIds.map(String),
                String(draggedItem.id),
              ]),
            ],
            updatedRecently: true,
          }
        : candidate,
    );

    setItems(updatedItems);
    resetTimelineDrag();
    try {
      await onSaveEdit?.(updatedItems);
    } catch (saveError) {
      console.error("Failed to save evidence added by drag and drop:", saveError);
      setAppDialog({
        type: "alert",
        title: "Could not update group",
        message: "The evidence could not be added to this group. Please try again.",
      });
    }
  };

  const handleTimelineDrop = async (event) => {
    const draggedId = event.dataTransfer.getData(TIMELINE_DRAG_TYPE);
    const draggedItem = items.find(
      (candidate) => String(candidate.id) === String(draggedId),
    );
    if (!draggedItem) return;

    event.preventDefault();
    const sourceBounds =
      cardRefs.current[draggedItem.id]?.getBoundingClientRect();
    if (
      sourceBounds &&
      event.clientX >= sourceBounds.left &&
      event.clientX <= sourceBounds.right
    ) {
      resetTimelineDrag();
      return;
    }

    const otherItems = displayItems.filter(
      (candidate) => String(candidate.id) !== String(draggedItem.id),
    );

    const insertionIndex = otherItems.findIndex((candidate) => {
      const bounds = cardRefs.current[candidate.id]?.getBoundingClientRect();
      return bounds && event.clientX < bounds.left + bounds.width / 2;
    });
    const nextItemIndex =
      insertionIndex === -1 ? otherItems.length : insertionIndex;
    const previousItem = otherItems[nextItemIndex - 1] || null;
    const nextItem = otherItems[nextItemIndex] || null;

    let timestamp = Number(draggedItem.timestamp);
    if (previousItem && nextItem) {
      timestamp =
        Number(previousItem.timestamp) +
        Math.floor(
          (Number(nextItem.timestamp) - Number(previousItem.timestamp)) / 2,
        );
    } else if (nextItem) {
      timestamp = Number(nextItem.timestamp) - 60_000;
    } else if (previousItem) {
      timestamp = Number(previousItem.timestamp) + 60_000;
    }

    if (!Number.isFinite(timestamp) || timestamp === Number(draggedItem.timestamp)) {
      resetTimelineDrag();
      return;
    }

    const date = new Date(timestamp);
    const updatedItems = items
      .map((candidate) =>
        String(candidate.id) === String(draggedItem.id)
          ? {
              ...candidate,
              timestamp,
              dateFormatted: date.toLocaleDateString([], {
                month: "short",
                day: "numeric",
                year: "numeric",
              }),
              timeFormatted: date.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }),
              updatedRecently: true,
            }
          : candidate,
      )
      .sort(
        (a, b) =>
          a.timestamp - b.timestamp ||
          String(a.id).localeCompare(String(b.id)),
      );

    setItems(updatedItems);
    resetTimelineDrag();
    try {
      await onSaveEdit?.(updatedItems);
    } catch (saveError) {
      console.error("Failed to save timeline time change:", saveError);
      setAppDialog({
        type: "alert",
        title: "Could not update time",
        message: "The new date and time could not be saved. Please try again.",
      });
    }
  };

  // ---------------------------------------------------------------------------
  // Save Timeline Edit
  // ---------------------------------------------------------------------------
  const handleSave = async (id) => {
    const newTimestamp = editDate ? new Date(editDate).getTime() : null;
    const d = newTimestamp ? new Date(newTimestamp) : null;

    const updated = items.map((item) => {
      if (item.id === id) {
        return {
          ...item,
          title: editTitle !== "" ? editTitle : item.title,
          memo: editMemo,
          note: editMemo,
          timestamp: newTimestamp || item.timestamp,
          dateFormatted: d
            ? d.toLocaleDateString([], {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
            : item.dateFormatted,
          timeFormatted: d
            ? d.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            : item.timeFormatted,
          updatedRecently: true,
        };
      }

      return item;
    });

    const sorted = updated.sort((a, b) => a.timestamp - b.timestamp);

    setItems(sorted);
    setEditingId(null);

    if (onSaveEdit) {
      await onSaveEdit(sorted);
    }

    setTimeout(() => {
      const cardEl = cardRefs.current[id];
      const containerEl = containerRef.current;

      if (cardEl && containerEl) {
        const containerWidth = containerEl.clientWidth;
        const cardLeft = cardEl.offsetLeft;
        const cardWidth = cardEl.offsetWidth;

        const targetScrollLeft = cardLeft - containerWidth / 2 + cardWidth / 2;

        containerEl.scrollTo({
          left: targetScrollLeft,
          behavior: "smooth",
        });
      }
    }, 50);
  };

  const startEditing = (item) => {
    setEditingId(item.id);
    setEditTitle(item.title || "");
    setEditMemo(item.memo || item.note || "");

    setEditDate(toDateTimeLocalValue(item.timestamp));
  };

  const closeTextNoteModal = () => {
    if (isUploadingNote) return;
    setShowTextNoteModal(false);
    setTextNoteBeingEdited(null);
  };

  const handleSaveTextNote = async (noteData) => {
    setIsUploadingNote(true);
    try {
      if (textNoteBeingEdited) {
        await onUpdateTextNote?.(textNoteBeingEdited.id, noteData);
      } else {
        await onAddTextNote?.(noteData);
      }
      setShowTextNoteModal(false);
      setTextNoteBeingEdited(null);
    } catch (noteError) {
      console.error("Failed to save text evidence:", noteError);
      setAppDialog({
        type: "alert",
        title: "Could not save text evidence",
        message:
          noteError.message ||
          "Failed to save the text evidence to Google Drive.",
      });
    } finally {
      setIsUploadingNote(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Horizontal wheel scroll
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const container = containerRef.current;

    if (!container) return;

    const handleWheel = (e) => {
      if (e.deltaY !== 0 || e.deltaX !== 0) {
        e.preventDefault();

        container.scrollLeft += e.deltaY !== 0 ? e.deltaY : e.deltaX;
      }
    };

    container.addEventListener("wheel", handleWheel, {
      passive: false,
    });

    return () => container.removeEventListener("wheel", handleWheel);
  }, [items]);

  // ---------------------------------------------------------------------------
  // Selection logic
  // ---------------------------------------------------------------------------
  const toggleSelection = (id, shiftKey = false) => {
    if (!isGroupingMode) return;

    setSelectedIds((prev) => {
      if (shiftKey && selectionAnchorId) {
        const anchorIndex = displayItems.findIndex(
          (item) => item.id === selectionAnchorId,
        );

        const clickedIndex = displayItems.findIndex((item) => item.id === id);

        if (anchorIndex !== -1 && clickedIndex !== -1) {
          const start = Math.min(anchorIndex, clickedIndex);
          const end = Math.max(anchorIndex, clickedIndex);

          const rangeIds = displayItems
            .slice(start, end + 1)
            .filter((item) => item.type !== "event_group")
            .map((item) => item.id);

          return [...new Set([...prev, ...rangeIds])];
        }
      }

      return prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id];
    });

    if (!shiftKey) {
      setSelectionAnchorId(id);
    }
  };

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-slate-950">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />

        <p className="text-xs text-slate-400 font-mono">Building Timeline...</p>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------------------
  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center p-6 bg-slate-950">
        <div className="max-w-md p-6 bg-rose-950/40 border border-rose-800 text-rose-300 rounded-xl text-center text-xs">
          {error}
        </div>
      </div>
    );
  }

  const currentModalPhoto =
    modalGroup?.photos?.[modalGroup.currentIndex] || null;
  const currentModalMemo =
    String(currentModalPhoto?.memo || "").trim() ||
    String(currentModalPhoto?.note || "").trim();
  const viewerState = {
    modalGroup,
    currentModalPhoto,
    currentModalMemo,
    activeImage,
    isModalImageLoading,
    isEditingModalGroup,
    isEditingModalDetails,
    isSavingModalGroup,
    modalGroupEditTitle,
    modalGroupEditMemo,
    modalGroupEditError,
    isSavingModalDetails,
    modalEditTitle,
    modalEditDate,
    modalEditMemo,
    modalEditError
  };
  const viewerActions = {
    setTextNoteBeingEdited,
    setShowTextNoteModal,
    handleCloseModal,
    handleOpenMapLocation,
    handleUngroupCurrentEvidence,
    handleUngroupEntireGroup,
    handleSaveModalGroup,
    handleCancelEditingModalGroup,
    setModalGroupEditTitle,
    setModalGroupEditMemo,
    handleStartEditingModalGroup,
    handleSaveModalDetails,
    setIsEditingModalDetails,
    setModalEditError,
    setModalEditTitle,
    setModalEditDate,
    setModalEditMemo,
    handleStartEditingModalDetails,
    handleModalNavigate
  };

  return (
    <div className="w-full h-full flex flex-col overflow-hidden select-none bg-slate-950 m-0 p-0 relative">
      {/* ------------------------------------------------------------------- */}
      {/* Top right grouping action button */}
      {/* ------------------------------------------------------------------- */}
      <div className="absolute top-4 right-4 z-40 flex items-center gap-2">
        {!isGroupingMode && (
          <>
            <button
              onClick={() => {
                setTextNoteBeingEdited(null);
                setShowTextNoteModal(true);
              }}
              disabled={isUploadingNote}
              className="px-3 py-1.5 bg-slate-900 border border-slate-700 hover:border-cyan-400 text-slate-300 rounded text-xs flex items-center gap-1.5 shadow-lg transition-colors cursor-pointer disabled:opacity-60"
            >
              <FileText className="w-3.5 h-3.5" />
              {isUploadingNote ? "Saving Note..." : "Add .txt Evidence"}
            </button>
            {displayItems.length > 0 && (
              <button
                onClick={() => {
                  setIsGroupingMode(true);
                  setTargetGroupId(null);
                  setSelectedIds([]);
                  setSelectionAnchorId(null);
                }}
                className="px-3 py-1.5 bg-slate-900 border border-slate-700 hover:border-amber-500 text-slate-300 rounded text-xs flex items-center gap-1.5 shadow-lg transition-colors cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5" />
                Group Evidences
              </button>
            )}
          </>
        )}
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* Timeline */}
      {/* ------------------------------------------------------------------- */}
      <div
        ref={containerRef}
        onDragOver={handleTimelineDragOver}
        onDragLeave={handleTimelineDragLeave}
        onDrop={handleTimelineDrop}
        className="w-full flex-1 overflow-x-auto overflow-y-hidden relative bg-slate-950 custom-scrollbar p-0 m-0"
      >
        <div className="min-h-full w-max flex items-center gap-12 pl-12 pr-16 relative">
          {/* Timeline center line */}
          <div className="absolute top-1/2 left-0 right-0 h-1 bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 shadow-md shadow-amber-500/20 -translate-y-1/2 z-0 pointer-events-none" />

          {dropIndicatorX !== null && draggedItemId && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.8)] z-20 pointer-events-none"
              style={{ left: dropIndicatorX }}
            />
          )}

          {displayItems.map((item, index) => {
            const isTop = index % 2 === 0;
            const isEditing = editingId === item.id;
            const isThisLoading = loadingItemId === item.id;
            const isSelected = selectedIds.includes(item.id);
            const isGroup = item.type === "event_group";
            const isTargetGroup = isGroup && targetGroupId === item.id;

            // Determine photo count and GPS availability
            const photoCount = isGroup ? item.photos?.length || 0 : 1;

            const gpsPhotos = isGroup
              ? (item.photos || []).filter(
                  (p) => p.hasGps || (p.latitude && p.longitude),
                )
              : item.hasGps || (item.latitude && item.longitude)
                ? [item]
                : [];

            // -----------------------------------------------------------------
            // Card border / selection styling
            // -----------------------------------------------------------------
            let cardBorderStyle = "border-slate-700 hover:border-amber-500/70";

            if (isTargetGroup) {
              cardBorderStyle =
                "border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.4)] bg-amber-950/20";
            } else if (isSelected) {
              cardBorderStyle =
                "border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.4)] bg-amber-950/20";
            } else if (item.updatedRecently) {
              cardBorderStyle =
                "border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.5)] bg-emerald-950/20";
            }

            const wrapperClass = isGroupingMode ? "cursor-pointer" : "";

            return (
              <div
                key={item.id}
                ref={(el) => (cardRefs.current[item.id] = el)}
                draggable={!isGroupingMode && !isEditing}
                title={
                  !isGroupingMode && !isEditing
                    ? isGroup
                      ? "Drag to change this group's timeline time; drop evidence here to add it."
                      : "Drag between cards to set this evidence's date and time."
                    : undefined
                }
                onDragStart={(event) => handleTimelineDragStart(item, event)}
                onDragEnd={handleTimelineDragEnd}
                onDragOver={(event) => handleGroupDragOver(item, event)}
                onDrop={(event) => handleGroupDrop(item.id, event)}
                className={`relative shrink-0 w-48 h-72 flex flex-col items-center justify-center z-10 ${wrapperClass} ${!isGroupingMode && !isEditing ? "cursor-grab active:cursor-grabbing" : ""} ${String(draggedItemId) === String(item.id) ? "opacity-40" : ""} ${dropTargetGroupId === item.id ? "scale-105 ring-2 ring-cyan-400 rounded-md" : ""}`}
                onClick={(e) => {
                  if (isGroup) {
                    selectTargetGroup(item.id);
                  } else {
                    toggleSelection(item.id, e.shiftKey);
                  }
                }}
              >
                {/* Vertical connector */}
                <div
                  className={`absolute left-1/2 -translate-x-1/2 w-0.5 bg-amber-500/80 z-0 ${
                    isTop ? "bottom-1/2 h-16" : "top-1/2 h-16"
                  }`}
                />

                {/* Timeline marker diamond */}
                <div className="relative z-20">
                  <div
                    className={`w-3 h-3 rotate-45 border border-slate-950 shadow-[0_0_6px_rgba(245,158,11,0.7)] transition-colors duration-500 ${
                      isTargetGroup
                        ? "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,1)]"
                        : item.updatedRecently
                          ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,1)]"
                          : "bg-amber-500"
                    }`}
                  />
                </div>

                {/* Outer Card Wrapper */}
                <div
                  className={`absolute w-48 z-30 ${
                    isTop ? "bottom-[calc(50%+64px)]" : "top-[calc(50%+64px)]"
                  }`}
                >
                  <div className="relative w-full">
                    {/* FANNED STACKED BACK CARDS FOR GROUPS */}
                    {isGroup && (
                      <>
                        <div className="absolute inset-0 bg-slate-900/80 border border-slate-700/80 rounded-md shadow-md transform -rotate-6 translate-x-[-5px] translate-y-[3px] z-0 pointer-events-none" />

                        <div className="absolute inset-0 bg-slate-900/90 border border-slate-700/90 rounded-md shadow-md transform rotate-3 translate-x-[5px] translate-y-[-2px] z-10 pointer-events-none" />
                      </>
                    )}

                    {/* TOP MAIN CARD */}
                    <div
                      className={`relative z-20 bg-slate-900 border rounded-md p-3 shadow-xl transition-all duration-300 flex flex-col gap-2 ${cardBorderStyle}`}
                    >
                      {/* Checkbox badge during grouping mode */}
                      {isGroupingMode && (
                        <div className="absolute -top-2 -right-2 bg-slate-900 rounded-md z-30">
                          {isGroup ? (
                            isTargetGroup ? (
                              <CheckSquare className="w-5 h-5 text-amber-500" />
                            ) : (
                              <div className="w-5 h-5 border-2 border-slate-600 rounded" />
                            )
                          ) : isSelected ? (
                            <CheckSquare className="w-5 h-5 text-amber-500" />
                          ) : (
                            <div className="w-5 h-5 border-2 border-slate-600 rounded" />
                          )}
                        </div>
                      )}

                      {/* Header */}
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-amber-400 font-medium truncate max-w-[80px]">
                          {isGroup
                            ? `GROUP (${photoCount})`
                            : item.type === "text_note"
                              ? "TEXT NOTE"
                              : `EX ${item.id.slice(0, 4).toUpperCase()}`}
                        </span>

                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-mono text-slate-400 flex items-center gap-0.5">
                            <Clock className="w-2.5 h-2.5" />
                            {item.timeFormatted}
                          </span>

                          {!isEditing && !isGroupingMode && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (item.type === "text_note") {
                                  setTextNoteBeingEdited(item);
                                  setShowTextNoteModal(true);
                                } else {
                                  startEditing(item);
                                }
                              }}
                              className="text-slate-400 hover:text-amber-400 transition cursor-pointer p-0.5 rounded hover:bg-slate-800"
                              title={
                                item.type === "text_note"
                                  ? "Edit Text Note"
                                  : "Edit Title, Memo, or Date"
                              }
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Editing Form */}
                      {isEditing ? (
                        <div
                          className="flex flex-col gap-1.5 my-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="bg-slate-950 border border-slate-700 text-slate-100 text-[11px] rounded px-1.5 py-1 outline-none focus:border-amber-500"
                            placeholder="Title..."
                          />

                          <textarea
                            value={editMemo}
                            onChange={(e) => setEditMemo(e.target.value)}
                            className="bg-slate-950 border border-slate-700 text-slate-100 text-[11px] rounded px-1.5 py-1 outline-none focus:border-amber-500 resize-none h-14"
                            placeholder="Write a personal memo..."
                          />

                          <input
                            type="datetime-local"
                            value={editDate}
                            onChange={(e) => setEditDate(e.target.value)}
                            className="bg-slate-950 border border-slate-700 text-slate-100 text-[10px] rounded px-1.5 py-1 outline-none focus:border-amber-500 text-slate-300"
                          />

                          <div className="flex items-center justify-end gap-1 mt-0.5">
                            <button
                              onClick={() => setEditingId(null)}
                              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] cursor-pointer flex items-center gap-0.5"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>

                            <button
                              onClick={() => handleSave(item.id)}
                              className="px-2 py-0.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold rounded text-[10px] cursor-pointer flex items-center gap-0.5"
                            >
                              <Check className="w-2.5 h-2.5" />
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Standard View */
                        <>
                          <h3
                            className="text-xs font-semibold text-slate-100 truncate"
                            title={item.title}
                          >
                            {item.title}
                          </h3>

                          {(item.memo || item.note) && (
                            <p
                              className={`text-[10px] text-slate-300 my-1 line-clamp-2 bg-slate-950/50 p-1.5 rounded border border-slate-800/80 ${item.type === "text_note" ? "whitespace-pre-wrap" : "italic"}`}
                            >
                              {item.type === "text_note"
                                ? item.memo || item.note
                                : `"${item.memo || item.note}"`}
                            </p>
                          )}

                          <p className="text-[10px] text-amber-500/80 font-mono">
                            {item.dateFormatted}
                          </p>
                        </>
                      )}

                      {/* Card Action Buttons */}
                      {!isEditing && (
                        <div className="flex flex-col gap-1.5 mt-auto pt-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEvidenceModal(item);
                            }}
                            disabled={isThisLoading}
                            className="w-full py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded text-[11px] font-medium transition flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            {item.type === "text_note" ? (
                              <FileText className="w-3.5 h-3.5" />
                            ) : (
                              <ImageIcon className="w-3.5 h-3.5" />
                            )}

                            {isThisLoading
                              ? "Loading..."
                              : isGroup
                                ? `View Items (${photoCount})`
                                : item.type === "text_note"
                                  ? "Read Note"
                                  : "View Evidence"}
                          </button>

                          {/* Location Data Button */}
                          {gpsPhotos.length > 0 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenMapLocation(gpsPhotos);
                              }}
                              className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 rounded text-[11px] font-medium transition flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <MapPin className="w-3.5 h-3.5" />

                              {isGroup && gpsPhotos.length > 1
                                ? `Location Data (${gpsPhotos.length})`
                                : "Location Data"}
                            </button>
                          )}

                          {isGroup && !isGroupingMode && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUngroupEntireGroup(item.id);
                              }}
                              className="w-full py-1.5 bg-rose-950/60 hover:bg-rose-900/70 border border-rose-800 text-rose-200 rounded text-[11px] font-medium transition cursor-pointer"
                              title="Return all evidence to the timeline and remove this group"
                            >
                              Ungroup All
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* Floating Grouping Action Bar */}
      {/* ------------------------------------------------------------------- */}
      {isGroupingMode && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 border border-amber-500 shadow-2xl rounded-full px-6 py-3 z-50 flex items-center gap-4">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-slate-200">
              {selectedIds.length} items selected
            </span>

            {targetGroupId && (
              <span className="text-[10px] font-mono text-amber-400">
                Existing stack selected
              </span>
            )}
          </div>

          {/* Cancel */}
          <button
            onClick={() => {
              setIsGroupingMode(false);
              setSelectedIds([]);
              setSelectionAnchorId(null);
              setTargetGroupId(null);
            }}
            className="text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Cancel
          </button>

          {/* Add to existing group */}
          {targetGroupId ? (
            <button
              onClick={handleAddToExistingGroup}
              disabled={selectedIds.length === 0}
              className="text-xs text-slate-950 font-bold bg-cyan-400 hover:bg-cyan-300 px-4 py-1.5 rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5" />
              Add to Group
            </button>
          ) : (
            /* Create new group */
            <button
              onClick={() => setShowGroupModal(true)}
              disabled={selectedIds.length === 0}
              className="text-xs text-slate-950 font-bold bg-amber-500 hover:bg-amber-400 px-4 py-1.5 rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5" />
              Create Group
            </button>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* Create Group Modal */}
      {/* ------------------------------------------------------------------- */}
      <GroupModal
        isOpen={showGroupModal}
        selectedCount={selectedIds.length}
        defaultDate={firstImageDateTime}
        onClose={() => setShowGroupModal(false)}
        onSave={handleSaveGroup}
      />

      <TextNoteModal
        isOpen={showTextNoteModal}
        isSaving={isUploadingNote}
        note={textNoteBeingEdited}
        onClose={closeTextNoteModal}
        onSave={handleSaveTextNote}
      />

      {/* ------------------------------------------------------------------- */}
      {/* Map Location Modal */}
      {/* ------------------------------------------------------------------- */}
      {selectedMapLocation && (
        <MapModal
          location={selectedMapLocation}
          onClose={() => setSelectedMapLocation(null)}
        />
      )}

      <EvidenceViewerModal state={viewerState} actions={viewerActions} />
      <AppDialog dialog={appDialog} onClose={() => setAppDialog(null)} />
    </div>
  );
}