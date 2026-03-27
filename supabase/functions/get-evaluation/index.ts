import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { EvaluationCreative } from "../_shared/types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const parseMetadata = (value: unknown) => {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return typeof value === "object" ? value : {};
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get job_id from query params or body
    let jobId: string | null = null;

    const url = new URL(req.url);
    jobId = url.searchParams.get("job_id");

    if (!jobId && req.method === "POST") {
      const body = await req.json();
      jobId = body.job_id;
    }

    if (!jobId) {
      return new Response(
        JSON.stringify({ success: false, error: "job_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch job from database
    const { data, error } = await supabase
      .from("evaluation_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return new Response(
          JSON.stringify({ success: false, error: "Evaluation not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw error;
    }

    // Parse creatives JSON
    const creatives: EvaluationCreative[] =
      typeof data.creatives === "string"
        ? JSON.parse(data.creatives || "[]")
        : data.creatives || [];
    const metadata = parseMetadata(data.metadata);

    // Calculate summary stats
    const completedCreatives = creatives.filter((c) => c.status === "completed");
    const failedCreatives = creatives.filter((c) => c.status === "failed");

    let avgScore = 0;
    let totalPassed = 0;
    let totalFailed = 0;
    let totalWarnings = 0;

    completedCreatives.forEach((c) => {
      if (c.complianceScores) {
        avgScore += c.complianceScores.overall;
        totalPassed += c.complianceScores.breakdown.passed;
        totalFailed += c.complianceScores.breakdown.failed;
        totalWarnings += c.complianceScores.breakdown.warnings;
      }
    });

    if (completedCreatives.length > 0) {
      avgScore = Math.round(avgScore / completedCreatives.length);
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          id: data.id,
          project_id: data.project_id,
          project_name: data.project_name,
          platform_id: data.platform_id,
          status: data.status,
          total_creatives: data.total_creatives,
          analyzed_creatives: data.analyzed_creatives,
          creatives: creatives,
          metadata,
          source_type: metadata.sourceType || "single",
          source_project_ids: metadata.sourceProjectIds || [data.project_id],
          workspace_short_id: metadata.workspaceShortId,
          brand_id: metadata.brandId,
          brand_name: metadata.brandName,
          rule_mode: metadata.ruleMode,
          created_at: data.created_at,
          updated_at: data.updated_at,
          error: data.error,
          summary: {
            avg_score: avgScore,
            completed: completedCreatives.length,
            failed: failedCreatives.length,
            pending: creatives.filter((c) => c.status === "pending").length,
            analyzing: creatives.filter((c) => c.status === "analyzing").length,
            compliance: {
              passed: totalPassed,
              failed: totalFailed,
              warnings: totalWarnings,
            },
          },
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
