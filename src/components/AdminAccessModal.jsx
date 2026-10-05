import { ShieldCheck, UserPlus, X, Trash2 } from "lucide-react";
import { useState } from "react";

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

export default function AdminAccessModal({ ownerEmail, adminEmails, onClose, onSave }) {
  const [draftEmails, setDraftEmails] = useState(() =>
    [...new Set(adminEmails.map(normalizeEmail))].filter(
      (email) => email !== normalizeEmail(ownerEmail),
    ),
  );
  const [newEmail, setNewEmail] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const addEmail = () => {
    const email = normalizeEmail(newEmail);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email address.");
      return;
    }
    if (email === normalizeEmail(ownerEmail) || draftEmails.includes(email)) {
      setError("That email is already an administrator.");
      return;
    }
    setDraftEmails((current) => [...current, email]);
    setNewEmail("");
    setError("");
  };

  const saveAdmins = async () => {
    setIsSaving(true);
    setError("");
    try {
      await onSave([normalizeEmail(ownerEmail), ...draftEmails]);
      onClose();
    } catch (saveError) {
      setError(saveError.message || "Could not save the administrator list.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="admin-access-title" className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="admin-access-title" className="flex items-center gap-2 text-base font-semibold text-slate-100">
              <ShieldCheck className="h-4 w-4 text-amber-400" /> Manage Admins
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Admins can edit evidence, group and ungroup items, add text evidence, and manage this list.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close admin settings" className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <p className="text-[10px] uppercase tracking-wide text-amber-400">Vault owner · permanent admin</p>
          <p className="mt-1 break-all text-sm text-slate-100">{ownerEmail}</p>
        </div>

        <div className="mt-4 flex gap-2">
          <input type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addEmail();
            }
          }} placeholder="admin@example.com" aria-label="Email address for new admin" className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-500" />
          <button type="button" onClick={addEmail} className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-slate-100 hover:bg-slate-700">
            <UserPlus className="h-3.5 w-3.5" /> Add
          </button>
        </div>

        <div className="mt-4 max-h-56 overflow-y-auto rounded-lg border border-slate-800">
          {draftEmails.length === 0 ? (
            <p className="p-4 text-center text-xs text-slate-500">No additional admins yet.</p>
          ) : draftEmails.map((email) => (
            <div key={email} className="flex items-center justify-between gap-3 border-b border-slate-800 px-3 py-2 last:border-b-0">
              <span className="break-all text-sm text-slate-200">{email}</span>
              <button type="button" onClick={() => setDraftEmails((current) => current.filter((entry) => entry !== email))} className="shrink-0 rounded p-1.5 text-slate-400 hover:bg-rose-950/60 hover:text-rose-300" title={`Remove ${email} as admin`} aria-label={`Remove ${email} as admin`}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          Added users also need Editor access to this Drive folder. Keep view-only accounts as Drive Viewers.
        </p>
        {error && <p className="mt-3 rounded-lg border border-rose-900/60 bg-rose-950/40 p-2.5 text-xs text-rose-300">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={isSaving} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50">Cancel</button>
          <button type="button" onClick={saveAdmins} disabled={isSaving} className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50">
            {isSaving ? "Saving…" : "Save Admins"}
          </button>
        </div>
      </section>
    </div>
  );
}
