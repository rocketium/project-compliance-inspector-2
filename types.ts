
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

export interface ComplianceResult {
  rule: string;
  status: "PASS" | "FAIL" | "WARNING";
  reasoning: string;
  suggestion?: string; // AI-generated fix suggestion for violations
  category?: "brand" | "accessibility" | "policy" | "quality"; // Rule category for scoring
  severity?: "critical" | "major" | "minor"; // Severity for weighted scoring
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
  complianceRules?: string[];
  imageSpecs?: ImageSpec;
  localizationRules?: LocalizationRule[];
  category?: "retail" | "social" | "ecommerce" | "other";
}

export interface ImageMetadata {
  width: number;
  height: number;
  fileSizeKB: number;
  format: string;
  aspectRatio: string;
  dpi?: number;
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
