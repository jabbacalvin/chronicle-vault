import React, { useState, useEffect } from "react";
import TimelinePage from "./pages/TimelinePage";
import SetupModal from "./components/SetupModal";
import {
  loadDriveData,
  saveConfigToDrive,
  uploadTextNoteToDrive,
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
      } catch (err) {
        console.error("Failed to load drive data:", err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [config]);

  const handleSaveConfig = (newConfig) => {
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
          photoIds: [...new Set(group.photoIds || [])],
        }));

      const groupByPhotoId = new Map();
      groups.forEach((group) => {
        group.photoIds.forEach((photoId) => {
          groupByPhotoId.set(photoId, group.id);
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
        const groupId = groupByPhotoId.get(item.id);
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

      await saveConfigToDrive(
        config.accessToken,
        config.folderId,
        configFileId,
        updatedConfigData,
      );
    } catch (err) {
      console.error("Failed to save edit to Google Drive:", err);
    }
  };

  const handleAddTextNote = async (file) => {
    if (!config) return;

    await uploadTextNoteToDrive(config.accessToken, config.folderId, file);
    const result = await loadDriveData(config.accessToken, config.folderId);
    setImages(result.items || []);
    setConfigData(
      result.configData || { overrides: {}, virtualEntries: [], groups: [] },
    );
    setConfigFileId(result.configFileId);
  };

  return (
    <div className="w-screen h-screen overflow-hidden bg-slate-950 text-slate-100 font-sans flex flex-col relative m-0 p-0">
      <header className="h-12 border-b border-slate-900 bg-slate-950/85 backdrop-blur px-4 flex items-center justify-between z-45 shrink-0">
        <div className="flex items-center gap-2 text-xs font-mono text-amber-500">
          <span>⚖</span>
          <span className="font-semibold tracking-wider uppercase">
            Chronicle Vault
          </span>
        </div>
        {config && (
          <button
            onClick={() => setShowSetup(true)}
            className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-md transition cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" /> Configure Vault
          </button>
        )}
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
          />
        )}
      </main>
    </div>
  );
}
