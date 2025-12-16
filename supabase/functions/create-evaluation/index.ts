import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  EvaluationCreative,
  RocketiumVariation,
  PlatformConfig,
} from "../_shared/types.ts";
import {
  analyzeImageWithGemini,
  checkComplianceWithGemini,
  calculateComplianceScores,
} from "../_shared/gemini.ts";
import { DEFAULT_PLATFORMS } from "../_shared/platforms.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Helper function to convert ArrayBuffer to base64 without stack overflow
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192; // Process in chunks to avoid stack overflow
  let binary = "";

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

// Generate a unique shareable ID
const generateShareableId = (): string => {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `eval-${timestamp}-${randomPart}`;
};

// Extract project ID from URL
const extractProjectIdFromUrl = (input: string): string | null => {
  const trimmed = input.trim();

  const urlPattern = /\/campaign\/p\/([^\/]+)/;
  const match = trimmed.match(urlPattern);
  if (match && match[1]) return match[1];

  const simplePattern = /\/p\/([^\/]+)/;
  const simpleMatch = trimmed.match(simplePattern);
  if (simpleMatch && simpleMatch[1]) return simpleMatch[1];

  if (/^[a-zA-Z0-9-]+$/.test(trimmed)) return trimmed;

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

// Analyze a single creative
const analyzeCreative = async (
  creative: EvaluationCreative,
  platform: PlatformConfig
): Promise<EvaluationCreative> => {
  console.log(
    `[analyzeCreative] Starting analysis for creative: ${creative.id}`
  );
  console.log(`[analyzeCreative] Creative URL: ${creative.url}`);

  try {
    // Fetch image and convert to base64
    console.log(`[analyzeCreative] Fetching image...`);
    const imageResponse = await fetch(creative.url);

    if (!imageResponse.ok) {
      throw new Error(
        `Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`
      );
    }

    console.log(
      `[analyzeCreative] Image fetched successfully. Status: ${imageResponse.status}`
    );
    console.log(
      `[analyzeCreative] Content-Type: ${imageResponse.headers.get(
        "content-type"
      )}`
    );
    console.log(
      `[analyzeCreative] Content-Length: ${imageResponse.headers.get(
        "content-length"
      )}`
    );

    const arrayBuffer = await imageResponse.arrayBuffer();
    console.log(
      `[analyzeCreative] ArrayBuffer size: ${arrayBuffer.byteLength} bytes`
    );

    // Use chunked conversion to avoid stack overflow for large images
    const base64Data = arrayBufferToBase64(arrayBuffer);
    console.log(
      `[analyzeCreative] Base64 data length: ${base64Data.length} characters`
    );

    const mimeType = imageResponse.headers.get("content-type") || "image/png";
    console.log(`[analyzeCreative] Using mimeType: ${mimeType}`);

    // Run analysis
    console.log(`[analyzeCreative] Starting Gemini analysis...`);
    const analysisResult = await analyzeImageWithGemini(
      base64Data,
      mimeType,
      platform.prompt
    );
    console.log(
      `[analyzeCreative] Gemini analysis completed. Elements found: ${
        analysisResult.elements?.length || 0
      }`
    );

    // Run compliance check
    let complianceResults;
    let complianceScores;

    if (platform.complianceRules && platform.complianceRules.length > 0) {
      console.log(
        `[analyzeCreative] Starting compliance check with ${platform.complianceRules.length} rules...`
      );
      complianceResults = await checkComplianceWithGemini(
        base64Data,
        mimeType,
        platform.complianceRules
      );
      console.log(
        `[analyzeCreative] Compliance check completed. Results: ${
          complianceResults?.length || 0
        }`
      );

      complianceScores = calculateComplianceScores(complianceResults);
      console.log(
        `[analyzeCreative] Compliance scores calculated. Overall: ${complianceScores.overall}%`
      );
    }

    console.log(
      `[analyzeCreative] ✅ Creative ${creative.id} analysis completed successfully`
    );
    return {
      ...creative,
      status: "completed",
      analysisResult,
      complianceResults,
      complianceScores,
    };
  } catch (error: any) {
    console.error(
      `[analyzeCreative] ❌ Error analyzing creative ${creative.id}:`,
      error
    );
    console.error(`[analyzeCreative] Error stack:`, error.stack);
    return {
      ...creative,
      status: "failed",
      error: error.message,
    };
  }
};

// Background analysis function
const runBackgroundAnalysis = async (
  supabase: any,
  jobId: string,
  creatives: EvaluationCreative[],
  platformId: string
) => {
  console.log(
    `[runBackgroundAnalysis] 🚀 Starting background analysis for job: ${jobId}`
  );
  console.log(`[runBackgroundAnalysis] Total creatives: ${creatives.length}`);
  console.log(`[runBackgroundAnalysis] Platform ID: ${platformId}`);

  try {
    // Update status to analyzing
    console.log(
      `[runBackgroundAnalysis] Updating job status to 'analyzing'...`
    );
    const { error: updateError } = await supabase
      .from("evaluation_jobs")
      .update({ status: "analyzing", updated_at: new Date().toISOString() })
      .eq("id", jobId);

    if (updateError) {
      console.error(
        `[runBackgroundAnalysis] Failed to update status:`,
        updateError
      );
      throw updateError;
    }
    console.log(`[runBackgroundAnalysis] Status updated to 'analyzing'`);

    // Get platform config
    const platform =
      DEFAULT_PLATFORMS.find((p) => p.id === platformId) ||
      DEFAULT_PLATFORMS[0];
    console.log(
      `[runBackgroundAnalysis] Using platform: ${platform.name} (${platform.id})`
    );
    console.log(
      `[runBackgroundAnalysis] Compliance rules count: ${
        platform.complianceRules?.length || 0
      }`
    );

    // Analyze creatives with concurrency limit
    const CONCURRENCY_LIMIT = 3;
    const results: EvaluationCreative[] = [...creatives];
    console.log(
      `[runBackgroundAnalysis] Concurrency limit: ${CONCURRENCY_LIMIT}`
    );

    for (let i = 0; i < creatives.length; i += CONCURRENCY_LIMIT) {
      const batch = creatives.slice(i, i + CONCURRENCY_LIMIT);
      console.log(
        `[runBackgroundAnalysis] Processing batch ${
          Math.floor(i / CONCURRENCY_LIMIT) + 1
        }, creatives ${i + 1} to ${Math.min(
          i + CONCURRENCY_LIMIT,
          creatives.length
        )}`
      );

      await Promise.all(
        batch.map(async (creative, batchIndex) => {
          const index = i + batchIndex;
          console.log(
            `[runBackgroundAnalysis] Starting creative ${index + 1}/${
              creatives.length
            }: ${creative.id}`
          );

          try {
            results[index] = { ...results[index], status: "analyzing" };
            const { error: progressError } = await supabase
              .from("evaluation_jobs")
              .update({
                creatives: JSON.stringify(results),
                analyzed_creatives: index,
                updated_at: new Date().toISOString(),
              })
              .eq("id", jobId);

            if (progressError) {
              console.warn(
                `[runBackgroundAnalysis] Warning: Failed to update progress:`,
                progressError
              );
            }

            const analyzed = await analyzeCreative(creative, platform);
            results[index] = analyzed;
            console.log(
              `[runBackgroundAnalysis] Creative ${index + 1}/${
                creatives.length
              } status: ${analyzed.status}`
            );

            const { error: saveError } = await supabase
              .from("evaluation_jobs")
              .update({
                creatives: JSON.stringify(results),
                analyzed_creatives: index + 1,
                updated_at: new Date().toISOString(),
              })
              .eq("id", jobId);

            if (saveError) {
              console.warn(
                `[runBackgroundAnalysis] Warning: Failed to save result:`,
                saveError
              );
            }
          } catch (err: any) {
            console.error(
              `[runBackgroundAnalysis] ❌ Failed to analyze creative ${creative.id}:`,
              err
            );
            console.error(`[runBackgroundAnalysis] Error details:`, err.stack);
            results[index] = {
              ...results[index],
              status: "failed",
              error: err.message,
            };
          }
        })
      );
    }

    // Count results
    const completed = results.filter((r) => r.status === "completed").length;
    const failed = results.filter((r) => r.status === "failed").length;
    console.log(
      `[runBackgroundAnalysis] Analysis complete. Completed: ${completed}, Failed: ${failed}`
    );

    // Mark job as completed
    console.log(`[runBackgroundAnalysis] Marking job as completed...`);
    const { error: finalError } = await supabase
      .from("evaluation_jobs")
      .update({
        status: "completed",
        creatives: JSON.stringify(results),
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    if (finalError) {
      console.error(
        `[runBackgroundAnalysis] Failed to mark job as completed:`,
        finalError
      );
    } else {
      console.log(
        `[runBackgroundAnalysis] ✅ Job ${jobId} completed successfully`
      );
    }
  } catch (error: any) {
    console.error(
      `[runBackgroundAnalysis] ❌ Background analysis failed:`,
      error
    );
    console.error(`[runBackgroundAnalysis] Error stack:`, error.stack);

    const { error: failError } = await supabase
      .from("evaluation_jobs")
      .update({
        status: "failed",
        error: error.message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    if (failError) {
      console.error(
        `[runBackgroundAnalysis] Failed to mark job as failed:`,
        failError
      );
    }
  }
};

serve(async (req) => {
  console.log(`[create-evaluation] ========================================`);
  console.log(`[create-evaluation] Request received: ${req.method} ${req.url}`);
  console.log(`[create-evaluation] Timestamp: ${new Date().toISOString()}`);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    console.log(`[create-evaluation] CORS preflight request`);
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Check environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const geminiKey = Deno.env.get("GEMINI_API_KEY");

    console.log(
      `[create-evaluation] ENV Check - SUPABASE_URL: ${!!supabaseUrl}`
    );
    console.log(
      `[create-evaluation] ENV Check - SUPABASE_SERVICE_ROLE_KEY: ${!!supabaseKey}`
    );
    console.log(
      `[create-evaluation] ENV Check - GEMINI_API_KEY: ${!!geminiKey} (length: ${
        geminiKey?.length || 0
      })`
    );

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    console.log(`[create-evaluation] Supabase client created`);

    const body = await req.json();
    const { project_link, platform_id = "default", base_url } = body;
    console.log(
      `[create-evaluation] Request body:`,
      JSON.stringify(body, null, 2)
    );

    if (!project_link) {
      console.log(`[create-evaluation] Error: project_link is required`);
      return new Response(
        JSON.stringify({ success: false, error: "project_link is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const projectId = extractProjectIdFromUrl(project_link);
    console.log(`[create-evaluation] Extracted project ID: ${projectId}`);

    if (!projectId) {
      console.log(`[create-evaluation] Error: Invalid project link`);
      return new Response(
        JSON.stringify({ success: false, error: "Invalid project link" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const jobId = generateShareableId();
    const now = new Date().toISOString();
    console.log(`[create-evaluation] Generated job ID: ${jobId}`);

    // Fetch project data from Rocketium
    console.log(
      `[create-evaluation] Fetching project data from Rocketium API...`
    );
    const rocketiumUrl = `https://rocketium.com/api/v2/assetGroup/${projectId}/variations`;
    console.log(`[create-evaluation] Rocketium URL: ${rocketiumUrl}`);

    const response = await fetch(rocketiumUrl, {
      method: "GET",
      headers: { accept: "application/json" },
    });

    console.log(
      `[create-evaluation] Rocketium API response status: ${response.status}`
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[create-evaluation] Rocketium API error: ${errorText}`);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Failed to fetch project: ${response.status}`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const data = await response.json();
    console.log(
      `[create-evaluation] Rocketium data received. Variations: ${
        data.variations?.length || 0
      }`
    );

    const creatives = extractCreativesFromResponse(data);
    console.log(`[create-evaluation] Extracted creatives: ${creatives.length}`);

    if (creatives.length === 0) {
      console.log(`[create-evaluation] Error: No creatives found in project`);
      return new Response(
        JSON.stringify({
          success: false,
          error: "No creatives found in project",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const projectName = data.assetGroup?.name || null;
    console.log(`[create-evaluation] Project name: ${projectName}`);

    // Create job record
    console.log(`[create-evaluation] Creating job record in database...`);
    const { error: insertError } = await supabase
      .from("evaluation_jobs")
      .insert({
        id: jobId,
        project_id: projectId,
        project_name: projectName,
        platform_id: platform_id,
        status: "pending",
        total_creatives: creatives.length,
        analyzed_creatives: 0,
        creatives: JSON.stringify(creatives),
        created_at: now,
        updated_at: now,
      });

    if (insertError) {
      console.error(`[create-evaluation] Failed to create job:`, insertError);
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
    console.log(`[create-evaluation] Job record created successfully`);

    // Start background analysis (non-blocking)
    console.log(
      `[create-evaluation] Starting background analysis with EdgeRuntime.waitUntil...`
    );
    EdgeRuntime.waitUntil(
      runBackgroundAnalysis(supabase, jobId, creatives, platform_id)
    );
    console.log(`[create-evaluation] Background analysis started`);

    // Return shareable URL immediately
    const shareableUrl = base_url
      ? `${base_url}/preview/${jobId}`
      : `/preview/${jobId}`;

    console.log(
      `[create-evaluation] ✅ Success! Shareable URL: ${shareableUrl}`
    );

    return new Response(
      JSON.stringify({
        success: true,
        job_id: jobId,
        shareable_url: shareableUrl,
        project_id: projectId,
        project_name: projectName,
        total_creatives: creatives.length,
        status: "pending",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error(`[create-evaluation] ❌ Error:`, error);
    console.error(`[create-evaluation] Error stack:`, error.stack);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
