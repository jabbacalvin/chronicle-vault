import React, { useState } from "react";
import { Folder, Key, ShieldCheck } from "lucide-react";

export default function SetupModal({ onSave }) {
  const [clientId, setClientId] = useState(
    () => localStorage.getItem("chronicle_client_id") || "",
  );
  const [folderInput, setFolderInput] = useState(
    () => localStorage.getItem("chronicle_folder_id") || "",
  );
  const [error, setError] = useState("");

  const extractFolderId = (input) => {
    const trimmed = input.trim();
    if (!trimmed) return "";

    const matchFolderUrl = trimmed.match(/\/folders\/([a-zA-Z0-9-_]+)/);
    if (matchFolderUrl && matchFolderUrl[1]) {
      return matchFolderUrl[1];
    }

    const matchQueryId = trimmed.match(/[?&]id=([a-zA-Z0-9-_]+)/);
    if (matchQueryId && matchQueryId[1]) {
      return matchQueryId[1];
    }

    return trimmed;
  };

  const handleGoogleLogin = (e) => {
    e.preventDefault();
    const resolvedFolderId = extractFolderId(folderInput);

    if (!clientId || !resolvedFolderId) {
      setError(
        "Please provide both your Google OAuth Client ID and a valid Google Drive folder URL or ID.",
      );
      return;
    }

    // Initialize Google Identity Services token client with full drive scope
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/drive",
      prompt: "",
      callback: (tokenResponse) => {
        if (tokenResponse && tokenResponse.access_token) {
          const config = {
            clientId,
            folderId: resolvedFolderId,
            accessToken: tokenResponse.access_token,
          };
          localStorage.setItem("chronicle_client_id", clientId);
          // Keep the raw user input (full URL) in local storage as requested
          localStorage.setItem("chronicle_folder_id", folderInput.trim());
          onSave(config);
        }
      },
    });

    client.requestAccessToken();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-500" /> Connect Google
            Drive Vault
          </h2>
          <p className="text-xs text-slate-400">
            Sign in with Google to allow Chronicle Vault to read your evidence
            and save edits directly to your `.json` config file.
          </p>
        </div>

        {error && (
          <div className="text-xs text-rose-400 bg-rose-950/40 border border-rose-900/50 p-2.5 rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleGoogleLogin} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
              <Key className="w-3 h-3" /> Google OAuth Client ID
            </label>
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="xxxx.apps.googleusercontent.com"
              className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-100 outline-none focus:border-amber-500"
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
              <Folder className="w-3 h-3" /> Google Drive Folder URL
            </label>
            <input
              type="text"
              value={folderInput}
              onChange={(e) => setFolderInput(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/..."
              className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-100 outline-none focus:border-amber-500"
              required
            />
          </div>

          <button
            type="submit"
            className="mt-2 w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-2"
          >
            Sign In & Open Vault
          </button>
        </form>
      </div>
    </div>
  );
}
