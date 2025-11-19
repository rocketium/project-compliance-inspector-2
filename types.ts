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
  category: 'Text' | 'Logo' | 'Product' | 'Button' | 'Other';
  box: BoundingBox;
  polygon: Point[]; // Array of points normalized to 0-1
  croppedImageUrl?: string; // Generated client-side after analysis
}

export interface AnalysisResult {
  elements: AnalyzedElement[];
}

export interface PlatformConfig {
  id: string;
  name: string;
  description: string;
  prompt: string;
  referenceLogo?: string; // Base64 string of the reference logo
}

export enum AppState {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}