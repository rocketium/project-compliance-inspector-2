import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult } from "../types";

// Initialize the Gemini API client
// API key must be provided via process.env.API_KEY
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const PROMPTS: Record<string, string> = {
  'default': `
      Analyze this advertisement or design image in extreme detail.
      
      Your task is to decompose the image into its constituent parts for a design system.
      Identify all distinct elements:
      1. Text blocks (headlines, body copy, disclaimers, prices).
      2. Visual elements (product shots, logos, icons, buttons, graphical shapes).
      
      For each element identified:
      - Classify it into one of these categories: 'Text', 'Logo', 'Product', 'Button', 'Other'.
      - Provide the exact text content (if it is text) or a concise visual description (if it is an image).
      - Provide precise bounding box coordinates (ymin, xmin, ymax, xmax) normalized to 0-1000 scale.
      - Provide a detailed polygon outline (list of x,y coordinates) that tightly encloses the element, also normalized to 0-1000 scale.
      
      Be very precise with the boundaries. Do not overlap boxes if possible unless elements are nested.
      Ensure every visible piece of significant content is captured.
    `,
  'am-fuse': `
      Analyze this image specifically for the AM Fuse platform.
      
      Focus on identifying elements that can be fused or recombined in a modular design system.
      Pay special attention to:
      1. Isolated visual assets suitable for reuse (backgrounds, extracted products).
      2. Structural layout containers.
      3. Typography and branding elements.
      
      For each element identified:
      - Classify it into one of these categories: 'Text', 'Logo', 'Product', 'Button', 'Other'.
      - Provide the exact text content or visual description.
      - Provide precise bounding box coordinates (ymin, xmin, ymax, xmax) normalized to 0-1000 scale.
      - Provide a detailed polygon outline (list of x,y coordinates) normalized to 0-1000 scale for precise extraction.
    `,
  'am-ads': `
      Analyze this image specifically for the AM Ads platform.
      
      Focus on ad-specific components, compliance, and performance drivers.
      Identify:
      1. Ad copy and messaging hierarchies (Headline, CTA, Disclaimer).
      2. Call-to-action buttons and interactive areas.
      3. Product placement and brand visibility.
      
      For each element identified:
      - Classify it into one of these categories: 'Text', 'Logo', 'Product', 'Button', 'Other'.
      - Provide the exact text content or visual description.
      - Provide precise bounding box coordinates (ymin, xmin, ymax, xmax) normalized to 0-1000 scale.
      - Provide a detailed polygon outline (list of x,y coordinates) normalized to 0-1000 scale.
    `
};

/**
 * Analyzes an image to extract text and visual elements with bounding boxes.
 * Uses 'gemini-3-pro-preview' with high thinking budget for precision.
 */
export const analyzeImageWithGemini = async (
  base64Image: string,
  mimeType: string,
  platform: string = 'default'
): Promise<AnalysisResult> => {
  try {
    const model = "gemini-3-pro-preview";
    
    const prompt = PROMPTS[platform] || PROMPTS['default'];

    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Image,
            },
          },
          {
            text: prompt,
          },
        ],
      },
      config: {
        // Enable Thinking Mode with max budget for complex layout analysis
        thinkingConfig: {
          thinkingBudget: 32768, 
        },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            elements: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  content: {
                    type: Type.STRING,
                    description: "The exact text extracted or a description of the visual element.",
                  },
                  category: {
                    type: Type.STRING,
                    enum: ["Text", "Logo", "Product", "Button", "Other"],
                    description: "The type of element.",
                  },
                  ymin: { type: Type.NUMBER, description: "Top coordinate (0-1000)" },
                  xmin: { type: Type.NUMBER, description: "Left coordinate (0-1000)" },
                  ymax: { type: Type.NUMBER, description: "Bottom coordinate (0-1000)" },
                  xmax: { type: Type.NUMBER, description: "Right coordinate (0-1000)" },
                  polygon: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        x: { type: Type.NUMBER, description: "X coordinate (0-1000)" },
                        y: { type: Type.NUMBER, description: "Y coordinate (0-1000)" },
                      },
                      required: ["x", "y"],
                    },
                    description: "Ordered list of points forming the outline polygon.",
                  },
                },
                required: ["content", "category", "ymin", "xmin", "ymax", "xmax"],
              },
            },
          },
          required: ["elements"],
        },
      },
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("No response from AI");
    }

    const parsedData = JSON.parse(resultText);
    
    // Normalize coordinates from 0-1000 back to 0-1 for easier frontend consumption
    const elements = parsedData.elements.map((el: any, index: number) => ({
      id: `el-${index}-${Date.now()}`,
      content: el.content,
      category: el.category,
      box: {
        ymin: el.ymin / 1000,
        xmin: el.xmin / 1000,
        ymax: el.ymax / 1000,
        xmax: el.xmax / 1000,
      },
      polygon: el.polygon ? el.polygon.map((p: any) => ({ x: p.x / 1000, y: p.y / 1000 })) : [],
    }));

    return { elements };

  } catch (error) {
    console.error("Error analyzing image:", error);
    throw error;
  }
};