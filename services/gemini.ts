import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult } from "../types";

// Initialize the Gemini API client
// API key must be provided via process.env.API_KEY
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Analyzes an image to extract text and visual elements with bounding boxes.
 * Uses 'gemini-3-pro-preview' with high thinking budget for precision.
 * Supports optional reference image to guide detection.
 */
export const analyzeImageWithGemini = async (
  base64Image: string,
  mimeType: string,
  promptText: string, // Raw prompt text provided by the caller
  referenceImageBase64?: string
): Promise<AnalysisResult> => {
  try {
    const model = "gemini-3-pro-preview";
    
    let prompt = promptText;

    // Construct the content parts
    const parts: any[] = [
      {
        inlineData: {
          mimeType: mimeType,
          data: base64Image,
        },
      }
    ];

    // If a reference image is provided, add it to the payload and update the prompt instructions
    if (referenceImageBase64) {
      parts.push({
        inlineData: {
          mimeType: "image/png", // Assuming PNG/JPEG from canvas/file reader usually
          data: referenceImageBase64,
        },
      });
      
      prompt += `
      
      IMPORTANT: A second image has been provided as a REFERENCE. 
      This reference image contains a specific logo or visual element that is critical.
      You must identify this specific element within the main image (the first image).
      - Ensure the bounding box and polygon outline for this referenced element are pixel-perfect.
      - Verify that the extracted element matches the visual characteristics of the reference.
      `;
    }

    parts.push({ text: prompt });

    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: parts,
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