import React, { useState } from "react";
import { FileText, Film, Image as ImageIcon, Clock } from "lucide-react";

const getThumbnailUrl = (item) => {
  if (!item?.thumbnailLink) return null;
  return item.thumbnailLink.replace(/=s\\d+/, "=s480");
};

function EvidencePreview({ item }) {
  const [hasError, setHasError] = useState(false);
  const thumbnailUrl = getThumbnailUrl(item);

  if (item.type === "text_note") {
    return (
      <div className="flex h-20 w-24 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-950 text-cyan-300">
        <FileText className="h-8 w-8" />
      </div>
    );
  }

  if (thumbnailUrl && !hasError) {
    return (
      <div className="flex h-20 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-700 bg-slate-950">
        <img
          src={thumbnailUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
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
    <div className="flex h-20 w-24 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-950 text-slate-500">
      <Icon className="h-8 w-8" />
    </div>
  );
}

function EvidenceRow({ item, onOpen }) {
  const memo = String(item.memo || item.note || item.noteContent || "").trim();

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full flex-col gap-3 rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-left transition-colors hover:border-amber-500/60 sm:flex-row"
    >
      <EvidencePreview item={item} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="truncate text-sm font-semibold text-slate-100">
            {item.title || item.name || "Untitled evidence"}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-400">
            <Clock className="h-3 w-3" />
            {item.dateFormatted || "Date unavailable"}
            {item.timeFormatted ? ` · ${item.timeFormatted}` : ""}
          </span>
        </span>
        {memo ? (
          <span className="mt-2 block whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-300">
            {memo}
          </span>
        ) : (
          <span className="mt-2 block text-xs italic text-slate-500">
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
    <div className="mx-auto w-full max-w-4xl space-y-4 px-3 pb-8 pt-24 sm:px-6">
      {items.map((item) => {
        if (item.type === "event_group") {
          const photos = item.photos || [];
          return (
            <section
              key={item.id}
              className="rounded-xl border border-amber-500/30 bg-slate-900/80 p-4 shadow-lg sm:p-5"
            >
              <header className="mb-4 border-b border-slate-700 pb-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-base font-semibold text-amber-300">
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
              <div className="space-y-2">
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
            className="rounded-xl border border-slate-700 bg-slate-900/80 p-3 shadow-lg"
          >
            <EvidenceRow item={item} onOpen={() => onOpenEvidence(item)} />
          </section>
        );
      })}
    </div>
  );
}
