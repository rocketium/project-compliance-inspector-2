const DEFAULT_APP_BASE_URL = "http://localhost:3000";
const storageKey = "rocketiumQcAppBaseUrl";
const userIdStorageKey = "rocketiumQcOverrideUserId";
const sessionIdStorageKey = "rocketiumQcOverrideSessionId";

const appBaseUrlInput = document.getElementById("app-base-url");
const rocketiumUserIdInput = document.getElementById("rocketium-user-id");
const rocketiumSessionIdInput = document.getElementById("rocketium-session-id");
const identityStatus = document.getElementById("identity-status");
const saveBaseUrlButton = document.getElementById("save-base-url");
const refreshTabButton = document.getElementById("refresh-tab");
const settingsToggleButton = document.getElementById("settings-toggle");
const settingsPanel = document.getElementById("settings-panel");
const appFrame = document.getElementById("app-frame");
const identityRequestMessageType = "rocketium-review:request-identity";
const identityResponseMessageType = "rocketium-review:identity";
const identityReadAttempts = 5;
const identityReadDelayMs = 350;

const normalizeBaseUrl = (value) => value.trim().replace(/\/$/, "");

const setSettingsOpen = (isOpen) => {
  settingsPanel.hidden = !isOpen;
};

const setIdentityStatus = (isDetected) => {
  if (!identityStatus) return;
  identityStatus.textContent = isDetected ? "Detected from tab" : "Not detected yet";
  identityStatus.classList.toggle("detected", isDetected);
};

const getStoredBaseUrl = async () => {
  const result = await chrome.storage.sync.get(storageKey);
  return result[storageKey] || DEFAULT_APP_BASE_URL;
};

const getStoredIdentityOverrides = async () => {
  const result = await chrome.storage.sync.get([
    userIdStorageKey,
    sessionIdStorageKey,
  ]);

  return {
    rocketiumUserId: normalizeStorageValue(result[userIdStorageKey]),
    rocketiumSessionId: normalizeStorageValue(result[sessionIdStorageKey]),
  };
};

const getCurrentTab = async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
};

const normalizeStorageValue = (value) => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const parsed = JSON.parse(trimmed);
    return typeof parsed === "string" ? parsed.trim() : trimmed;
  } catch {
    return trimmed;
  }
};

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

const getRocketiumIdentity = async (tab) => {
  if (!tab?.id || !tab?.url?.startsWith("https://rocketium.com/")) {
    return {
      rocketiumUserId: "",
      rocketiumSessionId: "",
    };
  }

  for (let attempt = 0; attempt < identityReadAttempts; attempt += 1) {
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN",
        func: () => ({
          rocketiumUserId:
            window.localStorage.getItem("lscache-rocketiumUserId") || "",
          rocketiumSessionId: window.localStorage.getItem("lscache-sessionId") || "",
        }),
      });

      const identity = {
        rocketiumUserId: normalizeStorageValue(result?.result?.rocketiumUserId),
        rocketiumSessionId: normalizeStorageValue(result?.result?.rocketiumSessionId),
      };

      if (identity.rocketiumUserId && identity.rocketiumSessionId) {
        return identity;
      }
    } catch (error) {
      if (attempt === identityReadAttempts - 1) {
        console.warn("Failed to read Rocketium identity from active tab", error);
      }
    }

    if (attempt < identityReadAttempts - 1) {
      await sleep(identityReadDelayMs);
    }
  }

  return {
    rocketiumUserId: "",
    rocketiumSessionId: "",
  };
};

window.addEventListener("message", async (event) => {
  if (event.source !== appFrame.contentWindow) {
    return;
  }

  if (event.data?.type !== identityRequestMessageType) {
    return;
  }

  const overrides = await getStoredIdentityOverrides();
  let identity = overrides;

  if (!identity.rocketiumUserId || !identity.rocketiumSessionId) {
    const tab = await getCurrentTab();
    const tabIdentity = await getRocketiumIdentity(tab);
    identity = {
      rocketiumUserId: overrides.rocketiumUserId || tabIdentity.rocketiumUserId,
      rocketiumSessionId:
        overrides.rocketiumSessionId || tabIdentity.rocketiumSessionId,
    };
  }

  event.source?.postMessage(
    {
      type: identityResponseMessageType,
      ...identity,
    },
    event.origin || "*"
  );
});

const renderFrame = async () => {
  const baseUrl = normalizeBaseUrl(appBaseUrlInput.value || DEFAULT_APP_BASE_URL);
  const tab = await getCurrentTab();
  const tabUrl = tab?.url || "";

  if (!tabUrl) {
    appFrame.removeAttribute("src");
    return;
  }

  const overrides = await getStoredIdentityOverrides();
  const tabIdentity = await getRocketiumIdentity(tab);
  setIdentityStatus(
    Boolean(tabIdentity.rocketiumUserId && tabIdentity.rocketiumSessionId)
  );
  const rocketiumUserId =
    overrides.rocketiumUserId || tabIdentity.rocketiumUserId;
  const rocketiumSessionId =
    overrides.rocketiumSessionId || tabIdentity.rocketiumSessionId;
  const params = new URLSearchParams({
    source: tabUrl,
  });

  if (rocketiumUserId) {
    params.set("rocketiumUserId", rocketiumUserId);
  }

  if (rocketiumSessionId) {
    params.set("rocketiumSessionId", rocketiumSessionId);
  }

  const frameUrl = `${baseUrl}/extension-panel?${params.toString()}`;
  appFrame.src = frameUrl;
};

const bootstrap = async () => {
  const [baseUrl, identityOverrides] = await Promise.all([
    getStoredBaseUrl(),
    getStoredIdentityOverrides(),
  ]);
  appBaseUrlInput.value = baseUrl;
  rocketiumUserIdInput.value = identityOverrides.rocketiumUserId;
  rocketiumSessionIdInput.value = identityOverrides.rocketiumSessionId;
  setIdentityStatus(false);
  setSettingsOpen(false);
  await renderFrame();
};

settingsToggleButton.addEventListener("click", () => {
  setSettingsOpen(settingsPanel.hidden);
});

saveBaseUrlButton.addEventListener("click", async () => {
  const normalized = normalizeBaseUrl(appBaseUrlInput.value || DEFAULT_APP_BASE_URL);
  await chrome.storage.sync.set({
    [storageKey]: normalized,
    [userIdStorageKey]: normalizeStorageValue(rocketiumUserIdInput.value),
    [sessionIdStorageKey]: normalizeStorageValue(rocketiumSessionIdInput.value),
  });
  await renderFrame();
  setSettingsOpen(false);
});

refreshTabButton.addEventListener("click", async () => {
  await renderFrame();
});

bootstrap();
