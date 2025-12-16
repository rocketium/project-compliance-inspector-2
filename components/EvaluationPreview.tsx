import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  loadEvaluationJob,
  subscribeToJobUpdates,
  EvaluationJob,
  EvaluationCreative,
} from "../services/evaluationApi";
import { ComplianceResult, ComplianceScores } from "../types";
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
        setJob(result.data);
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
                setJob(updatedJob);
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
              <ZoomPanControls className="flex-1 min-h-0 bg-gradient-to-br from-slate-100/50 to-slate-200/50 dark:from-slate-800/50 dark:to-slate-900/50">
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

        {/* Right Sidebar - Compliance Results */}
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
              <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                {/* Scores Header */}
                {selectedCreative.complianceScores && (
                  <div className="p-3 border-b border-slate-200/50 dark:border-slate-700/50">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <ShieldCheck size={14} className="text-indigo-500" />
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
                          {selectedCreative.complianceScores.breakdown.passed}
                        </p>
                        <p className="text-[9px] uppercase tracking-wider text-emerald-700 dark:text-emerald-500 font-medium">
                          Passed
                        </p>
                      </div>
                      <div className="bg-amber-50/80 dark:bg-amber-900/20 rounded-lg p-2 text-center border border-amber-100 dark:border-amber-800/30">
                        <p className="text-base font-bold text-amber-600 dark:text-amber-400 tabular-nums leading-tight">
                          {selectedCreative.complianceScores.breakdown.warnings}
                        </p>
                        <p className="text-[9px] uppercase tracking-wider text-amber-700 dark:text-amber-500 font-medium">
                          Warnings
                        </p>
                      </div>
                      <div className="bg-rose-50/80 dark:bg-rose-900/20 rounded-lg p-2 text-center border border-rose-100 dark:border-rose-800/30">
                        <p className="text-base font-bold text-rose-600 dark:text-rose-400 tabular-nums leading-tight">
                          {selectedCreative.complianceScores.breakdown.failed}
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
                                      typeof score === "number" && score >= 80
                                        ? "text-emerald-600 dark:text-emerald-400"
                                        : typeof score === "number" &&
                                          score >= 60
                                        ? "text-amber-600 dark:text-amber-400"
                                        : "text-rose-600 dark:text-rose-400"
                                    }`}
                                  >
                                    {typeof score === "number" ? score : "--"}%
                                  </span>
                                </div>
                                <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all duration-700 ease-out ${
                                      typeof score === "number" && score >= 80
                                        ? "bg-gradient-to-r from-emerald-400 to-emerald-500"
                                        : typeof score === "number" &&
                                          score >= 60
                                        ? "bg-gradient-to-r from-amber-400 to-amber-500"
                                        : "bg-gradient-to-r from-rose-400 to-rose-500"
                                    }`}
                                    style={{
                                      width: `${
                                        typeof score === "number" ? score : 0
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

                                {res.suggestion && res.status !== "PASS" && (
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
