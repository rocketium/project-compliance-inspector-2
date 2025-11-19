
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
  status: 'PASS' | 'FAIL' | 'WARNING';
  reasoning: string;
}

export interface PlatformConfig {
  id: string;
  name: string;
  prompt: string;
  complianceRules?: string[];
}

export enum AppState {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}
