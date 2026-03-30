
export interface BoundingBox {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface AnalyzedElement {
  id: string;
  content: string; // Text content or description of the visual
  category: 'Text' | 'Logo' | 'Product' | 'Button' | 'Other' | 'Partner';
  box: BoundingBox;
  polygon?: Point[]; // Optional polygon for detailed outlines
  croppedImageUrl?: string; // Generated client-side after analysis
}

export interface AnalysisResult {
  elements: AnalyzedElement[];
}

export type ComplianceCategory =
  | "brand"
  | "accessibility"
  | "policy"
  | "quality";

export type ComplianceSeverity = "critical" | "major" | "minor";

export type RuleSource = "platform" | "brand";

export type RuleEngine = "visual" | "precision";

export type RuleMode = "platform" | "brand" | "combined";

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
  severity?: ComplianceSeverity;
  enabled?: boolean;
  engine?: RuleEngine;
  source?: RuleSource;
  brandId?: string;
  precisionConfig?: PrecisionRuleConfig;
}

export interface BrandRule extends ComplianceRuleDefinition {
  source?: "brand";
}

export interface BrandConfig {
  id: string;
  name: string;
  description?: string;
  systemPrompt?: string;
  checkTypes: string[];
  rules: BrandRule[];
}

export interface PromptLayerConfig {
  platformName?: string;
  platformSystemPrompt?: string;
  brandName?: string;
  brandDescription?: string;
  brandSystemPrompt?: string;
  ruleMode?: RuleMode;
}

export interface RocketiumSource {
  sourceType: "single" | "assetpreview";
  inputUrl: string;
  projectIds: string[];
  workspaceShortId?: string;
}

export interface ComplianceResult {
  rule: string;
  status: "PASS" | "FAIL" | "WARNING";
  reasoning: string;
  suggestion?: string; // AI-generated fix suggestion for violations
  category?: ComplianceCategory; // Rule category for scoring
  severity?: ComplianceSeverity; // Severity for weighted scoring
  ruleId?: string;
  ruleTitle?: string;
  ruleSource?: RuleSource;
  checkType?: string;
  brandId?: string;
  engine?: RuleEngine;
  actualValue?: string | number | boolean;
  expectedValue?: string | number | boolean;
  matchedLayerName?: string;
  matchedLayerId?: string;
  referenceLayerName?: string;
  evaluationMessage?: string;
  relatedElementIds?: string[];
}

// Multi-dimensional compliance scores
export interface ComplianceScores {
  overall: number; // 0-100
  brand: number; // Brand visibility & guidelines
  accessibility: number; // A11y compliance
  policy: number; // Platform policy adherence
  quality: number; // Ad quality / cart-fit score
  breakdown: {
    passed: number;
    failed: number;
    warnings: number;
    total: number;
  };
}

// Image specification requirements for platforms
export interface ImageSpec {
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  aspectRatios?: string[]; // e.g., "1:1", "16:9"
  maxFileSizeKB?: number;
  minDPI?: number;
  allowedFormats?: string[]; // e.g., ["jpg", "png"]
}

// Localization rules for specific regions/languages
export interface LocalizationRule {
  region: string; // e.g., "US", "EU", "UK", "CA"
  language?: string; // e.g., "en", "es", "fr"
  rules: string[];
}

export interface PlatformConfig {
  id: string;
  name: string;
  prompt: string;
  systemPrompt?: string;
  complianceRules?: string[];
  imageSpecs?: ImageSpec;
  localizationRules?: LocalizationRule[];
  category?: "retail" | "social" | "ecommerce" | "other";
}

export interface EvaluationJobMetadata {
  sourceType?: "single" | "assetpreview";
  sourceProjectIds?: string[];
  workspaceShortId?: string;
  inputUrl?: string;
  brandId?: string;
  brandName?: string;
  ruleMode?: RuleMode;
}

export interface ImageMetadata {
  width: number;
  height: number;
  fileSizeKB: number;
  format: string;
  aspectRatio: string;
  dpi?: number;
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
  attentionResult?: AttentionInsightResult;
  error?: string;
}

export enum AppState {
  IDLE = "IDLE",
  ANALYZING = "ANALYZING",
  SUCCESS = "SUCCESS",
  ERROR = "ERROR",
}

export type ThemeMode = "light" | "dark";

// Attention Insight types
export interface AttentionAreaRecommendation {
  name: string;
  description: string;
  colorIndicator: "red" | "yellow" | "green";
}

export interface AttentionArea {
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  width: number; // percentage
  height: number; // percentage
  score: number; // AOI attention percentage
  label?: string;
  recommendation?: AttentionAreaRecommendation;
}

export interface AttentionMetrics {
  topThird: number;
  middleThird: number;
  bottomThird: number;
  leftHalf: number;
  rightHalf: number;
}

export interface AttentionInsightResult {
  studyId: string;
  heatmapUrl: string;
  clarityScore: number; // 0-100
  clarityDescription: string;
  clarityKey: string;
  focusScore: number; // 0-100
  benchmarkDescription: string;
  benchmarkPercentile: number;
  attentionAreas: AttentionArea[];
  metrics: AttentionMetrics;
  suggestions: string[];
  status: "pending" | "processing" | "completed" | "failed";
}
