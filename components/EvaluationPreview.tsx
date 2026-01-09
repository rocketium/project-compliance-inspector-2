import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  loadEvaluationJob,
  subscribeToJobUpdates,
  updateJobCreativeAttention,
  EvaluationJob,
  EvaluationCreative,
} from "../services/evaluationApi";
import {
  analyzeWithAttentionInsight,
  generateMockAttentionResult,
  isAttentionInsightConfigured,
} from "../services/attentionInsight";
import {
  ComplianceResult,
  ComplianceScores,
  AttentionInsightResult,
} from "../types";
import {
  ArrowLeft,
  Sparkles,
  Image as ImageIcon,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Moon,
  Sun,
  ExternalLink,
  Layers,
  BarChart3,
  ListChecks,
  ChevronUp,
  ChevronDown,
  Lightbulb,
  ShieldCheck,
  Target,
  TrendingUp,
  Eye,
  Share2,
  Copy,
  Check,
  Focus,
  Flame,
  Lock,
} from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";
import { ZoomPanControls } from "./ZoomPanControls";

// Theme toggle button
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

export const EvaluationPreview: React.FC = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();

  // State
  const [job, setJob] = useState<EvaluationJob | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [selectedCreativeId, setSelectedCreativeId] = useState<string | null>(
    null
  );
  const [copied, setCopied] = useState(false);

  // Compliance view state
  const [activeTab, setActiveTab] = useState<"dashboard" | "details">(
    "dashboard"
  );
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());

  // Attention Insight state
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [heatmapSliderPosition, setHeatmapSliderPosition] = useState(50);
  const [rightPanelTab, setRightPanelTab] = useState<
    "compliance" | "attention"
  >("compliance");
  const [analyzingAttentionIds, setAnalyzingAttentionIds] = useState<
    Set<string>
  >(new Set());

  // Helper to merge server job data with local attention results
  // This preserves locally-computed attention results that haven't been saved to the server yet
  const mergeJobWithLocalAttention = (
    serverJob: EvaluationJob,
    localJob: EvaluationJob | null
  ): EvaluationJob => {
    if (!localJob) return serverJob;

    return {
      ...serverJob,
      creatives: serverJob.creatives.map((serverCreative) => {
        const localCreative = localJob.creatives.find(
          (c) => c.id === serverCreative.id
        );
        // Preserve local attention result if server doesn't have one yet
        if (localCreative?.attentionResult && !serverCreative.attentionResult) {
          return {
            ...serverCreative,
            attentionResult: localCreative.attentionResult,
          };
        }
        return serverCreative;
      }),
    };
  };

  // Load job and subscribe to updates with polling fallback
  useEffect(() => {
    if (!jobId) return;

    let unsubscribe: (() => void) | null = null;
    let pollInterval: NodeJS.Timeout | null = null;
    let isMounted = true;
    let retryTimeout: NodeJS.Timeout | null = null;

    const loadJob = async (isInitialLoad = false, currentRetry = 0) => {
      if (isInitialLoad) {
        setIsLoading(true);
      }

      const result = await loadEvaluationJob(jobId);

      if (!isMounted) return;

      if (result.success && result.data) {
        // Merge with local state to preserve attention results that are being analyzed
        setJob((prevJob) => mergeJobWithLocalAttention(result.data!, prevJob));
        setError(null);
        setRetryCount(0);
        if (result.data.creatives.length > 0 && !selectedCreativeId) {
          setSelectedCreativeId(result.data.creatives[0].id);
        }

        // If job is still in progress, set up polling and real-time subscription
        if (
          result.data.status !== "completed" &&
          result.data.status !== "failed"
        ) {
          // Subscribe to real-time updates (as primary mechanism)
          if (!unsubscribe) {
            unsubscribe = subscribeToJobUpdates(jobId, (updatedJob) => {
              if (isMounted) {
                // Merge with local state to preserve attention results
                setJob((prevJob) =>
                  mergeJobWithLocalAttention(updatedJob, prevJob)
                );
                // Stop polling if job is complete
                if (
                  updatedJob.status === "completed" ||
                  updatedJob.status === "failed"
                ) {
                  if (pollInterval) {
                    clearInterval(pollInterval);
                    pollInterval = null;
                  }
                }
              }
            });
          }

          // Set up polling as fallback (every 3 seconds)
          if (!pollInterval) {
            pollInterval = setInterval(() => {
              loadJob(false);
            }, 3000);
          }
        } else {
          // Job is complete, stop polling
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
        }
      } else {
        // Failed to load - implement retry logic
        if (currentRetry < 2) {
          // Retry after 2 seconds
          setRetryCount(currentRetry + 1);
          retryTimeout = setTimeout(() => {
            loadJob(isInitialLoad, currentRetry + 1);
          }, 2000);
        } else {
          // After 2 retries, show error
          setError(result.error || "Failed to load evaluation");
          if (isInitialLoad) {
            setIsLoading(false);
          }
        }
        return;
      }

      if (isInitialLoad) {
        setIsLoading(false);
      }
    };

    loadJob(true, 0);

    return () => {
      isMounted = false;
      if (unsubscribe) unsubscribe();
      if (pollInterval) clearInterval(pollInterval);
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [jobId]);

  // Get selected creative
  const selectedCreative = useMemo(
    () => job?.creatives.find((c) => c.id === selectedCreativeId) || null,
    [job, selectedCreativeId]
  );

  // Check if selected creative is the first one (only first creative has attention analysis)
  const isFirstCreative = useMemo(
    () =>
      job?.creatives &&
      job.creatives.length > 0 &&
      selectedCreativeId === job.creatives[0]?.id,
    [job, selectedCreativeId]
  );

  // Check if the selected creative is being analyzed for attention
  const isAnalyzingAttention = useMemo(
    () =>
      selectedCreativeId
        ? analyzingAttentionIds.has(selectedCreativeId)
        : false,
    [selectedCreativeId, analyzingAttentionIds]
  );

  // Analyze attention for the selected creative
  const analyzeAttention = async (creativeId: string) => {
    if (!job || !jobId) return;

    const creative = job.creatives.find((c) => c.id === creativeId);
    if (!creative || analyzingAttentionIds.has(creativeId)) return;

    // Mark as analyzing
    setAnalyzingAttentionIds((prev) => new Set(prev).add(creativeId));

    try {
      let attentionResult: AttentionInsightResult;

      // Check if API is configured, use mock data otherwise
      if (isAttentionInsightConfigured()) {
        try {
          attentionResult = await analyzeWithAttentionInsight(creative.url);
        } catch (apiError: any) {
          // If API call fails (e.g., CORS error), fall back to mock data
          console.warn(
            "Attention Insight API failed, using mock data:",
            apiError.message
          );
          attentionResult = generateMockAttentionResult(creative.url);
        }
      } else {
        // Use mock data for development/demo
        console.log("Using mock attention data (API key not configured)");
        attentionResult = generateMockAttentionResult(creative.url);
      }

      // Update local state
      setJob((prevJob) => {
        if (!prevJob) return prevJob;
        return {
          ...prevJob,
          creatives: prevJob.creatives.map((c) =>
            c.id === creativeId ? { ...c, attentionResult } : c
          ),
        };
      });

      // Save to database
      const result = await updateJobCreativeAttention(
        jobId,
        creativeId,
        attentionResult
      );
      if (result.success) {
        console.log("Attention result saved to evaluation job");
      } else {
        console.warn("Failed to save attention result:", result.error);
      }

      // Switch to attention tab to show results
      setRightPanelTab("attention");
    } catch (err: any) {
      console.error("Error analyzing attention:", err);
    } finally {
      // Remove from analyzing set
      setAnalyzingAttentionIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(creativeId);
        return newSet;
      });
    }
  };

  // Copy share link
  const copyShareLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Get project status
  const getProjectStatus = () => {
    if (!job) return null;
    const analyzed = job.creatives.filter((c) => c.complianceScores);
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

  // Render badges
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

  // Loading state
  if (isLoading) {
    return (
      <div className="h-screen bg-gradient-to-br from-slate-50 via-slate-50 to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-12 h-12 mx-auto mb-4">
            <div className="absolute inset-0 rounded-full border-3 border-slate-200 dark:border-slate-700" />
            <div className="absolute inset-0 rounded-full border-3 border-transparent border-t-indigo-500 animate-spin" />
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
            Loading evaluation...
            {retryCount > 0 && ` (Retry ${retryCount}/2)`}
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !job) {
    return (
      <div className="h-screen bg-gradient-to-br from-slate-50 via-slate-50 to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900 flex items-center justify-center">
        <div className="text-center max-w-md p-6">
          <div className="w-12 h-12 bg-rose-100 dark:bg-rose-900/30 rounded-xl flex items-center justify-center mx-auto mb-4">
            <XCircle size={24} className="text-rose-500" />
          </div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-2">
            Evaluation Not Found
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">
            {error || "Unable to load the evaluation data."}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-500 mb-5">
            This may happen if the page was opened before the evaluation was
            fully created. Please try reloading.
          </p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-1.5 bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-all duration-200 shadow-sm"
            >
              Reload Page
            </button>
            <button
              onClick={() => navigate("/")}
              className="px-4 py-1.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-lg text-xs font-medium hover:bg-slate-800 dark:hover:bg-slate-100 transition-all duration-200"
            >
              Go Home
            </button>
          </div>
        </div>
      </div>
    );
  }

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
            <div className="flex items-center gap-2">
              <div className="bg-gradient-to-br from-indigo-500 to-violet-600 p-1.5 rounded-lg shadow-md shadow-indigo-500/20">
                <Layers className="text-white h-4 w-4" />
              </div>
              <div>
                <h1 className="text-sm font-semibold text-slate-900 dark:text-white tracking-tight leading-tight">
                  {job.projectName || "Project Evaluation"}
                </h1>
                <p className="text-[10px] text-slate-500 dark:text-slate-500 font-mono leading-tight">
                  {job.projectId}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Job Status */}
            <div className="flex items-center gap-3 px-3 py-1.5 bg-slate-100/80 dark:bg-slate-800/50 rounded-xl backdrop-blur-sm border border-slate-200/50 dark:border-slate-700/50">
              {job.status === "analyzing" || job.status === "pending" ? (
                <div className="flex items-center gap-1.5">
                  <div className="relative">
                    <div className="w-4 h-4 rounded-full border-2 border-indigo-200 dark:border-indigo-800" />
                    <div className="absolute inset-0 w-4 h-4 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-indigo-500 font-medium leading-tight">
                      {job.status === "pending" ? "Starting" : "Analyzing"}
                    </div>
                    <div className="text-sm font-bold text-indigo-600 dark:text-indigo-400 tabular-nums leading-tight">
                      {job.creatives.filter((c) => c.complianceScores).length}/
                      {job.totalCreatives}
                    </div>
                  </div>
                </div>
              ) : projectStatus ? (
                <>
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
                    <div>
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
                    <div className="text-[9px] uppercase tracking-wider text-slate-500 dark:text-slate-500 font-medium leading-tight">
                      Analyzed
                    </div>
                    <div className="text-sm font-bold text-slate-700 dark:text-slate-200 tabular-nums leading-tight">
                      {job.creatives.filter((c) => c.complianceScores).length}/
                      {job.totalCreatives}
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-slate-500 font-medium leading-tight">
                    Creatives
                  </div>
                  <div className="text-sm font-bold text-slate-700 dark:text-slate-200 tabular-nums leading-tight">
                    {job.totalCreatives}
                  </div>
                </div>
              )}
            </div>

            {/* Share Button */}
            <button
              onClick={copyShareLink}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-all duration-200 text-xs font-medium text-slate-700 dark:text-slate-200 shadow-sm"
            >
              {copied ? (
                <>
                  <Check size={13} className="text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400">
                    Copied!
                  </span>
                </>
              ) : (
                <>
                  <Share2 size={13} className="text-slate-400" />
                  <span>Share</span>
                </>
              )}
            </button>

            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden min-h-0">
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
                ({job.totalCreatives})
              </span>
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {job.creatives.map((creative) => (
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
                    <div className="mt-1 flex items-center gap-1 flex-wrap">
                      {creative.status === "analyzing" && (
                        <span className="flex items-center gap-0.5 text-[9px] text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-px rounded-full font-medium">
                          <Loader2 size={8} className="animate-spin" />
                          Analyzing
                        </span>
                      )}
                      {creative.status === "pending" && (
                        <span className="text-[9px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-px rounded-full font-medium">
                          Pending
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
                      {creative.status === "failed" && (
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
                          setHeatmapSliderPosition(50);
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
                </div>
              </div>
              <ZoomPanControls className="flex-1 min-h-0 bg-gradient-to-br from-slate-100/50 to-slate-200/50 dark:from-slate-800/50 dark:to-slate-900/50">
                {showHeatmap && selectedCreative.attentionResult?.heatmapUrl ? (
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
                      {selectedCreative.attentionResult.attentionAreas &&
                        selectedCreative.attentionResult.attentionAreas.length >
                          0 && (
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
                            width: `${100 / (heatmapSliderPosition / 100)}%`,
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
            selectedCreative.status === "analyzing" ? (
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
                  Analyzing Creative
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-xs">
                  Running compliance checks against brand guidelines...
                </p>
              </div>
            ) : selectedCreative.status === "pending" ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                <div className="w-14 h-14 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mb-4">
                  <Loader2 size={24} className="text-slate-400 animate-pulse" />
                </div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
                  Waiting to Analyze
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-xs">
                  This creative is queued for analysis...
                </p>
              </div>
            ) : selectedCreative.complianceResults ? (
              <>
                {/* Panel Tab Switcher */}
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
                {rightPanelTab === "attention" ? (
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
                        Attention analysis is available for the first creative
                        in this project.
                      </p>
                      <div className="bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 rounded-lg px-3 py-2 border border-orange-200/50 dark:border-orange-800/30">
                        <p className="text-[10px] text-orange-700 dark:text-orange-400 font-medium">
                          Select the first creative to view attention data
                        </p>
                      </div>
                    </div>
                  ) : isAnalyzingAttention ? (
                    /* Analyzing state */
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
                              <Flame size={14} className="text-orange-500" />
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
                                {selectedCreative.attentionResult.clarityScore}
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
                                {selectedCreative.attentionResult.focusScore}
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
                        selectedCreative.attentionResult.attentionAreas.length >
                          0 && (
                          <div className="flex-1 overflow-y-auto min-h-0 border-t border-slate-200/50 dark:border-slate-700/50">
                            <div className="p-3">
                              <h4 className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-1.5 mb-2.5">
                                <Target size={11} />
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
                                          ) : colorIndicator === "yellow" ? (
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
                                            {area.label || `Area ${idx + 1}`}
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
                                            {area.recommendation.description}
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
                          onClick={() => analyzeAttention(selectedCreative.id)}
                          disabled={isAnalyzingAttention}
                          className="w-full py-1.5 text-[11px] text-orange-600 dark:text-orange-400 hover:text-orange-800 dark:hover:text-orange-300 font-medium flex items-center justify-center gap-1.5 disabled:opacity-50 bg-orange-50 dark:bg-orange-900/20 rounded-lg hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-all duration-200"
                        >
                          {isAnalyzingAttention ? (
                            <Loader2 size={11} className="animate-spin" />
                          ) : (
                            <Focus size={11} />
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
                        Discover where users will focus their attention on this
                        creative using AI-powered eye-tracking simulation.
                      </p>
                      <button
                        onClick={() => analyzeAttention(selectedCreative.id)}
                        disabled={isAnalyzingAttention}
                        className="px-4 py-2 bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 disabled:from-orange-400 disabled:to-rose-400 text-white rounded-xl text-xs font-medium shadow-md shadow-orange-500/25 hover:shadow-orange-500/40 transition-all duration-200 flex items-center gap-1.5"
                      >
                        {isAnalyzingAttention ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Focus size={14} />
                        )}
                        Analyze Attention
                      </button>
                    </div>
                  )
                ) : (
                  /* Compliance Panel */
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
                              {selectedCreative.complianceResults.length} rules
                              checked
                            </p>
                          </div>
                          <ScoreRing
                            score={selectedCreative.complianceScores.overall}
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

                          {selectedCreative.complianceScores.breakdown.failed >
                            0 && (
                            <div className="bg-gradient-to-br from-rose-50 to-orange-50 dark:from-rose-900/20 dark:to-orange-900/20 rounded-xl p-3 border border-rose-200/50 dark:border-rose-800/30">
                              <h4 className="text-[11px] font-semibold text-rose-800 dark:text-rose-300 mb-2 flex items-center gap-1.5">
                                <Lightbulb size={12} />
                                Quick Fixes Needed
                              </h4>
                              <div className="space-y-1.5">
                                {selectedCreative.complianceResults
                                  .filter(
                                    (r) => r.status === "FAIL" && r.suggestion
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
                        <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-white/50 dark:bg-slate-800/30 flex items-center gap-1.5 flex-wrap">
                          {["all", "fail", "warning", "pass"].map((status) => {
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
                                      selectedCreative.complianceResults!.length
                                    })`
                                  : status === "fail"
                                  ? `Failed (${counts.failed})`
                                  : status === "warning"
                                  ? `Warnings (${counts.warnings})`
                                  : `Passed (${counts.passed})`}
                              </button>
                            );
                          })}
                        </div>

                        <div className="overflow-y-auto p-2.5 space-y-2 flex-1 min-h-0">
                          {getFilteredResults(
                            selectedCreative.complianceResults!
                          ).map((res, idx) => {
                            const originalIndex =
                              selectedCreative.complianceResults!.indexOf(res);
                            const isExpanded = expandedItems.has(originalIndex);

                            return (
                              <div
                                key={idx}
                                className={`rounded-xl border transition-all duration-200 overflow-hidden ${
                                  res.status === "FAIL"
                                    ? "border-rose-200 dark:border-rose-800/50 bg-gradient-to-br from-rose-50/50 to-white dark:from-rose-900/10 dark:to-slate-800/50"
                                    : res.status === "WARNING"
                                    ? "border-amber-200 dark:border-amber-800/50 bg-gradient-to-br from-amber-50/50 to-white dark:from-amber-900/10 dark:to-slate-800/50"
                                    : "border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-600"
                                }`}
                              >
                                <div
                                  className="p-2.5 cursor-pointer"
                                  onClick={() => toggleExpand(originalIndex)}
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
                                        {getCategoryBadge(res.category)}
                                        {getSeverityBadge(res.severity)}
                                      </div>
                                      <p
                                        className={`text-[11px] font-medium leading-snug ${
                                          res.status === "FAIL"
                                            ? "text-rose-900 dark:text-rose-200"
                                            : "text-slate-800 dark:text-slate-200"
                                        }`}
                                      >
                                        {res.rule}
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
                      </>
                    )}
                  </div>
                )}
              </>
            ) : selectedCreative.status === "failed" ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                <div className="w-14 h-14 bg-rose-100 dark:bg-rose-900/30 rounded-2xl flex items-center justify-center mb-4">
                  <XCircle size={24} className="text-rose-500" />
                </div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
                  Analysis Failed
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-xs">
                  {selectedCreative.error ||
                    "An error occurred during analysis."}
                </p>
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
                  Analysis Pending
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-4 max-w-xs leading-relaxed">
                  This creative has not been analyzed yet.
                </p>
              </div>
            )
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <ListChecks size={20} className="text-slate-400" />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  Select a creative to see compliance results
                </p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default EvaluationPreview;
