import { useEffect, useRef } from "react";
import { heicTo } from "heic-to";

export default function useDriveImageLoader(accessToken) {
  const objectUrlsRef = useRef(new Set());
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

  const getCachedImageUrl = (item) => {
    const cacheKey = getImageCacheKey(item);
    return cacheKey ? resolvedImageCacheRef.current.get(cacheKey) : null;
  };

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


  return {
    getImageCacheKey,
    getCachedImageUrl,
    getThumbnailUrl,
    fetchItemImageUrl,
    prefetchAdjacentPhotos,
  };
}
