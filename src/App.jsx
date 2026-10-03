import React, { useState, useEffect } from "react";
import TimelinePage from "./pages/TimelinePage";
import SetupModal from "./components/SetupModal";
import {
  loadDriveData,
  saveConfigToDrive,
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
          result.configData || { overrides: {}, virtualEntries: [] },
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

  // Updated handleSaveEdit: Only persists overrides for items that actually changed
  const handleSaveEdit = async (updatedItems) => {
    if (!config) return;

    try {
      const newOverrides = { ...(configData.overrides || {}) };

      // Map existing items for quick lookup of original baseline timestamps
      const originalItemsMap = new Map(
        images.map((img) => [img.id, img.timestamp]),
      );

      updatedItems.forEach((item) => {
        // Skip virtual entries for drive image overrides
        if (item.id.startsWith("virtual-")) return;

        const originalTimestamp = originalItemsMap.get(item.id);
        const newTimestamp = new Date(item.timestamp).getTime();

        // Check if the title or timestamp has actually been modified by the user
        const originalTitle = images.find((img) => img.id === item.id)?.title;
        const titleChanged = item.title !== originalTitle;
        const timeChanged =
          originalTimestamp && newTimestamp !== originalTimestamp;

        if (titleChanged || timeChanged) {
          newOverrides[item.id] = {
            ...(newOverrides[item.id] || {}),
            title: item.title,
            customDate: new Date(item.timestamp).toISOString(),
          };
        } else {
          // If reverted back to original, remove the override if it existed
          delete newOverrides[item.id];
        }
      });

      const updatedConfigData = {
        ...configData,
        overrides: newOverrides,
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
          />
        )}
      </main>
    </div>
  );
}
