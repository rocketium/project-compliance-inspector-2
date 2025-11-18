export interface BoundingBox {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

export interface AnalyzedElement {
  id: string;
  content: string; // Text content or description of the visual
  category: 'Text' | 'Logo' | 'Product' | 'Button' | 'Other';
  box: BoundingBox;
  croppedImageUrl?: string; // Generated client-side after analysis
}

export interface AnalysisResult {
  elements: AnalyzedElement[];
}

export enum AppState {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}