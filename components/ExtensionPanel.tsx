import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  Filter,
  Expand,
  Minimize2,
  Layers,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Store,
} from "lucide-react";
import { parseRocketiumSource } from "../lib/rocketiumSource";
import {
  buildBrandRuleDefinitions,
  groupResultsByEngineAndCheckType,
  groupRuleDefinitionsByEngineAndCheckType,
} from "../lib/ruleBundle";
import {
  createEvaluationJob,
  EvaluationCreative,
  EvaluationJob,
  loadEvaluationJob,
  subscribeToJobUpdates,
} from "../services/evaluationApi";
import { loadBrands } from "../services/configService";
import { BrandConfig, ComplianceResult } from "../types";
type PanelFilter = "all" | "failed-rules" | "failed-assets" | "failed-both";
type EngineFilter = "all" | "visual" | "precision";

const creativeHasFailedRules = (creative: EvaluationCreative) =>
  creative.complianceResults?.some((result) => result.status === "FAIL") || false;

const creativeHasFailures = (creative: EvaluationCreative) =>
  creative.status === "failed" || creativeHasFailedRules(creative);

const getCreativeFailCount = (creative: EvaluationCreative) =>
  creative.complianceResults?.filter((result) => result.status === "FAIL").length || 0;

const getProjectDisplayName = (creative: EvaluationCreative) =>
  creative.sourceProjectName?.trim() || "Project";

const getCreativeSizeLabel = (creative: EvaluationCreative) => {
  if (!creative.width || !creative.height) {
    return null;
  }

  return `${creative.width}×${creative.height}`;
};

const getResultCategoryLabel = (category?: ComplianceResult["category"]) => {
  if (!category) {
    return null;
  }

  return category.charAt(0).toUpperCase() + category.slice(1);
};

const getResultCategoryBadgeClasses = (category?: ComplianceResult["category"]) => {
  switch (category) {
    case "brand":
      return "border-violet-500/30 bg-violet-500/12 text-violet-200";
    case "policy":
      return "border-cyan-500/30 bg-cyan-500/12 text-cyan-200";
    case "accessibility":
      return "border-emerald-500/30 bg-emerald-500/12 text-emerald-200";
    case "quality":
      return "border-amber-500/30 bg-amber-500/12 text-amber-200";
    default:
      return "border-zinc-700 bg-zinc-900 text-zinc-300";
  }
};

const getCheckTypeHeaderClasses = (checkType?: string) => {
  const normalized = checkType?.toLowerCase() || "";

  if (
    normalized.includes("copy") ||
    normalized.includes("type") ||
    normalized.includes("legibility")
  ) {
    return "border-amber-500/20 bg-amber-500/10";
  }

  if (
    normalized.includes("logo") ||
    normalized.includes("brand") ||
    normalized.includes("variant")
  ) {
    return "border-violet-500/20 bg-violet-500/10";
  }

  if (
    normalized.includes("policy") ||
    normalized.includes("localization") ||
    normalized.includes("content verification")
  ) {
    return "border-cyan-500/20 bg-cyan-500/10";
  }

  if (
    normalized.includes("image") ||
    normalized.includes("crop") ||
    normalized.includes("framing") ||
    normalized.includes("safe area")
  ) {
    return "border-emerald-500/20 bg-emerald-500/10";
  }

  return "border-zinc-700 bg-zinc-900/70";
};

export const ExtensionPanel: React.FC = () => {
  const [searchParams] = useSearchParams();
  const sourceUrl = searchParams.get("source") || "";
  const [rocketiumIdentity, setRocketiumIdentity] = useState(() => ({
    rocketiumUserId: searchParams.get("rocketiumUserId") || "",
    rocketiumSessionId: searchParams.get("rocketiumSessionId") || "",
  }));
  const parsedSource = useMemo(
    () => parseRocketiumSource(sourceUrl),
    [sourceUrl]
  );
  const rocketiumUserId = rocketiumIdentity.rocketiumUserId;
  const rocketiumSessionId = rocketiumIdentity.rocketiumSessionId;

  const [brands, setBrands] = useState<BrandConfig[]>([]);
  const [activeBrandId, setActiveBrandId] = useState("");
  const [job, setJob] = useState<EvaluationJob | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [selectedCreativeId, setSelectedCreativeId] = useState<string | null>(
    null
  );
  const [panelFilter, setPanelFilter] = useState<PanelFilter>("all");
  const [engineFilter, setEngineFilter] = useState<EngineFilter>("all");
  const [variantFilter, setVariantFilter] = useState("all");
  const [isControlsCollapsed, setIsControlsCollapsed] = useState(false);
  const [isAssetsCollapsed, setIsAssetsCollapsed] = useState(false);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [highlightedRuleKey, setHighlightedRuleKey] = useState<string | null>(null);
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);
  const [previewBounds, setPreviewBounds] = useState({ width: 0, height: 0 });
  const [previewNaturalSize, setPreviewNaturalSize] = useState({ width: 0, height: 0 });
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [isCreatingJob, setIsCreatingJob] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);

  const requestRocketiumIdentity = useCallback(async () => {
    if (typeof window === "undefined" || window.parent === window) {
      return {
        rocketiumUserId: "",
        rocketiumSessionId: "",
      };
    }

    return await new Promise<{
      rocketiumUserId: string;
      rocketiumSessionId: string;
    }>((resolve) => {
      let settled = false;

      const cleanup = () => {
        window.removeEventListener("message", handleMessage);
      };

      const finish = (identity: {
        rocketiumUserId: string;
        rocketiumSessionId: string;
      }) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(identity);
      };

      const handleMessage = (event: MessageEvent) => {
        if (event.data?.type !== "rocketium-review:identity") {
          return;
        }

        finish({
          rocketiumUserId:
            typeof event.data.rocketiumUserId === "string"
              ? event.data.rocketiumUserId.trim()
              : "",
          rocketiumSessionId:
            typeof event.data.rocketiumSessionId === "string"
              ? event.data.rocketiumSessionId.trim()
              : "",
        });
      };

      window.addEventListener("message", handleMessage);
      window.parent.postMessage({ type: "rocketium-review:request-identity" }, "*");
      window.setTimeout(
        () =>
          finish({
            rocketiumUserId: "",
            rocketiumSessionId: "",
          }),
        3000
      );
    });
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadConfig = async () => {
      setIsLoadingConfig(true);
      try {
        const loadedBrands = await loadBrands();

        if (!isMounted) return;

        setBrands(loadedBrands);
        setActiveBrandId(loadedBrands[0]?.id || "");
      } catch (configError: any) {
        if (!isMounted) return;
        setError(configError.message || "Failed to load configuration");
      } finally {
        if (isMounted) {
          setIsLoadingConfig(false);
        }
      }
    };

    loadConfig();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (rocketiumUserId && rocketiumSessionId) {
      return;
    }

    let cancelled = false;

    requestRocketiumIdentity().then((identity) => {
      if (cancelled) return;
      if (!identity.rocketiumUserId || !identity.rocketiumSessionId) return;
      setRocketiumIdentity(identity);
    });

    return () => {
      cancelled = true;
    };
  }, [requestRocketiumIdentity, rocketiumSessionId, rocketiumUserId]);

  useEffect(() => {
    if (!activeBrandId) {
      setActiveBrandId(brands[0]?.id || "");
    }
  }, [activeBrandId, brands]);

  useEffect(() => {
    if (!jobId) return;

    let unsubscribe: (() => void) | null = null;
    let intervalId: number | null = null;
    let mounted = true;

    const loadJob = async () => {
      const result = await loadEvaluationJob(jobId);
      if (!mounted || !result.success || !result.data) {
        return;
      }

      setJob(result.data);
    };

    loadJob();
    unsubscribe = subscribeToJobUpdates(jobId, (updatedJob) => {
      if (!mounted) return;
      setJob(updatedJob);
    });

    intervalId = window.setInterval(loadJob, 3000);

    return () => {
      mounted = false;
      if (unsubscribe) unsubscribe();
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [jobId]);

  const activeBrand = useMemo(
    () => brands.find((brand) => brand.id === activeBrandId) || null,
    [brands, activeBrandId]
  );

  const filteredCreatives = useMemo(() => {
    if (!job) {
      return [];
    }

    return job.creatives.filter((creative) => {
      const variantName = creative.variationName || "Untitled Variant";
      const hasFailures = creativeHasFailures(creative);
      if (variantFilter !== "all" && variantName !== variantFilter) {
        return false;
      }
      if (panelFilter === "failed-assets" || panelFilter === "failed-both") {
        return hasFailures;
      }
      return true;
    });
  }, [job, panelFilter, variantFilter]);

  const variantOptions = useMemo(() => {
    if (!job) {
      return [];
    }

    return Array.from(
      new Set(job.creatives.map((creative) => creative.variationName || "Untitled Variant"))
    ).sort((left, right) => left.localeCompare(right));
  }, [job]);

  const groupedCreatives = useMemo(() => {
    const grouped = new Map<string, EvaluationCreative[]>();

    filteredCreatives.forEach((creative) => {
      const variantName = creative.variationName || "Untitled Variant";
      const bucket = grouped.get(variantName) || [];
      bucket.push(creative);
      grouped.set(variantName, bucket);
    });

    return Array.from(grouped.entries()).map(([variantName, creatives]) => ({
      variantName,
      creatives,
    }));
  }, [filteredCreatives]);

  useEffect(() => {
    if (!filteredCreatives.length) {
      setSelectedCreativeId(null);
      return;
    }

    if (!selectedCreativeId) {
      setSelectedCreativeId(filteredCreatives[0].id);
      return;
    }

    if (!filteredCreatives.some((creative) => creative.id === selectedCreativeId)) {
      setSelectedCreativeId(filteredCreatives[0].id);
    }
  }, [filteredCreatives, selectedCreativeId]);

  const selectedCreative = useMemo(
    () =>
      filteredCreatives.find((creative) => creative.id === selectedCreativeId) ||
      null,
    [filteredCreatives, selectedCreativeId]
  );

  const selectedCreativeIndex = useMemo(
    () =>
      selectedCreativeId
        ? filteredCreatives.findIndex((creative) => creative.id === selectedCreativeId)
        : -1,
    [filteredCreatives, selectedCreativeId]
  );

  const groupedResults = useMemo(() => {
    if (!selectedCreative?.complianceResults) {
      return [];
    }

    let filtered = selectedCreative.complianceResults;

    if (panelFilter === "failed-rules" || panelFilter === "failed-both") {
      filtered = filtered.filter((result) => result.status === "FAIL");
    }

    if (engineFilter !== "all") {
      filtered = filtered.filter(
        (result) => (result.engine || "visual") === engineFilter
      );
    }

    return groupResultsByEngineAndCheckType(filtered);
  }, [selectedCreative, panelFilter, engineFilter]);

  const queuedRuleGroups = useMemo(() => {
    if (!activeBrand) {
      return [];
    }

    const configuredRules = buildBrandRuleDefinitions(activeBrand);
    const evaluatedRuleIds = new Set(
      selectedCreative?.complianceResults
        ?.map((result) => result.ruleId)
        .filter(Boolean) ?? []
    );

    let pendingRules = configuredRules.filter(
      (rule) => !evaluatedRuleIds.has(rule.id)
    );

    if (engineFilter !== "all") {
      pendingRules = pendingRules.filter(
        (rule) => (rule.engine || "visual") === engineFilter
      );
    }

    return groupRuleDefinitionsByEngineAndCheckType(pendingRules);
  }, [activeBrand, engineFilter, selectedCreative]);

  const showQueuedRules =
    Boolean(selectedCreative) &&
    Boolean(activeBrand) &&
    (job?.status === "analyzing" || job?.status === "pending") &&
    queuedRuleGroups.length > 0;

  const jobFailedAssetCount = useMemo(
    () => job?.creatives.filter((creative) => creativeHasFailures(creative)).length || 0,
    [job]
  );

  const totalFailedRules = useMemo(
    () =>
      job?.creatives.reduce(
        (count, creative) => count + getCreativeFailCount(creative),
        0
      ) || 0,
    [job]
  );

  const highlightedElements = useMemo(() => {
    if (!selectedCreative?.analysisResult?.elements || !highlightedRuleKey) {
      return [];
    }

    const result = selectedCreative.complianceResults?.find(
      (item) =>
        `${item.ruleId || item.ruleTitle || item.rule}-${item.engine || "visual"}` ===
        highlightedRuleKey
    );

    if (!result?.relatedElementIds?.length) {
      return [];
    }

    const ids = new Set(result.relatedElementIds);
    return selectedCreative.analysisResult.elements.filter((element) =>
      ids.has(element.id)
    );
  }, [selectedCreative, highlightedRuleKey]);

  useEffect(() => {
    setHighlightedRuleKey(null);
  }, [selectedCreativeId]);

  useEffect(() => {
    if (!previewRef.current || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setPreviewBounds({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    observer.observe(previewRef.current);
    return () => observer.disconnect();
  }, [selectedCreative?.id]);
  const handleAnalyze = async () => {
    if (!sourceUrl || !parsedSource) {
      return;
    }

    if (!activeBrand) {
      setError("Choose a brand rule set before running analysis.");
      return;
    }

    let identity = {
      rocketiumUserId,
      rocketiumSessionId,
    };

    if (!identity.rocketiumUserId || !identity.rocketiumSessionId) {
      identity = await requestRocketiumIdentity();
      if (identity.rocketiumUserId && identity.rocketiumSessionId) {
        setRocketiumIdentity(identity);
      }
    }

    if (!identity.rocketiumUserId || !identity.rocketiumSessionId) {
      setError(
        "Could not read Rocketium user/session from the active tab. Refresh the Rocketium page and reopen the extension."
      );
      return;
    }

    setError(null);
    setIsCreatingJob(true);

    try {
      const result = await createEvaluationJob(sourceUrl, {
        brand: activeBrand,
        ruleMode: "brand",
        rocketiumUserId: identity.rocketiumUserId,
        rocketiumSessionId: identity.rocketiumSessionId,
      });

      if (!result.success || !result.jobId) {
        throw new Error(result.error || "Failed to create evaluation job");
      }

      setJobId(result.jobId);
    } catch (jobError: any) {
      setError(jobError.message || "Failed to start analysis");
    } finally {
      setIsCreatingJob(false);
    }
  };

  const openFullPreview = () => {
    if (!jobId) return;
    window.open(`/preview/${jobId}`, "_blank", "noopener,noreferrer");
  };

  const activePreviewSize = {
    width: selectedCreative?.width || previewNaturalSize.width || 1,
    height: selectedCreative?.height || previewNaturalSize.height || 1,
  };

  const renderElementOverlayWithBounds = (
    element: NonNullable<EvaluationCreative["analysisResult"]>["elements"][number],
    bounds: { width: number; height: number }
  ) => {
    const frameWidth = bounds.width;
    const frameHeight = bounds.height;
    if (!frameWidth || !frameHeight) return null;

    const imageWidth = activePreviewSize.width || 1;
    const imageHeight = activePreviewSize.height || 1;
    const scale = Math.min(frameWidth / imageWidth, frameHeight / imageHeight);
    const displayWidth = imageWidth * scale;
    const displayHeight = imageHeight * scale;
    const offsetX = (frameWidth - displayWidth) / 2;
    const offsetY = (frameHeight - displayHeight) / 2;

    if (element.polygon?.length) {
      const points = element.polygon
        .map(
          (point) =>
            `${offsetX + point.x * displayWidth},${offsetY + point.y * displayHeight}`
        )
        .join(" ");

      return (
        <svg
          key={element.id}
          className="absolute inset-0 h-full w-full"
          viewBox={`0 0 ${frameWidth} ${frameHeight}`}
        >
          <polygon
            points={points}
            className="fill-violet-500/20 stroke-violet-300"
            strokeWidth={2}
            strokeLinejoin="round"
          />
        </svg>
      );
    }

    return (
      <div
        key={element.id}
        className="absolute rounded-lg border-2 border-violet-300 bg-violet-500/15 shadow-[0_0_0_1px_rgba(139,92,246,0.25)]"
        style={{
          left: offsetX + element.box.xmin * displayWidth,
          top: offsetY + element.box.ymin * displayHeight,
          width: (element.box.xmax - element.box.xmin) * displayWidth,
          height: (element.box.ymax - element.box.ymin) * displayHeight,
        }}
      />
    );
  };

  const renderElementOverlay = (
    element: NonNullable<EvaluationCreative["analysisResult"]>["elements"][number]
  ) => renderElementOverlayWithBounds(element, previewBounds);

  const getResultKey = (result: ComplianceResult) =>
    `${result.ruleId || result.ruleTitle || result.rule}-${result.engine || "visual"}`;

  const toggleResultHighlight = (result: ComplianceResult) => {
    if ((result.engine || "visual") !== "visual" || !result.relatedElementIds?.length) {
      setHighlightedRuleKey(null);
      return;
    }

    const resultKey = getResultKey(result);
    setHighlightedRuleKey((current) => (current === resultKey ? null : resultKey));
  };

  const goToCreative = (direction: "previous" | "next") => {
    if (selectedCreativeIndex < 0) return;

    const nextIndex =
      direction === "previous" ? selectedCreativeIndex - 1 : selectedCreativeIndex + 1;
    const nextCreative = filteredCreatives[nextIndex];
    if (!nextCreative) return;

    setSelectedCreativeId(nextCreative.id);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <section className="rounded-[28px] border border-zinc-800 bg-zinc-950/95 p-4 shadow-2xl shadow-black/20 mb-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-400 mb-2">
                  <Layers size={14} />
                  Analyze
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setIsControlsCollapsed((value) => !value)}
                  className="inline-flex items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
                  title={isControlsCollapsed ? "Expand controls" : "Collapse controls"}
                >
                  {isControlsCollapsed ? (
                    <ChevronDown size={14} />
                  ) : (
                    <ChevronUp size={14} />
                  )}
                </button>
                {jobId && (
                  <button
                    onClick={openFullPreview}
                    className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
                  >
                    <ExternalLink size={14} />
                    Open Full Preview
                  </button>
                )}
              </div>
            </div>

            {!isControlsCollapsed && (
              <>
                <div className="flex items-end gap-3">
                <label className="block min-w-0 flex-1">
                  <span className="block text-[11px] text-zinc-500 mb-1">
                    Brand Rules
                  </span>
                  <div className="relative">
                    <ShieldCheck
                      size={13}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
                    />
                    <ChevronDown
                      size={13}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
                    />
                    <select
                      value={activeBrandId}
                      onChange={(e) => setActiveBrandId(e.target.value)}
                      disabled={isLoadingConfig || brands.length === 0}
                      className="w-full appearance-none rounded-xl bg-zinc-950 border border-zinc-800 pl-9 pr-8 py-2 text-xs text-white disabled:opacity-50"
                    >
                      {brands.map((brand) => (
                        <option key={brand.id} value={brand.id}>
                          {brand.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </label>

                <div className="relative shrink-0">
                  <button
                    onClick={() => setIsFilterMenuOpen((open) => !open)}
                    className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                    title="Filters"
                  >
                    <Filter size={14} />
                  </button>
                  {isFilterMenuOpen && (
                    <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-zinc-800 bg-zinc-900 p-3 shadow-2xl z-20">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-3">
                        Filters
                      </div>
                      <div className="space-y-3 text-sm text-zinc-200">
                        <div className="space-y-2">
                          <div className="text-xs text-zinc-500">Failure Filter</div>
                          <div className="grid grid-cols-1 gap-2">
                            {[
                              ["all", "Show All"],
                              ["failed-rules", "Failed Rules Only"],
                              ["failed-assets", "Failed Assets Only"],
                              ["failed-both", "Failed Assets + Rules"],
                            ].map(([value, label]) => (
                              <button
                                key={value}
                                onClick={() => setPanelFilter(value as PanelFilter)}
                                className={`rounded-xl px-3 py-2 text-left text-sm ${
                                  panelFilter === value
                                    ? "bg-violet-500/15 text-violet-200"
                                    : "bg-zinc-950 text-zinc-300 hover:bg-zinc-800"
                                }`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="text-xs text-zinc-500">Rule Engine</div>
                          <div className="grid grid-cols-1 gap-2">
                            {[
                              ["all", "All Rules"],
                              ["visual", "Visual Only"],
                              ["precision", "Fact-Based Only"],
                            ].map(([value, label]) => (
                              <button
                                key={value}
                                onClick={() => setEngineFilter(value as EngineFilter)}
                                className={`rounded-xl px-3 py-2 text-left text-sm ${
                                  engineFilter === value
                                    ? "bg-violet-500/15 text-violet-200"
                                    : "bg-zinc-950 text-zinc-300 hover:bg-zinc-800"
                                }`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            setPanelFilter("all");
                            setEngineFilter("all");
                            setIsFilterMenuOpen(false);
                          }}
                          className="w-full rounded-xl border border-zinc-800 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
                        >
                          Clear Filters
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                </div>

                <button
                  onClick={handleAnalyze}
                  disabled={!parsedSource || isLoadingConfig || isCreatingJob || !activeBrand}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-100 hover:bg-white disabled:bg-zinc-800 disabled:text-zinc-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition-colors"
                >
                  {isCreatingJob ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Starting…
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      Analyze Current Tab
                    </>
                  )}
                </button>
              </>
            )}

            {isLoadingConfig && (
              <div className="text-xs text-zinc-500">
                Loading brand configuration…
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                {error}
              </div>
            )}

            {!parsedSource && sourceUrl && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-100 flex items-start gap-3">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <div>
                  This tab URL is not yet supported. Open a Rocketium project URL
                  or asset preview URL and refresh the panel.
                </div>
              </div>
            )}
          </div>
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-4">
          <section
            className={`rounded-[28px] border border-zinc-800 bg-zinc-950/95 p-4 ${
              isAssetsCollapsed ? "" : "min-h-[520px]"
            }`}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-white">Assets</h2>
                <p className="text-xs text-zinc-500 mt-1">
                  {job
                    ? `${filteredCreatives.length} visible · ${job.totalCreatives} total`
                    : "Run analysis to load assets"}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {job && (
                  <>
                    <div className="relative">
                      <Store
                        size={12}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
                      />
                      <ChevronDown
                        size={12}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
                      />
                      <select
                        value={variantFilter}
                        onChange={(e) => setVariantFilter(e.target.value)}
                        className="appearance-none rounded-xl border border-zinc-800 bg-zinc-900 pl-8 pr-8 py-2 text-xs text-zinc-300"
                      >
                        <option value="all">All Variants</option>
                        {variantOptions.map((variantName) => (
                          <option key={variantName} value={variantName}>
                            {variantName}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      onClick={() =>
                        jobId &&
                        loadEvaluationJob(jobId).then(
                          (result) => result.data && setJob(result.data)
                        )
                      }
                      className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
                    >
                      <RefreshCw size={12} />
                    </button>
                  </>
                )}
                <button
                  onClick={() => setIsAssetsCollapsed((value) => !value)}
                  className="inline-flex items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
                  title={isAssetsCollapsed ? "Expand assets" : "Collapse assets"}
                >
                  {isAssetsCollapsed ? (
                    <ChevronDown size={12} />
                  ) : (
                    <ChevronUp size={12} />
                  )}
                </button>
              </div>
            </div>

            {isAssetsCollapsed ? (
              <div className="py-1" />
            ) : job ? (
              <div className="space-y-3 max-h-[720px] overflow-y-auto pr-1">
                {groupedCreatives.length > 0 ? (
                  groupedCreatives.map((group) => (
                    <div key={group.variantName} className="space-y-2">
                      <div className="sticky top-0 z-10 rounded-xl border border-zinc-800 bg-zinc-900/95 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                        {group.variantName}
                      </div>
                      {group.creatives.map((creative) => {
                        const failCount = getCreativeFailCount(creative);
                        const hasFailures = creativeHasFailures(creative);
                        const isSelected = selectedCreativeId === creative.id;

                        return (
                          <button
                            key={creative.id}
                            onClick={() => setSelectedCreativeId(creative.id)}
                            className={`w-full text-left rounded-2xl border p-3 transition-colors ${
                              isSelected
                                ? hasFailures
                                  ? "border-rose-500/60 bg-rose-500/10"
                                  : "border-zinc-600 bg-zinc-900"
                                : hasFailures
                                ? "border-rose-500/40 bg-zinc-950 hover:border-rose-400/70"
                                : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"
                            }`}
                          >
                            <div className="flex gap-3">
                              <div
                                className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl border bg-zinc-900 ${
                                  hasFailures ? "border-rose-500/40" : "border-zinc-800"
                                }`}
                              >
                                <img
                                  src={creative.url}
                                  alt={creative.name}
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="text-sm font-medium text-white truncate">
                                      {creative.name}
                                    </div>
                                    <div className="text-xs text-zinc-500 truncate mt-1">
                                      {getProjectDisplayName(creative)}
                                    </div>
                                  </div>
                                  <span className="text-[11px] text-zinc-300 bg-zinc-800 px-2 py-1 rounded-full capitalize">
                                    {creative.status}
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 mt-3 text-[11px]">
                                  {getCreativeSizeLabel(creative) && (
                                    <span className="rounded-full bg-zinc-800 px-2 py-1 text-zinc-400">
                                      {getCreativeSizeLabel(creative)}
                                    </span>
                                  )}
                                  {failCount > 0 && (
                                    <span className="rounded-full bg-rose-500/10 px-2 py-1 text-rose-300">
                                      {failCount} failed rule{failCount > 1 ? "s" : ""}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950 px-4 py-10 text-center text-sm text-zinc-500">
                    No assets match the current filters.
                  </div>
                )}
              </div>
            ) : (
              <div className="h-[420px] flex items-center justify-center text-sm text-zinc-500">
                Assets will appear here after you run analysis.
              </div>
            )}
          </section>

          <section className="rounded-[28px] border border-zinc-800 bg-zinc-950/95 p-4 min-h-[520px]">
            {!job ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-6">
                <div className="w-14 h-14 rounded-2xl bg-zinc-900 flex items-center justify-center mb-4">
                  <Sparkles size={22} className="text-zinc-200" />
                </div>
                <h2 className="text-lg font-semibold text-white mb-2">
                  Ready to analyze
                </h2>
                <p className="text-sm text-zinc-500 max-w-md">
                  Pick a brand rule set from the header and analyze the current Rocketium tab.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-white">
                      {job.projectName || "Evaluation"}
                    </h2>
                    <p className="text-sm text-zinc-500 mt-1">
                      {job.sourceProjectIds.length} project(s) · {job.totalCreatives} creatives
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="rounded-full bg-zinc-900 border border-zinc-800 px-3 py-1.5 text-sm text-zinc-300">
                      {jobFailedAssetCount} failed asset{jobFailedAssetCount === 1 ? "" : "s"}
                    </div>
                    <div className="rounded-full bg-zinc-900 border border-zinc-800 px-3 py-1.5 text-sm text-zinc-300">
                      {totalFailedRules} failed rule{totalFailedRules === 1 ? "" : "s"}
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-zinc-900 border border-zinc-800 px-3 py-1.5 text-sm text-zinc-300 capitalize">
                      {(job.status === "analyzing" || job.status === "pending") && (
                        <Loader2 size={14} className="animate-spin text-zinc-300" />
                      )}
                      {job.status}
                    </div>
                  </div>
                </div>

                {selectedCreative ? (
                  <>
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
                      <div
                        className={`grid grid-cols-1 ${
                          isPreviewExpanded ? "" : "lg:grid-cols-[160px_minmax(0,1fr)]"
                        } gap-4`}
                      >
                        <div
                          ref={previewRef}
                          className={`relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 flex items-center justify-center ${
                            isPreviewExpanded
                              ? "w-full max-w-none min-h-[360px] p-4"
                              : "aspect-square max-w-[160px] p-2"
                          }`}
                        >
                          <img
                            src={selectedCreative.url}
                            alt={selectedCreative.name}
                            className="h-full w-full object-contain"
                            referrerPolicy="no-referrer"
                            onLoad={(event) =>
                              setPreviewNaturalSize({
                                width: event.currentTarget.naturalWidth,
                                height: event.currentTarget.naturalHeight,
                              })
                            }
                          />
                          <div className="pointer-events-none absolute inset-2">
                            {highlightedElements.map(renderElementOverlay)}
                          </div>
                        </div>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="text-base font-medium text-white">
                                {selectedCreative.name}
                              </div>
                              <div className="text-sm text-zinc-500 mt-1">
                                {getProjectDisplayName(selectedCreative)}
                              </div>
                              <div className="text-sm text-zinc-500 mt-1">
                                Variant:{" "}
                                {selectedCreative.variationName || "Untitled Variant"}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                onClick={() => goToCreative("previous")}
                                disabled={selectedCreativeIndex <= 0}
                                className="inline-flex items-center justify-center rounded-full bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 disabled:hover:bg-zinc-800"
                                title="Previous creative"
                              >
                                <ChevronLeft size={12} />
                              </button>
                              <button
                                onClick={() => goToCreative("next")}
                                disabled={
                                  selectedCreativeIndex < 0 ||
                                  selectedCreativeIndex >= filteredCreatives.length - 1
                                }
                                className="inline-flex items-center justify-center rounded-full bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 disabled:hover:bg-zinc-800"
                                title="Next creative"
                              >
                                <ChevronRight size={12} />
                              </button>
                              <button
                                onClick={() =>
                                  setIsPreviewExpanded((current) => !current)
                                }
                                className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
                              >
                                {isPreviewExpanded ? (
                                  <Minimize2 size={12} />
                                ) : (
                                  <Expand size={12} />
                                )}
                                {isPreviewExpanded ? "Smaller preview" : "Bigger preview"}
                              </button>
                              <span className="rounded-full bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 capitalize">
                                {selectedCreative.status}
                              </span>
                              {getCreativeSizeLabel(selectedCreative) && (
                                <span className="rounded-full bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300">
                                  {getCreativeSizeLabel(selectedCreative)}
                                </span>
                              )}
                            </div>
                          </div>

                          {selectedCreative.error && (
                            <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                              {selectedCreative.error}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {groupedResults.length > 0 || showQueuedRules ? (
                      <>
                        {groupedResults.map((engineGroup) => (
                        <section
                          key={engineGroup.engine}
                          className="rounded-2xl bg-zinc-900/60 border border-zinc-800 p-4 space-y-3"
                        >
                          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                            {engineGroup.label}
                          </div>
                          {engineGroup.groups.map((group) => (
                            <div key={`${engineGroup.engine}-${group.checkType}`} className="space-y-3">
                              <div
                                className={`rounded-2xl border px-3 py-2.5 ${getCheckTypeHeaderClasses(
                                  group.checkType
                                )}`}
                              >
                                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                                  Rule Category
                                </div>
                                <div className="mt-1 text-sm font-semibold text-white">
                                  {group.checkType}
                                </div>
                              </div>
                              <div className="space-y-3">
                                {group.results.map((result) => (
                                  <button
                                    key={`${result.ruleId || result.rule}-${result.status}-${engineGroup.engine}`}
                                    onClick={() => toggleResultHighlight(result)}
                                    className={`w-full text-left rounded-xl border px-3 py-3 ${
                                      highlightedRuleKey === getResultKey(result)
                                        ? "border-violet-400/60 bg-violet-500/10"
                                        : "border-zinc-800 bg-zinc-950"
                                    } ${
                                      (result.engine || "visual") === "visual" &&
                                      result.relatedElementIds?.length
                                        ? "cursor-pointer hover:border-violet-500/40"
                                        : "cursor-default"
                                    }`}
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div>
                                        <div className="text-sm font-medium text-white">
                                          {result.ruleTitle || result.rule}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px]">
                                          {result.category && (
                                            <span
                                              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${getResultCategoryBadgeClasses(
                                                result.category
                                              )}`}
                                            >
                                              <span className="text-[9px] font-semibold uppercase tracking-[0.16em] opacity-70">
                                                Category
                                              </span>
                                              <span className="font-semibold">
                                                {getResultCategoryLabel(result.category)}
                                              </span>
                                            </span>
                                          )}
                                          <span
                                            className={`px-2 py-1 rounded-full ${
                                              result.status === "PASS"
                                                ? "bg-emerald-500/10 text-emerald-300"
                                                : result.status === "WARNING"
                                                ? "bg-amber-500/10 text-amber-300"
                                                : "bg-rose-500/10 text-rose-300"
                                            }`}
                                          >
                                            {result.status}
                                          </span>
                                          <span className="px-2 py-1 rounded-full bg-zinc-800 text-zinc-300">
                                            {result.engine === "precision"
                                              ? "fact-based"
                                              : "visual"}
                                          </span>
                                          {result.ruleSource && (
                                            <span className="px-2 py-1 rounded-full bg-zinc-800 text-zinc-300">
                                              {result.ruleSource}
                                            </span>
                                          )}
                                          {result.severity && (
                                            <span className="px-2 py-1 rounded-full bg-zinc-800 text-zinc-400">
                                              {result.severity}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    <p className="text-sm text-zinc-300 mt-3">
                                      {result.reasoning}
                                    </p>
                                    {result.engine === "precision" &&
                                      (result.actualValue !== undefined ||
                                        result.expectedValue !== undefined ||
                                        result.matchedLayerName) && (
                                        <div className="mt-2 space-y-1 text-xs text-zinc-400">
                                          {result.matchedLayerName && (
                                            <div>Layer: {result.matchedLayerName}</div>
                                          )}
                                          {result.actualValue !== undefined && (
                                            <div>Actual: {String(result.actualValue)}</div>
                                          )}
                                          {result.expectedValue !== undefined && (
                                            <div>
                                              Expected: {String(result.expectedValue)}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    {result.suggestion && (
                                      <p className="text-sm text-zinc-200 mt-2">
                                        Suggestion: {result.suggestion}
                                      </p>
                                    )}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </section>
                        ))}

                        {showQueuedRules && (
                          <section className="rounded-2xl bg-zinc-900/40 border border-zinc-800 p-4 space-y-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                                Queued For Evaluation
                              </div>
                              <div className="inline-flex items-center gap-2 rounded-full bg-zinc-900 border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400">
                                <Loader2 size={12} className="animate-spin text-zinc-400" />
                                {queuedRuleGroups.reduce(
                                  (count, engineGroup) =>
                                    count +
                                    engineGroup.groups.reduce(
                                      (groupCount, group) =>
                                        groupCount + group.rules.length,
                                      0
                                    ),
                                  0
                                )}{" "}
                                remaining rule
                                {queuedRuleGroups.reduce(
                                  (count, engineGroup) =>
                                    count +
                                    engineGroup.groups.reduce(
                                      (groupCount, group) =>
                                        groupCount + group.rules.length,
                                      0
                                    ),
                                  0
                                ) === 1
                                  ? ""
                                  : "s"}
                              </div>
                            </div>

                            {queuedRuleGroups.map((engineGroup) => (
                              <section key={`queued-${engineGroup.engine}`} className="space-y-3">
                                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                                  {engineGroup.label}
                                </div>
                                {engineGroup.groups.map((group) => (
                                  <div
                                    key={`queued-${engineGroup.engine}-${group.checkType}`}
                                    className="space-y-3"
                                  >
                                    <div
                                      className={`rounded-2xl border px-3 py-2.5 ${getCheckTypeHeaderClasses(
                                        group.checkType
                                      )}`}
                                    >
                                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                                        Rule Category
                                      </div>
                                      <div className="mt-1 text-sm font-semibold text-white">
                                        {group.checkType}
                                      </div>
                                    </div>
                                    <div className="space-y-3">
                                      {group.rules.map((rule) => (
                                        <div
                                          key={rule.id}
                                          className="rounded-xl border border-dashed border-zinc-700 bg-zinc-950/80 px-3 py-3"
                                        >
                                          <div className="flex items-start justify-between gap-3">
                                            <div>
                                              <div className="text-sm font-medium text-white">
                                                {rule.title}
                                              </div>
                                              <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px]">
                                                <span className="px-2 py-1 rounded-full bg-amber-500/10 text-amber-300">
                                                  queued
                                                </span>
                                                <span className="px-2 py-1 rounded-full bg-zinc-800 text-zinc-300">
                                                  {rule.engine === "precision"
                                                    ? "fact-based"
                                                    : "visual"}
                                                </span>
                                                <span className="px-2 py-1 rounded-full bg-zinc-800 text-zinc-300">
                                                  brand
                                                </span>
                                                {rule.severity && (
                                                  <span className="px-2 py-1 rounded-full bg-zinc-800 text-zinc-400">
                                                    {rule.severity}
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                          <p className="text-sm text-zinc-400 mt-3">
                                            {rule.instruction}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </section>
                            ))}
                          </section>
                        )}
                      </>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950 px-4 py-10 text-center text-sm text-zinc-500">
                        No compliance results match the current filters.
                      </div>
                    )}
                  </>
                ) : (
                  <div className="h-[420px] flex items-center justify-center text-sm text-zinc-500">
                    Choose a creative to inspect the QC results.
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
