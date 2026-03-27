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
  metadata?: Record<string, unknown>;
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
  ruleId?: string;
  ruleTitle?: string;
  ruleSource?: "platform" | "brand";
  checkType?: string;
  brandId?: string;
  engine?: "visual" | "precision";
  actualValue?: string | number | boolean;
  expectedValue?: string | number | boolean;
  matchedLayerName?: string;
  matchedLayerId?: string;
  referenceLayerName?: string;
  evaluationMessage?: string;
  relatedElementIds?: string[];
}

export type PrecisionSelectorType = "layerName" | "textContent";
export type PrecisionLayerKind = "text" | "shape" | "image";

export type PrecisionFact =
  | "fontSize"
  | "fontWeight"
  | "fontFamilyName"
  | "fontFamilyId"
  | "fontStyle"
  | "textAlign"
  | "textFill"
  | "fill"
  | "cornerRadius"
  | "opacity"
  | "objectFit"
  | "imageWidth"
  | "imageHeight"
  | "imageLeft"
  | "imageTop"
  | "scale"
  | "scaleX"
  | "scaleY"
  | "x"
  | "y"
  | "width"
  | "height"
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "centerX"
  | "centerY"
  | "wordStyle.fontSize"
  | "wordStyle.fontWeight"
  | "wordStyle.fontFamilyName"
  | "wordStyle.fontFamilyId"
  | "wordStyle.fontStyle"
  | "wordStyle.superscript"
  | "wordStyle.subscript"
  | "wordStyle.deltaY";

export type PrecisionOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between";

export interface PrecisionSelector {
  type: PrecisionSelectorType;
  value: string;
  layerKind?: PrecisionLayerKind;
}

export interface PrecisionLayerFactRef {
  kind: "layerFact";
  selector: PrecisionSelector;
  fact: PrecisionFact;
  wordStyleText?: string;
}

export interface PrecisionLiteralRef {
  kind: "literal";
  value: string | number | boolean;
}

export type PrecisionOperand = PrecisionLayerFactRef | PrecisionLiteralRef;

export interface PrecisionRuleConfig {
  selector: PrecisionSelector;
  fact: PrecisionFact;
  operator: PrecisionOperator;
  expected?: string | number | boolean;
  reference?: PrecisionLayerFactRef;
  min?: PrecisionOperand;
  max?: PrecisionOperand;
  wordStyleText?: string;
}

export interface ComplianceRuleDefinition {
  id: string;
  title: string;
  instruction: string;
  checkType?: string;
  severity?: "critical" | "major" | "minor";
  enabled?: boolean;
  engine?: "visual" | "precision";
  source?: "platform" | "brand";
  brandId?: string;
  precisionConfig?: PrecisionRuleConfig;
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
  systemPrompt?: string;
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
