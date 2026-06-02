const DEFAULT_PRODUCTION_APP_BASE_URL = "https://compliance.rocketiumlabs.com";

const normalizeBaseUrl = (value?: string | null) => {
  const trimmed = value?.trim();
  if (!trimmed) return "";
  return trimmed.replace(/\/+$/, "");
};

export const getConfiguredAppBaseUrl = () =>
  normalizeBaseUrl((import.meta as any).env?.VITE_APP_BASE_URL) ||
  DEFAULT_PRODUCTION_APP_BASE_URL;

export const getRuntimeAppBaseUrl = () => {
  const configuredUrl = getConfiguredAppBaseUrl();
  if (configuredUrl) {
    return configuredUrl;
  }

  if (typeof window === "undefined") {
    return "";
  }

  return normalizeBaseUrl(window.location.origin);
};

export const createAppUrl = (pathAndSearch = "/") => {
  const baseUrl = getRuntimeAppBaseUrl();
  const normalizedPath = pathAndSearch.startsWith("/")
    ? pathAndSearch
    : `/${pathAndSearch}`;

  if (!baseUrl) {
    return normalizedPath;
  }

  return `${baseUrl}${normalizedPath}`;
};

export const getCurrentAppPathAndSearch = () => {
  if (typeof window === "undefined") {
    return "/";
  }

  return `${window.location.pathname}${window.location.search}`;
};
