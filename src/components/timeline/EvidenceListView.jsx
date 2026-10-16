import React, { useEffect, useRef, useState } from "react";
import { FileText, Film, Image as ImageIcon, Clock } from "lucide-react";

const getThumbnailUrl = (item) => {
  if (!item?.thumbnailLink) return null;
  return item.thumbnailLink.replace(/=s\\d+/, "=s1200");
};

const isVideoEvidence = (item) =>
  item?.type === "video" ||
  String(item?.mimeType || "").toLowerCase().startsWith("video/");

function EvidencePreview({ item, fetchItemImageUrl, releaseItemImageUrl }) {
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
    const noteText = String(item.noteContent || item.memo || item.note || "").trim();
    return (
      <div className="flex min-h-40 w-full items-center justify-center bg-slate-950/60 p-6 text-cyan-300">
        <div className="max-w-3xl text-center">
          <FileText className="mx-auto mb-3 h-9 w-9" />
          <p className="line-clamp-6 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-300">
            {noteText || "Text evidence"}
          </p>
        </div>
      </div>
    );
  }

  const Icon = isVideo ? Film : ImageIcon;
  if (imageUrl && !hasError) {
    return (
      <img
        ref={previewRef}
        src={imageUrl}
        alt={item.title || item.name || "Evidence"}
        loading="lazy"
        decoding="async"
        className="mx-auto block h-auto max-h-[82vh] w-full object-contain"
        onError={() => {
          if (imageUrl !== thumbnailUrl && thumbnailUrl) setImageUrl(thumbnailUrl);
          else setHasError(true);
        }}
      />
    );
  }

  return (
    <div className="flex min-h-40 w-full items-center justify-center bg-slate-950/40 text-slate-500">
      <Icon className="h-10 w-10" />
    </div>
  );
}

function EvidenceRow({
  item,
  onOpen,
  fetchItemImageUrl,
  releaseItemImageUrl,
}) {
  const memo = String(item.memo || item.note || item.noteContent || "").trim();

  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
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
      <EvidencePreview
        item={item}
        fetchItemImageUrl={fetchItemImageUrl}
        releaseItemImageUrl={releaseItemImageUrl}
      />
      {memo ? (
        <span className="mt-3 block whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-300">
          {memo}
        </span>
      ) : (
        <span className="mt-3 block text-xs italic text-slate-500">
          No evidence memo
        </span>
      )}
    </button>
  );
}

export default function EvidenceListView({
  items,
  onOpenEvidence,
  fetchItemImageUrl,
  releaseItemImageUrl,
}) {
  if (!items.length) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-sm text-slate-400">
        No evidence matches these filters.
      </div>
    );
  }

  const previewProps = { fetchItemImageUrl, releaseItemImageUrl };

  return (
    <div className="w-full space-y-8 px-3 pb-8 pt-24 sm:px-5 lg:px-8 2xl:px-12">
      {items.map((item) => {
        if (item.type === "event_group") {
          const photos = item.photos || [];
          return (
            <section key={item.id} className="w-full border-b border-amber-500/25 pb-8">
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
              <div className="space-y-8">
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
          <section key={item.id} className="w-full border-b border-slate-700/70 pb-8">
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
