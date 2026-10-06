// src/pages/TimelinePage.jsx
import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { X, Layers } from "lucide-react";
import MapModal from "../components/map/MapModal";
import GroupModal from "../components/timeline/GroupModal";
import TextNoteModal from "../components/timeline/TextNoteModal";
import TimelineCardList from "../components/timeline/TimelineCardList";
import TimelineToolbar from "../components/timeline/TimelineToolbar";
import AppDialog from "../components/timeline/AppDialog";
import EvidenceViewerModal from "../components/timeline/EvidenceViewerModal";
import { isGoogleDriveAuthorizationError } from "../services/googleDriveService";
import useDriveImageLoader from "../hooks/useDriveImageLoader";

const toDateTimeLocalValue = (timestamp) => {
  if (!Number.isFinite(Number(timestamp))) return "";

  const date = new Date(Number(timestamp));
  const localDate = new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000,
  );
  return localDate.toISOString().slice(0, 16);
};

import {
  calculateTimelineLayout,
  MAX_TIMELINE_ZOOM,
  MIN_TIMELINE_ZOOM,
  TIMELINE_LANE_SPACING,
  TIMELINE_MARKER_WIDTH,
} from "../utils/timelineLayout";

export default function TimelinePage({
  images,
  isLoading,
  error,
  onSaveEdit,
  accessToken,
  onAddTextNote,
  onUpdateTextNote,
  onAuthenticationError,
  canEdit = false,
}) {
  const [selectedMapLocation, setSelectedMapLocation] = useState(null);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [isFitView, setIsFitView] = useState(false);
  const [timelineViewport, setTimelineViewport] = useState({ width: 0, height: 0 });

  // App-level notifications and confirmation dialogs
  const [appDialog, setAppDialog] = useState(null);

  // Modal Evidence Carousel State
  const [modalGroup, setModalGroup] = useState(null);
  const [activeImage, setActiveImage] = useState(null);
  const [isModalImageLoading, setIsModalImageLoading] = useState(false);

  // Individual item loading state for card buttons
  const [loadingItemId, setLoadingItemId] = useState(null);
  const [isUploadingNote, setIsUploadingNote] = useState(false);

  const [items, setItems] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchStartDate, setSearchStartDate] = useState("");
  const [searchEndDate, setSearchEndDate] = useState("");
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
  const [modalGroupEditDate, setModalGroupEditDate] = useState("");
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
  const cardContentRefs = useRef({});
  const [measuredCardHeights, setMeasuredCardHeights] = useState({});

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;

    const measureViewport = () => {
      const bounds = element.getBoundingClientRect();
      setTimelineViewport({
        width: element.clientWidth,
        // Use the visible screen area below the timeline's top edge. This
        // keeps the day separators full-height even if flex sizing reports a
        // smaller client height during initial layout.
        height: Math.max(
          element.clientHeight,
          window.innerHeight - bounds.top,
        ),
      });
    };
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measureViewport);

    observer?.observe(element);
    window.addEventListener("resize", measureViewport);
    measureViewport();

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measureViewport);
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

  // Search across visible timeline entries and the evidence contained in groups.
  // Date filters use each entry's effective timeline timestamp; groups also match
  // when any evidence inside the group falls within the selected range.
  const filteredDisplayItems = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    const startTimestamp = searchStartDate
      ? new Date(`${searchStartDate}T00:00:00`).getTime()
      : null;
    const endTimestamp = searchEndDate
      ? new Date(`${searchEndDate}T23:59:59.999`).getTime()
      : null;
    const searchableFields = [
      "title",
      "name",
      "memo",
      "note",
      "noteContent",
      "dateFormatted",
      "timeFormatted",
      "id",
      "fileId",
    ];

    return displayItems.filter((item) => {
      const groupEvidence =
        item.type === "event_group" ? item.photos || [] : [];
      const searchableEntries = [item, ...groupEvidence];
      const matchesQuery =
        !query ||
        searchableEntries.some((entry) =>
          searchableFields.some((field) =>
            String(entry[field] ?? "").toLocaleLowerCase().includes(query),
          ),
        );

      if (!matchesQuery) return false;
      if (!searchStartDate && !searchEndDate) return true;

      const timestamps = [
        item.timestamp,
        ...groupEvidence.map((entry) => entry.timestamp),
      ].filter(Number.isFinite);

      return timestamps.some(
        (timestamp) =>
          (startTimestamp === null || timestamp >= startTimestamp) &&
          (endTimestamp === null || timestamp <= endTimestamp),
      );
    });
  }, [displayItems, searchQuery, searchStartDate, searchEndDate]);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return undefined;

    const updateMeasurements = () => {
      const nextMeasurements = {};
      Object.entries(cardContentRefs.current).forEach(([id, element]) => {
        if (element) {
          nextMeasurements[id] = Math.ceil(
            element.getBoundingClientRect().height,
          );
        }
      });
      setMeasuredCardHeights((previous) => {
        const ids = Object.keys(nextMeasurements);
        const unchanged =
          ids.length === Object.keys(previous).length &&
          ids.every((id) => previous[id] === nextMeasurements[id]);
        return unchanged ? previous : nextMeasurements;
      });
    };
    const observer = new ResizeObserver(updateMeasurements);

    Object.values(cardContentRefs.current).forEach((element) => {
      if (element) observer.observe(element);
    });
    updateMeasurements();
    return () => observer.disconnect();
  }, [filteredDisplayItems, editingId, isGroupingMode, canEdit]);

  const timelineLayout = useMemo(
    () =>
      calculateTimelineLayout({
        filteredDisplayItems,
        timelineZoom,
        isFitView,
        timelineViewport,
        measuredCardHeights,
      }),
    [
      filteredDisplayItems,
      timelineZoom,
      isFitView,
      timelineViewport,
      measuredCardHeights,
    ],
  );
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

  const {
    getImageCacheKey,
    getCachedImageUrl,
    getThumbnailUrl,
    fetchItemImageUrl,
    prefetchAdjacentPhotos,
  } = useDriveImageLoader(accessToken);

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
      groupTimestamp: isEventGroup ? item.timestamp : null,
      groupDateFormatted: isEventGroup ? item.dateFormatted : "",
      groupTimeFormatted: isEventGroup ? item.timeFormatted : "",
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
      if (isGoogleDriveAuthorizationError(err)) {
        handleCloseModal();
        onAuthenticationError?.(err);
      } else {
        console.error(err);
        setAppDialog({
          type: "alert",
          title: "Could not load evidence",
          message: "Failed to load photo evidence.",
        });
      }
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
    const cachedUrl = getCachedImageUrl(targetPhoto);
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
      if (isGoogleDriveAuthorizationError(err)) {
        handleCloseModal();
        onAuthenticationError?.(err);
      } else {
        console.error("Failed to load evidence at index", newIndex, err);
      }
    } finally {
      setIsModalImageLoading(false);
    }
  };

  const handleCloseModal = useCallback(() => {
    setModalGroup(null);
    setActiveImage(null);
    setIsEditingModalDetails(false);
    setModalEditError("");
    setIsEditingModalGroup(false);
    setModalGroupEditError("");
  }, []);

  useEffect(() => {
    if (!modalGroup) return undefined;

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleCloseModal();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [modalGroup, handleCloseModal]);

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
    setModalGroupEditDate(
      toDateTimeLocalValue(modalGroup.groupTimestamp),
    );
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

    const updatedTimestamp = modalGroupEditDate
      ? new Date(modalGroupEditDate).getTime()
      : Number(group.timestamp);
    if (!Number.isFinite(updatedTimestamp)) {
      setModalGroupEditError("Enter a valid group date and time.");
      return;
    }

    const updatedDate = new Date(updatedTimestamp);
    const updatedGroup = {
      ...group,
      title: modalGroupEditTitle.trim() || group.title || "Untitled Group",
      memo: modalGroupEditMemo,
      note: modalGroupEditMemo,
      timestamp: updatedTimestamp,
      dateFormatted: updatedDate.toLocaleDateString([], {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      timeFormatted: updatedDate.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
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
            groupTimestamp: updatedGroup.timestamp,
            groupDateFormatted: updatedGroup.dateFormatted,
            groupTimeFormatted: updatedGroup.timeFormatted,
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
    if (!canEdit) return;
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
    if (!canEdit) return;
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
    if (!canEdit) return;
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
    if (!canEdit) return;
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
    if (!canEdit) return;
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
    if (!canEdit || !isGroupingMode) return;
    if (!isGroupingMode) return;

    setTargetGroupId((prev) => (prev === groupId ? null : groupId));
  };

  // ---------------------------------------------------------------------------
  // Save Timeline Edit
  // ---------------------------------------------------------------------------
  const handleSave = async (id) => {
    if (!canEdit) return;
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
    if (!canEdit) return;
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
    if (!canEdit) return;
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
    if (!canEdit || !isGroupingMode) return;
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
    modalGroupEditDate,
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
    setModalGroupEditDate,
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
    <div className="w-full h-full min-h-0 flex flex-col overflow-hidden select-none bg-slate-950 m-0 p-0 relative">
      <TimelineToolbar
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        searchStartDate={searchStartDate}
        setSearchStartDate={setSearchStartDate}
        searchEndDate={searchEndDate}
        setSearchEndDate={setSearchEndDate}
        displayItems={displayItems}
        filteredDisplayItems={filteredDisplayItems}
        timelineZoom={timelineZoom}
        setTimelineZoom={setTimelineZoom}
        isFitView={isFitView}
        setIsFitView={setIsFitView}
        timelineLayout={timelineLayout}
        containerRef={containerRef}
        canEdit={canEdit}
        isGroupingMode={isGroupingMode}
        isUploadingNote={isUploadingNote}
        setTextNoteBeingEdited={setTextNoteBeingEdited}
        setShowTextNoteModal={setShowTextNoteModal}
        setIsGroupingMode={setIsGroupingMode}
        setTargetGroupId={setTargetGroupId}
        setSelectedIds={setSelectedIds}
        setSelectionAnchorId={setSelectionAnchorId}
      />
      {/* ------------------------------------------------------------------- */}
      {/* Timeline */}
      {/* ------------------------------------------------------------------- */}
      <div
        ref={containerRef}
        className="w-full flex-1 min-h-0 overflow-x-auto overflow-y-hidden relative bg-slate-950 custom-scrollbar p-0 m-0"
      >
        <div
          style={
            filteredDisplayItems.length > 0
              ? {
                  width: timelineLayout.canvasWidth,
                  height: timelineLayout.canvasHeight,
                }
              : undefined
          }
          className={
            filteredDisplayItems.length > 0
              ? "relative shrink-0"
              : "w-full h-full flex items-center justify-center"
          }
        >
          {timelineLayout.dateMarkers.map((marker) => (
            <div
              key={marker.id}
              aria-hidden="true"
              className="absolute top-0 bottom-0 z-[1] border-l-2 border-dotted border-sky-400/70 pointer-events-none"
              style={{ left: marker.left }}
            >
              {marker.showLabel && (
                <span className="absolute left-2 top-16 whitespace-nowrap rounded border border-sky-500/30 bg-slate-950/95 px-2 py-1 text-[10px] font-mono text-sky-200 shadow-lg">
                  {marker.label}
                </span>
              )}
            </div>
          ))}
          {filteredDisplayItems.length > 0 && (
            <div
              className="absolute left-0 right-0 h-1 bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 shadow-md shadow-amber-500/20 -translate-y-1/2 z-0 pointer-events-none"
              style={{ top: timelineLayout.axisY }}
            />
          )}

          {filteredDisplayItems.length === 0 ? (
            <div className="px-6 text-center">
              <p className="text-sm text-slate-300">
                {isLoading
                  ? "Loading evidence..."
                  : items.length === 0
                    ? "No evidence to display."
                    : "No evidence matches these filters."}
              </p>
              {items.length > 0 && (
                <p className="mt-1 text-xs text-slate-500">
                  Try another search term or adjust the date range.
                </p>
              )}
            </div>
          ) : (
            <TimelineCardList
              items={filteredDisplayItems}
              timelineLayout={timelineLayout}
              canEdit={canEdit}
              loadingItemId={loadingItemId}
              selection={{ isGroupingMode, selectedIds, targetGroupId }}
              editing={{
                id: editingId,
                title: editTitle,
                memo: editMemo,
                date: editDate,
                setTitle: setEditTitle,
                setMemo: setEditMemo,
                setDate: setEditDate,
              }}
              actions={{
                setEditingId,
                setTextNoteBeingEdited,
                setShowTextNoteModal,
                startEditing,
                handleSave,
                handleOpenEvidenceModal,
                handleOpenMapLocation,
                handleUngroupEntireGroup,
                selectTargetGroup,
                toggleSelection,
              }}
              refs={{ cardRefs, cardContentRefs }}
            />
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* Floating Grouping Action Bar */}
      {/* ------------------------------------------------------------------- */}
      {canEdit && isGroupingMode && (
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
        isOpen={canEdit && showGroupModal}
        selectedCount={selectedIds.length}
        defaultDate={firstImageDateTime}
        onClose={() => setShowGroupModal(false)}
        onSave={handleSaveGroup}
      />

      <TextNoteModal
        isOpen={canEdit && showTextNoteModal}
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

      <EvidenceViewerModal state={viewerState} actions={viewerActions} canEdit={canEdit} />
      <AppDialog dialog={appDialog} onClose={() => setAppDialog(null)} />
    </div>
  );
}