import React, { useEffect, useRef, useState } from "react";
import { FileText, Film, Image as ImageIcon, Clock } from "lucide-react";

const getThumbnailUrl = (item) => {
  if (!item?.thumbnailLink) return null;
  return item.thumbnailLink.replace(/=s\d+/, "=s1200");
};

const isVideoEvidence = (item) =>
  item?.type === "video" ||
  String(item?.mimeType || "").toLowerCase().startsWith("video/");

function EvidencePreview({ item, fetchItemImageUrl, releaseItemImageUrl, maxImageHeight }) {
  const [hasError, setHasError] = useState(false);
  const [imageUrl, setImageUrl] = useState(() => getThumbnailUrl(item));
  const previewRef = useRef(null);
  const isVideo = isVideoEvidence(item);
  const thumbnailUrl = getThumbnailUrl(item);

  useEffect(() => {
    if (isVideo || !fetchItemImageUrl) return undefined;

    const element = previewRef.current;
    if (!element) return undefined;

    let active = true;
    const loadFullImage = async () => {
      try {
        const fullImageUrl = await fetchItemImageUrl(item);
        if (active) setImageUrl(fullImageUrl);
        else releaseItemImageUrl?.(item);
      } catch {
        if (active && !thumbnailUrl) setHasError(true);
      }
    };

    if (typeof IntersectionObserver === "undefined") {
      loadFullImage();
      return () => {
        active = false;
        releaseItemImageUrl?.(item);
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        loadFullImage();
      },
      { rootMargin: "800px 0px" },
    );
    observer.observe(element);

    return () => {
      active = false;
      observer.disconnect();
      releaseItemImageUrl?.(item);
    };
  }, [fetchItemImageUrl, item, isVideo, releaseItemImageUrl, thumbnailUrl]);

  if (item.type === "text_note") {
    return (
      <div
        className="flex min-h-40 w-full items-center justify-center bg-slate-950/60 p-6 text-cyan-300"
        aria-label="Text note"
      >
        <div className="text-center">
          <FileText className="mx-auto mb-2 h-9 w-9" />
          <p className="text-sm text-slate-400">Text note</p>
        </div>
      </div>
    );
  }

  const Icon = isVideo ? Film : ImageIcon;
  return (
    <div ref={previewRef} className="flex w-full items-center justify-center">
      {imageUrl && !hasError ? (
        <img
          src={imageUrl}
          alt={item.title || item.name || "Evidence"}
          loading="lazy"
          decoding="async"
          className="block h-auto max-w-full object-contain"
          style={{ maxHeight: `${maxImageHeight}px` }}
          onError={() => {
            if (imageUrl !== thumbnailUrl && thumbnailUrl) setImageUrl(thumbnailUrl);
            else setHasError(true);
          }}
        />
      ) : (
        <div className="flex min-h-40 w-full items-center justify-center bg-slate-950/40 text-slate-500">
          <Icon className="h-10 w-10" />
        </div>
      )}
    </div>
  );
}

function EvidenceRow({
  item,
  onOpen,
  fetchItemImageUrl,
  releaseItemImageUrl,
  maxImageHeight,
}) {
  const memo = String(\n    item.type === "text_note"\n      ? item.noteContent || item.memo || item.note || ""\n      : item.memo || item.note || item.noteContent || "",\n  ).trim();

  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full rounded-lg border border-slate-700 bg-slate-950/70 p-3 text-left shadow-md transition-colors hover:border-amber-500/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 sm:p-4"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="break-words text-base font-semibold text-slate-100">
          {item.title || item.name || "Untitled evidence"}
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-mono text-slate-400">
          <Clock className="h-3 w-3" />
          {item.dateFormatted || "Date unavailable"}
          {item.timeFormatted ? ` · ${item.timeFormatted}` : ""}
        </span>
      </div>
      <div className="grid grid-cols-1 items-center gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)] lg:gap-6">
        <EvidencePreview
          item={item}
          fetchItemImageUrl={fetchItemImageUrl}
          releaseItemImageUrl={releaseItemImageUrl}
          maxImageHeight={maxImageHeight}
        />
        <span
          className={
            memo
              ? "whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-300"
              : "text-xs italic text-slate-500"
          }
        >
          {memo || "No evidence memo"}
        </span>
      </div>
    </button>
  );
}

export default function EvidenceListView({
  items,
  onOpenEvidence,
  fetchItemImageUrl,
  releaseItemImageUrl,
  zoom = 1,
  isFitView = false,
  viewportHeight = 0,
}) {
  if (!items.length) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-sm text-slate-400">
        No evidence matches these filters.
      </div>
    );
  }

  const zoomLevel = isFitView ? 1 : Math.max(0.05, Math.min(3, Number(zoom) || 1));
  const availableHeight =
    viewportHeight ||
    (typeof window === "undefined" ? 900 : window.innerHeight);
  const maxImageHeight = Math.max(220, availableHeight - 300);
  const previewProps = {
    fetchItemImageUrl,
    releaseItemImageUrl,
    maxImageHeight,
  };

  return (
    <div
      className="w-full space-y-8 px-3 pb-8 pt-24 sm:px-5 lg:px-8 2xl:px-12"
      style={{ zoom: zoomLevel }}
    >
      {items.map((item) => {
        if (item.type === "event_group") {
          const photos = item.photos || [];
          return (
            <section key={item.id} className="w-full rounded-xl border border-amber-500/30 bg-slate-900/80 p-3 shadow-lg sm:p-5 lg:p-6">
              <header className="mb-5 border-b border-slate-700/70 pb-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-base font-semibold text-amber-300 sm:text-lg">
                    {item.title || "Milestone Event"}
                  </h2>
                  <span className="text-xs font-mono text-slate-400">
                    {item.dateFormatted}
                    {item.timeFormatted ? ` · ${item.timeFormatted}` : ""}
                    {photos.length ? ` · ${photos.length} items` : ""}
                  </span>
                </div>
                {(item.memo || item.note) && (
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-300">
                    {item.memo || item.note}
                  </p>
                )}
              </header>
              <div className="space-y-4">
                {photos.length ? (
                  photos.map((photo, index) => (
                    <EvidenceRow
                      key={photo.id}
                      item={photo}
                      {...previewProps}
                      onOpen={() => onOpenEvidence(item, index)}
                    />
                  ))
                ) : (
                  <p className="text-xs text-slate-500">
                    No evidence is attached to this group.
                  </p>
                )}
              </div>
            </section>
          );
        }

        return (
          <section key={item.id} className="w-full">
            <EvidenceRow
              item={item}
              {...previewProps}
              onOpen={() => onOpenEvidence(item, 0)}
            />
          </section>
        );
      })}
    </div>
  );
}
