
import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult, ComplianceResult } from "../types";

// Initialize the Gemini API client
// API key must be provided via process.env.API_KEY
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Analyzes an image to extract text and visual elements with bounding boxes.
 * Uses 'gemini-3-pro-preview' with high thinking budget for precision.
 */
export const analyzeImageWithGemini = async (
  base64Image: string,
  mimeType: string,
  customPrompt?: string
): Promise<AnalysisResult> => {
  try {
    const model = "gemini-3-pro-preview";
    
    const defaultPrompt = `
      Analyze this advertisement or design image in extreme detail.
      
      Your task is to decompose the image into its constituent parts for a design system.
      Identify all distinct elements:
      1. Text blocks (headlines, body copy, disclaimers, prices).
      2. Visual elements (product shots, logos, icons, buttons, graphical shapes).
      
      For each element identified:
      - Classify it into one of these categories: 'Text', 'Logo', 'Product', 'Button', 'Other'.
      - Provide the exact text content (if it is text) or a concise visual description (if it is an image).
      - precise bounding box coordinates (ymin, xmin, ymax, xmax) normalized to 0-1000 scale (where 0 is top/left and 1000 is bottom/right).
      
      Be very precise with the bounding boxes. Do not overlap boxes if possible unless elements are nested.
      Ensure every visible piece of significant content is captured.
    `;

    const prompt = customPrompt || defaultPrompt;

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
                    enum: ["Text", "Logo", "Product", "Button", "Other", "Partner"],
                    description: "The type of element. Use 'Partner' for partner logos in co-branding.",
                  },
                  ymin: { type: Type.NUMBER, description: "Top coordinate (0-1000)" },
                  xmin: { type: Type.NUMBER, description: "Left coordinate (0-1000)" },
                  ymax: { type: Type.NUMBER, description: "Bottom coordinate (0-1000)" },
                  xmax: { type: Type.NUMBER, description: "Right coordinate (0-1000)" },
                  polygon: {
                    type: Type.ARRAY,
                    description: "A series of points (x,y) defining the detailed polygon outline of the object.",
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        x: { type: Type.NUMBER },
                        y: { type: Type.NUMBER }
                      },
                      required: ["x", "y"]
                    }
                  }
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
      polygon: el.polygon ? el.polygon.map((p: any) => ({ x: p.x / 1000, y: p.y / 1000 })) : undefined
    }));

    return { elements };

  } catch (error) {
    console.error("Error analyzing image:", error);
    throw error;
  }
};

/**
 * Checks an image against a specific set of compliance rules.
 */
export const checkComplianceWithGemini = async (
  base64Image: string,
  mimeType: string,
  rules: string[]
): Promise<ComplianceResult[]> => {
  try {
    const model = "gemini-3-pro-preview";

    const prompt = `
      You are a Strict Brand Compliance Officer. 
      Evaluate the provided advertisement image against the following list of rules.
      
      For each rule, determine if the image passes or fails. 
      Be extremely strict. Visual consistency is key.
      
      Rules to Check:
      ${rules.map((rule, i) => `${i + 1}. ${rule}`).join('\n')}
    `;

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
        thinkingConfig: {
          thinkingBudget: 16000, // Lower budget than analysis but still needs reasoning
        },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            results: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  ruleIndex: { type: Type.INTEGER, description: "The index of the rule (1-based)" },
                  status: { 
                    type: Type.STRING, 
                    enum: ["PASS", "FAIL", "WARNING"],
                    description: "Use FAIL if there is a clear violation. Use WARNING if unsure or minor." 
                  },
                  reasoning: { type: Type.STRING, description: "Brief explanation of why it passed or failed." }
                },
                required: ["ruleIndex", "status", "reasoning"]
              }
            }
          },
          required: ["results"]
        }
      }
    });

    const resultText = response.text;
    if (!resultText) throw new Error("No response from Compliance Check");

    const parsedData = JSON.parse(resultText);

    // Map back to the original rules array
    return rules.map((rule, index) => {
      const found = parsedData.results.find((r: any) => r.ruleIndex === index + 1);
      return {
        rule: rule,
        status: found?.status || 'WARNING',
        reasoning: found?.reasoning || 'Could not verify this rule.'
      };
    });

  } catch (error) {
    console.error("Error checking compliance:", error);
    throw error;
  }
}
