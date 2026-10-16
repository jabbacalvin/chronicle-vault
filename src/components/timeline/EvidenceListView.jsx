import React, { useState } from "react";
import { FileText, Film, Image as ImageIcon, Clock } from "lucide-react";

const getThumbnailUrl = (item) => {
  if (!item?.thumbnailLink) return null;
  return item.thumbnailLink.replace(/=s\\d+/, "=s1200");
};

function EvidencePreview({ item }) {
  const [hasError, setHasError] = useState(false);
  const thumbnailUrl = getThumbnailUrl(item);

  if (item.type === "text_note") {
    const noteText = String(item.noteContent || item.memo || item.note || "").trim();
    return (
      <div className="flex min-h-56 w-full items-center justify-center overflow-hidden rounded-lg border border-slate-700 bg-slate-950 p-6 text-cyan-300">
        <div className="max-w-xl text-center">
          <FileText className="mx-auto mb-3 h-9 w-9" />
          <p className="line-clamp-6 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-300">
            {noteText || "Text evidence"}
          </p>
        </div>
      </div>
    );
  }

  if (thumbnailUrl && !hasError) {
    return (
      <div className="flex min-h-56 w-full items-center justify-center overflow-hidden rounded-lg border border-slate-700 bg-slate-950 p-2">
        <img
          src={thumbnailUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-auto w-auto max-h-[72vh] max-w-full object-contain"
          onError={() => setHasError(true)}
        />
      </div>
    );
  }

  const isVideo =
    item.type === "video" ||
    String(item.mimeType || "").toLowerCase().startsWith("video/");
  const Icon = isVideo ? Film : ImageIcon;

  return (
    <div className="flex min-h-56 w-full items-center justify-center rounded-lg border border-slate-700 bg-slate-950 text-slate-500">
      <Icon className="h-10 w-10" />
    </div>
  );
}

function EvidenceRow({ item, onOpen }) {
  const memo = String(item.memo || item.note || item.noteContent || "").trim();

  return (
    <button
      type="button"
      onClick={onOpen}
      className="grid w-full grid-cols-1 items-stretch gap-4 rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-left transition-colors hover:border-amber-500/60 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,1fr)] lg:gap-6 lg:p-5"
    >
      <EvidencePreview item={item} />
      <span className="flex min-w-0 flex-col justify-center py-1 lg:py-4">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="break-words text-base font-semibold text-slate-100">
            {item.title || item.name || "Untitled evidence"}
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-mono text-slate-400">
            <Clock className="h-3 w-3" />
            {item.dateFormatted || "Date unavailable"}
            {item.timeFormatted ? ` · ${item.timeFormatted}` : ""}
          </span>
        </span>
        {memo ? (
          <span className="mt-3 block whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-300">
            {memo}
          </span>
        ) : (
          <span className="mt-3 block text-xs italic text-slate-500">
            No evidence memo
          </span>
        )}
      </span>
    </button>
  );
}

export default function EvidenceListView({ items, onOpenEvidence }) {
  if (!items.length) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-sm text-slate-400">
        No evidence matches these filters.
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 px-3 pb-8 pt-24 sm:px-5 lg:px-8 2xl:px-12">
      {items.map((item) => {
        if (item.type === "event_group") {
          const photos = item.photos || [];
          return (
            <section
              key={item.id}
              className="w-full rounded-xl border border-amber-500/30 bg-slate-900/80 p-3 shadow-lg sm:p-5 lg:p-6"
            >
              <header className="mb-4 border-b border-slate-700 pb-3 sm:mb-5 sm:pb-4">
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
                  photos.map((photo) => (
                    <EvidenceRow
                      key={photo.id}
                      item={photo}
                      onOpen={() => onOpenEvidence(item)}
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
          <section
            key={item.id}
            className="w-full rounded-xl border border-slate-700 bg-slate-900/80 p-3 shadow-lg sm:p-5"
          >
            <EvidenceRow item={item} onOpen={() => onOpenEvidence(item)} />
          </section>
        );
      })}
    </div>
  );
}
