import { useEffect, useState } from "react";

const STORAGE_KEY = "iht-pwa-installed";

export default function InstallAppButton() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(
    () => typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY) === "1",
  );

  useEffect(() => {
    if (installed) return undefined;

    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
    };
    const onInstalled = () => {
      window.localStorage.setItem(STORAGE_KEY, "1");
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [installed]);

  if (installed || !deferredPrompt) return null;

  const handleClick = async () => {
    deferredPrompt.prompt();
    try {
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        window.localStorage.setItem(STORAGE_KEY, "1");
        setInstalled(true);
      }
    } finally {
      setDeferredPrompt(null);
    }
  };

  return (
    <button type="button" className="ghost-button install-app-button" onClick={handleClick}>
      Install app
    </button>
  );
}
