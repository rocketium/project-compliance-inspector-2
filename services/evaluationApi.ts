import { supabase } from "../lib/supabase";
import {
  analyzeImageWithGemini,
  checkComplianceWithGemini,
  calculateComplianceScores,
} from "./gemini";
import {
  StoredCreativeResult,
  saveProjectEvaluation,
} from "./projectEvaluation";
import {
  PlatformConfig,
  AnalysisResult,
  ComplianceResult,
  ComplianceScores,
  AttentionInsightResult,
} from "../types";
import { DEFAULT_PLATFORMS } from "../constants/platforms";

// Types for evaluation jobs
export interface EvaluationJob {
  id: string;
  projectId: string;
  projectName?: string;
  platformId: string;
  status: "pending" | "analyzing" | "completed" | "failed";
  totalCreatives: number;
  analyzedCreatives: number;
  creatives: EvaluationCreative[];
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export interface EvaluationCreative {
  id: string;
  url: string;
  name: string;
  dimensionKey: string;
  variationId: string;
  variationName?: string;
  width?: number;
  height?: number;
  status: "pending" | "analyzing" | "completed" | "failed";
  analysisResult?: AnalysisResult;
  complianceResults?: ComplianceResult[];
  complianceScores?: ComplianceScores;
  attentionResult?: AttentionInsightResult;
  error?: string;
}

// Generate a unique shareable ID
const generateShareableId = (): string => {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `eval-${timestamp}-${randomPart}`;
};

// Get the API base URL based on current environment
const getApiBaseUrl = () => {
  if (typeof window === "undefined") return "https://rocketium.com";
  const hostname = window.location.hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://localhost:3000";
  }
  return "https://rocketium.com";
};

// Get the app base URL for shareable links
const getAppBaseUrl = () => {
  if (typeof window === "undefined") return "";
  return window.location.origin;
};

// Extract project ID from URL
export const extractProjectIdFromUrl = (input: string): string | null => {
  const trimmed = input.trim();

  // Check URL patterns
  const urlPattern = /\/campaign\/p\/([^\/]+)/;
  const match = trimmed.match(urlPattern);
  if (match && match[1]) return match[1];

  const simplePattern = /\/p\/([^\/]+)/;
  const simpleMatch = trimmed.match(simplePattern);
  if (simpleMatch && simpleMatch[1]) return simpleMatch[1];

  // If no URL pattern found, assume it's already a project ID
  if (/^[a-zA-Z0-9-]+$/.test(trimmed)) return trimmed;

  // Try to extract from any URL-like string
  try {
    const url = new URL(trimmed);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const pIndex = pathParts.indexOf("p");
    if (pIndex !== -1 && pathParts[pIndex + 1]) {
      return pathParts[pIndex + 1];
    }
  } catch {
    // Not a valid URL
  }

  return trimmed || null;
};

// Extract creatives from API response
interface RocketiumVariation {
  _id: string;
  capsuleId?: string;
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

const extractCreativesFromResponse = (data: any): EvaluationCreative[] => {
  const extractedCreatives: EvaluationCreative[] = [];
  const seenUrls = new Set<string>();

  if (data.variations && Array.isArray(data.variations)) {
    data.variations.forEach((variation: RocketiumVariation) => {
      if (variation.savedCustomDimensions) {
        Object.entries(variation.savedCustomDimensions).forEach(
          ([dimensionKey, dimension]) => {
            if (dimension.creativeUrl && !seenUrls.has(dimension.creativeUrl)) {
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
                status: "pending",
              });
            }
          }
        );
      }
    });
  }

  return extractedCreatives;
};

/**
 * Create a new evaluation job
 * Returns shareable URL immediately while analysis runs in background
 */
export const createEvaluationJob = async (
  projectLink: string,
  platformId: string = "default"
): Promise<{
  success: boolean;
  shareableUrl?: string;
  jobId?: string;
  error?: string;
}> => {
  try {
    const projectId = extractProjectIdFromUrl(projectLink);
    if (!projectId) {
      return { success: false, error: "Invalid project link" };
    }

    const jobId = generateShareableId();
    const now = new Date().toISOString();

    // Fetch project data first
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

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to fetch project: ${response.status}`,
      };
    }

    const data = await response.json();
    const creatives = extractCreativesFromResponse(data);

    if (creatives.length === 0) {
      return { success: false, error: "No creatives found in project" };
    }

    const projectName = data.assetGroup?.name || null;

    // Create initial job record
    const jobData: EvaluationJob = {
      id: jobId,
      projectId,
      projectName,
      platformId,
      status: "pending",
      totalCreatives: creatives.length,
      analyzedCreatives: 0,
      creatives,
      createdAt: now,
      updatedAt: now,
    };

    // Save to Supabase
    const { error: insertError } = await supabase
      .from("evaluation_jobs")
      .insert({
        id: jobId,
        project_id: projectId,
        project_name: projectName,
        platform_id: platformId,
        status: "pending",
        total_creatives: creatives.length,
        analyzed_creatives: 0,
        creatives: JSON.stringify(creatives),
        created_at: now,
        updated_at: now,
      });

    if (insertError) {
      console.error("Failed to create evaluation job:", insertError);
      return { success: false, error: "Failed to create evaluation job" };
    }

    // Start background analysis (don't await)
    runBackgroundAnalysis(jobId, projectId, platformId, creatives, projectName);

    const shareableUrl = `${getAppBaseUrl()}/preview/${jobId}`;
    return { success: true, shareableUrl, jobId };
  } catch (error: any) {
    console.error("Error creating evaluation job:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Run analysis in background for all creatives
 */
const runBackgroundAnalysis = async (
  jobId: string,
  projectId: string,
  platformId: string,
  creatives: EvaluationCreative[],
  projectName?: string | null
) => {
  try {
    // Update status to analyzing
    await updateJobStatus(jobId, "analyzing");

    // Get platform config
    const platforms = await fetchPlatforms();
    const platform = platforms.find((p) => p.id === platformId) || platforms[0];

    // Analyze all creatives in parallel (with concurrency limit)
    const CONCURRENCY_LIMIT = 3;
    const results: EvaluationCreative[] = [...creatives];

    for (let i = 0; i < creatives.length; i += CONCURRENCY_LIMIT) {
      const batch = creatives.slice(i, i + CONCURRENCY_LIMIT);

      await Promise.all(
        batch.map(async (creative, batchIndex) => {
          const index = i + batchIndex;
          try {
            // Update creative status to analyzing
            results[index] = { ...results[index], status: "analyzing" };
            await updateJobCreatives(jobId, results, index + 1);

            // Analyze the creative
            const analyzed = await analyzeCreative(creative, platform);
            results[index] = analyzed;

            // Update progress
            await updateJobCreatives(jobId, results, index + 1);
          } catch (err: any) {
            console.error(`Failed to analyze creative ${creative.id}:`, err);
            results[index] = {
              ...results[index],
              status: "failed",
              error: err.message,
            };
            await updateJobCreatives(jobId, results, index + 1);
          }
        })
      );
    }

    // Mark job as completed
    await updateJobStatus(jobId, "completed");

    // Also save to project_evaluations for persistence
    const storedCreatives: StoredCreativeResult[] = results
      .filter((c) => c.complianceResults || c.analysisResult)
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
        analyzedAt: new Date().toISOString(),
        platformId,
      }));

    if (storedCreatives.length > 0) {
      await saveProjectEvaluation(
        projectId,
        platformId,
        storedCreatives,
        projectName || undefined
      );
    }
  } catch (error: any) {
    console.error("Background analysis failed:", error);
    await updateJobStatus(jobId, "failed", error.message);
  }
};

/**
 * Analyze a single creative
 */
const analyzeCreative = async (
  creative: EvaluationCreative,
  platform: PlatformConfig
): Promise<EvaluationCreative> => {
  try {
    // Fetch image and convert to base64
    const imageResponse = await fetch(creative.url);
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

    // Run analysis
    const analysisResult = await analyzeImageWithGemini(
      base64Data,
      mimeType,
      platform.prompt
    );

    // Run compliance check
    let complianceResults: ComplianceResult[] | undefined;
    let complianceScores: ComplianceScores | undefined;

    if (platform.complianceRules && platform.complianceRules.length > 0) {
      complianceResults = await checkComplianceWithGemini(
        base64Data,
        mimeType,
        platform.complianceRules
      );
      complianceScores = calculateComplianceScores(complianceResults);
    }

    return {
      ...creative,
      status: "completed",
      analysisResult,
      complianceResults,
      complianceScores,
    };
  } catch (error: any) {
    return {
      ...creative,
      status: "failed",
      error: error.message,
    };
  }
};

/**
 * Fetch platforms configuration
 */
const fetchPlatforms = async (): Promise<PlatformConfig[]> => {
  try {
    const res = await fetch("/api/platforms");
    if (res.ok) {
      return await res.json();
    }
    const staticRes = await fetch("/platforms.json");
    if (staticRes.ok) {
      return await staticRes.json();
    }
  } catch {
    // Fall back to defaults
  }
  return DEFAULT_PLATFORMS;
};

/**
 * Update job status in database
 */
const updateJobStatus = async (
  jobId: string,
  status: EvaluationJob["status"],
  error?: string
) => {
  await supabase
    .from("evaluation_jobs")
    .update({
      status,
      error,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
};

/**
 * Update job creatives and progress
 */
const updateJobCreatives = async (
  jobId: string,
  creatives: EvaluationCreative[],
  analyzedCount: number
) => {
  await supabase
    .from("evaluation_jobs")
    .update({
      creatives: JSON.stringify(creatives),
      analyzed_creatives: analyzedCount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
};

/**
 * Load evaluation job by ID
 */
export const loadEvaluationJob = async (
  jobId: string
): Promise<{ success: boolean; data?: EvaluationJob; error?: string }> => {
  try {
    const { data, error } = await supabase
      .from("evaluation_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return { success: false, error: "Evaluation not found" };
      }
      throw error;
    }

    if (data) {
      const job: EvaluationJob = {
        id: data.id,
        projectId: data.project_id,
        projectName: data.project_name,
        platformId: data.platform_id,
        status: data.status,
        totalCreatives: data.total_creatives,
        analyzedCreatives: data.analyzed_creatives,
        creatives:
          typeof data.creatives === "string"
            ? JSON.parse(data.creatives || "[]")
            : data.creatives || [],
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        error: data.error,
      };
      return { success: true, data: job };
    }

    return { success: false, error: "Evaluation not found" };
  } catch (error: any) {
    console.error("Error loading evaluation job:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Subscribe to real-time updates for an evaluation job
 */
export const subscribeToJobUpdates = (
  jobId: string,
  onUpdate: (job: EvaluationJob) => void
) => {
  const channel = supabase
    .channel(`evaluation-job-${jobId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "evaluation_jobs",
        filter: `id=eq.${jobId}`,
      },
      (payload) => {
        const data = payload.new as any;
        const job: EvaluationJob = {
          id: data.id,
          projectId: data.project_id,
          projectName: data.project_name,
          platformId: data.platform_id,
          status: data.status,
          totalCreatives: data.total_creatives,
          analyzedCreatives: data.analyzed_creatives,
          creatives:
            typeof data.creatives === "string"
              ? JSON.parse(data.creatives || "[]")
              : data.creatives || [],
          createdAt: data.created_at,
          updatedAt: data.updated_at,
          error: data.error,
        };
        onUpdate(job);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};

/**
 * Update a creative's attention result in an evaluation job
 */
export const updateJobCreativeAttention = async (
  jobId: string,
  creativeId: string,
  attentionResult: AttentionInsightResult
): Promise<{ success: boolean; error?: string }> => {
  try {
    // First, load the current job
    const { data: jobData, error: loadError } = await supabase
      .from("evaluation_jobs")
      .select("creatives")
      .eq("id", jobId)
      .single();

    if (loadError) {
      throw loadError;
    }

    // Parse creatives
    const creatives: EvaluationCreative[] =
      typeof jobData.creatives === "string"
        ? JSON.parse(jobData.creatives || "[]")
        : jobData.creatives || [];

    // Update the specific creative's attention result
    const updatedCreatives = creatives.map((c) =>
      c.id === creativeId ? { ...c, attentionResult } : c
    );

    // Save back to database
    const { error: updateError } = await supabase
      .from("evaluation_jobs")
      .update({
        creatives: JSON.stringify(updatedCreatives),
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    if (updateError) {
      throw updateError;
    }

    return { success: true };
  } catch (error: any) {
    console.error("Error updating creative attention result:", error);
    return { success: false, error: error.message };
  }
};
