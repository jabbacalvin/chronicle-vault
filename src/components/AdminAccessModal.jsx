import { ShieldCheck, UserPlus, X, Trash2, Crown } from "lucide-react";
import { useState } from "react";

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

export default function AdminAccessModal({
  ownerEmail,
  adminEmails,
  onClose,
  onSave,
  onTransferOwnership,
}) {
  const [draftEmails, setDraftEmails] = useState(() =>
    [...new Set(adminEmails.map(normalizeEmail))].filter(
      (email) => email !== normalizeEmail(ownerEmail),
    ),
  );
  const [newEmail, setNewEmail] = useState("");
  const [newOwnerEmail, setNewOwnerEmail] = useState("");
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

  const transferOwnership = async () => {
    const email = normalizeEmail(newOwnerEmail);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email address for the new owner.");
      return;
    }
    if (email === normalizeEmail(ownerEmail)) {
      setError("That account is already the vault owner.");
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      await onTransferOwnership(email);
      onClose();
    } catch (transferError) {
      setError(transferError.message || "Could not transfer vault ownership.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="admin-access-title" className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="admin-access-title" className="flex items-center gap-2 text-base font-semibold text-slate-100">
              <ShieldCheck className="h-4 w-4 text-amber-400" /> Manage Vault Access
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Admins can edit evidence, group and ungroup items, and add text evidence. Only the owner can manage access or transfer ownership.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close vault access settings" className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <p className="text-[10px] uppercase tracking-wide text-amber-400">Current vault owner</p>
          <p className="mt-1 break-all text-sm text-slate-100">{ownerEmail}</p>
        </div>

        <div className="mt-4 flex gap-2">
          <input type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addEmail();
            }
          }} placeholder="admin@example.com" aria-label="Email address for new admin" className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-500" />
          <button type="button" onClick={addEmail} disabled={isSaving} className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-slate-100 hover:bg-slate-700 disabled:opacity-50">
            <UserPlus className="h-3.5 w-3.5" /> Add
          </button>
        </div>

        <div className="mt-4 max-h-48 overflow-y-auto rounded-lg border border-slate-800">
          {draftEmails.length === 0 ? (
            <p className="p-4 text-center text-xs text-slate-500">No additional admins yet.</p>
          ) : draftEmails.map((email) => (
            <div key={email} className="flex items-center justify-between gap-3 border-b border-slate-800 px-3 py-2 last:border-b-0">
              <span className="break-all text-sm text-slate-200">{email}</span>
              <button type="button" onClick={() => setDraftEmails((current) => current.filter((entry) => entry !== email))} disabled={isSaving} className="shrink-0 rounded p-1.5 text-slate-400 hover:bg-rose-950/60 hover:text-rose-300 disabled:opacity-50" title={`Remove ${email} as admin`} aria-label={`Remove ${email} as admin`}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          Added users also need Editor access to this Drive folder. Keep view-only accounts as Drive Viewers.
        </p>

        <div className="mt-5 rounded-lg border border-slate-700 bg-slate-950/60 p-3">
          <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <Crown className="h-3.5 w-3.5 text-amber-400" /> Transfer ownership
          </h3>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            The selected account becomes the owner and can manage admins. You’ll keep editing access as an admin, but won’t be able to manage admins. The new owner must already have Editor access to this Drive folder.
          </p>
          <div className="mt-3 flex gap-2">
            <input type="email" value={newOwnerEmail} onChange={(event) => setNewOwnerEmail(event.target.value)} placeholder="new-owner@example.com" aria-label="Email address for new vault owner" className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-500" />
            <button type="button" onClick={transferOwnership} disabled={isSaving} className="rounded-lg border border-amber-500/50 px-3 py-2 text-xs font-medium text-amber-300 hover:bg-amber-500/10 disabled:opacity-50">
              Transfer
            </button>
          </div>
        </div>

        {error && <p role="alert" className="mt-3 rounded-lg border border-rose-900/60 bg-rose-950/40 p-2.5 text-xs text-rose-300">{error}</p>}

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
