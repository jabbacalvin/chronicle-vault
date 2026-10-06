import React, { useEffect, useState } from "react";
import { Folder, Key, ShieldCheck, Smartphone } from "lucide-react";

const PENDING_AUTH_KEY = "chronicle_pending_redirect_auth";

export default function SetupModal({ onSave }) {
  const [clientId, setClientId] = useState(
    () => localStorage.getItem("chronicle_client_id") || "",
  );
  const [folderInput, setFolderInput] = useState(
    () => localStorage.getItem("chronicle_folder_id") || "",
  );
  const [authWorkerUrl, setAuthWorkerUrl] = useState(
    () => localStorage.getItem("chronicle_auth_worker_url") || "",
  );
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    if (params.get("cv_auth") !== "1") return;

    // The Worker returns short-lived credentials in the URL fragment. Remove
    // them from browser history immediately before doing anything else.
    window.history.replaceState(
      window.history.state,
      document.title,
      window.location.pathname + window.location.search,
    );

    let pending;
    try {
      pending = JSON.parse(localStorage.getItem(PENDING_AUTH_KEY) || "null");
    } catch {
      pending = null;
    }

    if (!pending || params.get("state") !== pending.state) {
      localStorage.removeItem(PENDING_AUTH_KEY);
      setError("The Google sign-in could not be verified. Please try again.");
      return;
    }

    const oauthError = params.get("error");
    if (oauthError) {
      localStorage.removeItem(PENDING_AUTH_KEY);
      setError("Google sign-in failed: " + oauthError.replace(/_/g, " ") + ". Please try again.");
      return;
    }

    const accessToken = params.get("access_token");
    const userEmail = params.get("email");
    const returnedClientId = params.get("client_id");
    const resolvedFolderId = pending.folderId;
    if (!accessToken || !userEmail || !returnedClientId || !resolvedFolderId) {
      localStorage.removeItem(PENDING_AUTH_KEY);
      setError("Google sign-in returned incomplete information. Please try again.");
      return;
    }

    const config = {
      clientId: returnedClientId,
      folderId: resolvedFolderId,
      accessToken,
      userEmail,
      authWorkerUrl: pending.authWorkerUrl,
    };
    localStorage.setItem("chronicle_client_id", returnedClientId);
    localStorage.setItem("chronicle_folder_id", pending.folderInput);
    localStorage.setItem("chronicle_auth_worker_url", pending.authWorkerUrl);
    localStorage.removeItem(PENDING_AUTH_KEY);
    onSave(config);
  }, [onSave]);

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

  const resolveWorkerUrl = (input) => {
    const trimmed = input.trim();
    if (!trimmed) return "";

    const parsed = new URL(trimmed);
    if (
      (parsed.protocol !== "https:" && parsed.hostname !== "localhost") ||
      (parsed.pathname !== "/" && parsed.pathname !== "") ||
      parsed.search ||
      parsed.hash
    ) {
      throw new Error("Enter the Worker base URL, such as https://your-worker.workers.dev.");
    }
    return parsed.origin;
  };

  const handleGoogleLogin = (event) => {
    event.preventDefault();
    setError("");

    const resolvedFolderId = extractFolderId(folderInput);
    if (!resolvedFolderId) {
      setError("Enter a valid Google Drive folder URL or ID.");
      return;
    }

    let workerBaseUrl;
    try {
      workerBaseUrl = resolveWorkerUrl(authWorkerUrl);
    } catch (workerError) {
      setError(workerError.message);
      return;
    }

    if (workerBaseUrl) {
      const state = crypto.randomUUID();
      const pending = {
        state,
        folderId: resolvedFolderId,
        folderInput: folderInput.trim(),
        authWorkerUrl: workerBaseUrl,
      };
      localStorage.setItem(PENDING_AUTH_KEY, JSON.stringify(pending));
      localStorage.setItem("chronicle_folder_id", folderInput.trim());
      localStorage.setItem("chronicle_auth_worker_url", workerBaseUrl);

      const startUrl = new URL("/auth/google/start", workerBaseUrl);
      startUrl.searchParams.set("state", state);
      window.location.assign(startUrl.toString());
      return;
    }

    if (!clientId) {
      setError("Enter your Google OAuth Client ID or configure the redirect Worker URL.");
      return;
    }
    if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
      setError("Google sign-in did not finish loading. Refresh the page and try again.");
      return;
    }

    // Keep the existing popup flow available for current client-only setups.
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "openid email https://www.googleapis.com/auth/drive",
      prompt: "",
      callback: async (tokenResponse) => {
        if (tokenResponse && tokenResponse.error) {
          setError(tokenResponse.error_description || "Google could not authorize this account.");
          return;
        }
        if (!tokenResponse || !tokenResponse.access_token) {
          setError("Google did not return an access token. Please try again.");
          return;
        }
        try {
          const profileResponse = await fetch(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            { headers: { Authorization: "Bearer " + tokenResponse.access_token } },
          );
          if (!profileResponse.ok) throw new Error("Could not verify your Google account.");
          const profile = await profileResponse.json();
          if (!profile.email || profile.email_verified === false) {
            throw new Error("Google did not return a verified email for this account.");
          }
          const config = {
            clientId,
            folderId: resolvedFolderId,
            accessToken: tokenResponse.access_token,
            userEmail: profile.email,
            authWorkerUrl: "",
          };
          localStorage.setItem("chronicle_client_id", clientId);
          localStorage.setItem("chronicle_folder_id", folderInput.trim());
          onSave(config);
        } catch (profileError) {
          setError(profileError.message || "Could not verify your Google account.");
        }
      },
      error_callback: (popupError) => {
        setError(
          popupError && popupError.type === "popup_failed_to_open"
            ? "Your browser blocked Google’s sign-in window. Use the redirect Worker option for mobile."
            : "Google’s sign-in window closed before authorization completed.",
        );
      },
    });

    client.requestAccessToken();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex items-center justify-center overflow-y-auto p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl flex flex-col gap-4 my-auto">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-500" /> Connect Google
            Drive Vault
          </h2>
          <p className="text-xs text-slate-400">
            Sign in with Google to read evidence from your Drive folder. Access
            to editing tools is based on this vault’s administrator list.
          </p>
        </div>

        {error && (
          <div role="alert" className="text-xs text-rose-400 bg-rose-950/40 border border-rose-900/50 p-2.5 rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleGoogleLogin} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
              <Smartphone className="w-3 h-3" /> OAuth Redirect Worker URL
            </label>
            <input
              type="url"
              value={authWorkerUrl}
              onChange={(event) => setAuthWorkerUrl(event.target.value)}
              placeholder="https://your-worker.workers.dev"
              className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-100 outline-none focus:border-amber-500"
              autoComplete="url"
            />
            <p className="text-[10px] text-slate-500">
              Recommended for mobile. Uses a full-page redirect. Leave blank to use popup sign-in.
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
              <Key className="w-3 h-3" /> Google OAuth Client ID (popup fallback)
            </label>
            <input
              type="text"
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
              placeholder="xxxx.apps.googleusercontent.com"
              className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-100 outline-none focus:border-amber-500"
              required={!authWorkerUrl.trim()}
              autoComplete="off"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
              <Folder className="w-3 h-3" /> Google Drive Folder URL
            </label>
            <input
              type="text"
              value={folderInput}
              onChange={(event) => setFolderInput(event.target.value)}
              placeholder="https://drive.google.com/drive/folders/..."
              className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-100 outline-none focus:border-amber-500"
              required
              autoComplete="url"
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
