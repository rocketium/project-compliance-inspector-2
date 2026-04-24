import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  loadAllProjectEvaluations,
  deleteProjectEvaluation,
  StoredProjectEvaluation,
} from "../services/projectEvaluation";
import {
  ArrowLeft,
  History,
  Trash2,
  ExternalLink,
  Loader2,
  FolderOpen,
  Calendar,
  Image as ImageIcon,
  BarChart3,
  Moon,
  Sun,
  AlertCircle,
} from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";

// Theme toggle button
const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-slate-500 dark:text-slate-400"
      title={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
    >
      {theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
    </button>
  );
};

export const EvaluationHistory: React.FC = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [evaluations, setEvaluations] = useState<StoredProjectEvaluation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const getEvaluationTitle = (evaluation: StoredProjectEvaluation): string => {
    const title = evaluation.projectName?.trim();
    return title || "Untitled project";
  };

  // Load all evaluations
  useEffect(() => {
    const loadHistory = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await loadAllProjectEvaluations();
        if (result.success && result.data) {
          setEvaluations(result.data);
        } else if (result.error) {
          setError(result.error);
        }
      } catch (err: any) {
        setError(err.message || "Failed to load history");
      } finally {
        setIsLoading(false);
      }
    };

    loadHistory();
  }, []);

  // Handle delete
  const handleDelete = async (
    evaluation: StoredProjectEvaluation,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    if (!evaluation.id) return;
    if (!confirm("Are you sure you want to delete this saved run?")) return;

    setDeletingId(evaluation.id);
    try {
      const result = await deleteProjectEvaluation(evaluation.id);
      if (result.success) {
        setEvaluations((prev) => prev.filter((ev) => ev.id !== evaluation.id));
      }
    } catch (err) {
      console.error("Failed to delete:", err);
    } finally {
      setDeletingId(null);
    }
  };

  // Calculate average score for an evaluation
  const getAverageScore = (evaluation: StoredProjectEvaluation): number => {
    const creativesWithScores = evaluation.creatives.filter(
      (c) => c.complianceScores?.overall
    );
    if (creativesWithScores.length === 0) return 0;
    const total = creativesWithScores.reduce(
      (sum, c) => sum + (c.complianceScores?.overall || 0),
      0
    );
    return Math.round(total / creativesWithScores.length);
  };

  // Format date
  const formatDate = (dateString?: string): string => {
    if (!dateString) return "Unknown";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="h-screen max-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col transition-colors overflow-hidden">
      {/* Header */}
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex-shrink-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <button
              onClick={() => navigate("/")}
              className="mt-0.5 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-400"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex items-start gap-3">
              <div className="bg-indigo-600 p-1.5 rounded-lg">
                <History className="text-white h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h1 className="text-lg font-bold text-slate-800 dark:text-white tracking-tight">
                  Evaluation History
                </h1>
                <p className="text-sm leading-none text-slate-500 dark:text-slate-400">
                  {evaluations.length} saved run
                  {evaluations.length !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
          </div>

          <ThemeToggle />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-16 h-16 border-4 border-slate-200 dark:border-slate-700 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
              <p className="text-slate-600 dark:text-slate-400">
                Loading history...
              </p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-20">
              <AlertCircle
                size={48}
                className="text-red-500 mb-4"
              />
              <p className="text-slate-600 dark:text-slate-400 mb-4">{error}</p>
              <button
                onClick={() => navigate("/")}
                className="px-4 py-2 bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-800 rounded-lg hover:bg-slate-900 dark:hover:bg-white transition-colors"
              >
                Go Back
              </button>
            </div>
          ) : evaluations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <FolderOpen
                size={64}
                className="text-slate-300 dark:text-slate-600 mb-6"
              />
              <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
                No Evaluations Yet
              </h2>
              <p className="text-slate-600 dark:text-slate-400 mb-6 text-center max-w-md">
                Start by evaluating a project. Your saved evaluation runs will
                appear here.
              </p>
              <button
                onClick={() => navigate("/")}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
              >
                Evaluate a Project
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              {evaluations.map((evaluation) => {
                const avgScore = getAverageScore(evaluation);
                const analyzedCount = evaluation.creatives.filter(
                  (c) => c.complianceScores
                ).length;

                return (
                  <div
                    key={evaluation.id || evaluation.projectId}
                    onClick={() =>
                      navigate(
                        evaluation.id
                          ? `/evaluate-project/${evaluation.projectId}?evaluationId=${encodeURIComponent(
                              evaluation.id
                            )}`
                          : `/evaluate-project/${evaluation.projectId}`
                      )
                    }
                    className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-500 hover:shadow-md transition-all group"
                  >
                    <div className="flex items-start justify-between gap-4">
                      {/* Left: Project Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-lg font-semibold text-slate-800 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                            {getEvaluationTitle(evaluation)}
                          </h3>
                          <ExternalLink
                            size={16}
                            className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity"
                          />
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
                          <span className="flex items-center gap-1">
                            <ImageIcon size={14} />
                            {evaluation.creatives.length} creative
                            {evaluation.creatives.length !== 1 ? "s" : ""}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300">
                            {evaluation.platformId}
                          </span>
                          <span className="flex items-center gap-1">
                            <BarChart3 size={14} />
                            {analyzedCount} analyzed
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar size={14} />
                            Run saved {formatDate(evaluation.updatedAt)}
                          </span>
                        </div>

                        {/* Creative thumbnails */}
                        {evaluation.creatives.length > 0 && (
                          <div className="flex items-center gap-2 mt-3">
                            {evaluation.creatives.slice(0, 5).map((creative) => (
                              <div
                                key={creative.creativeId}
                                className="w-12 h-12 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600"
                              >
                                <img
                                  src={creative.creativeUrl}
                                  alt={creative.creativeName}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display =
                                      "none";
                                  }}
                                />
                              </div>
                            ))}
                            {evaluation.creatives.length > 5 && (
                              <div className="w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center text-xs font-medium text-slate-500 dark:text-slate-400">
                                +{evaluation.creatives.length - 5}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Right: Score & Actions */}
                      <div className="flex items-center gap-4">
                        {/* Average Score */}
                        {avgScore > 0 && (
                          <div
                            className={`text-center px-4 py-2 rounded-lg ${
                              avgScore >= 80
                                ? "bg-green-50 dark:bg-green-900/30"
                                : avgScore >= 60
                                ? "bg-amber-50 dark:bg-amber-900/30"
                                : "bg-red-50 dark:bg-red-900/30"
                            }`}
                          >
                            <div
                              className={`text-2xl font-bold ${
                                avgScore >= 80
                                  ? "text-green-600 dark:text-green-400"
                                  : avgScore >= 60
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-red-600 dark:text-red-400"
                              }`}
                            >
                              {avgScore}%
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              Avg Score
                            </div>
                          </div>
                        )}

                        {/* Delete Button */}
                        <button
                          onClick={(e) => handleDelete(evaluation, e)}
                          disabled={deletingId === evaluation.id}
                          className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-50"
                          title="Delete saved run"
                        >
                          {deletingId === evaluation.id ? (
                            <Loader2 size={18} className="animate-spin" />
                          ) : (
                            <Trash2 size={18} />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default EvaluationHistory;
