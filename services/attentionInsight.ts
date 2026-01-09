/**
 * Attention Insight API Integration
 * Analyzes images to generate attention heatmaps and focus metrics
 * API Docs: https://ext-api.attentioninsight.com/api/v2/studies
 */

export interface AttentionArea {
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  width: number; // percentage
  height: number; // percentage
  score: number; // AOI value (attention percentage)
  label?: string;
  recommendation?: {
    name: string;
    description: string;
    colorIndicator: "red" | "yellow" | "green";
  };
}

export interface AttentionInsightResult {
  studyId: string;
  heatmapUrl: string;
  clarityScore: number; // 0-100
  clarityDescription: string;
  clarityKey: string;
  focusScore: number; // 0-100
  benchmarkDescription: string;
  benchmarkPercentile: number; // e.g., 57 means "lower than 57%"
  attentionAreas: AttentionArea[];
  metrics: {
    topThird: number;
    middleThird: number;
    bottomThird: number;
    leftHalf: number;
    rightHalf: number;
  };
  suggestions: string[];
  status: "pending" | "processing" | "completed" | "failed";
}

interface StudyStatusResponse {
  success: boolean;
  message: string;
  data: {
    study_id: string;
    status: string;
    tasks: {
      clarity_score_status_status?: string;
      auto_aoi_status_status?: string;
      heatmap_status_status?: string;
      focus_status_status?: string;
      contrast_status_status?: string;
    };
  };
}

// API Configuration
const ATTENTION_INSIGHT_API_URL = "https://ext-api.attentioninsight.com/api/v2";

/**
 * Get API key from environment or config
 */
const getApiKey = (): string => {
  const envKey = (import.meta as any).env?.VITE_ATTENTION_INSIGHT_API_KEY;
  if (envKey) return envKey;

  const processKey =
    typeof process !== "undefined" && process.env?.ATTENTION_INSIGHT_API_KEY;
  if (processKey) return processKey;

  throw new Error(
    "Attention Insight API key not configured. Set VITE_ATTENTION_INSIGHT_API_KEY environment variable."
  );
};

/**
 * Create a study and wait for results
 */
export const analyzeWithAttentionInsight = async (
  imageUrl: string,
  studyName?: string
): Promise<AttentionInsightResult> => {
  try {
    const apiKey = getApiKey();

    // Fetch the image and convert to blob
    const imageResponse = await fetch(imageUrl);
    const imageBlob = await imageResponse.blob();

    // Extract filename from URL
    const urlPath = imageUrl.split("?")[0];
    const fileName = urlPath.split("/").pop() || "image.png";

    // Create FormData for multipart request
    const formData = new FormData();
    formData.append("study_name", studyName || `Analysis_${Date.now()}`);
    formData.append("study_type", "web");
    formData.append("content_type", "general");
    formData.append("file", imageBlob, fileName);

    // Add analysis tasks
    formData.append("tasks[]", "focus");
    formData.append("tasks[]", "clarity_score");
    formData.append("tasks[]", "auto_aoi");
    formData.append("tasks[]", "contrast");

    // Step 1: Create study
    const createResponse = await fetch(`${ATTENTION_INSIGHT_API_URL}/studies`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": apiKey,
      },
      body: formData,
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(
        `Failed to create study: ${createResponse.status} - ${errorText}`
      );
    }

    const createData = await createResponse.json();
    console.log("Study created:", createData);

    if (!createData.success || !createData.data?.study_id) {
      throw new Error("Failed to create study: No study_id returned");
    }

    const studyId = createData.data.study_id;

    // Step 2: Poll for completion
    await waitForStudyCompletion(studyId, apiKey);

    // Step 3: Get study details and heatmap
    const result = await fetchStudyResults(studyId, apiKey);

    return result;
  } catch (error: any) {
    console.error("Error analyzing with Attention Insight:", error);
    throw error;
  }
};

/**
 * Poll study status until all tasks are complete
 */
const waitForStudyCompletion = async (
  studyId: string,
  apiKey: string,
  maxAttempts: number = 60,
  intervalMs: number = 2000
): Promise<void> => {
  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(
      `${ATTENTION_INSIGHT_API_URL}/studies/${studyId}/status`,
      {
        method: "GET",
        headers: {
          accept: "application/json",
          "api-key": apiKey,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to get study status: ${response.status} - ${errorText}`
      );
    }

    const statusData: StudyStatusResponse = await response.json();
    console.log(`Study ${studyId} status:`, statusData);

    if (!statusData.success) {
      throw new Error("Failed to get study status");
    }

    if (statusData.data.status === "finished") {
      console.log("Study analysis completed!");
      return;
    }

    const tasks = statusData.data.tasks;
    const allCompleted =
      tasks.clarity_score_status_status === "finished" &&
      tasks.heatmap_status_status === "finished" &&
      tasks.focus_status_status === "finished";

    const anyFailed =
      tasks.clarity_score_status_status === "failed" ||
      tasks.heatmap_status_status === "failed" ||
      tasks.focus_status_status === "failed";

    if (anyFailed) {
      throw new Error("Study analysis failed");
    }

    if (allCompleted) {
      console.log("Study analysis completed!");
      return;
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error("Study analysis timed out");
};

/**
 * Fetch study details and heatmap image
 */
const fetchStudyResults = async (
  studyId: string,
  apiKey: string
): Promise<AttentionInsightResult> => {
  // Fetch study details
  const detailsResponse = await fetch(
    `${ATTENTION_INSIGHT_API_URL}/studies/${studyId}`,
    {
      method: "GET",
      headers: {
        accept: "application/json",
        "api-key": apiKey,
      },
    }
  );

  if (!detailsResponse.ok) {
    const errorText = await detailsResponse.text();
    throw new Error(
      `Failed to get study details: ${detailsResponse.status} - ${errorText}`
    );
  }

  const detailsData = await detailsResponse.json();
  console.log("Study details:", detailsData);

  // Fetch heatmap image
  const heatmapResponse = await fetch(
    `${ATTENTION_INSIGHT_API_URL}/studies/${studyId}/image?image=heatmap`,
    {
      method: "GET",
      headers: {
        accept: "application/json",
        "api-key": apiKey,
      },
    }
  );

  let heatmapUrl = "";
  if (heatmapResponse.ok) {
    heatmapUrl = heatmapResponse.url;
    console.log("Heatmap data:", heatmapUrl);
  }

  return transformApiResponse(detailsData, heatmapUrl, studyId);
};

/**
 * Transform API response to internal format
 */
const transformApiResponse = (
  data: any,
  heatmapUrl: string,
  studyId: string
): AttentionInsightResult => {
  const study = data.data || data.study || data;

  // Extract aesthetics data
  const aesthetics = study.aesthetics || {};
  const clarityScore = aesthetics.clarity_score ?? study.clarity_score ?? 0;
  const clarityDescription = aesthetics.clarity_description || "Unknown";
  const clarityKey = aesthetics.clarity_key || "";
  const focusScore = aesthetics.focus_score ?? study.focus_score ?? 0;

  // Extract benchmark data
  const benchmark = study.benchmark || {};
  const benchmarkDescription =
    aesthetics.benchmark_description || benchmark.description || "";
  const benchmarkPercentile = benchmark.average ?? 0;

  // Extract annotations (AOIs - Areas of Interest)
  const annotations = study.annotations || [];
  const attentionAreas: AttentionArea[] = annotations.map(
    (annotation: any, idx: number) => {
      const geometry = annotation.geometry || {};
      const aoiData = annotation.data || {};
      const benchmarkInfo = aoiData.benchmark || aoiData.recommendations || {};

      return {
        x: geometry.x ?? 0,
        y: geometry.y ?? 0,
        width: geometry.width ?? 0,
        height: geometry.height ?? 0,
        score: Math.round((aoiData.aoiValue ?? 0) * 100), // Convert to percentage
        label: aoiData.text || `Area ${idx + 1}`,
        recommendation: benchmarkInfo.name
          ? {
              name: benchmarkInfo.name,
              description: benchmarkInfo.description || "",
              colorIndicator: benchmarkInfo.colorIndicator || "yellow",
            }
          : undefined,
      };
    }
  );

  // Calculate distribution metrics from areas
  const metrics = calculateMetrics(attentionAreas);

  // Generate suggestions from annotations and scores
  const suggestions = generateSuggestionsFromData(
    clarityScore,
    focusScore,
    attentionAreas,
    clarityDescription
  );

  return {
    studyId,
    heatmapUrl,
    clarityScore: Math.round(clarityScore),
    clarityDescription,
    clarityKey,
    focusScore: Math.round(focusScore),
    benchmarkDescription,
    benchmarkPercentile,
    attentionAreas,
    metrics: {
      topThird: metrics.topThird,
      middleThird: metrics.middleThird,
      bottomThird: metrics.bottomThird,
      leftHalf: metrics.leftHalf,
      rightHalf: metrics.rightHalf,
    },
    suggestions,
    status: "completed",
  };
};

/**
 * Calculate distribution metrics from attention areas
 * Note: Area coordinates are in percentages (0-100)
 */
const calculateMetrics = (areas: AttentionArea[]) => {
  if (areas.length === 0) {
    return {
      topThird: 33,
      middleThird: 34,
      bottomThird: 33,
      leftHalf: 50,
      rightHalf: 50,
    };
  }

  let topThird = 0,
    middleThird = 0,
    bottomThird = 0,
    leftHalf = 0,
    rightHalf = 0;
  let totalScore = 0;

  areas.forEach((area) => {
    // Coordinates are in percentages (0-100)
    const centerY = area.y + area.height / 2;
    const centerX = area.x + area.width / 2;
    const score = area.score || 1; // Use 1 if no score
    totalScore += score;

    // Vertical distribution (33.33%, 66.66%)
    if (centerY < 33.33) topThird += score;
    else if (centerY < 66.66) middleThird += score;
    else bottomThird += score;

    // Horizontal distribution (50%)
    if (centerX < 50) leftHalf += score;
    else rightHalf += score;
  });

  if (totalScore > 0) {
    return {
      topThird: Math.round((topThird / totalScore) * 100),
      middleThird: Math.round((middleThird / totalScore) * 100),
      bottomThird: Math.round((bottomThird / totalScore) * 100),
      leftHalf: Math.round((leftHalf / totalScore) * 100),
      rightHalf: Math.round((rightHalf / totalScore) * 100),
    };
  }

  return {
    topThird: 33,
    middleThird: 34,
    bottomThird: 33,
    leftHalf: 50,
    rightHalf: 50,
  };
};

/**
 * Generate suggestions based on analysis results
 */
const generateSuggestionsFromData = (
  clarityScore: number,
  focusScore: number,
  areas: AttentionArea[],
  clarityDescription: string
): string[] => {
  const suggestions: string[] = [];

  // Add recommendations from annotations
  areas.forEach((area) => {
    if (area.recommendation && area.recommendation.colorIndicator === "red") {
      suggestions.push(`${area.label}: ${area.recommendation.description}`);
    }
  });

  // Add clarity-based suggestions
  if (clarityScore < 50) {
    suggestions.push(
      `Clarity is "${clarityDescription}" - consider simplifying the design`
    );
  } else if (clarityScore >= 80) {
    suggestions.push(
      "Excellent clarity score - the design has a clear focal point"
    );
  }

  // Add focus-based suggestions
  if (focusScore < 40) {
    suggestions.push(
      "Low focus score - attention is scattered across the design"
    );
  } else if (focusScore >= 70) {
    suggestions.push("Good focus score - users will easily find key elements");
  }

  // Add yellow warning recommendations
  areas.forEach((area) => {
    if (
      area.recommendation &&
      area.recommendation.colorIndicator === "yellow"
    ) {
      suggestions.push(`${area.label}: ${area.recommendation.description}`);
    }
  });

  if (suggestions.length === 0) {
    suggestions.push("The design has balanced attention distribution");
  }

  return suggestions;
};

/**
 * Create a study with a File/Blob directly
 */
export const analyzeFileWithAttentionInsight = async (
  file: File | Blob,
  fileName: string = "image.png",
  studyName?: string
): Promise<AttentionInsightResult> => {
  try {
    const apiKey = getApiKey();

    const formData = new FormData();
    formData.append("study_name", studyName || `Analysis_${Date.now()}`);
    formData.append("study_type", "web");
    formData.append("content_type", "general");
    formData.append("file", file, fileName);

    // Add analysis tasks
    formData.append("tasks[]", "focus");
    formData.append("tasks[]", "clarity_score");
    formData.append("tasks[]", "auto_aoi");
    formData.append("tasks[]", "contrast");

    // Create study
    const createResponse = await fetch(`${ATTENTION_INSIGHT_API_URL}/studies`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": apiKey,
      },
      body: formData,
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(
        `Failed to create study: ${createResponse.status} - ${errorText}`
      );
    }

    const createData = await createResponse.json();
    if (!createData.success || !createData.data?.study_id) {
      throw new Error("Failed to create study: No study_id returned");
    }

    const studyId = createData.data.study_id;

    // Poll and fetch results
    await waitForStudyCompletion(studyId, apiKey);
    return await fetchStudyResults(studyId, apiKey);
  } catch (error: any) {
    console.error("Error analyzing with Attention Insight:", error);
    throw error;
  }
};

/**
 * Get study results by ID (public function for manual polling)
 */
export const getStudyResults = async (
  studyId: string
): Promise<AttentionInsightResult> => {
  const apiKey = getApiKey();
  return fetchStudyResults(studyId, apiKey);
};

/**
 * Generate a mock result for development/testing
 */
export const generateMockAttentionResult = (
  imageUrl: string
): AttentionInsightResult => {
  const clarityScore = Math.floor(Math.random() * 40) + 40;
  const focusScore = Math.floor(Math.random() * 30) + 50;

  return {
    studyId: `mock_${Date.now()}`,
    heatmapUrl: imageUrl,
    clarityScore,
    clarityDescription:
      clarityScore < 50 ? "Moderate difficulty" : "Good clarity",
    clarityKey: clarityScore < 50 ? "moderate_clarity" : "good_clarity",
    focusScore,
    benchmarkDescription: `You have ${
      clarityScore < 50 ? "lower" : "higher"
    } clarity than ${Math.floor(Math.random() * 30) + 40}% of popular websites`,
    benchmarkPercentile: Math.floor(Math.random() * 30) + 40,
    attentionAreas: [
      {
        x: 10,
        y: 10,
        width: 30,
        height: 20,
        score: 3,
        label: "Logo",
        recommendation: {
          name: "Good Logo Visibility",
          description: "Logo is well positioned",
          colorIndicator: "green",
        },
      },
      {
        x: 30,
        y: 70,
        width: 15,
        height: 8,
        score: 2,
        label: "CTA",
        recommendation: {
          name: "Low CTA",
          description: "Your CTA's visibility is below the 2.4% average",
          colorIndicator: "red",
        },
      },
    ],
    metrics: {
      topThird: Math.floor(Math.random() * 40) + 30,
      middleThird: Math.floor(Math.random() * 50) + 25,
      bottomThird: Math.floor(Math.random() * 35) + 15,
      leftHalf: Math.floor(Math.random() * 30) + 35,
      rightHalf: Math.floor(Math.random() * 30) + 35,
    },
    suggestions: [
      "CTA: Your CTA's visibility is below the 2.4% average",
      "Consider moving the CTA button higher for better visibility",
    ],
    status: "completed",
  };
};

/**
 * Check if API key is configured
 */
export const isAttentionInsightConfigured = (): boolean => {
  try {
    getApiKey();
    return true;
  } catch {
    return false;
  }
};
