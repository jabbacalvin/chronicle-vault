import React, { useEffect, useRef, useState } from "react";
import { Search, X, ZoomIn, ZoomOut, Layers, FileText, Menu } from "lucide-react";
import { MAX_TIMELINE_ZOOM, MIN_TIMELINE_ZOOM } from "../../utils/timelineLayout";

export default function TimelineToolbar({
  searchQuery,
  setSearchQuery,
  searchStartDate,
  setSearchStartDate,
  searchEndDate,
  setSearchEndDate,
  displayItems,
  filteredDisplayItems,
  timelineZoom,
  setTimelineZoom,
  isFitView,
  setIsFitView,
  timelineLayout,
  containerRef,
  canEdit,
  isGroupingMode,
  isUploadingNote,
  setTextNoteBeingEdited,
  setShowTextNoteModal,
  setIsGroupingMode,
  setTargetGroupId,
  setSelectedIds,
  setSelectionAnchorId
}) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const toolbarRef = useRef(null);

  useEffect(() => {
    if (!isMobileMenuOpen) return undefined;

    const closeOnOutsidePress = (event) => {
      if (!toolbarRef.current?.contains(event.target)) {
        setIsMobileMenuOpen(false);
      }
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setIsMobileMenuOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isMobileMenuOpen]);

  return (
      <div ref={toolbarRef} className="cv-timeline-toolbar absolute top-4 left-4 right-4 z-40 flex flex-wrap items-center justify-between gap-3 pointer-events-none">
        <button
          type="button"
          className="cv-toolbar-toggle pointer-events-auto items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-xs font-medium text-slate-100 shadow-xl"
          aria-controls="timeline-mobile-controls"
          aria-expanded={isMobileMenuOpen}
          aria-label={isMobileMenuOpen ? "Close timeline tools" : "Open timeline tools"}
          onClick={() => setIsMobileMenuOpen((open) => !open)}
        >
          {isMobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          <span>Tools</span>
        </button>
        <div
          id="timeline-mobile-controls"
          className="cv-toolbar-controls"
          data-open={isMobileMenuOpen ? "true" : "false"}
        >
        <div className="cv-timeline-filter-group flex flex-wrap items-center gap-2 pointer-events-auto">
          <label className="relative flex items-center">
            <Search className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search title, memo, or note..."
              aria-label="Search evidence titles, memos, and note content"
              className="cv-timeline-search w-56 sm:w-64 pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 hover:border-slate-500 focus:border-amber-500 rounded-md text-xs text-slate-100 placeholder:text-slate-500 outline-none shadow-lg"
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
              className="cv-timeline-date-input w-32 bg-transparent text-xs normal-case tracking-normal text-slate-100 outline-none [color-scheme:dark]"
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
        <div className="cv-timeline-action-group flex flex-wrap items-center gap-2 pointer-events-auto">
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
                  setIsMobileMenuOpen(false);
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
                    setIsMobileMenuOpen(false);
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
      </div>
  );
}
