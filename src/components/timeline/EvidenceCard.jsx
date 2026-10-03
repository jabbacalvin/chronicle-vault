import React, { useEffect, useRef } from "react";
import L from "leaflet";
import { X, MapPin } from "lucide-react";

export default function MapModal({ location, onClose }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);

  useEffect(() => {
    if (!mapRef.current || !location) return;

    if (!mapInstance.current) {
      mapInstance.current = L.map(mapRef.current).setView(
        [location.lat, location.lng],
        14,
      );

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(mapInstance.current);

      const customIcon = L.divIcon({
        className: "custom-pin",
        html: `<div style="background-color: #6366f1; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.5);"></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      L.marker([location.lat, location.lng], { icon: customIcon })
        .addTo(mapInstance.current)
        .bindPopup(location.title)
        .openPopup();
    }

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [location]);

  if (!location) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden w-full max-w-2xl shadow-2xl flex flex-col">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <div className="flex items-center gap-2 text-indigo-400 text-sm font-semibold">
            <MapPin className="w-4 h-4" />
            <span className="text-slate-200">{location.title}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div ref={mapRef} className="h-96 w-full bg-slate-950" />
        <div className="p-3 bg-slate-900/50 text-[11px] font-mono text-slate-400 text-center border-t border-slate-800">
          GPS: {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
        </div>
      </div>
    </div>
  );
}
