import React, { useEffect, useState } from "react";
import { Check, FileText, X } from "lucide-react";

const toLocalInputValue = (date) => {
  const localDate = new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000,
  );
  return localDate.toISOString().slice(0, 16);
};

export default function TextNoteModal({
  isOpen,
  isSaving,
  note = null,
  onClose,
  onSave,
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [incidentDate, setIncidentDate] = useState("");

  useEffect(() => {
    if (isOpen) {
      const timestamp = note ? Number(note.timestamp) : Date.now();
      const date = Number.isFinite(timestamp)
        ? new Date(timestamp)
        : new Date();
      setTitle(note?.title || "");
      setContent(note?.noteContent ?? note?.memo ?? note?.note ?? "");
      setIncidentDate(toLocalInputValue(date));
    }
  }, [isOpen, note]);

  if (!isOpen) return null;

  const parsedTimestamp = new Date(incidentDate).getTime();
  const hasValidDate = Number.isFinite(parsedTimestamp);
  const generatedTitle = hasValidDate
    ? `Incident Note — ${new Date(parsedTimestamp).toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short",
      })}`
    : "Incident Note";
  const finalTitle = title.trim() || generatedTitle;
  const canSave = content.trim().length > 0 && hasValidDate && !isSaving;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!canSave) return;

    onSave({
      title: finalTitle,
      content,
      timestamp: parsedTimestamp,
    });
  };

  return (
    <div
      className="cv-modal-backdrop fixed inset-0 z-[65] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSaving) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="cv-modal-panel bg-slate-900 border border-slate-700 rounded-xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <FileText className="w-4 h-4 text-cyan-400" />
            {note ? "Edit Text Evidence" : "Add Text Evidence"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="text-slate-400 hover:text-slate-200 transition disabled:opacity-50"
            aria-label="Close note dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <p className="text-xs text-slate-400">
            {note
              ? "Update the text and details for this note. The existing .txt file in Google Drive will be updated."
              : "Write a quick note. It will be saved as a .txt item in this Google Drive folder and added to the timeline."}
          </p>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
              Title <span className="normal-case">(optional)</span>
            </span>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={180}
              className="bg-slate-950 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 outline-none focus:border-cyan-400"
              placeholder={generatedTitle}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
              Incident Date & Time
            </span>
            <input
              type="datetime-local"
              value={incidentDate}
              onChange={(event) => setIncidentDate(event.target.value)}
              required
              className="bg-slate-950 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 outline-none focus:border-cyan-400"
            />
            <span className="text-[10px] text-slate-500">
              If you leave the title blank, the incident date and time will be
              used to generate it: {generatedTitle}
            </span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
              {note ? "Text file content" : "Note"}
            </span>
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              required
              rows={8}
              className="bg-slate-950 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 outline-none focus:border-cyan-400 resize-y"
              placeholder={
                note
                  ? "Edit the text saved in this .txt file..."
                  : "Enter the note to save with this incident..."
              }
            />
          </label>
        </div>

        <div className="px-5 py-4 border-t border-slate-800 flex justify-end gap-2 bg-slate-950/50">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 rounded-md text-xs font-medium text-slate-300 hover:bg-slate-800 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSave}
            className="px-4 py-2 rounded-md text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 flex items-center gap-1.5 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Check className="w-4 h-4" />
            {isSaving
              ? "Saving to Drive..."
              : note
                ? "Save Changes"
                : "Save Note"}
          </button>
        </div>
      </form>
    </div>
  );
}
