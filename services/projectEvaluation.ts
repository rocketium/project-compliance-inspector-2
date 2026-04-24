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
  evaluationJobId?: string;
  projectId: string;
  projectName?: string;
  platformId: string;
  creatives: StoredCreativeResult[];
  createdAt?: string;
  updatedAt?: string;
}

export interface SaveProjectEvaluationOptions {
  evaluationId?: string;
  evaluationJobId?: string;
}

const LOCAL_EVALUATION_STORAGE_KEY = "rocketium.project-evaluation-runs";

const createEvaluationId = (): string => {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `eval-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const mapStoredProjectEvaluation = (data: any): StoredProjectEvaluation => ({
  id: data.id,
  evaluationJobId: data.evaluation_job_id || undefined,
  projectId: data.project_id,
  projectName: data.project_name,
  platformId: data.platform_id,
  creatives:
    typeof data.creatives === "string"
      ? JSON.parse(data.creatives || "[]")
      : data.creatives || [],
  createdAt: data.created_at,
  updatedAt: data.updated_at,
});

const getEvaluationTimestamp = (evaluation?: StoredProjectEvaluation): number => {
  if (!evaluation?.updatedAt) return 0;
  const parsed = Date.parse(evaluation.updatedAt);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const readLocalProjectEvaluations = (): StoredProjectEvaluation[] => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(LOCAL_EVALUATION_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeLocalProjectEvaluations = (evaluations: StoredProjectEvaluation[]) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      LOCAL_EVALUATION_STORAGE_KEY,
      JSON.stringify(evaluations)
    );
  } catch {
    // Ignore local storage failures
  }
};

const mergeProjectEvaluations = (
  primary: StoredProjectEvaluation[],
  secondary: StoredProjectEvaluation[]
): StoredProjectEvaluation[] => {
  const merged = new Map<string, StoredProjectEvaluation>();

  [...secondary, ...primary].forEach((evaluation) => {
    const key =
      evaluation.id ||
      evaluation.evaluationJobId ||
      `${evaluation.projectId}:${evaluation.updatedAt || ""}`;
    const existing = merged.get(key);

    if (!existing || getEvaluationTimestamp(evaluation) >= getEvaluationTimestamp(existing)) {
      merged.set(key, evaluation);
    }
  });

  return Array.from(merged.values()).sort(
    (a, b) => getEvaluationTimestamp(b) - getEvaluationTimestamp(a)
  );
};

const upsertLocalProjectEvaluation = (evaluation: StoredProjectEvaluation) => {
  const existing = readLocalProjectEvaluations();
  const key =
    evaluation.id ||
    evaluation.evaluationJobId ||
    `${evaluation.projectId}:${evaluation.updatedAt || ""}`;
  const filtered = existing.filter((item) => {
    const itemKey =
      item.id ||
      item.evaluationJobId ||
      `${item.projectId}:${item.updatedAt || ""}`;
    return itemKey !== key;
  });

  writeLocalProjectEvaluations(
    mergeProjectEvaluations([evaluation], filtered)
  );
};

const removeLocalProjectEvaluation = (evaluationId: string): boolean => {
  const existing = readLocalProjectEvaluations();
  const filtered = existing.filter((evaluation) => evaluation.id !== evaluationId);

  if (filtered.length === existing.length) {
    return false;
  }

  writeLocalProjectEvaluations(filtered);
  return true;
};

const getLocalProjectEvaluation = (
  projectId: string,
  evaluationId?: string
): StoredProjectEvaluation | undefined => {
  const evaluations = readLocalProjectEvaluations().filter(
    (evaluation) =>
      evaluation.projectId === projectId &&
      (!evaluationId || evaluation.id === evaluationId)
  );

  return evaluations.sort(
    (a, b) => getEvaluationTimestamp(b) - getEvaluationTimestamp(a)
  )[0];
};

/**
 * Save or update project evaluation results to Supabase
 * Uses upsert to avoid CORS issues with PATCH method
 */
export const saveProjectEvaluation = async (
  projectId: string,
  platformId: string,
  creatives: StoredCreativeResult[],
  projectName?: string,
  options: SaveProjectEvaluationOptions = {}
): Promise<{ success: boolean; error?: string; evaluationId?: string }> => {
  const evaluationId =
    options.evaluationId || options.evaluationJobId || createEvaluationId();
  const localEvaluation: StoredProjectEvaluation = {
    id: evaluationId,
    evaluationJobId: options.evaluationJobId,
    projectId,
    projectName,
    platformId,
    creatives,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    const now = new Date().toISOString();
    const evaluationData = {
      project_id: projectId,
      project_name: projectName || null,
      platform_id: platformId,
      creatives: JSON.stringify(creatives),
      updated_at: now,
      created_at: now, // Will be ignored on conflict/update
      ...(options.evaluationJobId
        ? {
            evaluation_job_id: options.evaluationJobId,
          }
        : {
            id: evaluationId,
            evaluation_job_id: null,
          }),
    };

    // Use upsert with onConflict to handle both insert and update
    // This uses POST method which avoids CORS issues with PATCH
    const { error: upsertError } = await supabase
      .from("project_evaluations")
      .upsert(evaluationData, {
        onConflict: options.evaluationJobId ? "evaluation_job_id" : "id",
        ignoreDuplicates: false,
      });

    if (upsertError) throw upsertError;

    return { success: true, evaluationId };
  } catch (error: any) {
    console.error("Error saving project evaluation:", error);
    upsertLocalProjectEvaluation(localEvaluation);
    return {
      success: true,
      evaluationId,
      error: error.message,
    };
  }
};

/**
 * Load project evaluation results from Supabase
 */
export const loadProjectEvaluation = async (
  projectId: string,
  evaluationId?: string
): Promise<{
  success: boolean;
  data?: StoredProjectEvaluation;
  error?: string;
}> => {
  const localEvaluation = getLocalProjectEvaluation(projectId, evaluationId);

  try {
    let query = supabase
      .from("project_evaluations")
      .select("*")
      .eq("project_id", projectId);

    if (evaluationId) {
      query = query.eq("id", evaluationId);
    } else {
      query = query.order("updated_at", { ascending: false }).limit(1);
    }

    const { data, error } = await query.maybeSingle();

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
      const evaluation = mapStoredProjectEvaluation(data);
      if (
        localEvaluation &&
        getEvaluationTimestamp(localEvaluation) > getEvaluationTimestamp(evaluation)
      ) {
        return { success: true, data: localEvaluation };
      }
      return { success: true, data: evaluation };
    }

    return { success: true, data: localEvaluation };
  } catch (error: any) {
    // Log but don't fail - just means no saved data available
    console.warn(
      "Could not load saved evaluation (table may not exist):",
      error.message
    );
    return { success: true, data: localEvaluation };
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
  existingCreatives: StoredCreativeResult[],
  options: SaveProjectEvaluationOptions = {}
): Promise<{ success: boolean; error?: string; evaluationId?: string }> => {
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

  return saveProjectEvaluation(
    projectId,
    platformId,
    updatedCreatives,
    undefined,
    options
  );
};

/**
 * Delete project evaluation from Supabase
 */
export const deleteProjectEvaluation = async (
  evaluationId: string
): Promise<{ success: boolean; error?: string }> => {
  const removedLocal = removeLocalProjectEvaluation(evaluationId);

  try {
    const { error } = await supabase
      .from("project_evaluations")
      .delete()
      .eq("id", evaluationId);

    if (error) throw error;

    return { success: true };
  } catch (error: any) {
    console.error("Error deleting project evaluation:", error);
    if (removedLocal) {
      return { success: true };
    }
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
  const localEvaluations = readLocalProjectEvaluations();

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

    const evaluations: StoredProjectEvaluation[] = (data || []).map(
      mapStoredProjectEvaluation
    );

    return {
      success: true,
      data: mergeProjectEvaluations(evaluations, localEvaluations),
    };
  } catch (error: any) {
    console.warn("Could not load project evaluations:", error.message);
    return { success: true, data: localEvaluations };
  }
};
