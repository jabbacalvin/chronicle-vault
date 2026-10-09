import React from "react";
import {
  Clock,
  MapPin,
  Image as ImageIcon,
  Edit3,
  Check,
  X,
  CheckSquare,
  FileText,
  Film,
} from "lucide-react";
import {
  TIMELINE_LANE_SPACING,
  TIMELINE_MARKER_WIDTH,
} from "../../utils/timelineLayout";

export default function TimelineCardList({
  items,
  timelineLayout,
  canEdit,
  loadingItemId,
  selection,
  editing,
  actions,
  refs,
}) {
  const { isGroupingMode, selectedIds, targetGroupId } = selection;
  const {
    id: editingId,
    title: editTitle,
    memo: editMemo,
    date: editDate,
    setTitle: setEditTitle,
    setMemo: setEditMemo,
    setDate: setEditDate,
  } = editing;
  const {
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
  } = actions;
  const { cardRefs, cardContentRefs } = refs;

  return items.map((item, index) => {
            const entryLayout = timelineLayout.entries[index];
            const isTop = entryLayout.side === 0;
            const laneIndex = entryLayout.lane;
            const connectorLength =
              64 + laneIndex * TIMELINE_LANE_SPACING;
            const isEditing = canEdit && editingId === item.id;
            const isThisLoading = loadingItemId === item.id;
            const isSelected = selectedIds.includes(item.id);
            const isGroup = item.type === "event_group";
            const isVideo =
              item.type === "video" ||
              String(item.mimeType || "").toLowerCase().startsWith("video/");
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
                              : isVideo
                                ? "VIDEO"
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
                            ) : isVideo ? (
                              <Film className="w-3.5 h-3.5" />
                            ) : (
                              <ImageIcon className="w-3.5 h-3.5" />
                            )}

                            {isThisLoading
                              ? "Loading..."
                              : isGroup
                                ? `View Items (${photoCount})`
                                : item.type === "text_note"
                                  ? "Read Note"
                                  : isVideo
                                    ? "View Video"
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
  });
}
