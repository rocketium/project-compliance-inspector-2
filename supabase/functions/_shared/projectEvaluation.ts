import { EvaluationCreative } from "./types.ts";

const getStoredCreativeId = (creative: EvaluationCreative) =>
  creative.variationId
    ? `${creative.variationId}-${creative.dimensionKey}`
    : creative.id;

export const saveProjectEvaluationSnapshot = async ({
  supabase,
  projectId,
  projectName,
  platformId,
  creatives,
}: {
  supabase: any;
  projectId: string;
  projectName?: string | null;
  platformId: string;
  creatives: EvaluationCreative[];
}) => {
  const storedCreatives = creatives
    .filter((creative) => creative.analysisResult || creative.complianceResults)
    .map((creative) => ({
      creativeId: getStoredCreativeId(creative),
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
      attentionResult: creative.attentionResult,
      analyzedAt: new Date().toISOString(),
      platformId,
    }));

  if (storedCreatives.length === 0) {
    return;
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from("project_evaluations").upsert(
    {
      project_id: projectId,
      project_name: projectName || null,
      platform_id: platformId,
      creatives: storedCreatives,
      updated_at: now,
      created_at: now,
    },
    {
      onConflict: "project_id",
      ignoreDuplicates: false,
    }
  );

  if (error) {
    throw error;
  }
};
