// Types for evaluation jobs
export interface EvaluationJob {
  id: string;
  project_id: string;
  project_name?: string;
  platform_id: string;
  status: "pending" | "analyzing" | "completed" | "failed";
  total_creatives: number;
  analyzed_creatives: number;
  creatives: EvaluationCreative[];
  created_at: string;
  updated_at: string;
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
  error?: string;
}

export interface AnalysisResult {
  elements: AnalysisElement[];
}

export interface AnalysisElement {
  id: string;
  content: string;
  category: string;
  box: {
    ymin: number;
    xmin: number;
    ymax: number;
    xmax: number;
  };
  polygon?: { x: number; y: number }[];
}

export interface ComplianceResult {
  rule: string;
  status: "PASS" | "FAIL" | "WARNING";
  reasoning: string;
  suggestion?: string;
  category?: string;
  severity?: string;
}

export interface ComplianceScores {
  overall: number;
  brand: number;
  accessibility: number;
  policy: number;
  quality: number;
  breakdown: {
    passed: number;
    failed: number;
    warnings: number;
    total: number;
  };
}

export interface PlatformConfig {
  id: string;
  name: string;
  category?: string;
  prompt?: string;
  complianceRules?: string[];
  imageSpecs?: {
    allowedFormats?: string[];
    maxFileSizeKB?: number;
    aspectRatios?: string[];
    minWidth?: number;
    maxWidth?: number;
    minHeight?: number;
    maxHeight?: number;
    minDPI?: number;
  };
  localizationRules?: {
    region: string;
    language?: string;
    rules: string[];
  }[];
}

export interface RocketiumVariation {
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
      [key: string]: unknown;
    }
  >;
  [key: string]: unknown;
}
