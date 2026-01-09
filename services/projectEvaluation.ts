import { supabase } from "../lib/supabase";
import { AnalysisResult, ComplianceResult, ComplianceScores, AttentionInsightResult } from "../types";

// Types for stored evaluation data
export interface StoredCreativeResult {
  creativeId: string;
  creativeUrl: string;
  creativeName: string;
  dimensionKey: string;
  variationId: string;
  variationName?: string;
  width?: number;
  height?: number;
  analysisResult?: AnalysisResult;
  complianceResults?: ComplianceResult[];
  complianceScores?: ComplianceScores;
  attentionResult?: AttentionInsightResult;
  analyzedAt?: string;
  platformId?: string;
}

export interface StoredProjectEvaluation {
  id?: string;
  projectId: string;
  projectName?: string;
  platformId: string;
  creatives: StoredCreativeResult[];
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Save or update project evaluation results to Supabase
 * Uses upsert to avoid CORS issues with PATCH method
 */
export const saveProjectEvaluation = async (
  projectId: string,
  platformId: string,
  creatives: StoredCreativeResult[],
  projectName?: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const now = new Date().toISOString();

    const evaluationData = {
      project_id: projectId,
      project_name: projectName || null,
      platform_id: platformId,
      creatives: JSON.stringify(creatives),
      updated_at: now,
      created_at: now, // Will be ignored on conflict/update
    };

    // Use upsert with onConflict to handle both insert and update
    // This uses POST method which avoids CORS issues with PATCH
    const { error: upsertError } = await supabase
      .from("project_evaluations")
      .upsert(evaluationData, {
        onConflict: "project_id",
        ignoreDuplicates: false,
      });

    if (upsertError) throw upsertError;

    return { success: true };
  } catch (error: any) {
    console.error("Error saving project evaluation:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Load project evaluation results from Supabase
 */
export const loadProjectEvaluation = async (
  projectId: string
): Promise<{
  success: boolean;
  data?: StoredProjectEvaluation;
  error?: string;
}> => {
  try {
    const { data, error } = await supabase
      .from("project_evaluations")
      .select("*")
      .eq("project_id", projectId)
      .single();

    if (error) {
      // PGRST116 = no rows returned (empty result)
      // 42P01 = table doesn't exist
      // PGRST204 = table doesn't exist (REST API)
      if (
        error.code === "PGRST116" ||
        error.code === "42P01" ||
        error.code === "PGRST204" ||
        error.message?.includes("does not exist") ||
        error.message?.includes("0 rows")
      ) {
        // No data found or table doesn't exist - not an error, just no saved data
        console.log("No saved evaluation found for project:", projectId);
        return { success: true, data: undefined };
      }
      throw error;
    }

    if (data) {
      const evaluation: StoredProjectEvaluation = {
        id: data.id,
        projectId: data.project_id,
        projectName: data.project_name,
        platformId: data.platform_id,
        creatives:
          typeof data.creatives === "string"
            ? JSON.parse(data.creatives || "[]")
            : data.creatives || [],
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
      return { success: true, data: evaluation };
    }

    return { success: true, data: undefined };
  } catch (error: any) {
    // Log but don't fail - just means no saved data available
    console.warn(
      "Could not load saved evaluation (table may not exist):",
      error.message
    );
    return { success: true, data: undefined };
  }
};

/**
 * Save a single creative's evaluation result
 * This is useful for incremental saves as each creative completes
 */
export const saveCreativeResult = async (
  projectId: string,
  platformId: string,
  creativeResult: StoredCreativeResult,
  existingCreatives: StoredCreativeResult[]
): Promise<{ success: boolean; error?: string }> => {
  // Update or add the creative result
  const updatedCreatives = [...existingCreatives];
  const existingIndex = updatedCreatives.findIndex(
    (c) => c.creativeId === creativeResult.creativeId
  );

  if (existingIndex >= 0) {
    updatedCreatives[existingIndex] = creativeResult;
  } else {
    updatedCreatives.push(creativeResult);
  }

  return saveProjectEvaluation(projectId, platformId, updatedCreatives);
};

/**
 * Delete project evaluation from Supabase
 */
export const deleteProjectEvaluation = async (
  projectId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase
      .from("project_evaluations")
      .delete()
      .eq("project_id", projectId);

    if (error) throw error;

    return { success: true };
  } catch (error: any) {
    console.error("Error deleting project evaluation:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Load all project evaluations from Supabase (for history view)
 */
export const loadAllProjectEvaluations = async (): Promise<{
  success: boolean;
  data?: StoredProjectEvaluation[];
  error?: string;
}> => {
  try {
    const { data, error } = await supabase
      .from("project_evaluations")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) {
      // Table doesn't exist or other error
      if (
        error.code === "42P01" ||
        error.code === "PGRST204" ||
        error.message?.includes("does not exist")
      ) {
        console.log("Project evaluations table doesn't exist yet");
        return { success: true, data: [] };
      }
      throw error;
    }

    const evaluations: StoredProjectEvaluation[] = (data || []).map((item) => ({
      id: item.id,
      projectId: item.project_id,
      projectName: item.project_name,
      platformId: item.platform_id,
      creatives:
        typeof item.creatives === "string"
          ? JSON.parse(item.creatives || "[]")
          : item.creatives || [],
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }));

    return { success: true, data: evaluations };
  } catch (error: any) {
    console.warn("Could not load project evaluations:", error.message);
    return { success: true, data: [] };
  }
};
