import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  analyzeImageWithGemini,
  checkComplianceWithGemini,
  calculateComplianceScores,
} from "../services/gemini";
import {
  saveProjectEvaluation,
  loadProjectEvaluation,
  StoredCreativeResult,
} from "../services/projectEvaluation";
import {
  AnalysisResult,
  ComplianceResult,
  ComplianceScores,
  PlatformConfig,
  AttentionInsightResult,
} from "../types";
import {
  analyzeWithAttentionInsight,
  generateMockAttentionResult,
  isAttentionInsightConfigured,
} from "../services/attentionInsight";
import {
  buildPromptLayerConfig,
  groupResultsByEngineAndCheckType,
} from "../lib/ruleBundle";
import {
  ArrowLeft,
  Sparkles,
  Image as ImageIcon,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  RefreshCw,
  ChevronDown,
  Moon,
  Sun,
  ExternalLink,
  Layers,
  BarChart3,
  ListChecks,
  ChevronUp,
  Lightbulb,
  ShieldCheck,
  Play,
  History,
  Zap,
  Target,
  TrendingUp,
  Eye,
  Focus,
  Flame,
  LayoutGrid,
  Lock,
} from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";
import { Spinner } from "./Spinner";
import { ZoomPanControls } from "./ZoomPanControls";
import { DEFAULT_PLATFORMS } from "../constants/platforms";
import { getFetchableAssetUrl } from "../lib/assetProxy";
import { loadPlatforms } from "../services/configService";

// Types for Rocketium API response
interface RocketiumVariation {
  _id: string;
  name?: string;
  savedCustomDimensions?: Record<
    string,
    {
      creativeUrl?: string;
      name?: string;
      width?: number;
      height?: number;
      [key: string]: any;
    }
  >;
  [key: string]: any;
}

interface Creative {
  id: string;
  url: string;
  name: string;
  dimensionKey: string;
  variationId: string;
  variationName?: string;
  width?: number;
  height?: number;
  analysisResult?: AnalysisResult;
  complianceResults?: ComplianceResult[];
  complianceScores?: ComplianceScores;
  attentionResult?: AttentionInsightResult;
  isAnalyzing?: boolean;
  isCheckingCompliance?: boolean;
  isAnalyzingAttention?: boolean;
  error?: string;
}

const matchesSavedCreative = (
  creative: Creative,
  savedCreative: StoredCreativeResult
): boolean =>
  savedCreative.creativeId === creative.id ||
  (savedCreative.variationId === creative.variationId &&
    savedCreative.dimensionKey === creative.dimensionKey) ||
  savedCreative.creativeUrl === creative.url;

// Get the API base URL based on current environment
const getApiBaseUrl = () => {
  const env = (import.meta as any).env;
  return (
    env?.VITE_ROCKETIUM_API_BASE_URL?.replace(/\/$/, "") ||
    "https://rocketium.com"
  );
};

const createEvaluationRunId = (): string => {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.getRandomValues === "function"
  ) {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("");

    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20),
    ].join("-");
  }

  return "00000000-0000-4000-8000-000000000000";
};

// Theme toggle button with refined styling
const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      className="p-1.5 rounded-lg bg-slate-100/80 dark:bg-slate-700/50 hover:bg-slate-200/80 dark:hover:bg-slate-600/50 transition-all duration-200 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 backdrop-blur-sm"
      title={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
    >
      {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
    </button>
  );
};

const getCheckTypeHeaderClasses = (checkType?: string) => {
  const normalized = checkType?.toLowerCase() || "";

  if (
    normalized.includes("copy") ||
    normalized.includes("type") ||
    normalized.includes("legibility")
  ) {
    return "border-amber-100/80 bg-amber-50/45 dark:border-amber-500/15 dark:bg-amber-500/6";
  }

  if (
    normalized.includes("logo") ||
    normalized.includes("brand") ||
    normalized.includes("variant")
  ) {
    return "border-violet-100/80 bg-violet-50/45 dark:border-violet-500/15 dark:bg-violet-500/6";
  }

  if (
    normalized.includes("policy") ||
    normalized.includes("localization") ||
    normalized.includes("content verification")
  ) {
    return "border-cyan-100/80 bg-cyan-50/45 dark:border-cyan-500/15 dark:bg-cyan-500/6";
  }

  if (
    normalized.includes("image") ||
    normalized.includes("crop") ||
    normalized.includes("framing") ||
    normalized.includes("safe area")
  ) {
    return "border-emerald-100/80 bg-emerald-50/45 dark:border-emerald-500/15 dark:bg-emerald-500/6";
  }

  return "border-slate-200/80 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-800/50";
};

export const EvaluateProject: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { theme } = useTheme();
  const requestedEvaluationId = searchParams.get("evaluationId")?.trim() || undefined;

  // State
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingSaved, setIsLoadingSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [selectedCreativeId, setSelectedCreativeId] = useState<string | null>(
    null
  );
  const [platforms, setPlatforms] =
    useState<PlatformConfig[]>(DEFAULT_PLATFORMS);
  const [activePlatformId, setActivePlatformId] = useState<string>("default");
  const [showPlatformDropdown, setShowPlatformDropdown] = useState(false);
  const [savedResultsLoaded, setSavedResultsLoaded] = useState(false);

  // Compliance view state
  const [activeTab, setActiveTab] = useState<"dashboard" | "details">(
    "dashboard"
  );
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [highlightedRuleKey, setHighlightedRuleKey] = useState<string | null>(
    null
  );

  // Attention Insight state
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [heatmapSliderPosition, setHeatmapSliderPosition] = useState(50); // 0-100 slider position
  const [rightPanelTab, setRightPanelTab] = useState<
    "compliance" | "attention"
  >("compliance");

  // Ref to track latest creatives and project name for saving
  const creativesRef = useRef<Creative[]>([]);
  creativesRef.current = creatives;
  const projectNameRef = useRef<string | null>(null);
  projectNameRef.current = projectName;
  const saveEvaluationIdRef = useRef<string>(createEvaluationRunId());

  useEffect(() => {
    saveEvaluationIdRef.current = createEvaluationRunId();
  }, [projectId, requestedEvaluationId]);

  // Get active platform
  const activePlatform =
    platforms.find((p) => p.id === activePlatformId) || platforms[0];

  // Get selected creative
  const selectedCreative = useMemo(
    () => creatives.find((c) => c.id === selectedCreativeId) || null,
    [creatives, selectedCreativeId]
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

  // Check if selected creative is the first one (only first creative can use attention analysis)
  const isFirstCreative = useMemo(
    () => creatives.length > 0 && selectedCreativeId === creatives[0]?.id,
    [creatives, selectedCreativeId]
  );

  // Fetch platforms
  useEffect(() => {
    const fetchPlatforms = async () => {
      try {
        const data = await loadPlatforms();
        setPlatforms(data);
      } catch {
        // Keep default platforms
      }
    };
    fetchPlatforms();
  }, []);

  // Helper function to extract creatives from API response
  const extractCreativesFromResponse = (data: any): Creative[] => {
    const extractedCreatives: Creative[] = [];
    const seenUrls = new Set<string>();

    if (data.variations && Array.isArray(data.variations)) {
      data.variations.forEach((variation: RocketiumVariation) => {
        if (variation.savedCustomDimensions) {
          Object.entries(variation.savedCustomDimensions).forEach(
            ([dimensionKey, dimension]) => {
              if (
                dimension.creativeUrl &&
                !seenUrls.has(dimension.creativeUrl)
              ) {
                seenUrls.add(dimension.creativeUrl);
                extractedCreatives.push({
                  id: `${variation.capsuleId || variation._id}-${dimensionKey}`,
                  url: dimension.creativeUrl,
                  name: dimension.name || dimensionKey,
                  dimensionKey,
                  variationId: variation.capsuleId || variation._id,
                  variationName: variation.name,
                  width: dimension.width,
                  height: dimension.height,
                });
              }
            }
          );
        }
      });
    }

    return extractedCreatives;
  };

  // Fetch variations and load saved results in sequence
  useEffect(() => {
    if (!projectId) return;

    let isCancelled = false;

    const fetchAndLoadData = async () => {
      setCreatives([]);
      setSelectedCreativeId(null);
      setProjectName(null);
      setSavedResultsLoaded(false);
      setIsLoading(true);
      setError(null);

      try {
        const baseUrl = getApiBaseUrl();
        const response = await fetch(
          `${baseUrl}/api/v2/assetGroup/${projectId}/variations`,
          {
            method: "GET",
            headers: {
              accept: "application/json, text/plain, */*",
            },
          }
        );

        if (isCancelled) return;

        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }

        const data = await response.json();
        let extractedCreatives = extractCreativesFromResponse(data);

        if (extractedCreatives.length === 0) {
          throw new Error("No creatives found in API response");
        }

        let fetchedProjectName: string | null = null;
        if (data.assetGroup?.name) {
          fetchedProjectName = data.assetGroup.name;
        }

        setIsLoadingSaved(true);
        const savedResult = await loadProjectEvaluation(
          projectId,
          requestedEvaluationId
        );

        if (isCancelled) return;

        if (savedResult.success && savedResult.data?.creatives) {
          console.log(
            `Loading ${savedResult.data.creatives.length} saved results`
          );

          extractedCreatives = extractedCreatives.map((creative) => {
            const savedCreative = savedResult.data!.creatives.find(
              (sc) => matchesSavedCreative(creative, sc)
            );
            if (savedCreative) {
              return {
                ...creative,
                analysisResult: savedCreative.analysisResult,
                complianceResults: savedCreative.complianceResults,
                complianceScores: savedCreative.complianceScores,
                attentionResult: savedCreative.attentionResult,
              };
            }
            return creative;
          });

          if (savedResult.data.platformId) {
            setActivePlatformId(savedResult.data.platformId);
          }

          if (savedResult.data.projectName && !fetchedProjectName) {
            fetchedProjectName = savedResult.data.projectName;
          }
        }

        if (isCancelled) return;

        setCreatives(extractedCreatives);
        setSelectedCreativeId(extractedCreatives[0].id);
        if (fetchedProjectName) {
          setProjectName(fetchedProjectName);
        }
        setSavedResultsLoaded(true);
      } catch (err: any) {
        if (isCancelled) return;
        console.error("Failed to load project:", err.message);
        setError(
          err.message ||
            "Failed to fetch project data. Please check the project ID."
        );
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
          setIsLoadingSaved(false);
        }
      }
    };

    fetchAndLoadData();

    return () => {
      isCancelled = true;
    };
  }, [projectId, requestedEvaluationId]);

  // Save results to database
  const saveResults = useCallback(
    async (creativesToSave: Creative[]) => {
      if (!projectId) return;

      setIsSaving(true);
      try {
        const storedCreatives: StoredCreativeResult[] = creativesToSave
          .filter(
            (c) => c.complianceResults || c.analysisResult || c.attentionResult
          )
          .map((c) => ({
            creativeId: c.id,
            creativeUrl: c.url,
            creativeName: c.name,
            dimensionKey: c.dimensionKey,
            variationId: c.variationId,
            variationName: c.variationName,
            width: c.width,
            height: c.height,
            analysisResult: c.analysisResult,
            complianceResults: c.complianceResults,
            complianceScores: c.complianceScores,
            attentionResult: c.attentionResult,
            analyzedAt: new Date().toISOString(),
            platformId: activePlatformId,
          }));

        if (storedCreatives.length > 0) {
          const result = await saveProjectEvaluation(
            projectId,
            activePlatformId,
            storedCreatives,
            projectNameRef.current || undefined,
            {
              evaluationId: saveEvaluationIdRef.current,
            }
          );
          if (result.success) {
            console.log(`Saved ${storedCreatives.length} creative results`);
          } else {
            console.warn("Failed to save results:", result.error);
          }
        }
      } catch (err) {
        console.error("Error saving results:", err);
      } finally {
        setIsSaving(false);
      }
    },
    [projectId, activePlatformId]
  );

  // Analyze a single creative
  const analyzeCreative = useCallback(
    async (creativeId: string): Promise<void> => {
      const creative = creativesRef.current.find((c) => c.id === creativeId);
      if (!creative || creative.isAnalyzing) return;

      setCreatives((prev) =>
        prev.map((c) =>
          c.id === creativeId
            ? {
                ...c,
                isAnalyzing: true,
                error: undefined,
                analysisResult: undefined,
                complianceResults: undefined,
                complianceScores: undefined,
              }
            : c
        )
      );

      try {
        const imageResponse = await fetch(getFetchableAssetUrl(creative.url));
        const blob = await imageResponse.blob();
        const reader = new FileReader();

        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onload = () => {
            const dataUrl = reader.result as string;
            resolve(dataUrl.split(",")[1]);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });

        const base64Data = await base64Promise;
        const mimeType = blob.type || "image/png";

        const analysisResult = await analyzeImageWithGemini(
          base64Data,
          mimeType,
          activePlatform.prompt,
          buildPromptLayerConfig({ platform: activePlatform })
        );

        setCreatives((prev) =>
          prev.map((c) =>
            c.id === creativeId
              ? {
                  ...c,
                  analysisResult,
                  isAnalyzing: false,
                  isCheckingCompliance: true,
                }
              : c
          )
        );

        let complianceResults: ComplianceResult[] | undefined;
        let complianceScores: ComplianceScores | undefined;

        if (activePlatform) {
          complianceResults = await checkComplianceWithGemini(
            base64Data,
            mimeType,
            activePlatform.complianceRules || [],
            buildPromptLayerConfig({ platform: activePlatform }),
            analysisResult
          );
          complianceScores = calculateComplianceScores(complianceResults);

          setCreatives((prev) =>
            prev.map((c) =>
              c.id === creativeId
                ? {
                    ...c,
                    complianceResults,
                    complianceScores,
                    isCheckingCompliance: false,
                  }
                : c
            )
          );

          if (creativeId === selectedCreativeId) {
            const failedIndices = new Set<number>();
            complianceResults.forEach((r, i) => {
              if (r.status === "FAIL") failedIndices.add(i);
            });
            setExpandedItems(failedIndices);
          }
        } else {
          setCreatives((prev) =>
            prev.map((c) =>
              c.id === creativeId ? { ...c, isCheckingCompliance: false } : c
            )
          );
        }

        return;
      } catch (err: any) {
        console.error("Error analyzing creative:", err);
        setCreatives((prev) =>
          prev.map((c) =>
            c.id === creativeId
              ? {
                  ...c,
                  isAnalyzing: false,
                  isCheckingCompliance: false,
                  error: err.message || "Analysis failed",
                }
              : c
          )
        );
      }
    },
    [activePlatform, selectedCreativeId]
  );

  // Analyze a single creative and save results
  const analyzeAndSave = useCallback(
    async (creativeId: string) => {
      await analyzeCreative(creativeId);
      setTimeout(() => {
        saveResults(creativesRef.current);
      }, 300);
    },
    [analyzeCreative, saveResults]
  );

  // Analyze attention for a single creative
  const analyzeAttention = useCallback(
    async (creativeId: string): Promise<void> => {
      const creative = creativesRef.current.find((c) => c.id === creativeId);
      if (!creative || creative.isAnalyzingAttention) return;

      setCreatives((prev) =>
        prev.map((c) =>
          c.id === creativeId ? { ...c, isAnalyzingAttention: true } : c
        )
      );

      try {
        let attentionResult: AttentionInsightResult;

        // Check if API is configured, use mock data otherwise
        if (isAttentionInsightConfigured()) {
          attentionResult = await analyzeWithAttentionInsight(creative.url);
        } else {
          // Use mock data for development/demo
          console.log("Using mock attention data (API key not configured)");
          attentionResult = generateMockAttentionResult(creative.url);
        }

        // Update state with attention result
        const updatedCreatives = creativesRef.current.map((c) =>
          c.id === creativeId
            ? { ...c, attentionResult, isAnalyzingAttention: false }
            : c
        );
        setCreatives(updatedCreatives);

        // Save results to database
        saveResults(updatedCreatives);

        // Switch to attention tab to show results
        setRightPanelTab("attention");
      } catch (err: any) {
        console.error("Error analyzing attention:", err);
        setCreatives((prev) =>
          prev.map((c) =>
            c.id === creativeId
              ? { ...c, isAnalyzingAttention: false, error: err.message }
              : c
          )
        );
      }
    },
    [saveResults]
  );

  // Analyze attention for the first creative only
  const analyzeAllAttention = useCallback(async () => {
    // Only analyze the first creative for attention
    const firstCreative = creatives[0];
    if (!firstCreative) {
      console.log("No creatives available for attention analysis");
      return;
    }

    if (firstCreative.isAnalyzingAttention || firstCreative.attentionResult) {
      console.log("First creative already analyzed or in progress");
      return;
    }

    console.log("Starting attention analysis for the first creative");
    await analyzeAttention(firstCreative.id);
  }, [creatives, analyzeAttention]);

  // Analyze all creatives in parallel
  const analyzeAllCreatives = useCallback(async () => {
    const creativesToAnalyze = creatives.filter((c) => !c.isAnalyzing);

    if (creativesToAnalyze.length === 0) {
      console.log("No creatives to analyze");
      return;
    }

    console.log(
      `Starting parallel analysis of ${creativesToAnalyze.length} creatives`
    );

    await Promise.all(
      creativesToAnalyze.map((creative) => analyzeCreative(creative.id))
    );

    setTimeout(() => {
      saveResults(creativesRef.current);
    }, 500);
  }, [creatives, analyzeCreative, saveResults]);

  // Toggle expand for compliance item
  const toggleExpand = (index: number) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedItems(newExpanded);
  };

  // Get status counts
  const getStatusCounts = (results: ComplianceResult[]) => {
    return {
      passed: results.filter((r) => r.status === "PASS").length,
      failed: results.filter((r) => r.status === "FAIL").length,
      warnings: results.filter((r) => r.status === "WARNING").length,
    };
  };

  // Get filtered results
  const getFilteredResults = (results: ComplianceResult[]) => {
    if (filterStatus === "all") return results;
    return results.filter((r) => r.status === filterStatus.toUpperCase());
  };

  const groupedFilteredResults = useMemo(() => {
    if (!selectedCreative?.complianceResults) return [];
    return groupResultsByEngineAndCheckType(
      getFilteredResults(selectedCreative.complianceResults)
    );
  }, [selectedCreative, filterStatus]);

  useEffect(() => {
    setHighlightedRuleKey(null);
  }, [selectedCreativeId]);

  const getResultKey = (result: ComplianceResult) =>
    `${result.ruleId || result.ruleTitle || result.rule}-${result.engine || "visual"}`;

  const toggleResultHighlight = (result: ComplianceResult) => {
    if (
      (result.engine || "visual") !== "visual" ||
      !result.relatedElementIds?.length
    ) {
      setHighlightedRuleKey(null);
      return;
    }

    const resultKey = getResultKey(result);
    setHighlightedRuleKey((current) =>
      current === resultKey ? null : resultKey
    );
  };

  const renderHighlightedElementOverlay = (
    element: NonNullable<Creative["analysisResult"]>["elements"][number]
  ) => {
    if (element.polygon?.length) {
      const points = element.polygon
        .map((point) => `${point.x * 100},${point.y * 100}`)
        .join(" ");

      return (
        <svg
          key={element.id}
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <polygon
            points={points}
            className="fill-violet-500/20 stroke-violet-300"
            strokeWidth={0.8}
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
          left: `${element.box.xmin * 100}%`,
          top: `${element.box.ymin * 100}%`,
          width: `${(element.box.xmax - element.box.xmin) * 100}%`,
          height: `${(element.box.ymax - element.box.ymin) * 100}%`,
        }}
      />
    );
  };

  // Render compliance badges
  const getSeverityBadge = (severity?: string) => {
    switch (severity) {
      case "critical":
        return (
          <span className="text-[9px] font-semibold px-1.5 py-px rounded-full bg-gradient-to-r from-red-500/20 to-rose-500/20 text-red-600 dark:text-red-400 border border-red-200/50 dark:border-red-700/50">
            Critical
          </span>
        );
      case "major":
        return (
          <span className="text-[9px] font-semibold px-1.5 py-px rounded-full bg-gradient-to-r from-orange-500/20 to-amber-500/20 text-orange-600 dark:text-orange-400 border border-orange-200/50 dark:border-orange-700/50">
            Major
          </span>
        );
      case "minor":
        return (
          <span className="text-[9px] font-semibold px-1.5 py-px rounded-full bg-slate-100 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 border border-slate-200/50 dark:border-slate-600/50">
            Minor
          </span>
        );
      default:
        return null;
    }
  };

  const getCategoryBadge = (category?: string) => {
    const styles: Record<string, string> = {
      brand:
        "from-violet-500/20 to-purple-500/20 text-violet-600 dark:text-violet-400 border-violet-200/50 dark:border-violet-700/50",
      accessibility:
        "from-blue-500/20 to-cyan-500/20 text-blue-600 dark:text-blue-400 border-blue-200/50 dark:border-blue-700/50",
      policy:
        "from-emerald-500/20 to-teal-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-700/50",
      quality:
        "from-amber-500/20 to-yellow-500/20 text-amber-600 dark:text-amber-400 border-amber-200/50 dark:border-amber-700/50",
    };
    return category ? (
      <span
        className={`text-[9px] font-semibold px-1.5 py-px rounded-full bg-gradient-to-r capitalize border ${
          styles[category] ||
          "from-slate-500/20 to-slate-500/20 text-slate-600 border-slate-200/50"
        }`}
      >
        {category}
      </span>
    ) : null;
  };

  // Get overall project status
  const getProjectStatus = () => {
    const analyzed = creatives.filter((c) => c.complianceScores);
    if (analyzed.length === 0) return null;

    const avgScore =
      analyzed.reduce((sum, c) => sum + (c.complianceScores?.overall || 0), 0) /
      analyzed.length;
    const totalFailed = analyzed.reduce(
      (sum, c) => sum + (c.complianceScores?.breakdown.failed || 0),
      0
    );
    const totalPassed = analyzed.reduce(
      (sum, c) => sum + (c.complianceScores?.breakdown.passed || 0),
      0
    );

    return { avgScore: Math.round(avgScore), totalFailed, totalPassed };
  };

  const projectStatus = getProjectStatus();

  // Score ring component
  const ScoreRing = ({
    score,
    size = 52,
    strokeWidth = 5,
  }: {
    score: number;
    size?: number;
    strokeWidth?: number;
  }) => {
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (score / 100) * circumference;
    const color =
      score >= 80
        ? "stroke-emerald-500"
        : score >= 60
        ? "stroke-amber-500"
        : "stroke-rose-500";

    return (
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="transform -rotate-90" width={size} height={size}>
          <circle
            className="stroke-slate-200 dark:stroke-slate-700"
            strokeWidth={strokeWidth}
            fill="transparent"
            r={radius}
            cx={size / 2}
            cy={size / 2}
          />
          <circle
            className={`${color} transition-all duration-700 ease-out`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="transparent"
            r={radius}
            cx={size / 2}
            cy={size / 2}
            style={{
              strokeDasharray: circumference,
              strokeDashoffset: offset,
            }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={`text-sm font-bold ${
              score >= 80
                ? "text-emerald-600 dark:text-emerald-400"
                : score >= 60
                ? "text-amber-600 dark:text-amber-400"
                : "text-rose-600 dark:text-rose-400"
            }`}
          >
            {score}%
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="h-screen max-h-screen bg-gradient-to-br from-slate-50 via-slate-50 to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900 flex flex-col transition-colors overflow-hidden text-[13px]">
      {/* Header */}
      <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-700/50 flex-shrink-0 z-30">
        <div className="max-w-full mx-auto px-4 h-12 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/")}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-200 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <div className="bg-gradient-to-br from-indigo-500 to-violet-600 p-1.5 rounded-lg shadow-md shadow-indigo-500/20">
                <Layers className="text-white h-4 w-4" />
              </div>
              <div className="min-w-0 flex items-center">
                <h1 className="text-sm font-semibold text-slate-900 dark:text-white tracking-tight leading-tight truncate">
                  {projectName || "Project Evaluation"}
                </h1>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Project Status */}
            {projectStatus && (
              <div className="flex items-center gap-3 px-3 py-1.5 bg-slate-100/80 dark:bg-slate-800/50 rounded-xl backdrop-blur-sm border border-slate-200/50 dark:border-slate-700/50">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      projectStatus.avgScore >= 80
                        ? "bg-emerald-500"
                        : projectStatus.avgScore >= 60
                        ? "bg-amber-500"
                      : "bg-rose-500"
                    }`}
                  />
                  <div className="flex items-baseline gap-1.5">
                    <div className="text-[9px] uppercase tracking-wider text-slate-500 dark:text-slate-500 font-medium leading-tight">
                      Avg Score
                    </div>
                    <div
                      className={`text-base font-bold tabular-nums leading-tight ${
                        projectStatus.avgScore >= 80
                          ? "text-emerald-600 dark:text-emerald-400"
                          : projectStatus.avgScore >= 60
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {projectStatus.avgScore}%
                    </div>
                  </div>
                </div>
                <div className="w-px h-6 bg-slate-300/50 dark:bg-slate-600/50" />
                <div>
                  {creatives.some(
                    (c) => c.isAnalyzing || c.isCheckingCompliance
                  ) ? (
                    <div className="flex items-center gap-1.5">
                      <div className="relative">
                        <div className="w-4 h-4 rounded-full border-2 border-indigo-200 dark:border-indigo-800" />
                        <div className="absolute inset-0 w-4 h-4 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
                      </div>
                      <div className="flex items-baseline gap-1.5">
                        <div className="text-[9px] uppercase tracking-wider text-indigo-500 font-medium leading-tight">
                          Analyzing
                        </div>
                        <div className="text-sm font-bold text-indigo-600 dark:text-indigo-400 tabular-nums leading-tight">
                          {creatives.filter((c) => c.complianceScores).length}/
                          {creatives.length}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-baseline gap-1.5">
                      <div className="text-[9px] uppercase tracking-wider text-slate-500 dark:text-slate-500 font-medium leading-tight">
                        Analyzed
                      </div>
                      <div className="text-sm font-bold text-slate-700 dark:text-slate-200 tabular-nums leading-tight">
                        {creatives.filter((c) => c.complianceScores).length}/
                        {creatives.length}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Platform Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowPlatformDropdown(!showPlatformDropdown)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-all duration-200 text-xs font-medium text-slate-700 dark:text-slate-200 shadow-sm"
              >
                <Target size={13} className="text-slate-400" />
                <span>{activePlatform.name}</span>
                <ChevronDown
                  size={13}
                  className={`text-slate-400 transition-transform duration-200 ${
                    showPlatformDropdown ? "rotate-180" : ""
                  }`}
                />
              </button>

              {showPlatformDropdown && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowPlatformDropdown(false)}
                  />
                  <div className="absolute right-0 mt-1 w-60 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl shadow-slate-200/50 dark:shadow-slate-900/50 z-20 max-h-80 overflow-y-auto overflow-x-hidden">
                    <div className="p-1">
                      {platforms.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => {
                            setActivePlatformId(p.id);
                            setShowPlatformDropdown(false);
                          }}
                          className={`w-full text-left px-3 py-1.5 text-xs rounded-lg transition-all duration-200 ${
                            activePlatformId === p.id
                              ? "bg-gradient-to-r from-indigo-500/10 to-violet-500/10 text-indigo-700 dark:text-indigo-300 font-medium"
                              : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                          }`}
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Status Indicators */}
            {(isSaving || isLoadingSaved) && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-lg text-xs font-medium border border-amber-200/50 dark:border-amber-700/50">
                <Loader2 size={12} className="animate-spin" />
                {isLoadingSaved ? "Loading..." : "Saving..."}
              </div>
            )}

            {/* Analyze All Buttons */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={analyzeAllCreatives}
                disabled={creatives.some(
                  (c) => c.isAnalyzing || c.isCheckingCompliance
                )}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 disabled:from-indigo-400 disabled:to-violet-400 text-white rounded-lg text-xs font-medium transition-all duration-200 shadow-md shadow-indigo-500/25 hover:shadow-indigo-500/40 disabled:shadow-none"
              >
                {creatives.some(
                  (c) => c.isAnalyzing || c.isCheckingCompliance
                ) ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Zap size={14} />
                )}
                Compliance
              </button>
              <button
                onClick={analyzeAllAttention}
                disabled={creatives.some((c) => c.isAnalyzingAttention)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 disabled:from-orange-400 disabled:to-rose-400 text-white rounded-lg text-xs font-medium transition-all duration-200 shadow-md shadow-orange-500/25 hover:shadow-orange-500/40 disabled:shadow-none"
              >
                {creatives.some((c) => c.isAnalyzingAttention) ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Focus size={14} />
                )}
                Attention
              </button>
            </div>

            {/* History Button */}
            <button
              onClick={() => navigate("/history")}
              className="p-1.5 rounded-lg bg-slate-100/80 dark:bg-slate-800/50 hover:bg-slate-200/80 dark:hover:bg-slate-700/50 transition-all duration-200 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 backdrop-blur-sm"
              title="View History"
            >
              <History size={15} />
            </button>

            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden min-h-0">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="relative w-12 h-12 mx-auto mb-4">
                <div className="absolute inset-0 rounded-full border-3 border-slate-200 dark:border-slate-700" />
                <div className="absolute inset-0 rounded-full border-3 border-transparent border-t-indigo-500 animate-spin" />
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                Loading project...
              </p>
            </div>
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-sm p-6">
              <div className="w-12 h-12 bg-rose-100 dark:bg-rose-900/30 rounded-xl flex items-center justify-center mx-auto mb-4">
                <XCircle size={24} className="text-rose-500" />
              </div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
                Error Loading Project
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">
                {error}
              </p>
              <button
                onClick={() => navigate("/")}
                className="px-4 py-1.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-lg text-xs font-medium hover:bg-slate-800 dark:hover:bg-slate-100 transition-all duration-200"
              >
                Go Back
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Left Sidebar - Creative List */}
            <div className="w-64 flex-shrink-0 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border-r border-slate-200/50 dark:border-slate-700/50 flex flex-col min-h-0">
              <div className="px-3 py-2.5 border-b border-slate-200/50 dark:border-slate-700/50">
                <h2 className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <div className="p-1 rounded bg-slate-100 dark:bg-slate-800">
                    <ImageIcon
                      size={12}
                      className="text-slate-600 dark:text-slate-400"
                    />
                  </div>
                  Creatives
                  <span className="text-[10px] text-slate-500 dark:text-slate-500 font-normal">
                    ({creatives.length})
                  </span>
                </h2>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                {creatives.map((creative) => (
                  <button
                    key={creative.id}
                    onClick={() => setSelectedCreativeId(creative.id)}
                    className={`w-full text-left p-2 rounded-xl border transition-all duration-200 group ${
                      selectedCreativeId === creative.id
                        ? "border-indigo-300 dark:border-indigo-600 bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-900/30 dark:to-violet-900/30 shadow-md shadow-indigo-100 dark:shadow-indigo-900/20"
                        : "border-slate-200/80 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/50 bg-white/80 dark:bg-slate-800/30"
                    }`}
                  >
                    <div className="flex gap-2">
                      {/* Thumbnail */}
                      <div className="w-12 h-12 flex-shrink-0 bg-slate-100 dark:bg-slate-700 rounded-lg overflow-hidden ring-1 ring-slate-200/50 dark:ring-slate-600/50">
                        <img
                          src={creative.url}
                          alt={creative.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48'%3E%3Crect width='48' height='48' fill='%23e2e8f0'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2394a3b8' font-size='8'%3ENo Image%3C/text%3E%3C/svg%3E";
                          }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-800 dark:text-slate-100 truncate leading-tight">
                          {creative.name}
                        </p>
                        {creative.variationName && (
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate leading-tight">
                            {creative.variationName}
                          </p>
                        )}
                        {creative.width && creative.height && (
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono leading-tight">
                            {creative.width}×{creative.height}
                          </p>
                        )}
                        {/* Status indicators */}
                        <div className="mt-1 flex items-center gap-1 flex-wrap">
                          {creative.isAnalyzing && (
                            <span className="flex items-center gap-0.5 text-[9px] text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-px rounded-full font-medium">
                              <Loader2 size={8} className="animate-spin" />
                              Analyzing
                            </span>
                          )}
                          {creative.isCheckingCompliance && (
                            <span className="flex items-center gap-0.5 text-[9px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-1.5 py-px rounded-full font-medium">
                              <Loader2 size={8} className="animate-spin" />
                              Checking
                            </span>
                          )}
                          {creative.isAnalyzingAttention && (
                            <span className="flex items-center gap-0.5 text-[9px] text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30 px-1.5 py-px rounded-full font-medium">
                              <Loader2 size={8} className="animate-spin" />
                              Attention
                            </span>
                          )}
                          {creative.complianceScores && (
                            <span
                              className={`text-[9px] font-bold px-1.5 py-px rounded-full ${
                                creative.complianceScores.overall >= 80
                                  ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
                                  : creative.complianceScores.overall >= 60
                                  ? "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
                                  : "bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400"
                              }`}
                            >
                              {creative.complianceScores.overall}%
                            </span>
                          )}
                          {creative.attentionResult && (
                            <span className="flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-px rounded-full bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400">
                              <Focus size={8} />
                              {creative.attentionResult.clarityScore}%
                            </span>
                          )}
                          {creative.error && (
                            <span className="text-[9px] text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 px-1.5 py-px rounded-full font-medium">
                              Error
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Center - Preview */}
            <div className="flex-1 flex flex-col overflow-hidden min-h-0 min-w-0">
              {selectedCreative ? (
                <>
                  <div className="px-3 py-2 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-700/50 flex justify-between items-center">
                    <div>
                      <h2 className="text-xs font-semibold text-slate-900 dark:text-white leading-tight">
                        {selectedCreative.name}
                      </h2>
                      {selectedCreative.variationName && (
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                          {selectedCreative.variationName}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Heatmap Toggle */}
                      {selectedCreative.attentionResult?.heatmapUrl && (
                        <button
                          onClick={() => {
                            setShowHeatmap(!showHeatmap);
                            if (!showHeatmap) {
                              setHeatmapSliderPosition(50); // Reset slider to center when showing
                            }
                          }}
                          className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-lg font-medium transition-all duration-200 ${
                            showHeatmap
                              ? "bg-gradient-to-r from-orange-500 to-rose-500 text-white shadow-md shadow-orange-500/25"
                              : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                          }`}
                        >
                          <Flame size={12} />
                          {showHeatmap ? "Hide Comparison" : "Compare Heatmap"}
                        </button>
                      )}
                      <a
                        href={selectedCreative.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1 transition-colors"
                      >
                        <ExternalLink size={12} />
                        Open
                      </a>
                      <button
                        onClick={() => analyzeAndSave(selectedCreative.id)}
                        disabled={
                          selectedCreative.isAnalyzing ||
                          selectedCreative.isCheckingCompliance
                        }
                        className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-100 disabled:bg-slate-400 text-white dark:text-slate-900 text-[11px] rounded-lg font-medium transition-all duration-200"
                      >
                        {selectedCreative.isAnalyzing ||
                        selectedCreative.isCheckingCompliance ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <RefreshCw size={12} />
                        )}
                        {selectedCreative.analysisResult
                          ? "Re-analyze"
                          : "Analyze"}
                      </button>
                    </div>
                  </div>
                  <ZoomPanControls className="flex-1 min-h-0 bg-gradient-to-br from-slate-100/50 to-slate-200/50 dark:from-slate-800/50 dark:to-slate-900/50">
                    {showHeatmap &&
                    selectedCreative.attentionResult?.heatmapUrl ? (
                      /* Heatmap Comparison Slider */
                      <div className="relative select-none">
                        {/* Container for both images */}
                        <div className="relative overflow-hidden rounded-lg shadow-xl shadow-slate-400/20 dark:shadow-slate-900/50 ring-1 ring-slate-200/50 dark:ring-slate-700/50">
                          {/* Heatmap image (bottom layer - full width) */}
                          <img
                            src={selectedCreative.attentionResult.heatmapUrl}
                            alt="Heatmap"
                            className="max-w-full max-h-full object-contain"
                            draggable={false}
                          />

                          {/* AOI Annotation Overlays */}
                          <div className="absolute inset-0 pointer-events-none">
                            {selectedCreative.attentionResult.attentionAreas.map(
                              (area, idx) => {
                                const colorIndicator =
                                  area.recommendation?.colorIndicator ||
                                  "green";
                                const getBorderColor = () => {
                                  if (colorIndicator === "red")
                                    return "rgba(239, 68, 68, 0.9)";
                                  if (colorIndicator === "yellow")
                                    return "rgba(251, 191, 36, 0.9)";
                                  return "rgba(34, 197, 94, 0.9)";
                                };
                                const getBgColor = () => {
                                  if (colorIndicator === "red")
                                    return "rgba(239, 68, 68, 0.15)";
                                  if (colorIndicator === "yellow")
                                    return "rgba(251, 191, 36, 0.15)";
                                  return "rgba(34, 197, 94, 0.15)";
                                };

                                return (
                                  <div
                                    key={idx}
                                    className="absolute border-2 rounded transition-all duration-300"
                                    style={{
                                      left: `${area.x}%`,
                                      top: `${area.y}%`,
                                      width: `${area.width}%`,
                                      height: `${area.height}%`,
                                      borderColor: getBorderColor(),
                                      backgroundColor: getBgColor(),
                                    }}
                                  >
                                    {/* Label */}
                                    <div
                                      className="absolute -top-6 left-0 text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap"
                                      style={{
                                        backgroundColor: getBorderColor(),
                                        color: "white",
                                      }}
                                    >
                                      {area.label || `Area ${idx + 1}`} •{" "}
                                      {area.score}%
                                    </div>
                                    {/* Recommendation badge */}
                                    {area.recommendation && (
                                      <div
                                        className="absolute -bottom-5 left-0 text-[8px] font-medium px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap max-w-[150px] truncate"
                                        style={{
                                          backgroundColor:
                                            "rgba(0, 0, 0, 0.75)",
                                          color: "white",
                                        }}
                                      >
                                        {area.recommendation.name}
                                      </div>
                                    )}
                                  </div>
                                );
                              }
                            )}
                          </div>

                          {highlightedElements.length > 0 && (
                            <div className="absolute inset-0 pointer-events-none z-10">
                              {highlightedElements.map(
                                renderHighlightedElementOverlay
                              )}
                            </div>
                          )}

                          {/* Original image (top layer - clipped by slider) */}
                          <div
                            className="absolute inset-0 overflow-hidden"
                            style={{ width: `${heatmapSliderPosition}%` }}
                          >
                            <img
                              src={selectedCreative.url}
                              alt={selectedCreative.name}
                              className="max-w-full max-h-full object-contain"
                              style={{
                                width: `${
                                  100 / (heatmapSliderPosition / 100)
                                }%`,
                                maxWidth: "none",
                              }}
                              draggable={false}
                            />
                          </div>

                          {/* Slider line */}
                          <div
                            className="absolute top-0 bottom-0 w-1 bg-white shadow-lg cursor-ew-resize z-10"
                            style={{
                              left: `${heatmapSliderPosition}%`,
                              transform: "translateX(-50%)",
                            }}
                          >
                            {/* Slider handle */}
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center border-2 border-slate-300">
                              <div className="flex gap-0.5">
                                <div className="w-0.5 h-3 bg-slate-400 rounded-full" />
                                <div className="w-0.5 h-3 bg-slate-400 rounded-full" />
                              </div>
                            </div>
                          </div>

                          {/* Invisible slider input for interaction */}
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={heatmapSliderPosition}
                            onChange={(e) =>
                              setHeatmapSliderPosition(Number(e.target.value))
                            }
                            className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-20"
                          />
                        </div>

                        {/* Labels */}
                        <div className="absolute bottom-4 left-4 px-2 py-1 bg-black/60 backdrop-blur-sm rounded text-[10px] text-white font-medium">
                          Original
                        </div>
                        <div className="absolute bottom-4 right-4 px-2 py-1 bg-gradient-to-r from-orange-500/80 to-rose-500/80 backdrop-blur-sm rounded text-[10px] text-white font-medium">
                          Heatmap
                        </div>

                        {/* Slider percentage indicator */}
                        <div className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1 bg-black/60 backdrop-blur-sm rounded-full text-[10px] text-white font-medium">
                          {heatmapSliderPosition}% Original
                        </div>
                      </div>
                    ) : (
                      /* Normal image view */
                      <div className="relative">
                        <img
                          key={selectedCreative.id}
                          src={selectedCreative.url}
                          alt={selectedCreative.name}
                          className="max-w-full max-h-full object-contain shadow-xl shadow-slate-400/20 dark:shadow-slate-900/50 rounded-lg ring-1 ring-slate-200/50 dark:ring-slate-700/50"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect width='400' height='300' fill='%23e2e8f0'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2394a3b8' font-size='14'%3EImage Failed to Load%3C/text%3E%3C/svg%3E";
                          }}
                          draggable={false}
                        />
                        {highlightedElements.length > 0 && (
                          <div className="absolute inset-0 pointer-events-none">
                            {highlightedElements.map(
                              renderHighlightedElementOverlay
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </ZoomPanControls>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center mx-auto mb-3">
                      <Eye size={20} className="text-slate-400" />
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                      Select a creative to preview
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Right Sidebar - Compliance & Attention Results */}
            <div className="w-[360px] flex-shrink-0 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border-l border-slate-200/50 dark:border-slate-700/50 flex flex-col min-h-0 overflow-hidden">
              {selectedCreative ? (
                /* Panel Tab Switcher */
                <>
                  <div className="flex border-b border-slate-200/50 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-800/30">
                    <button
                      onClick={() => setRightPanelTab("compliance")}
                      className={`flex-1 py-2.5 text-[11px] font-medium flex items-center justify-center gap-1.5 transition-all duration-200 border-b-2 ${
                        rightPanelTab === "compliance"
                          ? "border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-white/50 dark:bg-slate-800/50"
                          : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                      }`}
                    >
                      <ShieldCheck size={13} />
                      Compliance
                    </button>
                    <button
                      onClick={() => setRightPanelTab("attention")}
                      className={`flex-1 py-2.5 text-[11px] font-medium flex items-center justify-center gap-1.5 transition-all duration-200 border-b-2 ${
                        rightPanelTab === "attention"
                          ? "border-orange-500 text-orange-600 dark:text-orange-400 bg-white/50 dark:bg-slate-800/50"
                          : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                      }`}
                    >
                      {isFirstCreative ? (
                        <Focus size={13} />
                      ) : (
                        <Lock size={13} className="text-slate-400" />
                      )}
                      Attention
                      {isFirstCreative && selectedCreative.attentionResult && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 font-bold">
                          {selectedCreative.attentionResult.clarityScore}%
                        </span>
                      )}
                      {!isFirstCreative && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                          Pro
                        </span>
                      )}
                    </button>
                  </div>

                  {/* Attention Panel */}
                  {
                    rightPanelTab === "attention" ? (
                      !isFirstCreative ? (
                        /* Locked state for non-first creatives */
                        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                          <div className="w-14 h-14 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 rounded-2xl flex items-center justify-center mb-4">
                            <Lock
                              size={24}
                              className="text-slate-400 dark:text-slate-500"
                            />
                          </div>
                          <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
                            Attention Analysis Locked
                          </h3>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3 max-w-xs leading-relaxed">
                            Attention analysis is available for the first
                            creative in this project.
                          </p>
                          <div className="bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 rounded-lg px-3 py-2 border border-orange-200/50 dark:border-orange-800/30">
                            <p className="text-[10px] text-orange-700 dark:text-orange-400 font-medium">
                              Select the first creative to use this feature
                            </p>
                          </div>
                        </div>
                      ) : selectedCreative.isAnalyzingAttention ? (
                        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                          <div className="relative w-14 h-14 mx-auto mb-4">
                            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-orange-500/20 to-rose-500/20" />
                            <div className="absolute inset-1 rounded-full bg-white dark:bg-slate-900" />
                            <div className="absolute inset-0 rounded-full border-3 border-transparent border-t-orange-500 animate-spin" />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <Focus
                                size={18}
                                className="text-orange-500 animate-pulse"
                              />
                            </div>
                          </div>
                          <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
                            Analyzing Attention
                          </h3>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-xs">
                            Generating attention heatmap and focus metrics...
                          </p>
                        </div>
                      ) : selectedCreative.attentionResult ? (
                        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                          {/* Attention Score Header */}
                          <div className="p-3 border-b border-slate-200/50 dark:border-slate-700/50">
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <h3 className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                                  <Flame
                                    size={14}
                                    className="text-orange-500"
                                  />
                                  Attention Analysis
                                </h3>
                                <p className="text-[10px] text-slate-500 dark:text-slate-500">
                                  {selectedCreative.attentionResult
                                    .clarityDescription || "Analysis complete"}
                                </p>
                              </div>
                              <ScoreRing
                                score={
                                  selectedCreative.attentionResult.clarityScore
                                }
                              />
                            </div>

                            {/* Clarity & Focus Scores */}
                            <div className="grid grid-cols-2 gap-3 mb-3">
                              <div className="bg-gradient-to-br from-violet-50 via-indigo-50 to-violet-100 dark:from-violet-900/30 dark:via-indigo-900/20 dark:to-violet-900/30 rounded-xl p-3.5 border border-violet-200/60 dark:border-violet-700/40 shadow-sm shadow-violet-100 dark:shadow-violet-900/20">
                                <div className="flex items-center gap-1.5 mb-2">
                                  <div className="w-5 h-5 rounded-md bg-violet-500/15 dark:bg-violet-500/25 flex items-center justify-center">
                                    <Eye
                                      size={11}
                                      className="text-violet-600 dark:text-violet-400"
                                    />
                                  </div>
                                  <div className="text-[11px] text-violet-700 dark:text-violet-300 font-semibold uppercase tracking-wide">
                                    Clarity Score
                                  </div>
                                </div>
                                <div className="flex items-baseline gap-1.5">
                                  <span className="text-3xl font-bold text-violet-700 dark:text-violet-300 tabular-nums leading-none">
                                    {
                                      selectedCreative.attentionResult
                                        .clarityScore
                                    }
                                  </span>
                                  <span className="text-sm text-violet-400 dark:text-violet-500 font-medium">
                                    /100
                                  </span>
                                </div>
                              </div>
                              <div className="bg-gradient-to-br from-orange-50 via-rose-50 to-orange-100 dark:from-orange-900/30 dark:via-rose-900/20 dark:to-orange-900/30 rounded-xl p-3.5 border border-orange-200/60 dark:border-orange-700/40 shadow-sm shadow-orange-100 dark:shadow-orange-900/20">
                                <div className="flex items-center gap-1.5 mb-2">
                                  <div className="w-5 h-5 rounded-md bg-orange-500/15 dark:bg-orange-500/25 flex items-center justify-center">
                                    <Target
                                      size={11}
                                      className="text-orange-600 dark:text-orange-400"
                                    />
                                  </div>
                                  <div className="text-[11px] text-orange-700 dark:text-orange-300 font-semibold uppercase tracking-wide">
                                    Focus Score
                                  </div>
                                </div>
                                <div className="flex items-baseline gap-1.5">
                                  <span className="text-3xl font-bold text-orange-700 dark:text-orange-300 tabular-nums leading-none">
                                    {
                                      selectedCreative.attentionResult
                                        .focusScore
                                    }
                                  </span>
                                  <span className="text-sm text-orange-400 dark:text-orange-500 font-medium">
                                    /100
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Benchmark Description */}
                            {selectedCreative.attentionResult
                              .benchmarkDescription && (
                              <div className="text-[10px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-lg px-2.5 py-1.5 border border-slate-200/50 dark:border-slate-700/50">
                                {
                                  selectedCreative.attentionResult
                                    .benchmarkDescription
                                }
                              </div>
                            )}
                          </div>

                          {/* Areas of Interest (Annotations) */}
                          {selectedCreative.attentionResult.attentionAreas &&
                            selectedCreative.attentionResult.attentionAreas
                              .length > 0 && (
                              <div className="flex-1 overflow-y-auto min-h-0 border-t border-slate-200/50 dark:border-slate-700/50">
                                <div className="p-3">
                                  <h4 className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-1.5 mb-2.5">
                                    <LayoutGrid size={11} />
                                    Areas of Interest
                                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
                                      {
                                        selectedCreative.attentionResult
                                          .attentionAreas.length
                                      }
                                    </span>
                                  </h4>
                                  <div className="space-y-2">
                                    {/* Get unique annotations by label */}
                                    {(() => {
                                      const uniqueAreas = new Map<
                                        string,
                                        (typeof selectedCreative.attentionResult.attentionAreas)[0]
                                      >();
                                      selectedCreative.attentionResult.attentionAreas.forEach(
                                        (area) => {
                                          const key =
                                            area.label ||
                                            `Area_${area.x}_${area.y}`;
                                          if (!uniqueAreas.has(key)) {
                                            uniqueAreas.set(key, area);
                                          }
                                        }
                                      );
                                      return Array.from(uniqueAreas.values());
                                    })().map((area, idx) => {
                                      const colorIndicator =
                                        area.recommendation?.colorIndicator ||
                                        "green";
                                      const getBgColor = () => {
                                        if (colorIndicator === "red")
                                          return "from-rose-50 to-red-50 dark:from-rose-900/20 dark:to-red-900/20 border-rose-200/60 dark:border-rose-800/40";
                                        if (colorIndicator === "yellow")
                                          return "from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 border-amber-200/60 dark:border-amber-800/40";
                                        return "from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 border-emerald-200/60 dark:border-emerald-800/40";
                                      };
                                      const getTextColor = () => {
                                        if (colorIndicator === "red")
                                          return "text-rose-700 dark:text-rose-300";
                                        if (colorIndicator === "yellow")
                                          return "text-amber-700 dark:text-amber-300";
                                        return "text-emerald-700 dark:text-emerald-300";
                                      };
                                      const getIconColor = () => {
                                        if (colorIndicator === "red")
                                          return "text-rose-500";
                                        if (colorIndicator === "yellow")
                                          return "text-amber-500";
                                        return "text-emerald-500";
                                      };
                                      const getScoreBgColor = () => {
                                        if (colorIndicator === "red")
                                          return "bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300";
                                        if (colorIndicator === "yellow")
                                          return "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300";
                                        return "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300";
                                      };

                                      return (
                                        <div
                                          key={idx}
                                          className={`bg-gradient-to-br ${getBgColor()} rounded-lg p-2.5 border transition-all duration-200 hover:shadow-sm`}
                                        >
                                          <div className="flex items-start justify-between gap-2 mb-1.5">
                                            <div className="flex items-center gap-1.5">
                                              {colorIndicator === "red" ? (
                                                <XCircle
                                                  size={13}
                                                  className={getIconColor()}
                                                />
                                              ) : colorIndicator ===
                                                "yellow" ? (
                                                <AlertTriangle
                                                  size={13}
                                                  className={getIconColor()}
                                                />
                                              ) : (
                                                <CheckCircle2
                                                  size={13}
                                                  className={getIconColor()}
                                                />
                                              )}
                                              <span
                                                className={`text-[11px] font-semibold ${getTextColor()}`}
                                              >
                                                {area.label ||
                                                  `Area ${idx + 1}`}
                                              </span>
                                            </div>
                                            <span
                                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${getScoreBgColor()}`}
                                            >
                                              {area.score}%
                                            </span>
                                          </div>
                                          {area.recommendation && (
                                            <div className="mt-1">
                                              <p
                                                className={`text-[10px] font-medium ${getTextColor()} mb-0.5`}
                                              >
                                                {area.recommendation.name}
                                              </p>
                                              <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-relaxed">
                                                {
                                                  area.recommendation
                                                    .description
                                                }
                                              </p>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            )}

                          {/* Re-analyze Button */}
                          <div className="p-2.5 border-t border-slate-200/50 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-800/30">
                            <button
                              onClick={() =>
                                analyzeAttention(selectedCreative.id)
                              }
                              disabled={selectedCreative.isAnalyzingAttention}
                              className="w-full py-1.5 text-[11px] text-orange-600 dark:text-orange-400 hover:text-orange-800 dark:hover:text-orange-300 font-medium flex items-center justify-center gap-1.5 disabled:opacity-50 bg-orange-50 dark:bg-orange-900/20 rounded-lg hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-all duration-200"
                            >
                              {selectedCreative.isAnalyzingAttention ? (
                                <Spinner className="w-3 h-3" />
                              ) : (
                                <RefreshCw size={11} />
                              )}
                              Re-analyze Attention
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                          <div className="w-14 h-14 bg-gradient-to-br from-orange-100 to-rose-100 dark:from-orange-900/30 dark:to-rose-900/30 rounded-2xl flex items-center justify-center mb-4">
                            <Focus
                              size={24}
                              className="text-orange-500 dark:text-orange-400"
                            />
                          </div>
                          <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
                            Attention Analysis
                          </h3>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-4 max-w-xs leading-relaxed">
                            Discover where users will focus their attention on
                            this creative using AI-powered eye-tracking
                            simulation.
                          </p>
                          <button
                            onClick={() =>
                              analyzeAttention(selectedCreative.id)
                            }
                            className="px-4 py-2 bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 text-white rounded-xl text-xs font-medium shadow-md shadow-orange-500/25 hover:shadow-orange-500/40 transition-all duration-200 flex items-center gap-1.5"
                          >
                            <Focus size={14} />
                            Analyze Attention
                          </button>
                        </div>
                      )
                    ) : /* Compliance Panel */
                    selectedCreative.isAnalyzing ||
                      selectedCreative.isCheckingCompliance ? (
                      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                        <div className="relative w-14 h-14 mx-auto mb-4">
                          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-indigo-500/20 to-violet-500/20" />
                          <div className="absolute inset-1 rounded-full bg-white dark:bg-slate-900" />
                          <div className="absolute inset-0 rounded-full border-3 border-transparent border-t-indigo-500 animate-spin" />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Sparkles
                              size={18}
                              className="text-indigo-500 animate-pulse"
                            />
                          </div>
                        </div>
                        <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
                          {selectedCreative.isAnalyzing
                            ? "Analyzing Creative"
                            : "Checking Compliance"}
                        </h3>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-xs">
                          {selectedCreative.isAnalyzing
                            ? "Extracting visual elements from the image..."
                            : `Checking against ${
                                activePlatform.complianceRules?.length || 0
                              } brand guidelines...`}
                        </p>
                      </div>
                    ) : selectedCreative.complianceResults ? (
                      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                        {/* Scores Header */}
                        {selectedCreative.complianceScores && (
                          <div className="p-3 border-b border-slate-200/50 dark:border-slate-700/50">
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <h3 className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                                  <ShieldCheck
                                    size={14}
                                    className="text-indigo-500"
                                  />
                                  Compliance Score
                                </h3>
                                <p className="text-[10px] text-slate-500 dark:text-slate-500">
                                  {selectedCreative.complianceResults.length}{" "}
                                  rules checked
                                </p>
                              </div>
                              <ScoreRing
                                score={
                                  selectedCreative.complianceScores.overall
                                }
                              />
                            </div>
                            <div className="grid grid-cols-3 gap-1.5">
                              <div className="bg-emerald-50/80 dark:bg-emerald-900/20 rounded-lg p-2 text-center border border-emerald-100 dark:border-emerald-800/30">
                                <p className="text-base font-bold text-emerald-600 dark:text-emerald-400 tabular-nums leading-tight">
                                  {
                                    selectedCreative.complianceScores.breakdown
                                      .passed
                                  }
                                </p>
                                <p className="text-[9px] uppercase tracking-wider text-emerald-700 dark:text-emerald-500 font-medium">
                                  Passed
                                </p>
                              </div>
                              <div className="bg-amber-50/80 dark:bg-amber-900/20 rounded-lg p-2 text-center border border-amber-100 dark:border-amber-800/30">
                                <p className="text-base font-bold text-amber-600 dark:text-amber-400 tabular-nums leading-tight">
                                  {
                                    selectedCreative.complianceScores.breakdown
                                      .warnings
                                  }
                                </p>
                                <p className="text-[9px] uppercase tracking-wider text-amber-700 dark:text-amber-500 font-medium">
                                  Warnings
                                </p>
                              </div>
                              <div className="bg-rose-50/80 dark:bg-rose-900/20 rounded-lg p-2 text-center border border-rose-100 dark:border-rose-800/30">
                                <p className="text-base font-bold text-rose-600 dark:text-rose-400 tabular-nums leading-tight">
                                  {
                                    selectedCreative.complianceScores.breakdown
                                      .failed
                                  }
                                </p>
                                <p className="text-[9px] uppercase tracking-wider text-rose-700 dark:text-rose-500 font-medium">
                                  Failed
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Tab Switcher */}
                        <div className="flex px-2 py-1.5 gap-1 border-b border-slate-200/50 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-800/30">
                          <button
                            onClick={() => setActiveTab("dashboard")}
                            className={`flex-1 py-1.5 text-[11px] font-medium flex items-center justify-center gap-1 rounded-md transition-all duration-200 ${
                              activeTab === "dashboard"
                                ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm"
                                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                            }`}
                          >
                            <BarChart3 size={12} /> Overview
                          </button>
                          <button
                            onClick={() => setActiveTab("details")}
                            className={`flex-1 py-1.5 text-[11px] font-medium flex items-center justify-center gap-1 rounded-md transition-all duration-200 ${
                              activeTab === "details"
                                ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm"
                                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                            }`}
                          >
                            <ListChecks size={12} /> Details (
                            {selectedCreative.complianceResults.length})
                          </button>
                        </div>

                        {/* Dashboard Tab */}
                        {activeTab === "dashboard" &&
                          selectedCreative.complianceScores && (
                            <div className="flex-1 overflow-y-auto p-3 min-h-0">
                              {/* Category Scores */}
                              <div className="space-y-2.5 mb-3">
                                <h4 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1.5">
                                  <TrendingUp size={11} />
                                  Category Breakdown
                                </h4>
                                {["brand", "accessibility", "policy", "quality"]
                                  .filter(
                                    (cat) =>
                                      selectedCreative.complianceScores?.[
                                        cat as keyof ComplianceScores
                                      ] !== undefined
                                  )
                                  .map((cat) => {
                                    const score =
                                      selectedCreative.complianceScores?.[
                                        cat as keyof ComplianceScores
                                      ] || 0;
                                    return (
                                      <div
                                        key={cat}
                                        className="bg-white dark:bg-slate-800/50 rounded-lg p-2 border border-slate-200/50 dark:border-slate-700/50"
                                      >
                                        <div className="flex justify-between text-[11px] mb-1.5">
                                          <span className="capitalize text-slate-700 dark:text-slate-300 font-medium">
                                            {cat}
                                          </span>
                                          <span
                                            className={`font-bold tabular-nums ${
                                              typeof score === "number" &&
                                              score >= 80
                                                ? "text-emerald-600 dark:text-emerald-400"
                                                : typeof score === "number" &&
                                                  score >= 60
                                                ? "text-amber-600 dark:text-amber-400"
                                                : "text-rose-600 dark:text-rose-400"
                                            }`}
                                          >
                                            {typeof score === "number"
                                              ? score
                                              : "--"}
                                            %
                                          </span>
                                        </div>
                                        <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                          <div
                                            className={`h-full rounded-full transition-all duration-700 ease-out ${
                                              typeof score === "number" &&
                                              score >= 80
                                                ? "bg-gradient-to-r from-emerald-400 to-emerald-500"
                                                : typeof score === "number" &&
                                                  score >= 60
                                                ? "bg-gradient-to-r from-amber-400 to-amber-500"
                                                : "bg-gradient-to-r from-rose-400 to-rose-500"
                                            }`}
                                            style={{
                                              width: `${
                                                typeof score === "number"
                                                  ? score
                                                  : 0
                                              }%`,
                                            }}
                                          />
                                        </div>
                                      </div>
                                    );
                                  })}
                              </div>

                              {/* Quick Issues */}
                              {selectedCreative.complianceScores.breakdown
                                .failed > 0 && (
                                <div className="bg-gradient-to-br from-rose-50 to-orange-50 dark:from-rose-900/20 dark:to-orange-900/20 rounded-xl p-3 border border-rose-200/50 dark:border-rose-800/30">
                                  <h4 className="text-[11px] font-semibold text-rose-800 dark:text-rose-300 mb-2 flex items-center gap-1.5">
                                    <Lightbulb size={12} />
                                    Quick Fixes Needed
                                  </h4>
                                  <div className="space-y-1.5">
                                    {selectedCreative.complianceResults
                                      .filter(
                                        (r) =>
                                          r.status === "FAIL" && r.suggestion
                                      )
                                      .slice(0, 3)
                                      .map((r, i) => (
                                        <div
                                          key={i}
                                          className="text-[11px] bg-white/80 dark:bg-slate-800/50 backdrop-blur-sm rounded-lg p-2 border border-rose-100 dark:border-rose-800/30 text-slate-700 dark:text-slate-300 leading-relaxed"
                                        >
                                          {r.suggestion}
                                        </div>
                                      ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                        {/* Details Tab */}
                        {activeTab === "details" && (
                          <>
                            {/* Filter Bar */}
                            <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-white/50 dark:bg-slate-800/30 flex items-center gap-1.5 flex-wrap">
                              {["all", "fail", "warning", "pass"].map(
                                (status) => {
                                  const counts = getStatusCounts(
                                    selectedCreative.complianceResults!
                                  );
                                  const isActive = filterStatus === status;
                                  return (
                                    <button
                                      key={status}
                                      onClick={() => setFilterStatus(status)}
                                      className={`text-[10px] px-2 py-1 rounded-full font-medium transition-all duration-200 ${
                                        isActive
                                          ? status === "fail"
                                            ? "bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-800"
                                            : status === "warning"
                                            ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-800"
                                            : status === "pass"
                                            ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-200 dark:ring-emerald-800"
                                            : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 ring-1 ring-slate-300 dark:ring-slate-600"
                                          : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                                      }`}
                                    >
                                      {status === "all"
                                        ? `All (${
                                            selectedCreative.complianceResults!
                                              .length
                                          })`
                                        : status === "fail"
                                        ? `Failed (${counts.failed})`
                                        : status === "warning"
                                        ? `Warnings (${counts.warnings})`
                                        : `Passed (${counts.passed})`}
                                    </button>
                                  );
                                }
                              )}
                            </div>
                            <div className="overflow-y-auto p-2.5 space-y-2 flex-1 min-h-0">
                              {groupedFilteredResults.length === 0 && (
                                <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/30 px-3 py-6 text-center text-[11px] text-slate-500 dark:text-slate-400">
                                  No rules match the current filters.
                                </div>
                              )}
                              {groupedFilteredResults.map((engineGroup) => (
                                <div key={engineGroup.engine} className="space-y-3">
                                  <div className="px-1 text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">
                                    {engineGroup.label}
                                  </div>
                                  {engineGroup.groups.map((group) => (
                                    <div
                                      key={`${engineGroup.engine}-${group.checkType}`}
                                      className="space-y-2"
                                    >
                                      <div
                                        className={`rounded-2xl border px-3 py-2.5 ${getCheckTypeHeaderClasses(
                                          group.checkType
                                        )}`}
                                      >
                                        <div className="text-[9px] font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                                          Rule Category
                                        </div>
                                        <div className="mt-0.5 text-[13px] font-medium text-slate-700 dark:text-slate-200">
                                          {group.checkType}
                                        </div>
                                      </div>
                                      {group.results.map((res, idx) => {
                                        const originalIndex =
                                          selectedCreative.complianceResults!.indexOf(
                                            res
                                          );
                                        const isExpanded =
                                          expandedItems.has(originalIndex);

                                        return (
                                          <div
                                            key={`${group.checkType}-${idx}-${res.ruleId || res.rule}-${engineGroup.engine}`}
                                            className={`rounded-xl border transition-all duration-200 overflow-hidden ${
                                              res.status === "FAIL"
                                                ? "border-rose-200 dark:border-rose-800/50 bg-gradient-to-br from-rose-50/50 to-white dark:from-rose-900/10 dark:to-slate-800/50"
                                                : res.status === "WARNING"
                                                ? "border-amber-200 dark:border-amber-800/50 bg-gradient-to-br from-amber-50/50 to-white dark:from-amber-900/10 dark:to-slate-800/50"
                                                : "border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-600"
                                            }`}
                                          >
                                            <div
                                              className={`p-2.5 ${
                                                (res.engine || "visual") ===
                                                  "visual" &&
                                                res.relatedElementIds?.length
                                                  ? "cursor-pointer"
                                                  : "cursor-default"
                                              }`}
                                              onClick={() => {
                                                toggleExpand(originalIndex);
                                                toggleResultHighlight(res);
                                              }}
                                            >
                                              <div className="flex gap-2 items-start">
                                                <div className="mt-px flex-shrink-0">
                                                  {res.status === "PASS" && (
                                                    <div className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                                                      <CheckCircle2
                                                        className="text-emerald-500"
                                                        size={12}
                                                      />
                                                    </div>
                                                  )}
                                                  {res.status === "FAIL" && (
                                                    <div className="w-5 h-5 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
                                                      <XCircle
                                                        className="text-rose-500"
                                                        size={12}
                                                      />
                                                    </div>
                                                  )}
                                                  {res.status === "WARNING" && (
                                                    <div className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                                                      <AlertTriangle
                                                        className="text-amber-500"
                                                        size={12}
                                                      />
                                                    </div>
                                                  )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                  <div className="flex items-center gap-1 mb-1 flex-wrap">
                                                    {getSeverityBadge(
                                                      res.severity
                                                    )}
                                                    {(res.engine || "visual") ===
                                                      "visual" &&
                                                      res.relatedElementIds?.length && (
                                                        <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-px rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-300 border border-violet-200/60 dark:border-violet-700/50">
                                                          <Eye size={10} />
                                                          Click highlights image
                                                        </span>
                                                      )}
                                                    {res.ruleSource && (
                                                      <span className="text-[9px] font-semibold px-1.5 py-px rounded-full bg-slate-100 dark:bg-slate-700/50 text-slate-500 dark:text-slate-300 border border-slate-200/50 dark:border-slate-600/50 capitalize">
                                                        {res.ruleSource}
                                                      </span>
                                                    )}
                                                  </div>
                                                  <p
                                                    className={`text-[11px] font-medium leading-snug ${
                                                      res.status === "FAIL"
                                                        ? "text-rose-900 dark:text-rose-200"
                                                        : "text-slate-800 dark:text-slate-200"
                                                    }`}
                                                  >
                                                    {res.ruleTitle || res.rule}
                                                  </p>
                                                </div>
                                                <div className="flex items-center flex-shrink-0">
                                                  {isExpanded ? (
                                                    <ChevronUp
                                                      size={14}
                                                      className="text-slate-400"
                                                    />
                                                  ) : (
                                                    <ChevronDown
                                                      size={14}
                                                      className="text-slate-400"
                                                    />
                                                  )}
                                                </div>
                                              </div>
                                            </div>

                                            {isExpanded && (
                                              <div className="px-2.5 pb-2.5 pt-0 border-t border-slate-100 dark:border-slate-700/50">
                                                <div className="mt-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2">
                                                  <p className="text-[9px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 mb-1">
                                                    Analysis
                                                  </p>
                                                  <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                                                    {res.reasoning}
                                                  </p>
                                                </div>

                                                {res.suggestion &&
                                                  res.status !== "PASS" && (
                                                    <div className="mt-2 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-lg p-2 border border-amber-100 dark:border-amber-800/30">
                                                      <div className="flex items-start gap-1.5">
                                                        <Lightbulb
                                                          size={11}
                                                          className="text-amber-500 flex-shrink-0 mt-0.5"
                                                        />
                                                        <div className="flex-1">
                                                          <p className="text-[9px] uppercase tracking-wider font-semibold text-amber-700 dark:text-amber-400 mb-0.5">
                                                            How to Fix
                                                          </p>
                                                          <p className="text-[11px] text-amber-900 dark:text-amber-200 leading-relaxed">
                                                            {res.suggestion}
                                                          </p>
                                                        </div>
                                                      </div>
                                                    </div>
                                                  )}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ))}
                                </div>
                              ))}
                            </div>
                          </>
                        )}

                        {/* Re-run Button */}
                        <div className="p-2.5 border-t border-slate-200/50 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-800/30">
                          <button
                            onClick={() => analyzeAndSave(selectedCreative.id)}
                            disabled={
                              selectedCreative.isAnalyzing ||
                              selectedCreative.isCheckingCompliance
                            }
                            className="w-full py-1.5 text-[11px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium flex items-center justify-center gap-1.5 disabled:opacity-50 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-all duration-200"
                          >
                            {selectedCreative.isAnalyzing ||
                            selectedCreative.isCheckingCompliance ? (
                              <Spinner className="w-3 h-3" />
                            ) : (
                              <Play size={11} />
                            )}
                            Re-analyze Creative
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                        <div className="w-14 h-14 bg-gradient-to-br from-indigo-100 to-violet-100 dark:from-indigo-900/30 dark:to-violet-900/30 rounded-2xl flex items-center justify-center mb-4">
                          <ShieldCheck
                            size={24}
                            className="text-indigo-500 dark:text-indigo-400"
                          />
                        </div>
                        <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
                          Ready to Analyze
                        </h3>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-4 max-w-xs leading-relaxed">
                          Click the button below to analyze this creative
                          against{" "}
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            {activePlatform.complianceRules?.length || 0}
                          </span>{" "}
                          brand guidelines.
                        </p>
                        <button
                          onClick={() => analyzeCreative(selectedCreative.id)}
                          className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white rounded-xl text-xs font-medium shadow-md shadow-indigo-500/25 hover:shadow-indigo-500/40 transition-all duration-200 flex items-center gap-1.5"
                        >
                          <Sparkles size={14} />
                          Run Analysis
                        </button>
                      </div>
                    )
                    /* End of rightPanelTab ternary */
                  }
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center mx-auto mb-3">
                      <ListChecks size={20} className="text-slate-400" />
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                      Select a creative to see results
                    </p>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default EvaluateProject;
