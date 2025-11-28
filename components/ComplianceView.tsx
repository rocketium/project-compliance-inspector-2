
import React, { useState, useEffect } from "react";
import {
  ComplianceResult,
  ComplianceScores,
  ImageMetadata,
  ImageSpec,
  AnalysisResult,
} from "../types";
import {
  checkComplianceWithGemini,
  calculateComplianceScores,
  autoFixRuleWithGemini,
} from "../services/gemini";
import {
  ShieldCheck,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  Play,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  Wrench,
  BarChart3,
  ListChecks,
  Scan,
  Sparkles,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Spinner } from "./Spinner";
import { ComplianceDashboard } from "./ComplianceDashboard";
import {
  ImageMetadataDisplay,
  extractImageMetadata,
} from "./ImageMetadataDisplay";

interface ComplianceViewProps {
  imageSrc: string;
  rules: string[];
  initialResults?: ComplianceResult[] | null;
  isComplianceLoading?: boolean;
  imageFile?: File | null;
  imageSpecs?: ImageSpec;
  extractionResults?: AnalysisResult;
  onImageFixGenerated?: (
    imageDataUrl: string,
    ruleIndex: number,
    ruleLabel: string
  ) => void;
}

type ViewTab = "dashboard" | "details";

export const ComplianceView: React.FC<ComplianceViewProps> = ({
  imageSrc,
  rules,
  initialResults,
  isComplianceLoading = false,
  imageFile,
  imageSpecs,
  extractionResults,
  latestImageVersion,
  onImageFixGenerated,
}) => {
  const [results, setResults] = useState<ComplianceResult[]>([]);
  const [scores, setScores] = useState<ComplianceScores | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState<ViewTab>("dashboard");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [imageMetadata, setImageMetadata] = useState<ImageMetadata | null>(
    null
  );
  const [isSpecsExpanded, setIsSpecsExpanded] = useState(true);
  const [fixingRuleIndex, setFixingRuleIndex] = useState<number | null>(null);
  const [autoFixResults, setAutoFixResults] = useState<Record<number, string>>(
    {}
  );

  // Extract image metadata
  useEffect(() => {
    extractImageMetadata(imageFile || null, imageSrc).then(setImageMetadata);
  }, [imageSrc, imageFile]);

  // Update results when initialResults are provided
  useEffect(() => {
    if (initialResults && initialResults.length > 0) {
      setResults(initialResults);
      setScores(calculateComplianceScores(initialResults));
      setHasRun(true);
      // Auto-expand failed items
      const failedIndices = new Set<number>();
      initialResults.forEach((r, i) => {
        if (r.status === "FAIL") failedIndices.add(i);
      });
      setExpandedItems(failedIndices);
    } else if (initialResults === null) {
      // Reset when starting a new analysis
      setResults([]);
      setScores(null);
      setHasRun(false);
      setExpandedItems(new Set());
    }
  }, [initialResults]);

  const runComplianceCheck = async () => {
    setIsLoading(true);
    try {
      const base64Data = imageSrc.split(",")[1];
      const mimeType = imageSrc.substring(
        imageSrc.indexOf(":") + 1,
        imageSrc.indexOf(";")
      );

      const data = await checkComplianceWithGemini(base64Data, mimeType, rules);
      setResults(data);
      setScores(calculateComplianceScores(data));
      setHasRun(true);

      // Auto-expand failed items
      const failedIndices = new Set<number>();
      data.forEach((r, i) => {
        if (r.status === "FAIL") failedIndices.add(i);
      });
      setExpandedItems(failedIndices);
    } catch (error) {
      console.error("Compliance check failed", error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleExpand = (index: number) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedItems(newExpanded);
  };

  const handleAutoFix = async (ruleIndex: number) => {
    if (!extractionResults || !imageSrc) {
      console.error("Missing extraction results or image source");
      return;
    }

    const rule = results[ruleIndex];
    if (!rule || rule.status === "PASS") {
      return;
    }

    setFixingRuleIndex(ruleIndex);

    try {
      // Use the latest image version if available, otherwise use original
      // This allows fixes to build on top of each other
      const inputImage = latestImageVersion || imageSrc;
      const base64Data = inputImage.split(",")[1];
      const mimeType = inputImage.substring(
        inputImage.indexOf(":") + 1,
        inputImage.indexOf(";")
      );

      const fixSuggestion = await autoFixRuleWithGemini(
        base64Data,
        mimeType,
        rule,
        extractionResults
      );

      setAutoFixResults((prev) => ({
        ...prev,
        [ruleIndex]: fixSuggestion,
      }));

      // Notify parent component about the new fixed image
      if (onImageFixGenerated) {
        onImageFixGenerated(fixSuggestion, ruleIndex, rule.rule);
      }
    } catch (error) {
      console.error("Auto-fix failed:", error);
      setAutoFixResults((prev) => ({
        ...prev,
        [ruleIndex]: "Error generating fix suggestion. Please try again.",
      }));
    } finally {
      setFixingRuleIndex(null);
    }
  };

  const passedCount = results.filter((r) => r.status === "PASS").length;
  const failedCount = results.filter((r) => r.status === "FAIL").length;
  const warningCount = results.filter((r) => r.status === "WARNING").length;

  const filteredResults =
    filterStatus === "all"
      ? results
      : results.filter((r) => r.status === filterStatus.toUpperCase());

  const getSeverityBadge = (severity?: string) => {
    switch (severity) {
      case "critical":
        return (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 uppercase">
            Critical
          </span>
        );
      case "major":
        return (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 uppercase">
            Major
          </span>
        );
      case "minor":
        return (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 uppercase">
            Minor
          </span>
        );
      default:
        return null;
    }
  };

  const getCategoryBadge = (category?: string) => {
    const colors: Record<string, string> = {
      brand:
        "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300",
      accessibility:
        "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
      policy:
        "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300",
      quality:
        "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
    };
    return category ? (
      <span
        className={`text-[9px] font-medium px-1.5 py-0.5 rounded capitalize ${
          colors[category] || "bg-slate-100 text-slate-600"
        }`}
      >
        {category}
      </span>
    ) : null;
  };

  if (!rules || rules.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center text-slate-500 dark:text-slate-400">
        <ShieldCheck
          size={48}
          className="mb-4 text-slate-300 dark:text-slate-600"
        />
        <p className="text-lg font-medium">No compliance rules defined.</p>
        <p className="text-sm">
          Configure rules for this platform in Settings.
        </p>
      </div>
    );
  }

  // Show loader if compliance is being generated in the background
  if (isComplianceLoading && !hasRun) {
    return (
      <div className="flex flex-col h-full bg-slate-50/50 dark:bg-slate-900/50">
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <div className="relative w-16 h-16 mx-auto mb-6">
            <div className="absolute inset-0 border-4 border-slate-100 dark:border-slate-700 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
          </div>
          <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
            Checking Compliance...
          </h3>
          <p className="text-slate-600 dark:text-slate-400 mb-4 max-w-md">
            Analyzing creative against {rules.length} brand guidelines
          </p>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Lightbulb size={14} className="text-amber-500" />
            Generating AI fix suggestions...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50/50 dark:bg-slate-900/50">
      {!hasRun ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <ShieldCheck
            size={64}
            className="text-indigo-200 dark:text-indigo-800 mb-6"
          />
          <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
            Brand Compliance Check
          </h3>
          <p className="text-slate-600 dark:text-slate-400 mb-4 max-w-md">
            Verify this creative against {rules.length} specific brand
            guidelines for this platform.
          </p>
          <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 mb-8">
            <span className="flex items-center gap-1">
              <BarChart3 size={14} /> Compliance Scores
            </span>
            <span className="flex items-center gap-1">
              <Lightbulb size={14} /> AI Fix Suggestions
            </span>
          </div>
          <button
            onClick={runComplianceCheck}
            disabled={isLoading}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium shadow-md shadow-indigo-200 dark:shadow-indigo-900/30 transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <Spinner className="w-5 h-5 text-white" />
            ) : (
              <Play size={20} />
            )}
            {isLoading ? "Analyzing..." : "Run Compliance Check"}
          </button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Image Specifications Section */}
          {imageMetadata && imageSpecs && (
            <div className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              {/* Collapsible Header */}
              <button
                onClick={() => setIsSpecsExpanded(!isSpecsExpanded)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
              >
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                  <Scan size={16} />
                  Image Specifications
                </span>
                {isSpecsExpanded ? (
                  <ChevronUp size={18} className="text-slate-400" />
                ) : (
                  <ChevronDown size={18} className="text-slate-400" />
                )}
              </button>

              {/* Collapsible Content */}
              {isSpecsExpanded && (
                <div className="px-4 pb-4">
                  <ImageMetadataDisplay
                    metadata={imageMetadata}
                    specs={imageSpecs}
                  />
                </div>
              )}
            </div>
          )}

          {/* Tab Switcher */}
          <div className="flex border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                activeTab === "dashboard"
                  ? "border-indigo-600 text-indigo-700 dark:text-indigo-400"
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              <BarChart3 size={14} /> Scores
            </button>
            <button
              onClick={() => setActiveTab("details")}
              className={`flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                activeTab === "details"
                  ? "border-indigo-600 text-indigo-700 dark:text-indigo-400"
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              <ListChecks size={14} /> Details ({results.length})
            </button>
          </div>

          {/* Dashboard Tab */}
          {activeTab === "dashboard" && scores && (
            <div className="flex-1 overflow-y-auto p-4">
              <ComplianceDashboard scores={scores} />

              {/* Quick Actions for Failed Items */}
              {failedCount > 0 && (
                <div className="mt-4 bg-red-50 dark:bg-red-900/20 rounded-xl p-4 border border-red-100 dark:border-red-800">
                  <div className="flex items-center gap-2 mb-3">
                    <Wrench
                      size={16}
                      className="text-red-600 dark:text-red-400"
                    />
                    <h4 className="text-sm font-semibold text-red-800 dark:text-red-300">
                      {failedCount} Issue{failedCount > 1 ? "s" : ""} Need
                      Attention
                    </h4>
                  </div>
                  <div className="space-y-2">
                    {results
                      .filter((r) => r.status === "FAIL" && r.suggestion)
                      .slice(0, 3)
                      .map((r, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-2 text-xs bg-white dark:bg-slate-800 rounded-lg p-2.5 border border-red-100 dark:border-red-800"
                        >
                          <Lightbulb
                            size={14}
                            className="text-amber-500 flex-shrink-0 mt-0.5"
                          />
                          <span className="text-slate-700 dark:text-slate-300">
                            {r.suggestion}
                          </span>
                        </div>
                      ))}
                  </div>
                  {failedCount > 3 && (
                    <button
                      onClick={() => setActiveTab("details")}
                      className="mt-3 text-xs text-red-600 dark:text-red-400 hover:underline"
                    >
                      View all {failedCount} issues →
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Details Tab */}
          {activeTab === "details" && (
            <>
              {/* Filter Bar */}
              <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 flex items-center gap-2">
                <span className="text-[10px] uppercase text-slate-500 dark:text-slate-400 font-medium">
                  Filter:
                </span>
                {["all", "fail", "warning", "pass"].map((status) => (
                  <button
                    key={status}
                    onClick={() => setFilterStatus(status)}
                    className={`text-[10px] px-2 py-1 rounded-full font-medium transition-colors ${
                      filterStatus === status
                        ? status === "fail"
                          ? "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300"
                          : status === "warning"
                          ? "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300"
                          : status === "pass"
                          ? "bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300"
                          : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                    }`}
                  >
                    {status === "all"
                      ? `All (${results.length})`
                      : status === "fail"
                      ? `Failed (${failedCount})`
                      : status === "warning"
                      ? `Warnings (${warningCount})`
                      : `Passed (${passedCount})`}
                  </button>
                ))}
              </div>

              {/* Results List */}
              <div className="overflow-y-auto p-4 space-y-3 flex-1">
                {filteredResults.map((res, idx) => {
                  const originalIndex = results.indexOf(res);
                  const isExpanded = expandedItems.has(originalIndex);

                  return (
                    <div
                      key={idx}
                      className={`rounded-xl border bg-white dark:bg-slate-800 transition-all overflow-hidden ${
                        res.status === "FAIL"
                          ? "border-red-200 dark:border-red-800 shadow-sm"
                          : res.status === "WARNING"
                          ? "border-amber-200 dark:border-amber-800"
                          : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                      }`}
                    >
                      {/* Main Row */}
                      <div
                        className="p-4 cursor-pointer"
                        onClick={() => toggleExpand(originalIndex)}
                      >
                        <div className="flex gap-3 items-start">
                          <div className="mt-0.5 flex-shrink-0">
                            {res.status === "PASS" && (
                              <CheckCircle2
                                className="text-green-500"
                                size={20}
                              />
                            )}
                            {res.status === "FAIL" && (
                              <XCircle className="text-red-500" size={20} />
                            )}
                            {res.status === "WARNING" && (
                              <AlertTriangle
                                className="text-amber-500"
                                size={20}
                              />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              {getCategoryBadge(res.category)}
                              {getSeverityBadge(res.severity)}
                            </div>
                            <p
                              className={`text-sm font-medium ${
                                res.status === "FAIL"
                                  ? "text-red-900 dark:text-red-300"
                                  : "text-slate-800 dark:text-slate-200"
                              }`}
                            >
                              {res.rule}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span
                              className={`text-[10px] font-bold px-2 py-1 rounded uppercase ${
                                res.status === "PASS"
                                  ? "bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300"
                                  : res.status === "FAIL"
                                  ? "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300"
                                  : "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300"
                              }`}
                            >
                              {res.status}
                            </span>
                            {isExpanded ? (
                              <ChevronUp size={16} className="text-slate-400" />
                            ) : (
                              <ChevronDown
                                size={16}
                                className="text-slate-400"
                              />
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Expanded Content */}
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-0 border-t border-slate-100 dark:border-slate-700 mt-0">
                          {/* Analysis */}
                          <div className="mt-3">
                            <p className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 mb-1">
                              Analysis
                            </p>
                            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                              {res.reasoning}
                            </p>
                          </div>

                          {/* Suggestion */}
                          {res.suggestion && res.status !== "PASS" && (
                            <div className="mt-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 border border-amber-100 dark:border-amber-800">
                              <div className="flex items-start gap-2">
                                <Lightbulb
                                  size={14}
                                  className="text-amber-500 flex-shrink-0 mt-0.5"
                                />
                                <div className="flex-1">
                                  <p className="text-[10px] uppercase font-semibold text-amber-700 dark:text-amber-400 mb-1">
                                    How to Fix
                                  </p>
                                  <p className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                                    {res.suggestion}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Auto Fix Button and Result */}
                          {res.status !== "PASS" && extractionResults && (
                            <div className="mt-3">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAutoFix(originalIndex);
                                }}
                                disabled={fixingRuleIndex === originalIndex}
                                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-xs font-medium rounded-lg transition-colors disabled:cursor-not-allowed"
                              >
                                {fixingRuleIndex === originalIndex ? (
                                  <>
                                    <Spinner className="w-3 h-3" />
                                    Generating Fix...
                                  </>
                                ) : (
                                  <>
                                    <Sparkles size={14} />
                                    Auto Fix Using AI
                                  </>
                                )}
                              </button>
                              {autoFixResults[originalIndex] && (
                                <div className="mt-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 border border-indigo-100 dark:border-indigo-800">
                                  <div className="flex items-start gap-2">
                                    <Sparkles
                                      size={14}
                                      className="text-indigo-500 flex-shrink-0 mt-0.5"
                                    />
                                    <div className="flex-1">
                                      <p className="text-[10px] uppercase font-semibold text-indigo-700 dark:text-indigo-400 mb-2">
                                        AI-Generated Fix
                                      </p>
                                      {autoFixResults[originalIndex].startsWith(
                                        "data:image"
                                      ) ? (
                                        <div className="rounded-lg overflow-hidden border border-indigo-200 dark:border-indigo-800">
                                          <img
                                            src={autoFixResults[originalIndex]}
                                            alt="AI-generated fix visualization"
                                            className="w-full h-auto max-h-96 object-contain"
                                          />
                                        </div>
                                      ) : (
                                        <p className="text-xs text-indigo-900 dark:text-indigo-200 leading-relaxed">
                                          {autoFixResults[originalIndex]}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}
                              {autoFixResults[originalIndex] &&
                                onImageFixGenerated && (
                                  <div className="mt-2 text-xs text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                                    <Sparkles size={12} />
                                    <span>
                                      Fixed image added to preview carousel
                                    </span>
                                  </div>
                                )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {filteredResults.length === 0 && (
                  <div className="text-center py-12 text-slate-400 dark:text-slate-500">
                    <p>No results matching this filter.</p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Footer */}
          <div className="p-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-center">
            <button
              onClick={runComplianceCheck}
              disabled={isLoading}
              className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium flex items-center gap-2 disabled:opacity-50"
            >
              {isLoading ? <Spinner className="w-4 h-4" /> : <Play size={14} />}
              {isLoading ? "Re-checking..." : "Re-run Check"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
