const DEV_ASSET_PROXY_PREFIX = "/__rocketium_proxy";

const isLocalDevHost = (hostname: string) =>
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname === "0.0.0.0";

export const getFetchableAssetUrl = (assetUrl: string): string => {
  if (typeof window === "undefined") {
    return assetUrl;
  }

  if (!isLocalDevHost(window.location.hostname)) {
    return assetUrl;
  }

  try {
    const parsedUrl = new URL(assetUrl);
    if (!parsedUrl.hostname.endsWith("rocketium.com")) {
      return assetUrl;
    }

    return `${DEV_ASSET_PROXY_PREFIX}${parsedUrl.pathname}${parsedUrl.search}`;
  } catch {
    return assetUrl;
  }
};
