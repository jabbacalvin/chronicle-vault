// src/components/map/MapModal.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, MapPin, ChevronLeft, ChevronRight } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix Leaflet default marker icon paths if broken by bundlers
delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

export default function MapModal({ location, onClose }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);

  const [currentIndex, setCurrentIndex] = useState(0);

  /*
   * A normal single location becomes a one-item array.
   *
   * A grouped event passes:
   *
   * location = {
   *   lat,
   *   lng,
   *   title,
   *   locations: [
   *     { lat, lng, title },
   *     { lat, lng, title },
   *     ...
   *   ]
   * }
   */
  const locations = useMemo(() => {
    if (
      location &&
      Array.isArray(location.locations) &&
      location.locations.length > 0
    ) {
      return location.locations;
    }

    return location ? [location] : [];
  }, [location]);

  const currentLocation = locations[currentIndex] || locations[0] || null;

  const lat = Number(currentLocation?.lat);
  const lng = Number(currentLocation?.lng);
  const title = currentLocation?.title || "Location";

  const hasMultipleLocations = locations.length > 1;

  // ---------------------------------------------------------------------------
  // Reset carousel when a completely new MapModal location is opened
  // ---------------------------------------------------------------------------
  useEffect(() => {
    setCurrentIndex(0);
  }, [location]);

  // ---------------------------------------------------------------------------
  // Initialize Leaflet map once
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!location || !mapRef.current || mapInstanceRef.current) return;

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const map = L.map(mapRef.current).setView([lat, lng], 19);

    mapInstanceRef.current = map;

    // Satellite Base Layer
    const satelliteLayer = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 19,
        attribution:
          "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
      },
    );

    // Dedicated Road Lines Overlay Layer
    const roadsLayer = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 19,
        attribution: "Esri World Transportation",
      },
    );

    satelliteLayer.addTo(map);
    roadsLayer.addTo(map);

    markerRef.current = L.marker([lat, lng])
      .addTo(map)
      .bindPopup(title)
      .openPopup();

    // Give Leaflet a moment to calculate the modal's dimensions.
    setTimeout(() => {
      map.invalidateSize();
    }, 100);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      markerRef.current = null;
    };
    // Intentionally initialize the map only when the modal opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  // ---------------------------------------------------------------------------
  // Update map whenever the location carousel changes
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const map = mapInstanceRef.current;

    if (
      !map ||
      !currentLocation ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      return;
    }

    // Move the map to the new GPS location.
    map.setView([lat, lng], 19, {
      animate: true,
    });

    // Move the marker.
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
      markerRef.current.setPopupContent(title).openPopup();
    } else {
      markerRef.current = L.marker([lat, lng])
        .addTo(map)
        .bindPopup(title)
        .openPopup();
    }

    // Leaflet sometimes needs this after the modal has changed dimensions.
    setTimeout(() => {
      map.invalidateSize();
    }, 100);
  }, [currentIndex, currentLocation, lat, lng, title]);

  // ---------------------------------------------------------------------------
  // Navigate to previous GPS location
  // ---------------------------------------------------------------------------
  const handlePrevious = () => {
    if (!hasMultipleLocations) return;

    setCurrentIndex((prev) => (prev === 0 ? locations.length - 1 : prev - 1));
  };

  // ---------------------------------------------------------------------------
  // Navigate to next GPS location
  // ---------------------------------------------------------------------------
  const handleNext = () => {
    if (!hasMultipleLocations) return;

    setCurrentIndex((prev) => (prev === locations.length - 1 ? 0 : prev + 1));
  };

  if (!location || !currentLocation) return null;

  return (
    <div
      onClick={onClose}
      className="cv-modal-backdrop fixed inset-0 z-[80] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col cursor-default"
      >
        {/* ----------------------------------------------------------------- */}
        {/* Modal Header */}
        {/* ----------------------------------------------------------------- */}
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-2 min-w-0">
            <MapPin className="w-4 h-4 text-amber-500 shrink-0" />

            <div className="flex items-center gap-2 min-w-0">
              <h3
                className="text-xs font-mono font-semibold text-slate-100 uppercase tracking-wider truncate"
                title={title}
              >
                {title}
              </h3>

              {/* Location Carousel Counter */}
              {hasMultipleLocations && (
                <span className="shrink-0 text-xs font-mono text-amber-400 bg-slate-900 border border-slate-700 px-2 py-0.5 rounded">
                  {currentIndex + 1} / {locations.length}
                </span>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 transition p-1 rounded-md hover:bg-slate-800 cursor-pointer shrink-0 ml-2"
            title="Close Location Data"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* Map Container */}
        {/* ----------------------------------------------------------------- */}
        <div className="cv-map-canvas w-full h-96 bg-slate-950 relative z-10">
          <div ref={mapRef} className="w-full h-full" />

          {/* --------------------------------------------------------------- */}
          {/* Location Carousel Controls */}
          {/* --------------------------------------------------------------- */}
          {hasMultipleLocations && (
            <>
              <button
                type="button"
                onClick={handlePrevious}
                className="absolute left-3 top-1/2 -translate-y-1/2 z-[1000] w-10 h-10 rounded-full bg-slate-900/90 hover:bg-slate-900 border border-slate-700 text-slate-200 hover:text-amber-400 flex items-center justify-center transition shadow-xl cursor-pointer"
                title="Previous Location"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>

              <button
                type="button"
                onClick={handleNext}
                className="absolute right-3 top-1/2 -translate-y-1/2 z-[1000] w-10 h-10 rounded-full bg-slate-900/90 hover:bg-slate-900 border border-slate-700 text-slate-200 hover:text-amber-400 flex items-center justify-center transition shadow-xl cursor-pointer"
                title="Next Location"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* Footer */}
        {/* ----------------------------------------------------------------- */}
        <div className="px-4 py-3 bg-slate-950/60 border-t border-slate-800 flex items-center justify-between gap-4 text-[11px] font-mono text-slate-400">
          <div className="flex items-center gap-4">
            <span>LAT: {lat.toFixed(6)}</span>
            <span>LNG: {lng.toFixed(6)}</span>
          </div>

          <a
            href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-400 hover:underline shrink-0"
          >
            View on OSM ↗
          </a>
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* Location Carousel Bottom Controls */}
        {/* ----------------------------------------------------------------- */}
        {hasMultipleLocations && (
          <div className="px-4 py-2.5 bg-slate-900 border-t border-slate-800 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={handlePrevious}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-amber-400 rounded text-[11px] font-medium flex items-center gap-1.5 transition cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Previous
            </button>

            <span className="text-[11px] font-mono text-slate-500 min-w-[50px] text-center">
              {currentIndex + 1} / {locations.length}
            </span>

            <button
              type="button"
              onClick={handleNext}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-amber-400 rounded text-[11px] font-medium flex items-center gap-1.5 transition cursor-pointer"
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
