import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { saveProjectEvaluationSnapshot } from "../_shared/projectEvaluation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  console.log(`[update-attention] Request received: ${req.method}`);

  // Handle CORS preflight
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
    const { job_id, creative_id, attention_result } = body;

    console.log(
      `[update-attention] Job ID: ${job_id}, Creative ID: ${creative_id}`
    );

    if (!job_id || !creative_id || !attention_result) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "job_id, creative_id, and attention_result are required",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Load current job
    const { data: jobData, error: loadError } = await supabase
      .from("evaluation_jobs")
      .select("project_id, project_name, platform_id, metadata, creatives")
      .eq("id", job_id)
      .single();

    if (loadError) {
      console.error(`[update-attention] Load error:`, loadError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to load evaluation job",
          details: loadError.message,
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parse and update creatives
    const creatives =
      typeof jobData.creatives === "string"
        ? JSON.parse(jobData.creatives || "[]")
        : jobData.creatives || [];
    const metadata =
      typeof jobData.metadata === "string"
        ? JSON.parse(jobData.metadata || "{}")
        : jobData.metadata || {};

    const updatedCreatives = creatives.map((c: any) =>
      c.id === creative_id ? { ...c, attentionResult: attention_result } : c
    );

    // Save back to database
    const { error: updateError } = await supabase
      .from("evaluation_jobs")
      .update({
        creatives: JSON.stringify(updatedCreatives),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job_id);

    if (updateError) {
      console.error(`[update-attention] Update error:`, updateError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to update attention result",
          details: updateError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if ((metadata.sourceType || "single") === "single") {
      await saveProjectEvaluationSnapshot({
        supabase,
        projectId: jobData.project_id,
        projectName: jobData.project_name,
        platformId: jobData.platform_id,
        creatives: updatedCreatives,
      });
    }

    console.log(
      `[update-attention] ✅ Successfully updated attention for creative ${creative_id}`
    );

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error(`[update-attention] ❌ Error:`, error);
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
