import { supabase } from "../lib/supabase";
import {
  analyzeImageWithGemini,
  calculateComplianceScores,
  checkComplianceWithGemini,
} from "./gemini";
import {
  StoredCreativeResult,
  saveProjectEvaluation,
} from "./projectEvaluation";
import { DEFAULT_PLATFORMS } from "../constants/platforms";
import { getFetchableAssetUrl } from "../lib/assetProxy";
import { extractProjectIdFromUrl, parseRocketiumSource } from "../lib/rocketiumSource";
import { buildEvaluationRules, buildPromptLayerConfig } from "../lib/ruleBundle";
import {
  createPrecisionUnavailableResults,
  partitionRulesByEngine,
} from "../lib/precisionRules";
import {
  AnalysisResult,
  AttentionInsightResult,
  BrandConfig,
  ComplianceResult,
  ComplianceRuleDefinition,
  ComplianceScores,
  EvaluationJobMetadata,
  PlatformConfig,
  PromptLayerConfig,
  RocketiumSource,
  RuleMode,
} from "../types";

export interface EvaluationJob {
  id: string;
  projectId: string;
  projectName?: string;
  platformId: string;
  brandId?: string;
  brandName?: string;
  ruleMode?: RuleMode;
  sourceType?: "single" | "assetpreview";
  sourceProjectIds: string[];
  workspaceShortId?: string;
  inputUrl?: string;
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
  capsuleId?: string;
  variationName?: string;
  sourceProjectId?: string;
  sourceProjectName?: string;
  width?: number;
  height?: number;
  status: "pending" | "analyzing" | "completed" | "failed";
  analysisResult?: AnalysisResult;
  complianceResults?: ComplianceResult[];
  complianceScores?: ComplianceScores;
  attentionResult?: AttentionInsightResult;
  error?: string;
}

export interface CreateEvaluationJobOptions {
  platform?: PlatformConfig | null;
  brand?: BrandConfig | null;
  ruleMode?: RuleMode;
  rocketiumUserId?: string;
  rocketiumSessionId?: string;
}

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

interface SourceProjectPayload {
  projectId: string;
  projectName?: string;
  creatives: EvaluationCreative[];
}

const generateShareableId = (): string => {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `eval-${timestamp}-${randomPart}`;
};

const getApiBaseUrl = () => {
  if (typeof window === "undefined") return "https://rocketium.com";
  const env = (import.meta as any).env;
  return (
    env?.VITE_ROCKETIUM_API_BASE_URL?.replace(/\/$/, "") ||
    "https://rocketium.com"
  );
};

const getAppBaseUrl = () => {
  if (typeof window === "undefined") return "";
  return window.location.origin;
};

const getSupabaseFunctionBase = () => {
  const env = (import.meta as any).env;
  const supabaseUrl = env?.VITE_SUPABASE_URL?.replace(/\/$/, "");
  const supabaseAnonKey = env?.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return {
    url: `${supabaseUrl}/functions/v1`,
    anonKey: supabaseAnonKey,
  };
};

const parseMetadata = (metadata: unknown): EvaluationJobMetadata => {
  if (!metadata) {
    return {};
  }

  if (typeof metadata === "string") {
    try {
      return JSON.parse(metadata) as EvaluationJobMetadata;
    } catch {
      return {};
    }
  }

  if (typeof metadata === "object") {
    return metadata as EvaluationJobMetadata;
  }

  return {};
};

const parseEvaluationJobRecord = (data: any): EvaluationJob => {
  const metadata = parseMetadata(data.metadata);
  const creatives =
    typeof data.creatives === "string"
      ? JSON.parse(data.creatives || "[]")
      : data.creatives || [];

  return {
    id: data.id,
    projectId: data.project_id,
    projectName: data.project_name,
    platformId: data.platform_id,
    brandId: metadata.brandId,
    brandName: metadata.brandName,
    ruleMode: metadata.ruleMode,
    sourceType: metadata.sourceType || "single",
    sourceProjectIds: metadata.sourceProjectIds || [data.project_id].filter(Boolean),
    workspaceShortId: metadata.workspaceShortId,
    inputUrl: metadata.inputUrl,
    status: data.status,
    totalCreatives: data.total_creatives,
    analyzedCreatives: data.analyzed_creatives,
    creatives,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    error: data.error,
  };
};

const buildJobMetadata = ({
  source,
  brand,
  ruleMode,
}: {
  source: RocketiumSource;
  brand?: BrandConfig | null;
  ruleMode: RuleMode;
}): EvaluationJobMetadata => ({
  sourceType: source.sourceType,
  sourceProjectIds: source.projectIds,
  workspaceShortId: source.workspaceShortId,
  inputUrl: source.inputUrl,
  brandId: brand?.id,
  brandName: brand?.name,
  ruleMode,
});

const extractCreativesFromResponse = (
  data: any,
  sourceProjectId: string,
  sourceProjectName?: string
): EvaluationCreative[] => {
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
                id: `${sourceProjectId}-${variation.capsuleId || variation._id}-${dimensionKey}`,
                url: dimension.creativeUrl,
                name: dimension.name || dimensionKey,
                dimensionKey,
                variationId: variation.capsuleId || variation._id,
                capsuleId: variation.capsuleId,
                variationName: variation.name,
                sourceProjectId,
                sourceProjectName,
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

const fetchProjectPayload = async (
  projectId: string
): Promise<SourceProjectPayload> => {
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
    throw new Error(`Failed to fetch project ${projectId}: ${response.status}`);
  }

  const data = await response.json();
  const projectName = data.assetGroup?.name || undefined;
  const creatives = extractCreativesFromResponse(data, projectId, projectName);

  return {
    projectId,
    projectName,
    creatives,
  };
};

const fetchSourceProjects = async (
  source: RocketiumSource
): Promise<SourceProjectPayload[]> => {
  const results: SourceProjectPayload[] = [];
  const CONCURRENCY_LIMIT = 3;

  for (let index = 0; index < source.projectIds.length; index += CONCURRENCY_LIMIT) {
    const batch = source.projectIds.slice(index, index + CONCURRENCY_LIMIT);
    const batchResults = await Promise.all(batch.map(fetchProjectPayload));
    results.push(...batchResults);
  }

  return results;
};

const createJobRecord = async ({
  jobId,
  source,
  projectName,
  platform,
  brand,
  ruleMode,
  creatives,
}: {
  jobId: string;
  source: RocketiumSource;
  projectName?: string;
  platform: PlatformConfig;
  brand?: BrandConfig | null;
  ruleMode: RuleMode;
  creatives: EvaluationCreative[];
}) => {
  const now = new Date().toISOString();
  const metadata = buildJobMetadata({ source, brand, ruleMode });

  const { error } = await supabase.from("evaluation_jobs").insert({
    id: jobId,
    project_id: source.projectIds[0],
    project_name: projectName || null,
    platform_id: platform.id,
    status: "pending",
    total_creatives: creatives.length,
    analyzed_creatives: 0,
    creatives: JSON.stringify(creatives),
    metadata,
    created_at: now,
    updated_at: now,
  });

  if (error) {
    throw error;
  }
};

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

const analyzeCreative = async ({
  creative,
  prompt,
  rules,
  promptLayers,
}: {
  creative: EvaluationCreative;
  prompt: string;
  rules: ComplianceRuleDefinition[];
  promptLayers?: PromptLayerConfig;
}): Promise<EvaluationCreative> => {
  try {
    const { visualRules, precisionRules } = partitionRulesByEngine(rules);
    const imageResponse = await fetch(getFetchableAssetUrl(creative.url));
    if (!imageResponse.ok) {
      throw new Error(
        `Failed to fetch creative ${creative.id}: ${imageResponse.status}`
      );
    }

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
      prompt,
      promptLayers
    );

    let complianceResults: ComplianceResult[] | undefined;
    let complianceScores: ComplianceScores | undefined;

    if (visualRules.length > 0) {
      complianceResults = await checkComplianceWithGemini(
        base64Data,
        mimeType,
        visualRules,
        promptLayers,
        analysisResult
      );
    }

    if (precisionRules.length > 0) {
      const skippedResults = createPrecisionUnavailableResults(
        precisionRules,
        "Fact-based capsule checks are only available through the backend evaluation job path."
      );
      complianceResults = [...(complianceResults || []), ...skippedResults];
    }

    if (complianceResults?.length) {
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

const runBackgroundAnalysis = async ({
  jobId,
  source,
  platform,
  brand,
  ruleMode,
  rules,
  creatives,
  projectName,
}: {
  jobId: string;
  source: RocketiumSource;
  platform: PlatformConfig;
  brand?: BrandConfig | null;
  ruleMode: RuleMode;
  rules: ComplianceRuleDefinition[];
  creatives: EvaluationCreative[];
  projectName?: string;
}) => {
  try {
    await updateJobStatus(jobId, "analyzing");

    const results: EvaluationCreative[] = [...creatives];
    const CONCURRENCY_LIMIT = 3;

    for (let index = 0; index < creatives.length; index += CONCURRENCY_LIMIT) {
      const batch = creatives.slice(index, index + CONCURRENCY_LIMIT);

      await Promise.all(
        batch.map(async (creative, batchIndex) => {
          const resultIndex = index + batchIndex;

          results[resultIndex] = { ...results[resultIndex], status: "analyzing" };
          await updateJobCreatives(jobId, results, resultIndex);

          const analyzed = await analyzeCreative({
            creative,
            prompt: platform.prompt,
            rules,
            promptLayers: buildPromptLayerConfig({
              platform,
              brand,
              ruleMode,
            }),
          });

          results[resultIndex] = analyzed;
          await updateJobCreatives(jobId, results, resultIndex + 1);
        })
      );
    }

    await updateJobStatus(jobId, "completed");

    if (source.projectIds.length === 1 && ruleMode === "platform") {
      const storedCreatives: StoredCreativeResult[] = results
        .filter((creative) => creative.complianceResults || creative.analysisResult)
        .map((creative) => ({
          creativeId: creative.variationId
            ? `${creative.variationId}-${creative.dimensionKey}`
            : creative.id,
          creativeUrl: creative.url,
          creativeName: creative.name,
          dimensionKey: creative.dimensionKey,
          variationId: creative.variationId,
          variationName: creative.variationName,
          width: creative.width,
          height: creative.height,
          analysisResult: creative.analysisResult,
          complianceResults: creative.complianceResults,
          complianceScores: creative.complianceScores,
          analyzedAt: new Date().toISOString(),
          platformId: platform.id,
        }));

      if (storedCreatives.length > 0) {
        await saveProjectEvaluation(
          source.projectIds[0],
          platform.id,
          storedCreatives,
          projectName
        );
      }
    }
  } catch (error: any) {
    console.error("Background analysis failed:", error);
    await updateJobStatus(jobId, "failed", error.message);
  }
};

const createEvaluationJobViaFunction = async ({
  projectLink,
  platform,
  brand,
  ruleMode,
  rules,
  rocketiumUserId,
  rocketiumSessionId,
}: {
  projectLink: string;
  platform: PlatformConfig;
  brand?: BrandConfig | null;
  ruleMode: RuleMode;
  rules: ComplianceRuleDefinition[];
  rocketiumUserId?: string;
  rocketiumSessionId?: string;
}) => {
  const functionBase = getSupabaseFunctionBase();
  if (!functionBase) {
    throw new Error("Supabase function configuration is missing");
  }

  const response = await fetch(`${functionBase.url}/create-evaluation`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${functionBase.anonKey}`,
    },
    body: JSON.stringify({
      project_link: projectLink,
      platform_id: platform.id,
      platform_prompt: platform.prompt,
      platform_system_prompt: platform.systemPrompt,
      brand_id: brand?.id,
      brand_name: brand?.name,
      brand_description: brand?.description,
      brand_system_prompt: brand?.systemPrompt,
      rule_mode: ruleMode,
      rocketium_user_id: rocketiumUserId,
      rocketium_session_id: rocketiumSessionId,
      rules,
      base_url: getAppBaseUrl(),
    }),
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(
      data.error || `Failed to create evaluation job (${response.status})`
    );
  }

  return {
    success: true,
    shareableUrl: data.shareable_url as string,
    jobId: data.job_id as string,
  };
};

const createEvaluationJobLocally = async ({
  projectLink,
  source,
  platform,
  brand,
  ruleMode,
  rules,
}: {
  projectLink: string;
  source: RocketiumSource;
  platform: PlatformConfig;
  brand?: BrandConfig | null;
  ruleMode: RuleMode;
  rules: ComplianceRuleDefinition[];
}): Promise<{
  success: boolean;
  shareableUrl?: string;
  jobId?: string;
  error?: string;
}> => {
  try {
    const projectPayloads = await fetchSourceProjects(source);
    const creatives = projectPayloads.flatMap((payload) => payload.creatives);

    if (creatives.length === 0) {
      return { success: false, error: "No creatives found in project source" };
    }

    const projectName =
      projectPayloads.length === 1
        ? projectPayloads[0].projectName
        : `${projectPayloads.length} projects`;

    const jobId = generateShareableId();
    await createJobRecord({
      jobId,
      source,
      projectName,
      platform,
      brand,
      ruleMode,
      creatives,
    });

    void runBackgroundAnalysis({
      jobId,
      source,
      platform,
      brand,
      ruleMode,
      rules,
      creatives,
      projectName,
    });

    return {
      success: true,
      shareableUrl: `${getAppBaseUrl()}/preview/${jobId}`,
      jobId,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

export { extractProjectIdFromUrl };

export const createEvaluationJob = async (
  projectLink: string,
  options: CreateEvaluationJobOptions = {}
): Promise<{
  success: boolean;
  shareableUrl?: string;
  jobId?: string;
  error?: string;
}> => {
  try {
    const source = parseRocketiumSource(projectLink);
    if (!source) {
      return { success: false, error: "Invalid Rocketium project link" };
    }

    const platform = options.platform || DEFAULT_PLATFORMS[0];
    const ruleMode = options.ruleMode || "platform";
    const brand = options.brand || null;
    const rocketiumUserId = options.rocketiumUserId?.trim() || "";
    const rocketiumSessionId = options.rocketiumSessionId?.trim() || "";

    if ((ruleMode === "brand" || ruleMode === "combined") && !brand) {
      return { success: false, error: "Please select a brand rule set." };
    }

    const rules = buildEvaluationRules({ platform, brand, ruleMode });

    try {
      return await createEvaluationJobViaFunction({
        projectLink,
        platform,
        brand,
        ruleMode,
        rules,
        rocketiumUserId,
        rocketiumSessionId,
      });
    } catch (functionError) {
      console.warn(
        "Falling back to local evaluation job creation:",
        functionError
      );

      return await createEvaluationJobLocally({
        projectLink,
        source,
        platform,
        brand,
        ruleMode,
        rules,
      });
    }
  } catch (error: any) {
    console.error("Error creating evaluation job:", error);
    return { success: false, error: error.message };
  }
};

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

    return { success: true, data: parseEvaluationJobRecord(data) };
  } catch (error: any) {
    console.error("Error loading evaluation job:", error);
    return { success: false, error: error.message };
  }
};

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
        onUpdate(parseEvaluationJobRecord(payload.new));
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};

export const updateJobCreativeAttention = async (
  jobId: string,
  creativeId: string,
  attentionResult: AttentionInsightResult
): Promise<{ success: boolean; error?: string }> => {
  try {
    const functionBase = getSupabaseFunctionBase();

    if (!functionBase) {
      throw new Error("Missing Supabase environment variables");
    }

    const response = await fetch(`${functionBase.url}/update-attention`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${functionBase.anonKey}`,
      },
      body: JSON.stringify({
        job_id: jobId,
        creative_id: creativeId,
        attention_result: attentionResult,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(
        data.error || `Request failed with status ${response.status}`
      );
    }

    return { success: true };
  } catch (error: any) {
    console.error("Error updating creative attention result:", error);
    return { success: false, error: error.message };
  }
};
