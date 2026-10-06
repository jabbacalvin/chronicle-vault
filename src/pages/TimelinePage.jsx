// src/pages/TimelinePage.jsx
import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
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
  Search,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { heicTo } from "heic-to";
import MapModal from "../components/map/MapModal";
import GroupModal from "../components/timeline/GroupModal";
import TextNoteModal from "../components/timeline/TextNoteModal";
import AppDialog from "../components/timeline/AppDialog";
import EvidenceViewerModal from "../components/timeline/EvidenceViewerModal";
import { isGoogleDriveAuthorizationError } from "../services/googleDriveService";

const toDateTimeLocalValue = (timestamp) => {
  if (!Number.isFinite(Number(timestamp))) return "";

  const date = new Date(Number(timestamp));
  const localDate = new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000,
  );
  return localDate.toISOString().slice(0, 16);
};

const TIMELINE_DAY_WIDTH = 432;
const TIMELINE_CARD_WIDTH = 216;
const TIMELINE_CARD_SPACING = 32;
const TIMELINE_MARKER_WIDTH = 32;
const TIMELINE_LEFT_PADDING = 48;
const TIMELINE_RIGHT_PADDING = 64;
const MIN_TIMELINE_ZOOM = 0.05;
const MAX_TIMELINE_ZOOM = 3;
const COMPACT_ZOOM_THRESHOLD = 0.6;
const TIMELINE_LANE_SPACING = 260;
const TIMELINE_DATE_LABEL_LEFT_OFFSET = 8;
const TIMELINE_DATE_LABEL_CARD_GAP = 36;
const TIMELINE_DATE_LABEL_CHAR_WIDTH = 6;
const TIMELINE_CARD_CONNECTOR_OVERLAP = 4;
const MIN_DATE_LABEL_SPACING = 112;

const getTimelineDateLabelWidth = (label) =>
  label.length * TIMELINE_DATE_LABEL_CHAR_WIDTH + 18;
const HOUR_MILLISECONDS = 60 * 60 * 1000;

const getLocalDayStart = (timestamp) => {
  const dayStart = new Date(Number(timestamp));
  dayStart.setHours(0, 0, 0, 0);
  return dayStart;
};

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
  const objectUrlsRef = useRef(new Set());

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

  const timelineLayout = useMemo(() => {
    if (filteredDisplayItems.length === 0) {
      return {
        entries: [],
        dateMarkers: [],
        canvasWidth: timelineViewport.width || 800,
        canvasHeight: timelineViewport.height || 600,
        axisY: (timelineViewport.height || 600) / 2,
        zoom: timelineZoom,
        isCompact: false,
      };
    }

    const localDayOrdinal = (date) =>
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) /
      (24 * HOUR_MILLISECONDS);
    const dayGroupsByOrdinal = new Map();

    filteredDisplayItems.forEach((item, index) => {
      const dayStart = getLocalDayStart(item.timestamp);
      const dayOrdinal = localDayOrdinal(dayStart);
      const nextDayStart = new Date(dayStart);
      nextDayStart.setDate(nextDayStart.getDate() + 1);
      const timeRatio =
        (Number(item.timestamp) - dayStart.getTime()) /
        (nextDayStart.getTime() - dayStart.getTime());
      const group = dayGroupsByOrdinal.get(dayOrdinal) || {
        dayStart,
        dayOrdinal,
        entries: [],
      };
      group.entries.push({ item, index, timeRatio });
      dayGroupsByOrdinal.set(dayOrdinal, group);
    });

    const dayGroups = Array.from(dayGroupsByOrdinal.values()).sort(
      (a, b) => a.dayOrdinal - b.dayOrdinal,
    );
    const viewportWidth = timelineViewport.width || 800;
    const fitAvailableWidth = Math.max(
      TIMELINE_MARKER_WIDTH + 1,
      viewportWidth -
        TIMELINE_LEFT_PADDING -
        TIMELINE_RIGHT_PADDING -
        TIMELINE_MARKER_WIDTH,
    );
    const fitZoom = Math.min(
      1,
      fitAvailableWidth / (dayGroups.length * TIMELINE_DAY_WIDTH),
    );
    const zoom = isFitView ? fitZoom : timelineZoom;
    const isCompact = isFitView || zoom < COMPACT_ZOOM_THRESHOLD;
    const baseDayWidth = TIMELINE_DAY_WIDTH * zoom;
    const occupiedWidth = isCompact
      ? TIMELINE_MARKER_WIDTH
      : TIMELINE_CARD_WIDTH;
    const cardHalfWidth = TIMELINE_CARD_WIDTH / 2;
    const cardGutter = 32;
    const cardInset = cardHalfWidth + cardGutter;
    const minimumCardDayWidth = cardInset * 2;
    const minCardCenterSeparation =
      TIMELINE_CARD_WIDTH + TIMELINE_CARD_SPACING;
    const cardCenterForRatio = (ratio, group, dayWidth) =>
      isCompact
        ? ratio * dayWidth
        : cardInset + (ratio - group.firstTimeRatio) * dayWidth;
    const dayWidths = new Map();
    const dayOffsets = new Map();
    const cardCentersByIndex = new Map();
    let totalDayWidth = 0;

    dayGroups.forEach((group) => {
      group.firstTimeRatio = Math.min(...group.entries.map((entry) => entry.timeRatio));
      group.lastTimeRatio = Math.max(...group.entries.map((entry) => entry.timeRatio));
      const activeTimeSpan = group.lastTimeRatio - group.firstTimeRatio;
      let dayWidth = isCompact
        ? baseDayWidth
        : Math.max(baseDayWidth, minimumCardDayWidth);

      if (!isCompact) {
        // Start each active day at its first event instead of reserving space
        // from midnight. The time differences between events remain linear.
        const maxDayWidth = Math.max(
          baseDayWidth * 8,
          (group.entries.length + 1) * minCardCenterSeparation +
            2 * cardInset +
            TIMELINE_CARD_SPACING,
        );
        const widthForActiveSpan =
          activeTimeSpan < 1
            ? (2 * cardInset) / (1 - activeTimeSpan)
            : maxDayWidth;
        dayWidth = Math.max(
          dayWidth,
          Math.min(maxDayWidth, widthForActiveSpan),
        );

        const dayLabel = group.dayStart.toLocaleDateString([], {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
        const labelLeft = TIMELINE_DATE_LABEL_LEFT_OFFSET;
        const labelRight = labelLeft + getTimelineDateLabelWidth(dayLabel);
        // Leave room for the date label, its gap, and the rotated group-card
        // backs so the visible date stays clear.
        const labelSafeCardCenter =
          labelRight +
          TIMELINE_DATE_LABEL_CARD_GAP +
          cardHalfWidth +
          16;
        const connectorReach =
          cardHalfWidth - TIMELINE_CARD_CONNECTOR_OVERLAP;
        const requiredRightBuffer = cardGutter + TIMELINE_CARD_SPACING;

        const findFittedCardCenters = (candidateWidth) => {
          const centers = new Map();
          const markerCenters = new Map(
            group.entries.map((entry) => [
              entry.index,
              cardCenterForRatio(entry.timeRatio, group, candidateWidth),
            ]),
          );
          const sides = [[], []];
          group.entries.forEach((entry) => {
            sides[entry.index % 2].push(entry);
          });

          for (let side = 0; side < sides.length; side += 1) {
            const chosenCenters = [];
            const entriesOnSide = sides[side];
            for (const entry of entriesOnSide) {
              const markerCenter = markerCenters.get(entry.index);
              const lowerBound = Math.max(
                cardInset,
                markerCenter - connectorReach,
              );
              const upperBound = Math.min(
                candidateWidth - cardHalfWidth - requiredRightBuffer,
                markerCenter + connectorReach,
              );
              let selectedCenter = null;
              const minCandidate = Math.ceil(lowerBound);
              const maxCandidate = Math.floor(upperBound);

              for (
                let distance = 0;
                distance <= maxCandidate - minCandidate && selectedCenter === null;
                distance += 2
              ) {
                const candidates = distance === 0
                  ? [Math.round(markerCenter)]
                  : [
                      Math.round(markerCenter - distance),
                      Math.round(markerCenter + distance),
                    ];
                for (const candidate of candidates) {
                  if (candidate < minCandidate || candidate > maxCandidate) {
                    continue;
                  }
                  const cardHeight =
                    measuredCardHeights[entry.item.id] || 280;
                  const preferredAxisY =
                    (timelineViewport.height || 600) * 0.528;
                  const overlapsDateLabelVertically =
                    preferredAxisY - 64 - cardHeight < 108;
                  if (
                    side === 0 &&
                    overlapsDateLabelVertically &&
                    candidate < labelSafeCardCenter &&
                    candidate + cardHalfWidth > labelLeft
                  ) {
                    continue;
                  }
                  const overlapsAnotherCard = chosenCenters.some(
                    (center) =>
                      Math.abs(candidate - center) <
                      minCardCenterSeparation,
                  );
                  if (overlapsAnotherCard) continue;

                  const crossesAnotherConnector = entriesOnSide.some(
                    (otherEntry) =>
                      otherEntry.index !== entry.index &&
                      Math.abs(
                        candidate - markerCenters.get(otherEntry.index),
                      ) <
                        cardHalfWidth +
                          TIMELINE_CARD_CONNECTOR_OVERLAP,
                  );
                  if (crossesAnotherConnector) continue;

                  selectedCenter = candidate;
                  break;
                }
              }

              if (selectedCenter === null) return null;
              chosenCenters.push(selectedCenter);
              centers.set(entry.index, selectedCenter);
            }
          }
          return centers;
        };

        let fittedCenters = findFittedCardCenters(dayWidth);
        let lowerWidth = dayWidth;
        let upperWidth = dayWidth;
        while (!fittedCenters && upperWidth < maxDayWidth) {
          lowerWidth = upperWidth;
          upperWidth = Math.min(maxDayWidth, upperWidth + 16);
          fittedCenters = findFittedCardCenters(upperWidth);
        }
        if (fittedCenters) {
          // Narrow the expanded day to the smallest width that still keeps
          // every card clear of its neighbors and the other timestamp stems.
          let low = lowerWidth;
          let high = upperWidth;
          for (let iteration = 0; iteration < 12 && high - low > 1; iteration += 1) {
            const middle = (low + high) / 2;
            const middleCenters = findFittedCardCenters(middle);
            if (middleCenters) {
              high = middle;
              fittedCenters = middleCenters;
            } else {
              low = middle;
            }
          }
          dayWidth = high;
          fittedCenters = findFittedCardCenters(dayWidth) || fittedCenters;
        } else {
          dayWidth = maxDayWidth;
        }

        if (fittedCenters) {
          fittedCenters.forEach((center, entryIndex) => {
            cardCentersByIndex.set(entryIndex, center);
          });
        }
      }

      dayOffsets.set(group.dayOrdinal, totalDayWidth);
      dayWidths.set(group.dayOrdinal, dayWidth);
      totalDayWidth += dayWidth;
    });

        const xForTimestamp = (timestamp) => {
      const itemDayStart = getLocalDayStart(timestamp);
      const dayOrdinal = localDayOrdinal(itemDayStart);
      const nextDayStart = new Date(itemDayStart);
      nextDayStart.setDate(nextDayStart.getDate() + 1);
      const timeRatio =
        (Number(timestamp) - itemDayStart.getTime()) /
        (nextDayStart.getTime() - itemDayStart.getTime());
      const group = dayGroupsByOrdinal.get(dayOrdinal);
      const dayWidth = dayWidths.get(dayOrdinal);
      const dayRelativeX = isCompact
        ? timeRatio * dayWidth
        : cardInset + (timeRatio - group.firstTimeRatio) * dayWidth;
      return (
        TIMELINE_LEFT_PADDING +
        dayOffsets.get(dayOrdinal) +
        dayRelativeX
      );
    };

        const laneEnds = [[], []];
    const entries = [];
    const dateMarkers = [];
    let lastDateLabelX = -Infinity;

    dayGroups.forEach((group, index) => {
      const dateX = TIMELINE_LEFT_PADDING + dayOffsets.get(group.dayOrdinal);
      const showLabel =
        index === 0 || dateX - lastDateLabelX >= MIN_DATE_LABEL_SPACING;
      const label = group.dayStart.toLocaleDateString([], {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      dateMarkers.push({
        id: `day-${group.dayStart.getTime()}`,
        dayOrdinal: group.dayOrdinal,
        left: dateX,
        label,
        labelWidth: getTimelineDateLabelWidth(label),
        showLabel,
      });
      if (showLabel) lastDateLabelX = dateX;
    });

    filteredDisplayItems.forEach((item, index) => {
      const itemX = xForTimestamp(item.timestamp);
      const dayStart = getLocalDayStart(item.timestamp);
      const dayOrdinal = localDayOrdinal(dayStart);
      const dayLeft =
        TIMELINE_LEFT_PADDING + dayOffsets.get(dayOrdinal);
      const dayRight = dayLeft + dayWidths.get(dayOrdinal);
      const fittedCardCenter = cardCentersByIndex.get(index);
      const hasFittedCardCenter = Number.isFinite(fittedCardCenter);
      let cardX = hasFittedCardCenter
        ? dayLeft + fittedCardCenter
        : Math.min(
            dayRight - cardHalfWidth - cardGutter,
            Math.max(dayLeft + cardHalfWidth + cardGutter, itemX),
          );
      const preferredSide = index % 2 === 0 ? 0 : 1;
      const dayMarker = dateMarkers.find(
        (marker) => marker.dayOrdinal === dayOrdinal,
      );
      if (!hasFittedCardCenter && preferredSide === 0 && dayMarker?.showLabel) {
        const labelLeft = dayMarker.left + TIMELINE_DATE_LABEL_LEFT_OFFSET;
        const labelRight = labelLeft + dayMarker.labelWidth;
        const minCardCenter =
          labelRight + TIMELINE_DATE_LABEL_CARD_GAP + cardHalfWidth;
        const maxCardCenter =
          dayRight - cardHalfWidth - cardGutter;
        if (
          cardX - cardHalfWidth < labelRight &&
          cardX + cardHalfWidth > labelLeft
        ) {
          cardX = Math.min(maxCardCenter, Math.max(cardX, minCardCenter));
        }
      }
      // Give cards extra room from the next dotted day boundary. Shift only
      // the card; keep its timestamp marker and vertical connector in place.
      const desiredRightGap = cardGutter + TIMELINE_CARD_SPACING;
      const currentRightGap = dayRight - (cardX + cardHalfWidth);
      if (!hasFittedCardCenter && currentRightGap < desiredRightGap) {
        const labelLeft = dayMarker
          ? dayMarker.left + TIMELINE_DATE_LABEL_LEFT_OFFSET
          : 0;
        const labelRight = labelLeft + (dayMarker?.labelWidth || 0);
        const requestedShift = desiredRightGap - currentRightGap;
        const connectorReach =
          cardHalfWidth - TIMELINE_CARD_CONNECTOR_OVERLAP;
        const maxAttachedShift = Math.max(
          0,
          connectorReach - Math.abs(itemX - cardX),
        );
        const maxLeftShift = Math.max(
          0,
          cardX - (dayLeft + cardInset),
        );
        const shift = Math.min(
          requestedShift,
          maxAttachedShift,
          maxLeftShift,
        );
        const shiftedCardX = cardX - shift;
        const overlapsDateLabel =
          preferredSide === 0 &&
          dayMarker?.showLabel &&
          shiftedCardX - cardHalfWidth < labelRight &&
          shiftedCardX + cardHalfWidth > labelLeft;
        if (shift > 0 && !overlapsDateLabel) {
          cardX = shiftedCardX;
        }
      }
      const connectorReach =
        cardHalfWidth - TIMELINE_CARD_CONNECTOR_OVERLAP;
      const minimumCenterSeparation =
        occupiedWidth + TIMELINE_CARD_SPACING;
      const dayMarkerForCard = dateMarkers.find(
        (marker) => marker.dayOrdinal === dayOrdinal,
      );
      const cardCenterMin = Math.max(
        dayLeft + cardInset,
        itemX - connectorReach,
      );
      const cardCenterMax = Math.min(
        dayRight - cardHalfWidth - cardGutter,
        itemX + connectorReach,
      );
      const cardLabelLeft =
        dayMarkerForCard?.left + TIMELINE_DATE_LABEL_LEFT_OFFSET;
      const cardLabelRight =
        cardLabelLeft + (dayMarkerForCard?.labelWidth || 0);
      let side = preferredSide;
      let lane = 0;
      let placedCenter = null;

      // Keep cards on the first row. When a card would collide with another
      // card, scan to the right first (then left) inside its day, keeping its
      // timestamp stem vertical and attached to the card.
      for (
          let distance = 0;
          distance <= Math.max(cardCenterMax - cardCenterMin, 0) &&
          placedCenter === null;
          distance += 8
        ) {
          const candidates =
            distance === 0
              ? [cardX]
              : [cardX + distance, cardX - distance];
          for (const candidate of candidates) {
            if (
              candidate < cardCenterMin ||
              candidate > cardCenterMax ||
              entries.some(
                (entry) =>
                  entry.side === preferredSide &&
                  entry.lane === 0 &&
                  Math.abs(candidate - entry.cardX) < minimumCenterSeparation,
              )
            ) {
              continue;
            }

            if (
              preferredSide === 0 &&
              dayMarkerForCard?.showLabel &&
              candidate <
                cardLabelRight +
                  TIMELINE_DATE_LABEL_CARD_GAP +
                  cardHalfWidth +
                  16 &&
              candidate + cardHalfWidth > cardLabelLeft
            ) {
              continue;
            }

            const crossesAnotherStem = filteredDisplayItems.some(
              (otherItem, otherIndex) =>
                otherIndex !== index &&
                localDayOrdinal(getLocalDayStart(otherItem.timestamp)) ===
                  dayOrdinal &&
                Math.abs(
                  candidate -
                    xForTimestamp(otherItem.timestamp),
                ) <
                  cardHalfWidth + TIMELINE_CARD_CONNECTOR_OVERLAP,
            );
            if (crossesAnotherStem) continue;

            placedCenter = candidate;
            side = preferredSide;
            break;
          }
        }

      if (placedCenter !== null) {
        cardX = placedCenter;
      } else {
        // Preserve the alternating side assignment even for an unusually
        // dense cluster; keep additional lanes on that same side.
        const leftEdge = cardX - occupiedWidth / 2;
        side = preferredSide;
        lane = laneEnds[preferredSide].findIndex(
          (rightEdge) =>
            rightEdge + TIMELINE_CARD_SPACING <= leftEdge,
        );
        if (lane < 0) lane = laneEnds[preferredSide].length;
      }

      laneEnds[side][lane] = cardX + occupiedWidth / 2;
      entries.push({ id: item.id, x: itemX, cardX, side, lane });
    });

    const viewportHeight = timelineViewport.height || 600;
    const defaultCardHeight = 280;
    const topCardExtent = entries.reduce((extent, entry) => {
      if (entry.side !== 0) return extent;
      const cardHeight = measuredCardHeights[entry.id] || defaultCardHeight;
      return Math.max(
        extent,
        64 + entry.lane * TIMELINE_LANE_SPACING + 64 + cardHeight,
      );
    }, 0);
    const bottomCardExtent = entries.reduce((extent, entry) => {
      if (entry.side !== 1) return extent;
      const cardHeight = measuredCardHeights[entry.id] || defaultCardHeight;
      return Math.max(
        extent,
        64 + entry.lane * TIMELINE_LANE_SPACING + cardHeight + 12,
      );
    }, 0);
    const topExtent = isCompact ? 32 : topCardExtent;
    const bottomExtent = isCompact ? 32 : bottomCardExtent;
    // The timeline viewport is fixed-height; horizontal placement absorbs
    // card collisions so users never need to scroll vertically.
    const canvasHeight = viewportHeight;
    const preferredAxisY = viewportHeight * 0.528;
    const axisY = Math.max(
      topExtent,
      Math.min(preferredAxisY, canvasHeight - bottomExtent),
    );
    const canvasWidth = Math.max(
      viewportWidth,
      TIMELINE_LEFT_PADDING + totalDayWidth + TIMELINE_RIGHT_PADDING,
    );

    return {
      entries,
      dateMarkers,
      canvasWidth,
      canvasHeight,
      axisY,
      zoom,
      isCompact,
    };
  }, [filteredDisplayItems, timelineZoom, isFitView, timelineViewport, measuredCardHeights]);
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
          const error = new Error(`Failed to fetch file binary: ${res.status}`);
          error.status = res.status;
          throw error;
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
      {/* ------------------------------------------------------------------- */}
      {/* Timeline search and actions */}
      <div className="absolute top-4 left-4 right-4 z-40 flex flex-wrap items-center justify-between gap-3 pointer-events-none">
        <div className="flex flex-wrap items-center gap-2 pointer-events-auto">
          <label className="relative flex items-center">
            <Search className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search title, memo, or note..."
              aria-label="Search evidence titles, memos, and note content"
              className="w-56 sm:w-64 pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 hover:border-slate-500 focus:border-amber-500 rounded-md text-xs text-slate-100 placeholder:text-slate-500 outline-none shadow-lg"
            />
          </label>
          <label className="flex items-center gap-2 px-2.5 py-2 bg-slate-900 border border-slate-700 rounded-md text-[10px] font-mono uppercase tracking-wider text-slate-400 shadow-lg">
            From
            <input
              type="date"
              value={searchStartDate}
              max={searchEndDate || undefined}
              onChange={(event) => setSearchStartDate(event.target.value)}
              aria-label="Search from date"
              className="w-32 bg-transparent text-xs normal-case tracking-normal text-slate-100 outline-none [color-scheme:dark]"
            />
          </label>
          <label className="flex items-center gap-2 px-2.5 py-2 bg-slate-900 border border-slate-700 rounded-md text-[10px] font-mono uppercase tracking-wider text-slate-400 shadow-lg">
            To
            <input
              type="date"
              value={searchEndDate}
              min={searchStartDate || undefined}
              onChange={(event) => setSearchEndDate(event.target.value)}
              aria-label="Search through date"
              className="w-32 bg-transparent text-xs normal-case tracking-normal text-slate-100 outline-none [color-scheme:dark]"
            />
          </label>
          {(searchQuery || searchStartDate || searchEndDate) && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSearchStartDate("");
                setSearchEndDate("");
              }}
              className="p-2 bg-slate-900 border border-slate-700 hover:border-amber-500 rounded-md text-slate-300 hover:text-amber-400 shadow-lg transition-colors cursor-pointer"
              title="Clear search and date filters"
              aria-label="Clear search and date filters"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <span className="px-2 py-1 rounded bg-slate-900/90 border border-slate-800 text-[10px] font-mono text-slate-400 shadow-lg" aria-live="polite">
            {filteredDisplayItems.length} / {displayItems.length}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 pointer-events-auto">
          <div
            role="group"
            aria-label="Timeline zoom controls"
            className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900 p-1 shadow-lg"
          >
            <button
              type="button"
              onClick={() => {
                setIsFitView(false);
                setTimelineZoom((zoom) =>
                  Math.max(
                    MIN_TIMELINE_ZOOM,
                    Number(((isFitView ? timelineLayout.zoom : zoom) / 1.25).toFixed(3)),
                  ),
                );
              }}
              disabled={!isFitView && timelineZoom <= MIN_TIMELINE_ZOOM}
              aria-label="Zoom out on timeline"
              title="Zoom out"
              className="rounded p-1 text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-40"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="min-w-10 text-center text-[10px] font-mono text-slate-300" aria-live="polite">
              {isFitView
                ? "Fit"
                : timelineZoom < 0.1
                  ? `${(timelineZoom * 100).toFixed(1)}%`
                  : `${Math.round(timelineZoom * 100)}%`}
            </span>
            <button
              type="button"
              onClick={() => {
                setIsFitView(false);
                setTimelineZoom((zoom) =>
                  Math.min(
                    MAX_TIMELINE_ZOOM,
                    Number(((isFitView ? timelineLayout.zoom : zoom) * 1.25).toFixed(3)),
                  ),
                );
              }}
              disabled={!isFitView && timelineZoom >= MAX_TIMELINE_ZOOM}
              aria-label="Zoom in on timeline"
              title="Zoom in"
              className="rounded p-1 text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-40"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setIsFitView(true);
                containerRef.current?.scrollTo({ left: 0, top: 0, behavior: "smooth" });
              }}
              disabled={isFitView}
              className="rounded px-1.5 py-1 text-[10px] text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-40"
              title="Fit the full timeline in view"
            >
              Fit
            </button>
            <button
              type="button"
              onClick={() => {
                setTimelineZoom(1);
                setIsFitView(false);
                containerRef.current?.scrollTo({ left: 0, top: 0, behavior: "smooth" });
              }}
              disabled={!isFitView && timelineZoom === 1}
              className="rounded px-1.5 py-1 text-[10px] text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-40"
            >
              100%
            </button>
          </div>
          {canEdit && !isGroupingMode && (
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
      </div>

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
          ) : filteredDisplayItems.map((item, index) => {
            const entryLayout = timelineLayout.entries[index];
            const isTop = entryLayout.side === 0;
            const laneIndex = entryLayout.lane;
            const connectorLength =
              64 + laneIndex * TIMELINE_LANE_SPACING;
            const isEditing = canEdit && editingId === item.id;
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
                role={timelineLayout.isCompact ? "button" : undefined}
                tabIndex={timelineLayout.isCompact ? 0 : undefined}
                title={
                  timelineLayout.isCompact
                    ? `${item.title} · ${item.dateFormatted} ${item.timeFormatted}`
                    : undefined
                }
                style={{
                  left: entryLayout.x - TIMELINE_MARKER_WIDTH / 2,
                  top: timelineLayout.axisY,
                  transform: "translateY(-50%)",
                }}
                className={`group absolute w-8 h-72 flex flex-col items-center justify-center z-10 ${wrapperClass} ${timelineLayout.isCompact ? "cursor-pointer" : ""}`}
                onKeyDown={(event) => {
                  if (
                    timelineLayout.isCompact &&
                    (event.key === "Enter" || event.key === " ")
                  ) {
                    event.preventDefault();
                    if (!isGroupingMode) {
                      handleOpenEvidenceModal(item);
                    } else if (isGroup) {
                      selectTargetGroup(item.id);
                    } else {
                      toggleSelection(item.id, event.shiftKey);
                    }
                  }
                }}
                onClick={(e) => {
                  if (timelineLayout.isCompact && !isGroupingMode) {
                    handleOpenEvidenceModal(item);
                  } else if (isGroup) {
                    selectTargetGroup(item.id);
                  } else {
                    toggleSelection(item.id, e.shiftKey);
                  }
                }}
              >
                {/* Vertical connector */}
                <div
                  className={`absolute left-1/2 -translate-x-1/2 w-0.5 bg-amber-500/80 z-0 transition-colors duration-150 group-hover:bg-amber-300 group-hover:shadow-[0_0_8px_rgba(252,211,77,0.85)] ${
                    isTop ? "bottom-1/2" : "top-1/2"
                  }`}
                  style={{ height: connectorLength }}
                />

                {/* Timeline marker diamond */}
                <div
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20"
                  aria-hidden={timelineLayout.isCompact}
                >
                  <div
                    className={`${timelineLayout.isCompact ? "w-4 h-4" : "w-3 h-3"} rotate-45 border border-slate-950 shadow-[0_0_6px_rgba(245,158,11,0.7)] transition-all duration-150 group-hover:bg-amber-300 group-hover:scale-125 group-hover:shadow-[0_0_14px_rgba(252,211,77,1)] ${
                      isTargetGroup
                        ? "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,1)]"
                        : item.updatedRecently
                          ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,1)]"
                          : "bg-amber-500"
                    }`}
                  />
                </div>

                {!timelineLayout.isCompact && (
                  <div
                    className="absolute w-48 -translate-x-1/2 z-30"
                    style={{
                      left: `calc(50% + ${entryLayout.cardX - entryLayout.x}px)`,
                      [isTop ? "bottom" : "top"]:
                        `calc(50% + ${connectorLength}px)`,
                    }}
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
                      ref={(element) => {
                        cardContentRefs.current[item.id] = element;
                      }}
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

                          {canEdit && !isEditing && !isGroupingMode && (
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
                        <div className="flex flex-col gap-1 mt-auto pt-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEvidenceModal(item);
                            }}
                            disabled={isThisLoading}
                            className="w-full py-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded text-[11px] font-medium transition flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
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
                              className="w-full py-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 rounded text-[11px] font-medium transition flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <MapPin className="w-3.5 h-3.5" />

                              {isGroup && gpsPhotos.length > 1
                                ? `Location Data (${gpsPhotos.length})`
                                : "Location Data"}
                            </button>
                          )}

                          {canEdit && isGroup && !isGroupingMode && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUngroupEntireGroup(item.id);
                              }}
                              className="w-full py-1 bg-rose-950/60 hover:bg-rose-900/70 border border-rose-800 text-rose-200 rounded text-[11px] font-medium transition cursor-pointer"
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
                )}
              </div>
            );
          })}
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