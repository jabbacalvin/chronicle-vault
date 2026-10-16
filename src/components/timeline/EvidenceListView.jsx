import React, { useEffect, useRef, useState } from "react";
import { FileText, Film, Image as ImageIcon, Clock, Play } from "lucide-react";

const isVideoEvidence = (item) =>
  item?.type === "video" ||
  String(item?.mimeType || "").toLowerCase().startsWith("video/");

const extractFirstVideoFrame = (src) =>
  new Promise((resolve, reject) => {
    const video = document.createElement("video");
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      finish(new Error("Timed out while decoding video preview."));
    }, 15000);

    const finish = (error, frame) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      video.onloadeddata = null;
      video.onerror = null;
      video.removeAttribute("src");
      video.load();
      if (error) reject(error);
      else resolve(frame);
    };

    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.onloadeddata = () => {
      try {
        if (!video.videoWidth || !video.videoHeight) {
          throw new Error("The browser could not decode a video frame.");
        }
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Could not create a video preview.");
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        finish(null, canvas.toDataURL("image/jpeg", 0.84));
      } catch (error) {
        finish(error);
      }
    };
    video.onerror = () =>
      finish(new Error("The browser could not decode a video preview."));
    video.src = src;
    video.load();
  });

function EvidencePreview({
  item,
  fetchItemImageUrl,
  fetchItemThumbnailUrl,
  releaseItemImageUrl,
  maxImageHeight,
}) {
  const [hasError, setHasError] = useState(false);
  const [imageUrl, setImageUrl] = useState(null);
  const [thumbnailImageUrl, setThumbnailImageUrl] = useState(null);
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const [isLoadingThumbnail, setIsLoadingThumbnail] = useState(false);
  const [videoUrl, setVideoUrl] = useState(null);
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const previewRef = useRef(null);
  const videoPreviewMountedRef = useRef(true);
  const videoFrameFallbackAttemptedRef = useRef(false);
  const isVideo = isVideoEvidence(item);

  useEffect(() => {
    const element = previewRef.current;
    if (!element) return undefined;

    let active = true;
    videoPreviewMountedRef.current = true;

    const loadVisiblePreview = async () => {
      if (isVideo) setIsLoadingThumbnail(Boolean(item.thumbnailLink));
      else setIsLoadingImage(Boolean(fetchItemImageUrl));

      const thumbnailTask = (async () => {
        let url = null;
        if (fetchItemThumbnailUrl && item.thumbnailLink) {
          try {
            url = await fetchItemThumbnailUrl(item);
          } catch {
            // Some Drive videos do not have a generated thumbnail.
          }
        }

        if (active && url) {
          setThumbnailImageUrl(url);
          setHasError(false);
        } else if (!active && url) {
          releaseItemImageUrl?.(item);
        } else if (isVideo) {
          await loadVideoFrameFallback();
        }
      })();

      const imageTask =
        !isVideo && fetchItemImageUrl
          ? fetchItemImageUrl(item)
              .then((url) => {
                if (active && url) {
                  setImageUrl(url);
                  setHasError(false);
                } else if (url) {
                  releaseItemImageUrl?.(item);
                }
              })
              .catch(() => {
                if (active) setHasError(true);
              })
          : Promise.resolve();

      await Promise.allSettled([thumbnailTask, imageTask]);
      if (active) {
        setIsLoadingImage(false);
        setIsLoadingThumbnail(false);
      }
    };

    if (typeof IntersectionObserver === "undefined") {
      loadVisiblePreview();
      return () => {
        active = false;
        videoPreviewMountedRef.current = false;
        releaseItemImageUrl?.(item);
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        loadVisiblePreview();
      },
      { rootMargin: "800px 0px" },
    );
    observer.observe(element);

    return () => {
      active = false;
      observer.disconnect();
      videoPreviewMountedRef.current = false;
      releaseItemImageUrl?.(item);
    };
  }, [
    fetchItemImageUrl,
    fetchItemThumbnailUrl,
    item,
    isVideo,
    releaseItemImageUrl,
  ]);

  const loadVideoFrameFallback = async () => {
    if (videoFrameFallbackAttemptedRef.current || !fetchItemImageUrl) return;
    videoFrameFallbackAttemptedRef.current = true;
    setIsLoadingThumbnail(true);

    try {
      const videoSourceUrl = await fetchItemImageUrl(item);
      if (!videoPreviewMountedRef.current) {
        releaseItemImageUrl?.(item);
        return;
      }
      const frame = await extractFirstVideoFrame(videoSourceUrl);
      if (videoPreviewMountedRef.current) setThumbnailImageUrl(frame);
    } catch {
      // Keep the play control available if this browser cannot decode a still.
    } finally {
      if (videoPreviewMountedRef.current) setIsLoadingThumbnail(false);
    }
  };

  const handleLoadVideo = async (event) => {
    event.stopPropagation();
    if (videoUrl || isLoadingVideo || !fetchItemImageUrl) return;

    setIsLoadingVideo(true);
    setVideoError(false);
    try {
      const loadedUrl = await fetchItemImageUrl(item);
      if (videoPreviewMountedRef.current) setVideoUrl(loadedUrl);
      else releaseItemImageUrl?.(item);
    } catch {
      if (videoPreviewMountedRef.current) setVideoError(true);
    } finally {
      if (videoPreviewMountedRef.current) setIsLoadingVideo(false);
    }
  };

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
  const previewImageUrl = imageUrl || thumbnailImageUrl;
  if (isVideo) {
    return (
      <div ref={previewRef} className="flex w-full justify-center">
        {videoUrl ? (
          <video
            className="mx-auto block h-auto max-w-full bg-black object-contain"
            style={{ maxHeight: maxImageHeight + "px" }}
            src={videoUrl}
            poster={thumbnailImageUrl || undefined}
            controls
            playsInline
            preload="auto"
            onClick={(event) => event.stopPropagation()}
            onError={() => setVideoError(true)}
            aria-label={item.title || item.name || "Evidence video"}
          />
        ) : (
          <button
            type="button"
            onClick={handleLoadVideo}
            disabled={isLoadingVideo}
            className="relative flex min-h-48 w-full items-center justify-center overflow-hidden rounded-lg bg-slate-950/60 text-slate-200 disabled:cursor-wait"
            aria-label={isLoadingVideo ? "Loading video" : "Load video: " + (item.title || item.name || "Evidence")}
          >
            {thumbnailImageUrl ? (
              <img
                src={thumbnailImageUrl}
                alt=""
                loading="lazy"
                className="absolute inset-0 h-full w-full object-contain opacity-70"
                onError={() => {
                  setThumbnailImageUrl(null);
                  if (isVideo) loadVideoFrameFallback();
                }}
              />
            ) : (
              <Film className="absolute h-12 w-12 text-slate-600" />
            )}
            {isLoadingThumbnail && (
              <span className="absolute right-3 top-3 inline-flex items-center gap-2 rounded-full bg-slate-950/90 px-3 py-2 text-xs text-slate-200" role="status">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
                Loading preview
              </span>
            )}
            <span className="relative z-10 inline-flex items-center gap-2 rounded-full border border-slate-500 bg-slate-950/90 px-4 py-2 text-sm font-medium">
              {isLoadingVideo ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
              ) : (
                <Play className="h-4 w-4 fill-current" />
              )}
              {isLoadingVideo ? "Loading video…" : "Load video"}
            </span>
          </button>
        )}
        {videoError && (
          <p className="mt-2 text-xs text-rose-300">
            Video could not be loaded or decoded. Check Drive access and browser codec support, then try again.
          </p>
        )}
      </div>
    );
  }

  return (
    <div ref={previewRef} className="relative flex w-full items-center justify-center">
      {previewImageUrl && !hasError ? (
        <img
          src={previewImageUrl}
          alt={item.title || item.name || "Evidence"}
          loading="lazy"
          decoding="async"
          className="block h-auto max-w-full object-contain"
          style={{ maxHeight: maxImageHeight + "px" }}
          onError={() => {
            if (imageUrl && previewImageUrl === imageUrl) {
              setImageUrl(null);
              if (thumbnailImageUrl) setHasError(false);
              else setHasError(true);
            } else {
              setThumbnailImageUrl(null);
              if (!imageUrl) setHasError(true);
            }
          }}
        />
      ) : (
        <div className="flex min-h-40 w-full items-center justify-center bg-slate-950/40 text-slate-500">
          {isLoadingImage ? (
            <span className="inline-flex items-center gap-3 text-sm text-slate-300" role="status" aria-live="polite">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
              Loading image…
            </span>
          ) : (
            <Icon className="h-10 w-10" />
          )}
        </div>
      )}
      {isLoadingImage && previewImageUrl && !hasError && (
        <span className="absolute right-3 top-3 inline-flex items-center gap-2 rounded-full bg-slate-950/90 px-3 py-2 text-xs text-slate-200 shadow" role="status" aria-live="polite">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
          Loading full image
        </span>
      )}
    </div>
  );
}

function EvidenceRow({
  item,
  onOpen,
  fetchItemImageUrl,
  fetchItemThumbnailUrl,
  releaseItemImageUrl,
  maxImageHeight,
}) {
  const memo = String(
    item.type === "text_note"
      ? item.noteContent || item.memo || item.note || ""
      : item.memo || item.note || item.noteContent || "",
  ).trim();

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open evidence: ${item.title || item.name || "Untitled evidence"}`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className="block w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-950/70 p-3 text-left shadow-md transition-colors hover:border-amber-500/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 sm:p-4"
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
          fetchItemThumbnailUrl={fetchItemThumbnailUrl}
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
    </div>
  );
}

export default function EvidenceListView({
  items,
  onOpenEvidence,
  fetchItemImageUrl,
  fetchItemThumbnailUrl,
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
    fetchItemThumbnailUrl,
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
