
import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import {
  analyzeImageWithGemini,
  checkComplianceWithGemini,
} from "./services/gemini";
import {
  AnalysisResult,
  AppState,
  PlatformConfig,
  ComplianceResult,
} from "./types";
import { ResultsView } from "./components/ResultsView";
import {
  UploadCloud,
  FileImage,
  AlertCircle,
  Sparkles,
  Settings,
  ChevronDown,
  Moon,
  Sun,
  LogOut,
  Layers,
  History,
  Link2,
  Copy,
  Check,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { ConfigProvider, theme as antdTheme } from "antd";
import { AdminPanel } from "./components/AdminPanel";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import { useAuth } from "./contexts/AuthContext";
import { Login } from "./components/Login";
import { EvaluateProject } from "./components/EvaluateProject";
import { EvaluationHistory } from "./components/EvaluationHistory";
import { EvaluationPreview } from "./components/EvaluationPreview";
import { DEFAULT_PLATFORMS } from "./constants/platforms";
import {
  createEvaluationJob,
  extractProjectIdFromUrl as extractId,
} from "./services/evaluationApi";

// Theme toggle button component
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

// Helper function to extract project ID from URL or return as-is if it's already an ID
const extractProjectIdFromUrl = (input: string): string | null => {
  const trimmed = input.trim();

  // Check if it's a URL containing /campaign/p/ or /p/
  // URL patterns:
  // - https://rocketium.com/campaign/p/{projectId}/{name}/view
  // - http://localhost:3000/campaign/p/{projectId}/{name}/view
  const urlPattern = /\/campaign\/p\/([^\/]+)/;
  const match = trimmed.match(urlPattern);

  if (match && match[1]) {
    return match[1];
  }

  // Also try simpler /p/ pattern
  const simplePattern = /\/p\/([^\/]+)/;
  const simpleMatch = trimmed.match(simplePattern);

  if (simpleMatch && simpleMatch[1]) {
    return simpleMatch[1];
  }

  // If no URL pattern found, assume it's already a project ID
  // Basic validation: should contain alphanumeric chars and possibly hyphens
  if (/^[a-zA-Z0-9-]+$/.test(trimmed)) {
    return trimmed;
  }

  // Try to extract from any URL-like string
  try {
    const url = new URL(trimmed);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const pIndex = pathParts.indexOf("p");
    if (pIndex !== -1 && pathParts[pIndex + 1]) {
      return pathParts[pIndex + 1];
    }
  } catch {
    // Not a valid URL, return as-is
  }

  return trimmed || null;
};

const AppContent: React.FC = () => {
  // const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(
    null
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [thinkingTime, setThinkingTime] = useState(0);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showPlatformDropdown, setShowPlatformDropdown] = useState(false);
  const [complianceResults, setComplianceResults] = useState<
    ComplianceResult[] | null
  >(null);
  const [isComplianceLoading, setIsComplianceLoading] = useState(false);
  const [projectId, setProjectId] = useState<string>("");
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [shareableLink, setShareableLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  // Platform Management
  const [platforms, setPlatforms] =
    useState<PlatformConfig[]>(DEFAULT_PLATFORMS);
  // Initialize platform from URL parameter immediately to avoid race condition
  const [activePlatformId, setActivePlatformId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("platform") || "default";
  });

  const fetchPlatforms = async () => {
    try {
      const res = await fetch("/api/platforms");
      if (res.ok) {
        const data = await res.json();
        setPlatforms(data);
      } else {
        // Handle 404 or other errors without crashing
        console.warn(
          "Could not fetch platforms from API, checking fallback..."
        );
        try {
          // Fallback to json file if api is 404 (static hosting)
          const staticRes = await fetch("/platforms.json");
          if (staticRes.ok) {
            const staticData = await staticRes.json();
            setPlatforms(staticData);
          }
        } catch (e) {
          console.warn("Using default fallback configuration");
        }
      }
    } catch (err) {
      console.warn("Using default fallback configuration due to network error");
      // Keep DEFAULT_PLATFORMS
    }
  };

  useEffect(() => {
    // 1. Load Platforms
    fetchPlatforms();

    // 2. Ensure platform param is in URL (state already initialized from URL)
    const params = new URLSearchParams(window.location.search);
    if (!params.has("platform")) {
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set("platform", activePlatformId);
      window.history.replaceState({}, "", newUrl);
    }

    // 3. Check routing
    if (window.location.pathname === "/admin") {
      setShowAdmin(true);
    }

    // 4. Restore from localStorage if available
    try {
      const savedData = localStorage.getItem("adAnalyzerResults");
      if (savedData) {
        const parsed = JSON.parse(savedData);
        if (parsed.imagePreview && parsed.analysisResult) {
          setImagePreview(parsed.imagePreview);
          setAnalysisResult(parsed.analysisResult);
          setComplianceResults(parsed.complianceResults || null);
          setAppState(AppState.SUCCESS);
          // Note: imageFile cannot be restored from localStorage
          // This is acceptable as the preview is the important part for display
        }
      }
    } catch (error) {
      console.warn("Failed to restore data from localStorage:", error);
      // Clear corrupted data
      localStorage.removeItem("adAnalyzerResults");
    }
  }, []);

  // Keep platform in sync with query parameter
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const currentPlatform = params.get("platform");

    // Only update URL if it's different from current query param
    if (currentPlatform !== activePlatformId) {
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set("platform", activePlatformId);
      window.history.replaceState({}, "", newUrl);
    }
  }, [activePlatformId]);

  // Save to localStorage whenever analysis or compliance results change
  useEffect(() => {
    if (appState === AppState.SUCCESS && imagePreview && analysisResult) {
      try {
        const dataToSave = {
          imagePreview,
          analysisResult,
          complianceResults,
          platformId: activePlatformId,
          timestamp: Date.now(),
        };
        localStorage.setItem("adAnalyzerResults", JSON.stringify(dataToSave));
      } catch (error) {
        console.warn("Failed to save to localStorage:", error);
      }
    }
  }, [
    appState,
    imagePreview,
    analysisResult,
    complianceResults,
    activePlatformId,
  ]);

  // Use derived active platform, strictly falling back if ID not found
  const activePlatform =
    platforms.find((p) => p.id === activePlatformId) ||
    platforms[0] ||
    DEFAULT_PLATFORMS[0];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setErrorMsg("Please upload a valid image file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
      setImageFile(file);
      setAppState(AppState.IDLE);
      setErrorMsg(null);
      // Clear previous results when uploading new image
      setAnalysisResult(null);
      setComplianceResults(null);
      localStorage.removeItem("adAnalyzerResults");
    };
    reader.readAsDataURL(file);
  };

  const handleAnalyze = async () => {
    if (!imagePreview || !imageFile) return;

    setAppState(AppState.ANALYZING);
    setErrorMsg(null);

    // Start timer for thinking mode visualization
    const startTime = Date.now();
    const timer = setInterval(() => {
      setThinkingTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    try {
      // Extract base64 data (remove "data:image/jpeg;base64," prefix)
      const base64Data = imagePreview.split(",")[1];
      const mimeType = imageFile.type;

      // Use the specific prompt for the active platform
      const result = await analyzeImageWithGemini(
        base64Data,
        mimeType,
        activePlatform.prompt,
        "seed-dream"
      );
      setAnalysisResult(result);
      setAppState(AppState.SUCCESS);

      // Run compliance check asynchronously (don't await)
      if (
        activePlatform.complianceRules &&
        activePlatform.complianceRules.length > 0
      ) {
        setIsComplianceLoading(true);
        checkComplianceWithGemini(
          base64Data,
          mimeType,
          activePlatform.complianceRules,
          "seed-dream"
        )
          .then((results) => {
            setComplianceResults(results);
            setIsComplianceLoading(false);
          })
          .catch((err) => {
            console.error("Compliance check failed", err);
            setIsComplianceLoading(false);
            // Optionally set error state or handle silently
          });
      }
    } catch (err: any) {
      console.error(err);
      // Handle JSON parse errors from HTML responses
      let message = err.message || "An error occurred during analysis.";
      if (
        message.includes("Unexpected token") ||
        message.includes("is not valid JSON")
      ) {
        message =
          "API Error: The server returned an invalid response. Please check your connection or API key.";
      }
      setErrorMsg(message);
      setAppState(AppState.ERROR);
    } finally {
      clearInterval(timer);
      setThinkingTime(0);
    }
  };

  const handleReset = () => {
    setAppState(AppState.IDLE);
    setImageFile(null);
    setImagePreview(null);
    setAnalysisResult(null);
    setErrorMsg(null);
    setComplianceResults(null);
    setIsComplianceLoading(false);
    // Clear localStorage when resetting
    localStorage.removeItem("adAnalyzerResults");
  };

  // Generate shareable link that analyzes in background
  const handleGenerateShareableLink = async () => {
    if (!projectId.trim()) return;

    setIsGeneratingLink(true);
    setShareableLink(null);
    setErrorMsg(null);

    try {
      const result = await createEvaluationJob(
        projectId.trim(),
        activePlatformId
      );

      if (result.success && result.shareableUrl) {
        setShareableLink(result.shareableUrl);
      } else {
        setErrorMsg(result.error || "Failed to create shareable link");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to create shareable link");
    } finally {
      setIsGeneratingLink(false);
    }
  };

  // Copy shareable link to clipboard
  const copyShareableLink = () => {
    if (shareableLink) {
      navigator.clipboard.writeText(shareableLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  };

  // // Show loading state while checking authentication
  // if (authLoading) {
  //   return (
  //     <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
  //       <div className="text-center">
  //         <div className="w-16 h-16 border-4 border-slate-200 dark:border-slate-700 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4"></div>
  //         <p className="text-slate-600 dark:text-slate-400">Loading...</p>
  //       </div>
  //     </div>
  //   );
  // }

  // Show login page if not authenticated
  // if (!user) {
  //   return <Login />;
  // }

  // Render Admin Panel
  if (showAdmin) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-900">
        <AdminPanel
          onClose={() => {
            setShowAdmin(false);
            window.history.pushState({}, "", "/");
            fetchPlatforms(); // Refresh data
          }}
          currentPlatforms={platforms}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col transition-colors">
      {/* Header */}
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-1.5 rounded-lg">
              <Sparkles className="text-white h-5 w-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-white tracking-tight">
              Rocketium AI
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {/* User Email */}
            {/* <span className="text-sm text-slate-600 dark:text-slate-400 hidden sm:block">
              {user?.email}
            </span> */}

            {/* Sign Out Button */}
            {/* <button
              onClick={signOut}
              className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full"
              title="Sign Out"
            >
              <LogOut size={20} />
            </button> */}

            {/* Platform Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowPlatformDropdown(!showPlatformDropdown)}
                className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors text-sm font-medium text-slate-700 dark:text-slate-200"
              >
                <span>{activePlatform.name}</span>
                <ChevronDown
                  size={16}
                  className={`transition-transform ${
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
                  <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-20 max-h-96 overflow-y-auto">
                    {platforms.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setActivePlatformId(p.id);
                          const newUrl = new URL(window.location.href);
                          newUrl.searchParams.set("platform", p.id);
                          window.history.pushState({}, "", newUrl);
                          setShowPlatformDropdown(false);
                        }}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-indigo-50 dark:hover:bg-slate-700 transition-colors ${
                          activePlatformId === p.id
                            ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium"
                            : "text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* History Button */}
            <button
              onClick={() => navigate("/history")}
              className="p-1.5 rounded-lg bg-slate-100/80 dark:bg-slate-800/50 hover:bg-slate-200/80 dark:hover:bg-slate-700/50 transition-all duration-200 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 backdrop-blur-sm"
              title="View History"
            >
              <History size={18} />
            </button>
            <ThemeToggle />

            <button
              onClick={() => setShowAdmin(true)}
              className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full"
              title="Settings"
            >
              <Settings size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* IDLE STATE: Upload */}
        {appState === AppState.IDLE && !imagePreview && (
          <div className="max-w-2xl mx-auto mt-12">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold text-slate-800 dark:text-white mb-4">
                Extract logic from visual chaos
              </h2>
              <p className="text-lg text-slate-600 dark:text-slate-400 leading-relaxed">
                Upload an advertisement, flyer, or UI design. The AI will
                analyze the layout using the{" "}
                <strong className="text-indigo-600 dark:text-indigo-400">
                  {activePlatform.name}
                </strong>{" "}
                configuration.
              </p>
            </div>

            {/* Project Evaluation Section */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 mb-8 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-emerald-100 dark:bg-emerald-900/30 p-2 rounded-lg">
                  <Layers className="text-emerald-600 dark:text-emerald-400 h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Evaluate Rocketium Project
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Analyze all creatives in a project at once
                  </p>
                </div>
              </div>
              <div className="flex gap-3 mb-4">
                <input
                  type="text"
                  placeholder="Paste project URL or ID (e.g., https://rocketium.com/campaign/p/xxx-123/...)"
                  value={projectId}
                  onChange={(e) => {
                    setProjectId(e.target.value);
                    setShareableLink(null);
                  }}
                  className="flex-1 px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && projectId.trim()) {
                      const extractedId = extractProjectIdFromUrl(
                        projectId.trim()
                      );
                      if (extractedId) {
                        navigate(`/evaluate-project/${extractedId}`);
                      }
                    }
                  }}
                />
                <button
                  onClick={() => {
                    if (projectId.trim()) {
                      const extractedId = extractProjectIdFromUrl(
                        projectId.trim()
                      );
                      if (extractedId) {
                        navigate(`/evaluate-project/${extractedId}`);
                      }
                    }
                  }}
                  disabled={!projectId.trim()}
                  className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 text-white disabled:text-slate-500 dark:disabled:text-slate-400 font-medium rounded-lg transition-colors flex items-center gap-2"
                >
                  <Sparkles size={18} />
                  Evaluate
                </button>
              </div>

              {/* Generate Shareable Link Section */}
              <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Link2 size={16} className="text-indigo-500" />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Or generate a shareable link
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    (analysis runs in background)
                  </span>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleGenerateShareableLink}
                    disabled={!projectId.trim() || isGeneratingLink}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 text-white disabled:text-slate-500 dark:disabled:text-slate-400 font-medium rounded-lg transition-colors flex items-center gap-2 text-sm"
                  >
                    {isGeneratingLink ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Link2 size={16} />
                        Generate Link
                      </>
                    )}
                  </button>

                  {shareableLink && (
                    <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                      <input
                        type="text"
                        value={shareableLink}
                        readOnly
                        className="flex-1 bg-transparent text-sm text-emerald-700 dark:text-emerald-300 outline-none"
                      />
                      <button
                        onClick={copyShareableLink}
                        className="p-1.5 hover:bg-emerald-100 dark:hover:bg-emerald-800/30 rounded transition-colors"
                        title="Copy link"
                      >
                        {linkCopied ? (
                          <Check
                            size={16}
                            className="text-emerald-600 dark:text-emerald-400"
                          />
                        ) : (
                          <Copy
                            size={16}
                            className="text-emerald-600 dark:text-emerald-400"
                          />
                        )}
                      </button>
                      <a
                        href={shareableLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 hover:bg-emerald-100 dark:hover:bg-emerald-800/30 rounded transition-colors"
                        title="Open in new tab"
                      >
                        <ExternalLink
                          size={16}
                          className="text-emerald-600 dark:text-emerald-400"
                        />
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="relative mb-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200 dark:border-slate-700"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400">
                  or analyze a single image
                </span>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 p-12 text-center hover:border-indigo-500 dark:hover:border-indigo-400 transition-colors shadow-sm group">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 mb-6 group-hover:scale-110 transition-transform">
                <UploadCloud size={32} />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                Upload an image to analyze
              </h3>
              <p className="text-slate-500 dark:text-slate-400 mb-8">
                Supported formats: JPEG, PNG, WEBP
              </p>

              <label className="inline-flex">
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={handleFileChange}
                />
                <span className="cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-lg font-medium transition-colors shadow-sm hover:shadow flex items-center gap-2">
                  <FileImage size={18} />
                  Select Image
                </span>
              </label>
            </div>
          </div>
        )}

        {/* IDLE STATE: Preview */}
        {appState === AppState.IDLE && imagePreview && (
          <div className="max-w-4xl mx-auto flex flex-col items-center">
            <div className="w-full bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden p-4 mb-8">
              <img
                src={imagePreview}
                alt="Preview"
                className="max-h-[60vh] mx-auto object-contain rounded-lg"
              />
            </div>

            <div className="flex gap-4">
              <button
                onClick={handleReset}
                className="px-6 py-3 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-medium rounded-xl hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAnalyze}
                className="px-8 py-3 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 dark:shadow-indigo-900/30 flex items-center gap-2"
              >
                <Sparkles size={18} />
                Run Deep Analysis
              </button>
            </div>
          </div>
        )}

        {/* ANALYZING STATE */}
        {appState === AppState.ANALYZING && (
          <div className="max-w-lg mx-auto text-center mt-20">
            <div className="relative w-24 h-24 mx-auto mb-8">
              <div className="absolute inset-0 border-4 border-slate-100 dark:border-slate-700 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center font-mono text-indigo-600 dark:text-indigo-400 font-bold text-lg">
                {thinkingTime}s
              </div>
            </div>
            <h3 className="text-2xl font-bold text-slate-800 dark:text-white mb-3">
              Analyzing visual structure...
            </h3>
            <p className="text-slate-500 dark:text-slate-400 mb-8">
              Thinking mode enabled. Using{" "}
              <strong className="text-slate-700 dark:text-slate-200">
                {activePlatform.name}
              </strong>{" "}
              logic to deconstruct the image.
            </p>
            <div className="mb-6 inline-block bg-slate-100 dark:bg-slate-800 px-4 py-2 rounded font-mono text-xs text-slate-500 dark:text-slate-400">
              Platform: {activePlatformId}
            </div>

            <div className="space-y-3 max-w-xs mx-auto text-left">
              <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400 animate-pulse">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                Detecting text regions
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400 animate-pulse delay-150">
                <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                Calculating bounding boxes
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400 animate-pulse delay-300">
                <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                Categorizing visual elements
              </div>
            </div>
          </div>
        )}

        {/* ERROR STATE */}
        {appState === AppState.ERROR && (
          <div className="max-w-md mx-auto mt-20 text-center">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle size={32} />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              Analysis Failed
            </h3>
            <p className="text-slate-600 dark:text-slate-400 mb-8">
              {errorMsg}
            </p>
            <button
              onClick={handleReset}
              className="px-6 py-2 bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-800 rounded-lg hover:bg-slate-900 dark:hover:bg-white transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {/* SUCCESS STATE */}
        {appState === AppState.SUCCESS && imagePreview && analysisResult && (
          <div className="h-[calc(100vh-140px)] min-h-[600px]">
            <ResultsView
              imageSrc={imagePreview}
              analysis={analysisResult}
              onReset={handleReset}
              platformName={activePlatform.name}
              complianceRules={activePlatform.complianceRules}
              complianceResults={complianceResults}
              isComplianceLoading={isComplianceLoading}
              imageFile={imageFile}
              imageSpecs={activePlatform.imageSpecs}
            />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-slate-500 dark:text-slate-400">
          <a
            href="https://rocketium.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium transition-colors"
          >
            Rocketium
          </a>{" "}
          2025 All rights reserved
        </div>
      </footer>
    </div>
  );
};

// Wrapper component to access theme context
const ThemedApp: React.FC = () => {
  const { theme } = useTheme();

  return (
    <ConfigProvider
      theme={{
        algorithm:
          theme === "dark"
            ? antdTheme.darkAlgorithm
            : antdTheme.defaultAlgorithm,
        token: {
          // Grayscale dark mode colors
          colorBgElevated: theme === "dark" ? "#171717" : "#ffffff",
          colorBorder: theme === "dark" ? "#2a2a2a" : "#e2e8f0",
          colorText: theme === "dark" ? "#d4d4d4" : "#1e293b",
          colorTextHeading: theme === "dark" ? "#f0f0f0" : "#0f172a",
        },
      }}
    >
      <Routes>
        <Route path="/" element={<AppContent />} />
        <Route
          path="/evaluate-project/:projectId"
          element={<EvaluateProject />}
        />
        <Route path="/preview/:jobId" element={<EvaluationPreview />} />
        <Route path="/history" element={<EvaluationHistory />} />
      </Routes>
    </ConfigProvider>
  );
};

// Main App component wrapped with ThemeProvider and Router
const App: React.FC = () => {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <ThemedApp />
      </ThemeProvider>
    </BrowserRouter>
  );
};

export default App;
