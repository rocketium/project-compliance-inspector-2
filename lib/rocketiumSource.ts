import { RocketiumSource } from "../types";

const DIRECT_PROJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]*$/;

const extractSingleProjectId = (input: string): string | null => {
  const campaignPattern = /\/campaign\/p\/([^\/?#]+)/;
  const campaignMatch = input.match(campaignPattern);
  if (campaignMatch?.[1]) {
    return campaignMatch[1];
  }

  const editorPattern = /\/advertising\/campaign\/editor\/([^\/?#]+)/;
  const editorMatch = input.match(editorPattern);
  if (editorMatch?.[1]) {
    return editorMatch[1];
  }

  const simplePattern = /\/p\/([^\/?#]+)/;
  const simpleMatch = input.match(simplePattern);
  if (simpleMatch?.[1]) {
    return simpleMatch[1];
  }

  return null;
};

export const parseRocketiumSource = (
  input: string
): RocketiumSource | null => {
  const trimmed = input.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);

    if (
      url.pathname.includes("/campaign/assetpreview") ||
      url.pathname.endsWith("/assetpreview")
    ) {
      const rawProjectIds = url.searchParams.get("projectShortIds");
      const projectIds = (rawProjectIds || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);

      if (projectIds.length > 0) {
        return {
          sourceType: "assetpreview",
          inputUrl: trimmed,
          projectIds,
          workspaceShortId:
            url.searchParams.get("workspaceShortId") || undefined,
        };
      }
    }

    const singleProjectId = extractSingleProjectId(url.toString());
    if (singleProjectId) {
      return {
        sourceType: "single",
        inputUrl: trimmed,
        projectIds: [singleProjectId],
      };
    }
  } catch {
    // Not a URL, continue below
  }

  const directProjectId = extractSingleProjectId(trimmed);
  if (directProjectId) {
    return {
      sourceType: "single",
      inputUrl: trimmed,
      projectIds: [directProjectId],
    };
  }

  if (DIRECT_PROJECT_ID_PATTERN.test(trimmed)) {
    return {
      sourceType: "single",
      inputUrl: trimmed,
      projectIds: [trimmed],
    };
  }

  return null;
};

export const extractProjectIdFromUrl = (input: string): string | null =>
  parseRocketiumSource(input)?.projectIds[0] || null;

export const isMultiProjectSource = (input: string): boolean =>
  (parseRocketiumSource(input)?.projectIds.length || 0) > 1;
