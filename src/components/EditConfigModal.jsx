import React, { useState } from "react";
import { X, Plus, Download, Calendar, FileText } from "lucide-react";

export default function EditConfigModal({
  onClose,
  currentConfig = {},
  images = [],
}) {
  const [config, setConfig] = useState(() => {
    return {
      overrides: currentConfig.overrides || {},
      virtualEntries: currentConfig.virtualEntries || [],
    };
  });

  const [activeTab, setActiveTab] = useState("overrides");

  // Convert an ISO/timestamp value to the local wall-clock format expected by
  // <input type="datetime-local">. Slicing an ISO string directly displays
  // UTC as though it were local time.
  const formatDateTimeLocal = (value) => {
    if (!value) return "";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    const pad = (part) => String(part).padStart(2, "0");

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
      date.getDate(),
    )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const [newNote, setNewNote] = useState({
    title: "",
    description: "",
    customDate: "",
    latitude: "",
    longitude: "",
  });

  const handleDateOverrideChange = (fileId, newDate) => {
    setConfig((prev) => ({
      ...prev,
      overrides: {
        ...prev.overrides,
        [fileId]: {
          ...(prev.overrides[fileId] || {}),
          customDate: newDate,
        },
      },
    }));
  };

  const handleAddVirtualEntry = (e) => {
    e.preventDefault();
    if (!newNote.title || !newNote.customDate) return;

    setConfig((prev) => ({
      ...prev,
      virtualEntries: [
        ...prev.virtualEntries,
        {
          ...newNote,
          latitude: newNote.latitude ? parseFloat(newNote.latitude) : null,
          longitude: newNote.longitude ? parseFloat(newNote.longitude) : null,
        },
      ],
    }));

    setNewNote({
      title: "",
      description: "",
      customDate: "",
      latitude: "",
      longitude: "",
    });
  };

  const handleRemoveVirtualEntry = (index) => {
    setConfig((prev) => ({
      ...prev,
      virtualEntries: prev.virtualEntries.filter((_, i) => i !== index),
    }));
  };

  const handleExportJson = () => {
    const outputObj = {};

    Object.keys(config.overrides).forEach((fileId) => {
      if (config.overrides[fileId].customDate) {
        outputObj[fileId] = config.overrides[fileId];
      }
    });

    if (config.virtualEntries.length > 0) {
      outputObj.virtualEntries = config.virtualEntries;
    }

    const dataStr =
      "data:text/json;charset=utf-8," +
      encodeURIComponent(JSON.stringify(outputObj, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "timeline-config.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden w-full max-w-2xl shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <div className="flex items-center gap-2 text-amber-400 text-sm font-semibold">
            <Calendar className="w-4 h-4" />
            <span className="text-slate-200">Timeline Config & Editor</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/50 px-4 pt-2 gap-4">
          <button
            onClick={() => setActiveTab("overrides")}
            className={`pb-2 text-xs font-mono border-b-2 transition cursor-pointer ${
              activeTab === "overrides"
                ? "border-amber-500 text-amber-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            Edit Photo Dates
          </button>
          <button
            onClick={() => setActiveTab("virtual")}
            className={`pb-2 text-xs font-mono border-b-2 transition cursor-pointer ${
              activeTab === "virtual"
                ? "border-amber-500 text-amber-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            Add Custom Notes / Text Files
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 flex-1 overflow-y-auto flex flex-col gap-4 custom-scrollbar">
          {activeTab === "overrides" ? (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-slate-400">
                Modify capture dates for files detected in your Google Drive
                folder:
              </p>
              {images.map((img) => (
                <div
                  key={img.id}
                  className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-xl gap-4"
                >
                  <div className="flex flex-col truncate">
                    <span className="text-xs font-semibold text-slate-200 truncate">
                      {img.title}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      ID: {img.id}
                    </span>
                  </div>
                  <input
                    type="datetime-local"
                    className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:border-amber-500 outline-none"
                    value={
                      config.overrides[img.id]?.customDate
                        ? formatDateTimeLocal(
                            config.overrides[img.id].customDate,
                          )
                        : ""
                    }
                    onChange={(e) =>
                      handleDateOverrideChange(
                        img.id,
                        e.target.value
                          ? new Date(e.target.value).toISOString()
                          : "",
                      )
                    }
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              <form
                onSubmit={handleAddVirtualEntry}
                className="flex flex-col gap-3 bg-slate-950 p-4 border border-slate-800 rounded-xl"
              >
                <span className="text-xs font-mono text-amber-400 font-semibold flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" /> Add Virtual Timeline Note
                </span>
                <input
                  type="text"
                  placeholder="Note Title (e.g. Investigation Briefing)"
                  value={newNote.title}
                  onChange={(e) =>
                    setNewNote({ ...newNote, title: e.target.value })
                  }
                  className="bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
                  required
                />
                <textarea
                  placeholder="Description or notes..."
                  value={newNote.description}
                  onChange={(e) =>
                    setNewNote({ ...newNote, description: e.target.value })
                  }
                  className="bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 outline-none focus:border-amber-500 resize-none h-20"
                />
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="datetime-local"
                    value={newNote.customDate}
                    onChange={(e) =>
                      setNewNote({
                        ...newNote,
                        customDate: e.target.value
                          ? new Date(e.target.value).toISOString()
                          : "",
                      })
                    }
                    className="bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 outline-none focus:border-amber-500 col-span-3"
                    required
                  />
                  <input
                    type="number"
                    step="any"
                    placeholder="Latitude (optional)"
                    value={newNote.latitude}
                    onChange={(e) =>
                      setNewNote({ ...newNote, latitude: e.target.value })
                    }
                    className="bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
                  />
                  <input
                    type="number"
                    step="any"
                    placeholder="Longitude (optional)"
                    value={newNote.longitude}
                    onChange={(e) =>
                      setNewNote({ ...newNote, longitude: e.target.value })
                    }
                    className="bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
                  />
                  <button
                    type="submit"
                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-lg text-xs py-2 flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Note
                  </button>
                </div>
              </form>

              {/* Existing Virtual Entries List */}
              <div className="flex flex-col gap-2">
                <span className="text-xs font-mono text-slate-400">
                  Current Added Notes:
                </span>
                {config.virtualEntries.length === 0 ? (
                  <p className="text-xs text-slate-600 italic">
                    No custom notes added yet.
                  </p>
                ) : (
                  config.virtualEntries.map((entry, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-xl"
                    >
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-slate-200">
                          {entry.title}
                        </span>
                        <span className="text-[10px] font-mono text-amber-500">
                          {entry.customDate}
                        </span>
                      </div>
                      <button
                        onClick={() => handleRemoveVirtualEntry(idx)}
                        className="text-xs text-rose-400 hover:text-rose-300 cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Action */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between">
          <span className="text-[11px] text-slate-400 font-mono">
            Download and replace `timeline-config.json` in your Drive folder.
          </span>
          <button
            onClick={handleExportJson}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-xl text-xs transition flex items-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4" /> Export `timeline-config.json`
          </button>
        </div>
      </div>
    </div>
  );
}
