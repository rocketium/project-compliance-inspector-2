import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  ComplianceRuleDefinition,
  EvaluationCreative,
  PlatformConfig,
  RocketiumVariation,
} from "../_shared/types.ts";
import {
  analyzeImageWithGemini,
  calculateComplianceScores,
  checkComplianceWithGemini,
} from "../_shared/gemini.ts";
import { loadCapsuleDocument, loadCapsuleDocuments } from "../_shared/mongoCapsules.ts";
import { DEFAULT_PLATFORMS } from "../_shared/platforms.ts";
import { PromptLayerConfig } from "../_shared/promptLayers.ts";
import { saveProjectEvaluationSnapshot } from "../_shared/projectEvaluation.ts";
import { parseRocketiumSource } from "../_shared/source.ts";
import {
  buildCapsuleSnapshot,
  createPrecisionUnavailableResults,
  evaluatePrecisionRules,
  partitionRulesByEngine,
  resolveCapsuleSizeId,
} from "../../../lib/precisionRules.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const generateShareableId = (): string => {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `eval-${timestamp}-${randomPart}`;
};

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  let binary = "";

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
};

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

const fetchProjectPayload = async (projectId: string) => {
  const rocketiumUrl = `https://rocketium.com/api/v2/assetGroup/${projectId}/variations`;
  const response = await fetch(rocketiumUrl, {
    method: "GET",
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch project ${projectId}: ${response.status}`);
  }

  const data = await response.json();
  const projectName = data.assetGroup?.name || undefined;

  return {
    projectId,
    projectName,
    creatives: extractCreativesFromResponse(data, projectId, projectName),
  };
};

const fetchSourceProjects = async (projectIds: string[]) => {
  const results: Array<{
    projectId: string;
    projectName?: string;
    creatives: EvaluationCreative[];
  }> = [];
  const CONCURRENCY_LIMIT = 3;

  for (let index = 0; index < projectIds.length; index += CONCURRENCY_LIMIT) {
    const batch = projectIds.slice(index, index + CONCURRENCY_LIMIT);
    const batchResults = await Promise.all(batch.map(fetchProjectPayload));
    results.push(...batchResults);
  }

  return results;
};

const analyzeCreative = async ({
  supabase,
  creative,
  platformPrompt,
  rules,
  promptLayers,
  capsuleCache,
  snapshotCache,
  rocketiumUserId,
  rocketiumSessionId,
}: {
  supabase: any;
  creative: EvaluationCreative;
  platformPrompt: string;
  rules: string[] | ComplianceRuleDefinition[];
  promptLayers?: PromptLayerConfig;
  capsuleCache: Map<string, Promise<Record<string, unknown> | null>>;
  snapshotCache: Map<string, ReturnType<typeof buildCapsuleSnapshot>>;
  rocketiumUserId?: string;
  rocketiumSessionId?: string;
}): Promise<EvaluationCreative> => {
  try {
    const compiledRules = Array.isArray(rules)
      ? (rules as ComplianceRuleDefinition[])
      : [];
    const { visualRules, precisionRules } = partitionRulesByEngine(compiledRules);
    const imageResponse = await fetch(creative.url);

    if (!imageResponse.ok) {
      throw new Error(
        `Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`
      );
    }

    const arrayBuffer = await imageResponse.arrayBuffer();
    const base64Data = arrayBufferToBase64(arrayBuffer);
    const mimeType = imageResponse.headers.get("content-type") || "image/png";

    const analysisResult = await analyzeImageWithGemini(
      base64Data,
      mimeType,
      platformPrompt,
      promptLayers
    );

    let complianceResults: any[] = [];
    let complianceScores;

    if (visualRules.length > 0) {
      const visualResults = await checkComplianceWithGemini(
        base64Data,
        mimeType,
        visualRules,
        promptLayers,
        analysisResult
      );
      complianceResults = [...complianceResults, ...visualResults];
    }

    if (precisionRules.length > 0) {
      const capsuleLookupId = creative.capsuleId || creative.variationId;

      if (!rocketiumUserId || !rocketiumSessionId) {
        complianceResults = [
          ...complianceResults,
          ...createPrecisionUnavailableResults(
            precisionRules,
            "Rocketium user/session details are missing, so fact-based checks were skipped."
          ),
        ];
      } else if (!capsuleLookupId) {
        complianceResults = [
          ...complianceResults,
          ...createPrecisionUnavailableResults(
            precisionRules,
            "Capsule ID is not available for this creative, so fact-based checks were skipped."
          ),
        ];
      } else {
        const cacheKey = capsuleLookupId;
        if (!capsuleCache.has(cacheKey)) {
          capsuleCache.set(
            cacheKey,
            loadCapsuleDocument(capsuleLookupId, {
              userId: rocketiumUserId,
              sessionId: rocketiumSessionId,
            })
          );
        }
        const capsuleDoc = await capsuleCache.get(cacheKey)!;

        if (!capsuleDoc) {
          complianceResults = [
            ...complianceResults,
            ...createPrecisionUnavailableResults(
              precisionRules,
              `No capsule document was found through the capsule lookup service for capsule ID ${capsuleLookupId}.`
            ),
          ];
        } else {
          const sizeId = resolveCapsuleSizeId({
            capsuleDoc,
            dimensionKey: creative.dimensionKey,
            width: creative.width,
            height: creative.height,
          });

          if (!sizeId) {
            complianceResults = [
              ...complianceResults,
              ...createPrecisionUnavailableResults(
                precisionRules,
                `No matching capsule size was found for creative ${creative.name}.`
              ),
            ];
          } else {
            const snapshotKey = `${capsuleLookupId}:${sizeId}`;
            if (!snapshotCache.has(snapshotKey)) {
              snapshotCache.set(
                snapshotKey,
                buildCapsuleSnapshot({
                  capsuleDoc,
                  sizeId,
                })
              );
            }

            const snapshot = snapshotCache.get(snapshotKey)!;
            const precisionResults = evaluatePrecisionRules({
              snapshot,
              rules: precisionRules,
            });
            complianceResults = [...complianceResults, ...precisionResults];
          }
        }
      }
    }

    if (complianceResults.length > 0) {
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
  supabase,
  jobId,
  projectId,
  projectName,
  platformId,
  shouldPersistProjectEvaluation,
  creatives,
  platformPrompt,
  rules,
  promptLayers,
  rocketiumUserId,
  rocketiumSessionId,
}: {
  supabase: any;
  jobId: string;
  projectId: string;
  projectName?: string;
  platformId: string;
  shouldPersistProjectEvaluation: boolean;
  creatives: EvaluationCreative[];
  platformPrompt: string;
  rules: string[] | ComplianceRuleDefinition[];
  promptLayers?: PromptLayerConfig;
  rocketiumUserId?: string;
  rocketiumSessionId?: string;
}) => {
  try {
    const capsuleCache = new Map<string, Promise<Record<string, unknown> | null>>();
    const snapshotCache = new Map<string, ReturnType<typeof buildCapsuleSnapshot>>();
    const compiledRules = Array.isArray(rules)
      ? (rules as ComplianceRuleDefinition[])
      : [];
    const { precisionRules } = partitionRulesByEngine(compiledRules);

    if (
      precisionRules.length > 0 &&
      rocketiumUserId &&
      rocketiumSessionId
    ) {
      const capsuleIds = Array.from(
        new Set(
          creatives
            .map((creative) => creative.capsuleId || creative.variationId)
            .filter(Boolean)
        )
      ) as string[];

      if (capsuleIds.length > 0) {
        const capsuleDocs = await loadCapsuleDocuments(capsuleIds, {
          userId: rocketiumUserId,
          sessionId: rocketiumSessionId,
        });

        capsuleIds.forEach((capsuleId) => {
          capsuleCache.set(
            capsuleId,
            Promise.resolve(capsuleDocs.get(capsuleId) || null)
          );
        });
      }
    }

    const sanitizeCreativesForStorage = (items: EvaluationCreative[]) =>
      items.map(({ ...creative }) => creative);

    await supabase
      .from("evaluation_jobs")
      .update({ status: "analyzing", updated_at: new Date().toISOString() })
      .eq("id", jobId);

    const results: EvaluationCreative[] = [...creatives];
    const CONCURRENCY_LIMIT = 3;

    for (let index = 0; index < creatives.length; index += CONCURRENCY_LIMIT) {
      const batch = creatives.slice(index, index + CONCURRENCY_LIMIT);

      await Promise.all(
        batch.map(async (creative, batchIndex) => {
          const resultIndex = index + batchIndex;
          results[resultIndex] = { ...results[resultIndex], status: "analyzing" };

          await supabase
            .from("evaluation_jobs")
            .update({
              creatives: JSON.stringify(sanitizeCreativesForStorage(results)),
              analyzed_creatives: resultIndex,
              updated_at: new Date().toISOString(),
            })
            .eq("id", jobId);

          const analyzed = await analyzeCreative({
            supabase,
            creative,
            platformPrompt,
            rules,
            promptLayers,
            capsuleCache,
            snapshotCache,
            rocketiumUserId,
            rocketiumSessionId,
          });

          results[resultIndex] = analyzed;

          await supabase
            .from("evaluation_jobs")
            .update({
              creatives: JSON.stringify(sanitizeCreativesForStorage(results)),
              analyzed_creatives: resultIndex + 1,
              updated_at: new Date().toISOString(),
            })
            .eq("id", jobId);
        })
      );
    }

    await supabase
      .from("evaluation_jobs")
      .update({
        status: "completed",
        creatives: JSON.stringify(sanitizeCreativesForStorage(results)),
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    if (shouldPersistProjectEvaluation) {
      await saveProjectEvaluationSnapshot({
        supabase,
        evaluationJobId: jobId,
        projectId,
        projectName,
        platformId,
        creatives: results,
      });
    }
  } catch (error: any) {
    console.error("Background analysis failed:", error);
    await supabase
      .from("evaluation_jobs")
      .update({
        status: "failed",
        error: error.message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const {
      project_link,
      platform_id = "default",
      platform_prompt,
      platform_system_prompt,
      brand_id,
      brand_name,
      brand_description,
      brand_system_prompt,
      rule_mode = "platform",
      rocketium_user_id,
      rocketium_session_id,
      rules = [],
      base_url,
    } = body;

    if (!project_link) {
      return new Response(
        JSON.stringify({ success: false, error: "project_link is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const source = parseRocketiumSource(project_link);
    if (!source) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid project link" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const projectPayloads = await fetchSourceProjects(source.projectIds);
    const creatives = projectPayloads.flatMap((payload) => payload.creatives);

    if (creatives.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "No creatives found in project source",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const platform =
      DEFAULT_PLATFORMS.find((item) => item.id === platform_id) ||
      DEFAULT_PLATFORMS[0];
    const compiledRules =
      Array.isArray(rules) && rules.length > 0
        ? ((rules as Array<string | ComplianceRuleDefinition>).map((rule, index) =>
            typeof rule === "string"
              ? {
                  id: `platform:${platform_id}:${index}`,
                  title: `Platform Rule ${index + 1}`,
                  instruction: rule,
                  engine: "visual",
                  source: "platform",
                  severity: "major",
                }
              : rule
          ) as ComplianceRuleDefinition[])
        : (platform.complianceRules || []).map((rule, index) => ({
            id: `platform:${platform_id}:${index}`,
            title: `Platform Rule ${index + 1}`,
            instruction: rule,
            engine: "visual" as const,
            source: "platform" as const,
            severity: "major" as const,
          }));
    const promptToUse = platform_prompt || platform.prompt || DEFAULT_PLATFORMS[0].prompt;
    const promptLayers: PromptLayerConfig = {
      platformName: platform.name,
      platformSystemPrompt: platform_system_prompt || platform.systemPrompt,
      brandName: brand_name || undefined,
      brandDescription: brand_description || undefined,
      brandSystemPrompt: brand_system_prompt || undefined,
      ruleMode: rule_mode,
    };

    const jobId = generateShareableId();
    const projectName =
      projectPayloads.length === 1
        ? projectPayloads[0].projectName
        : `${projectPayloads.length} projects`;
    const metadata = {
      sourceType: source.sourceType,
      sourceProjectIds: source.projectIds,
      workspaceShortId: source.workspaceShortId,
      inputUrl: source.inputUrl,
      brandId: brand_id || undefined,
      brandName: brand_name || undefined,
      ruleMode: rule_mode,
    };
    const now = new Date().toISOString();

    const { error: insertError } = await supabase
      .from("evaluation_jobs")
      .insert({
        id: jobId,
        project_id: source.projectIds[0],
        project_name: projectName,
        platform_id: platform_id,
        status: "pending",
        total_creatives: creatives.length,
        analyzed_creatives: 0,
        creatives: JSON.stringify(creatives),
        metadata,
        created_at: now,
        updated_at: now,
      });

    if (insertError) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to create evaluation job",
          details: insertError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    EdgeRuntime.waitUntil(
      runBackgroundAnalysis({
        supabase,
        jobId,
        projectId: source.projectIds[0],
        projectName,
        platformId: platform_id,
        shouldPersistProjectEvaluation: true,
        creatives,
        platformPrompt: promptToUse,
        rules: compiledRules,
        promptLayers,
        rocketiumUserId: rocketium_user_id,
        rocketiumSessionId: rocketium_session_id,
      })
    );

    const shareableUrl = base_url
      ? `${base_url}/preview/${jobId}`
      : `/preview/${jobId}`;

    return new Response(
      JSON.stringify({
        success: true,
        job_id: jobId,
        shareable_url: shareableUrl,
        project_id: source.projectIds[0],
        project_name: projectName,
        total_creatives: creatives.length,
        status: "pending",
        source_type: source.sourceType,
        source_project_ids: source.projectIds,
        workspace_short_id: source.workspaceShortId,
        brand_id: brand_id || undefined,
        brand_name: brand_name || undefined,
        rule_mode,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("create-evaluation error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
