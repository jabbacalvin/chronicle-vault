import { X } from "lucide-react";

export default function AppDialog({ dialog, onClose }) {
  if (!dialog) return null;

  const handleConfirm = () => {
    const confirmAction = dialog.onConfirm;
    onClose();
    confirmAction?.();
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        aria-describedby="app-dialog-message"
        className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-950 shadow-2xl p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="app-dialog-title" className="text-base font-semibold text-amber-400">
            {dialog.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white transition"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p
          id="app-dialog-message"
          className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-300"
        >
          {dialog.message}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          {dialog.type === "confirm" && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 transition"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={handleConfirm}
            autoFocus
            className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
              dialog.type === "confirm"
                ? "bg-rose-700 text-white hover:bg-rose-600"
                : "bg-amber-500 text-slate-950 hover:bg-amber-400"
            }`}
          >
            {dialog.type === "confirm"
              ? dialog.confirmLabel || "Confirm"
              : "OK"}
          </button>
        </div>
      </section>
    </div>
  );
}
