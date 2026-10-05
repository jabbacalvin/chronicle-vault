import React, { useState, useEffect, useCallback } from "react";
import TimelinePage from "./pages/TimelinePage";
import SetupModal from "./components/SetupModal";
import {
  loadDriveData,
  saveConfigToDrive,
  createTextNoteInDrive,
  updateTextNoteInDrive,
  isGoogleDriveAuthorizationError,
} from "./services/googleDriveService";
import { Settings } from "lucide-react";

export default function App() {
  const [config, setConfig] = useState(() => {
    const saved = localStorage.getItem("chronicle_vault_config");
    return saved ? JSON.parse(saved) : null;
  });

  const [showSetup, setShowSetup] = useState(!config);
  const [isLoading, setIsLoading] = useState(false);
  const [images, setImages] = useState([]);
  const [error, setError] = useState(null);
  const [configData, setConfigData] = useState({
    overrides: {},
    virtualEntries: [],
    groups: [],
  });
  const [configFileId, setConfigFileId] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState(
    config ? "connecting" : "disconnected",
  );
  const [saveStatus, setSaveStatus] = useState("idle");
  const [lastSavedAt, setLastSavedAt] = useState(() => {
    const savedAt = config?.folderId
      ? localStorage.getItem(`chronicle_vault_last_saved_at:${config.folderId}`)
      : null;
    return savedAt && Number.isFinite(Number(savedAt)) ? Number(savedAt) : null;
  });

  const showSetupForAuthorizationError = useCallback((err) => {
    if (!isGoogleDriveAuthorizationError(err)) return false;
    setError(null);
    setConnectionStatus("reconnect");
    setSaveStatus((current) => current === "saving" ? "failed" : current);
    setShowSetup(true);
    return true;
  }, []);

  const markSaved = () => {
    const savedAt = Date.now();
    setSaveStatus("saved");
    setLastSavedAt(savedAt);
    setConnectionStatus("connected");
    if (config?.folderId) {
      localStorage.setItem(`chronicle_vault_last_saved_at:${config.folderId}`, String(savedAt));
    }
  };

  useEffect(() => {
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.margin = "0";
    document.body.style.height = "100vh";

    if (!config) return;

    async function fetchData() {
      try {
        setIsLoading(true);
        setError(null);
        const result = await loadDriveData(config.accessToken, config.folderId);
        setImages(result.items || []);
        setConfigData(
          result.configData || {
            overrides: {},
            virtualEntries: [],
            groups: [],
          },
        );
        setConfigFileId(result.configFileId);
        setConnectionStatus("connected");
      } catch (err) {
        if (!showSetupForAuthorizationError(err)) {
          setConnectionStatus("error");
          console.error("Failed to load drive data:", err);
          setError(err.message);
        }
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [config, showSetupForAuthorizationError]);

  const handleSaveConfig = (newConfig) => {
    setConnectionStatus("connecting");
    if (newConfig.folderId !== config?.folderId) setSaveStatus("idle");
    const savedAt = newConfig.folderId
      ? localStorage.getItem(`chronicle_vault_last_saved_at:${newConfig.folderId}`)
      : null;
    setLastSavedAt(savedAt && Number.isFinite(Number(savedAt)) ? Number(savedAt) : null);
    setConfig(newConfig);
    localStorage.setItem("chronicle_vault_config", JSON.stringify(newConfig));
    setShowSetup(false);
  };

  const handleSaveEdit = async (updatedItems) => {
    if (!config) return;

    try {
      const newOverrides = { ...(configData.overrides || {}) };

      // Persist group membership on each member image's stable Drive ID.
      const groups = updatedItems
        .filter((item) => item.type === "event_group")
        .map((group) => ({
          id: group.id,
          title: group.title,
          note: group.note || group.memo || "",
          memo: group.memo || group.note || "",
          customDate: new Date(group.timestamp).toISOString(),
          fileIds: [...new Set(group.fileIds || [])],
        }));

      const groupByFileId = new Map();
      groups.forEach((group) => {
        group.fileIds.forEach((fileId) => {
          groupByFileId.set(fileId, group.id);
        });
      });

      const originalItemsMap = new Map(images.map((img) => [img.id, img]));

      updatedItems.forEach((item) => {
        if (item.type === "event_group" || item.id.startsWith("virtual-"))
          return;

        const original = originalItemsMap.get(item.id);
        if (!original) return;

        const titleChanged = item.title !== original.title;
        const timeChanged =
          Number(item.timestamp) !== Number(original.timestamp);
        const updatedMemo = item.memo ?? item.note ?? "";
        const originalMemo = original.memo ?? original.note ?? "";
        const memoChanged = updatedMemo !== originalMemo;

        // Preserve existing title/date overrides for unchanged images. The
        // loaded values already include those overrides, so deleting them here
        // would silently reset them during an unrelated group save.
        if (titleChanged || timeChanged || memoChanged) {
          newOverrides[item.id] = {
            ...(newOverrides[item.id] || {}),
            ...(titleChanged ? { title: item.title } : {}),
            ...(timeChanged
              ? { customDate: new Date(item.timestamp).toISOString() }
              : {}),
            ...(memoChanged ? { memo: updatedMemo } : {}),
          };
        }

        const nextOverride = { ...(newOverrides[item.id] || {}) };
        const groupId = groupByFileId.get(item.id);
        if (groupId) {
          nextOverride.groupId = groupId;
        } else {
          delete nextOverride.groupId;
        }

        if (Object.keys(nextOverride).length > 0) {
          newOverrides[item.id] = nextOverride;
        } else {
          delete newOverrides[item.id];
        }
      });

      const updatedConfigData = {
        ...configData,
        overrides: newOverrides,
        groups,
      };

      setConfigData(updatedConfigData);
      setImages(updatedItems); // Instantly update local state with the reordered items
      setSaveStatus("saving");

      await saveConfigToDrive(
        config.accessToken,
        config.folderId,
        configFileId,
        updatedConfigData,
      );
      markSaved();
    } catch (err) {
      if (!showSetupForAuthorizationError(err)) {
        setSaveStatus("failed");
        console.error("Failed to save edit to Google Drive:", err);
      }
    }
  };

  const handleAddTextNote = async ({ title, content, timestamp }) => {
    if (!config) return;

    try {
      setSaveStatus("saving");

      const uploadedNote = await createTextNoteInDrive(
        config.accessToken,
        config.folderId,
        { title, content },
      );

      const noteOverride = {
        ...(configData.overrides?.[uploadedNote.id] || {}),
        title,
        customDate: new Date(timestamp).toISOString(),
        memo: content,
      };
      const updatedConfigData = {
        ...configData,
        overrides: {
          ...(configData.overrides || {}),
          [uploadedNote.id]: noteOverride,
        },
      };
      const savedConfigData = await saveConfigToDrive(
        config.accessToken,
        config.folderId,
        configFileId,
        updatedConfigData,
      );

      setConfigData(savedConfigData || updatedConfigData);
      const result = await loadDriveData(config.accessToken, config.folderId);
      setImages(result.items || []);
      setConfigData(
        result.configData || { overrides: {}, virtualEntries: [], groups: [] },
      );
      setConfigFileId(result.configFileId);
      markSaved();
    } catch (err) {
      if (!showSetupForAuthorizationError(err)) {
        setSaveStatus("failed");
        throw err;
      }
    }
  };

  const handleUpdateTextNote = async (
    noteId,
    { title, content, timestamp },
  ) => {
    if (!config) return;

    try {
      setSaveStatus("saving");

      await updateTextNoteInDrive(config.accessToken, noteId, {
        title,
        content,
      });

      const preservedOverride = { ...(configData.overrides?.[noteId] || {}) };
      delete preservedOverride.memo;
      delete preservedOverride.note;

      const updatedConfigData = {
        ...configData,
        overrides: {
          ...(configData.overrides || {}),
          [noteId]: {
            ...preservedOverride,
            title,
            customDate: new Date(timestamp).toISOString(),
          },
        },
      };
      const savedConfigData = await saveConfigToDrive(
        config.accessToken,
        config.folderId,
        configFileId,
        updatedConfigData,
      );

      setConfigData(savedConfigData || updatedConfigData);
      const result = await loadDriveData(config.accessToken, config.folderId);
      setImages(result.items || []);
      setConfigData(
        result.configData || { overrides: {}, virtualEntries: [], groups: [] },
      );
      setConfigFileId(result.configFileId);
      markSaved();
    } catch (err) {
      if (!showSetupForAuthorizationError(err)) {
        setSaveStatus("failed");
        throw err;
      }
    }
  };

  const connectionDisplay = {
    disconnected: {
      label: "Not connected",
      compactLabel: "Offline",
      classes: "text-slate-400 border-slate-800 bg-slate-900",
      dot: "bg-slate-500",
    },
    connecting: {
      label: "Connecting to Drive…",
      compactLabel: "Connecting…",
      classes: "text-amber-300 border-amber-900/60 bg-amber-950/30",
      dot: "bg-amber-400 animate-pulse",
    },
    connected: {
      label: "Drive connected",
      compactLabel: "Connected",
      classes: "text-emerald-300 border-emerald-900/60 bg-emerald-950/30",
      dot: "bg-emerald-400",
    },
    reconnect: {
      label: "Reconnect needed",
      compactLabel: "Reconnect",
      classes: "text-rose-300 border-rose-900/60 bg-rose-950/30",
      dot: "bg-rose-400",
    },
    error: {
      label: "Connection issue",
      compactLabel: "Issue",
      classes: "text-rose-300 border-rose-900/60 bg-rose-950/30",
      dot: "bg-rose-400",
    },
  }[connectionStatus];
  const saveStatusLabel =
    saveStatus === "saving"
      ? "Saving…"
      : saveStatus === "saved"
        ? `Saved · ${new Date(lastSavedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
        : saveStatus === "failed"
          ? "Save failed"
          : lastSavedAt
            ? `Last saved · ${new Date(lastSavedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
            : "";

  return (
    <div className="w-screen h-screen overflow-hidden bg-slate-950 text-slate-100 font-sans flex flex-col relative m-0 p-0">
      <header className="h-12 border-b border-slate-900 bg-slate-950/85 backdrop-blur px-4 flex items-center justify-between z-45 shrink-0">
        <div className="flex items-center gap-2 text-xs font-mono text-amber-500">
          <span>⚖</span>
          <span className="font-semibold tracking-wider uppercase">
            Chronicle Vault
          </span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div
            role="status"
            aria-live="polite"
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] sm:text-[11px] font-mono ${connectionDisplay.classes}`}
          >
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${connectionDisplay.dot}`} />
            <span className="sm:hidden">{connectionDisplay.compactLabel}</span>
            <span className="hidden sm:inline">{connectionDisplay.label}</span>
          </div>
          {saveStatusLabel && (
            <div
              role="status"
              aria-live="polite"
              className={`max-w-[62px] truncate text-[9px] sm:max-w-none sm:text-[11px] font-mono ${saveStatus === "failed" ? "text-rose-300" : "text-slate-300"}`}
            >
              <span className="sm:hidden">
                {saveStatus === "saving" ? "Saving…" : saveStatus === "failed" ? "Save failed" : "Saved"}
              </span>
              <span className="hidden sm:inline">{saveStatusLabel}</span>
            </div>
          )}
          {config && (
            <button
              onClick={() => setShowSetup(true)}
              className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-md transition cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" /> Configure Vault
            </button>
          )}
        </div>
      </header>

      <main className="w-full flex-1 flex flex-col relative overflow-hidden m-0 p-0">
        {!config || showSetup ? (
          <SetupModal onSave={handleSaveConfig} />
        ) : (
          <TimelinePage
            images={images}
            isLoading={isLoading}
            error={error}
            onSaveEdit={handleSaveEdit}
            accessToken={config.accessToken}
            onAddTextNote={handleAddTextNote}
            onAuthenticationError={showSetupForAuthorizationError}
            onUpdateTextNote={handleUpdateTextNote}
          />
        )}
      </main>
    </div>
  );
}
