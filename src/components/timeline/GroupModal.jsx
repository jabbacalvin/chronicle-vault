// src/components/timeline/GroupModal.jsx
import React, { useState } from "react";
import { X, Check, Layers } from "lucide-react";

export default function GroupModal({
  isOpen,
  onClose,
  onSave,
  selectedCount,
  defaultDate = "",
}) {
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(null);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave({ title, note, date: date ?? defaultDate });
    setTitle("");
    setNote("");
    setDate(null);
  };

  return (
    <div className="cv-modal-backdrop fixed inset-0 z-[60] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="cv-modal-panel bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <Layers className="w-4 h-4 text-amber-500" />
            Create Milestone Note
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 flex flex-col gap-3">
          <p className="text-xs text-slate-400 mb-1">
            Grouping <strong className="text-amber-500">{selectedCount}</strong>{" "}
            items into a single timeline event.
          </p>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
              Milestone Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 outline-none focus:border-amber-500 transition-colors"
              placeholder="e.g. Exhibit A: Breach of Contract Evidence"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
              Narrative Note
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 outline-none focus:border-amber-500 transition-colors resize-none h-24"
              placeholder="Enter detailed case notes, witness statements, or evidentiary context for this milestone..."
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
              Date & Time
            </label>
            <input
              type="datetime-local"
              value={date ?? defaultDate}
              onChange={(e) => setDate(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 outline-none focus:border-amber-500 transition-colors"
            />
            <p className="text-[10px] text-slate-500">
              Defaults to the earliest selected image. For note-only groups, it
              uses the earliest selected note. Change it if the milestone
              belongs at a different time.
            </p>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-slate-800 flex justify-end gap-2 bg-slate-950/50">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-xs font-medium text-slate-300 hover:bg-slate-800 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-md text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 flex items-center gap-1.5 transition shadow-[0_0_15px_rgba(245,158,11,0.3)]"
          >
            <Check className="w-4 h-4" />
            Save Milestone
          </button>
        </div>
      </div>
    </div>
  );
}
