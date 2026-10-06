const TIMELINE_DAY_WIDTH = 432;
const TIMELINE_CARD_WIDTH = 216;
const TIMELINE_CARD_SPACING = 32;
export const TIMELINE_MARKER_WIDTH = 32;
const TIMELINE_LEFT_PADDING = 48;
const TIMELINE_RIGHT_PADDING = 64;
export const MIN_TIMELINE_ZOOM = 0.05;
export const MAX_TIMELINE_ZOOM = 3;
const COMPACT_ZOOM_THRESHOLD = 0.6;
export const TIMELINE_LANE_SPACING = 260;
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

export function calculateTimelineLayout({
  filteredDisplayItems,
  timelineZoom,
  isFitView,
  timelineViewport,
  measuredCardHeights,
}) {
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
    // On phones, shift the axis up slightly while retaining a small top
    // buffer for the upper cards. This gives lower cards extra room without
    // adding vertical scrolling.
    const mobileAxisShift = viewportWidth < 640 ? 36 : 0;
    const axisY = Math.max(
      topExtent - mobileAxisShift,
      Math.min(
        preferredAxisY - mobileAxisShift,
        canvasHeight - bottomExtent,
      ),
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
}