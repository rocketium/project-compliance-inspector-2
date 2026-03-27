const DEFAULT_APP_BASE_URL = "http://localhost:3000";
const storageKey = "rocketiumQcAppBaseUrl";

const appBaseUrlInput = document.getElementById("app-base-url");
const saveBaseUrlButton = document.getElementById("save-base-url");
const refreshTabButton = document.getElementById("refresh-tab");
const settingsToggleButton = document.getElementById("settings-toggle");
const settingsPanel = document.getElementById("settings-panel");
const appFrame = document.getElementById("app-frame");

const normalizeBaseUrl = (value) => value.trim().replace(/\/$/, "");

const setSettingsOpen = (isOpen) => {
  settingsPanel.hidden = !isOpen;
};

const getStoredBaseUrl = async () => {
  const result = await chrome.storage.sync.get(storageKey);
  return result[storageKey] || DEFAULT_APP_BASE_URL;
};

const getCurrentTab = async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
};

const renderFrame = async () => {
  const baseUrl = normalizeBaseUrl(appBaseUrlInput.value || DEFAULT_APP_BASE_URL);
  const tab = await getCurrentTab();
  const tabUrl = tab?.url || "";

  if (!tabUrl) {
    appFrame.removeAttribute("src");
    return;
  }

  const frameUrl = `${baseUrl}/extension-panel?source=${encodeURIComponent(
    tabUrl
  )}`;
  appFrame.src = frameUrl;
};

const bootstrap = async () => {
  const baseUrl = await getStoredBaseUrl();
  appBaseUrlInput.value = baseUrl;
  setSettingsOpen(false);
  await renderFrame();
};

settingsToggleButton.addEventListener("click", () => {
  setSettingsOpen(settingsPanel.hidden);
});

saveBaseUrlButton.addEventListener("click", async () => {
  const normalized = normalizeBaseUrl(appBaseUrlInput.value || DEFAULT_APP_BASE_URL);
  await chrome.storage.sync.set({ [storageKey]: normalized });
  await renderFrame();
  setSettingsOpen(false);
});

refreshTabButton.addEventListener("click", async () => {
  await renderFrame();
});

bootstrap();
