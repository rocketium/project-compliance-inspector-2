
import { GoogleGenAI, Type } from "@google/genai";
import {
  AnalysisResult,
  ComplianceResult,
  ComplianceRuleDefinition,
  ComplianceScores,
  PromptLayerConfig,
} from "../types";
import { buildAnalysisPrompt, buildCompliancePrompt } from "../lib/promptLayers";

// Initialize the Gemini API client
// API key must be provided via process.env.API_KEY
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const GEMINI_ANALYSIS_MODEL = "gemini-3.1-pro-preview";
const GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image-preview";

/**
 * Analyzes an image to extract text and visual elements with bounding boxes.
 * Uses Gemini 3 Pro Preview with high thinking budget for precision.
 */
export const analyzeImageWithGemini = async (
  base64Image: string,
  mimeType: string,
  customPrompt?: string,
  promptLayers?: PromptLayerConfig | string
): Promise<AnalysisResult> => {
  try {
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

    const prompt = buildAnalysisPrompt({
      taskPrompt: customPrompt || defaultPrompt,
      config: promptLayers,
    });

    const response = await ai.models.generateContent({
      model: GEMINI_ANALYSIS_MODEL,
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
                    description:
                      "The exact text extracted or a description of the visual element.",
                  },
                  category: {
                    type: Type.STRING,
                    enum: [
                      "Text",
                      "Logo",
                      "Product",
                      "Button",
                      "Other",
                      "Partner",
                    ],
                    description:
                      "The type of element. Use 'Partner' for partner logos in co-branding.",
                  },
                  ymin: {
                    type: Type.NUMBER,
                    description: "Top coordinate (0-1000)",
                  },
                  xmin: {
                    type: Type.NUMBER,
                    description: "Left coordinate (0-1000)",
                  },
                  ymax: {
                    type: Type.NUMBER,
                    description: "Bottom coordinate (0-1000)",
                  },
                  xmax: {
                    type: Type.NUMBER,
                    description: "Right coordinate (0-1000)",
                  },
                  polygon: {
                    type: Type.ARRAY,
                    description:
                      "A series of points (x,y) defining the detailed polygon outline of the object.",
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        x: { type: Type.NUMBER },
                        y: { type: Type.NUMBER },
                      },
                      required: ["x", "y"],
                    },
                  },
                },
                required: [
                  "content",
                  "category",
                  "ymin",
                  "xmin",
                  "ymax",
                  "xmax",
                ],
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
      id: `el-${index + 1}`,
      content: el.content,
      category: el.category,
      box: {
        ymin: el.ymin / 1000,
        xmin: el.xmin / 1000,
        ymax: el.ymax / 1000,
        xmax: el.xmax / 1000,
      },
      polygon: el.polygon
        ? el.polygon.map((p: any) => ({ x: p.x / 1000, y: p.y / 1000 }))
        : undefined,
    }));

    return { elements };
  } catch (error) {
    console.error("Error analyzing image:", error);
    throw error;
  }
};

/**
 * Checks an image against a specific set of compliance rules.
 * Returns detailed results with AI-generated fix suggestions.
 */
export const checkComplianceWithGemini = async (
  base64Image: string,
  mimeType: string,
  rules: string[] | ComplianceRuleDefinition[],
  promptLayers?: PromptLayerConfig | string,
  analysisResult?: AnalysisResult
): Promise<ComplianceResult[]> => {
  try {
    const normalizedRules = rules.map((rule, index) =>
      typeof rule === "string"
        ? {
            id: `platform-rule-${index}`,
            title: `Platform Rule ${index + 1}`,
            instruction: rule,
            source: "platform" as const,
            engine: "visual" as const,
            enabled: true,
          }
        : {
            ...rule,
            source: rule.source || "platform",
            engine: rule.engine || "visual",
            enabled: rule.enabled !== false,
          }
    );

    const promptBase = buildCompliancePrompt({
      rules: normalizedRules,
      config: promptLayers,
    });
    const elementsContext =
      analysisResult?.elements?.length
        ? [
            "Detected Elements:",
            ...analysisResult.elements.map((element) => {
              const bounds = `box=(${element.box.xmin.toFixed(3)}, ${element.box.ymin.toFixed(
                3
              )})-(${element.box.xmax.toFixed(3)}, ${element.box.ymax.toFixed(3)})`;
              return `- ${element.id}: [${element.category}] ${element.content} ${bounds}`;
            }),
            "When a rule depends on one or more detected elements, return their ids in relatedElementIds. Use only ids from this list. Return an empty array or omit the field if no element can be referenced confidently.",
          ].join("\n")
        : "";
    const prompt = [promptBase, elementsContext].filter(Boolean).join("\n\n");

    const response = await ai.models.generateContent({
      model: GEMINI_ANALYSIS_MODEL,
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
          thinkingBudget: 24000, // Higher budget for detailed suggestions
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
                  ruleIndex: {
                    type: Type.INTEGER,
                    description: "The index of the rule (1-based)",
                  },
                  status: {
                    type: Type.STRING,
                    enum: ["PASS", "FAIL", "WARNING"],
                    description:
                      "Use FAIL if there is a clear violation. Use WARNING if unsure or minor issue.",
                  },
                  reasoning: {
                    type: Type.STRING,
                    description:
                      "Brief explanation of why it passed or failed.",
                  },
                  suggestion: {
                    type: Type.STRING,
                    description:
                      "Specific, actionable fix suggestion. Required for FAIL and WARNING status. Be precise with measurements and specifics.",
                  },
                  category: {
                    type: Type.STRING,
                    enum: ["brand", "accessibility", "policy", "quality"],
                    description: "Category of this rule for scoring purposes.",
                  },
                  severity: {
                    type: Type.STRING,
                    enum: ["critical", "major", "minor"],
                    description: "Severity level of this rule violation.",
                  },
                  relatedElementIds: {
                    type: Type.ARRAY,
                    description:
                      "Optional list of detected element ids that directly support this rule result.",
                    items: {
                      type: Type.STRING,
                    },
                  },
                },
                required: [
                  "ruleIndex",
                  "status",
                  "reasoning",
                  "category",
                  "severity",
                ],
              },
            },
          },
          required: ["results"],
        },
      },
    });

    const resultText = response.text;
    if (!resultText) throw new Error("No response from Compliance Check");

    const parsedData = JSON.parse(resultText);

    // Map back to the original rules array
    return normalizedRules.map((rule, index) => {
      const found = parsedData.results.find(
        (r: any) => r.ruleIndex === index + 1
      );
      return {
        rule: rule.instruction,
        status: found?.status || "WARNING",
        reasoning: found?.reasoning || "Could not verify this rule.",
        suggestion: found?.suggestion,
        category: found?.category || "policy",
        severity: found?.severity || rule.severity || "major",
        ruleId: rule.id,
        ruleTitle: rule.title,
        ruleSource: rule.source || "platform",
        checkType: rule.checkType,
        brandId: rule.brandId,
        engine: rule.engine || "visual",
        relatedElementIds: Array.isArray(found?.relatedElementIds)
          ? found.relatedElementIds.filter((value: unknown) => typeof value === "string")
          : undefined,
      };
    });
  } catch (error) {
    console.error("Error checking compliance:", error);
    throw error;
  }
};

/**
 * Auto-fix a failed compliance rule using AI.
 * Takes the failing rule context, finds related data from extraction results,
 * and generates a visual fix suggestion (image) using Gemini.
 */
export const autoFixRuleWithGemini = async (
  base64Image: string,
  mimeType: string,
  failedRule: ComplianceResult,
  extractionResults: AnalysisResult
): Promise<string> => {
  try {
    // Find related elements from extraction that might be relevant to the rule
    const relevantElements = extractionResults.elements.filter((el) => {
      const ruleLower = failedRule.rule.toLowerCase();
      const contentLower = el.content.toLowerCase();
      const categoryLower = el.category.toLowerCase();

      // Check if element content or category relates to the rule
      return (
        ruleLower.includes(categoryLower) ||
        ruleLower.includes(contentLower) ||
        contentLower.includes(ruleLower.split(" ")[0]) ||
        // Check for common keywords
        (ruleLower.includes("logo") && categoryLower === "logo") ||
        (ruleLower.includes("text") && categoryLower === "text") ||
        (ruleLower.includes("button") && categoryLower === "button") ||
        (ruleLower.includes("product") && categoryLower === "product")
      );
    });

    // Build context from relevant elements
    const elementsContext = relevantElements
      .map(
        (el, idx) =>
          `${idx + 1}. ${el.category}: "${el.content}" (position: ${Math.round(
            el.box.xmin * 100
          )}%, ${Math.round(el.box.ymin * 100)}%)`
      )
      .join("\n");

    const prompt = `
You are an expert design compliance advisor. A compliance rule has failed, and you need to generate a FIXED version of the image.

FAILED RULE:
"${failedRule.rule}"

CURRENT STATUS:
- Status: ${failedRule.status}
- Reasoning: ${failedRule.reasoning}
${failedRule.suggestion ? `- Existing Suggestion: ${failedRule.suggestion}` : ""}

RELEVANT ELEMENTS EXTRACTED FROM THE IMAGE:
${elementsContext || "No directly related elements found, but analyze the full image context."}

TASK:
Generate a COMPLETE, FIXED version of the image that complies with the rule. The image should:
1. Be the final, corrected version - NOT an annotated or marked-up version
2. Show all the fixes applied (moved elements, resized elements, changed colors, added elements, etc.)
3. Be production-ready and visually polished
4. Maintain the same overall design aesthetic and quality as the original
5. Fix the specific compliance issue mentioned in the rule

Do NOT include annotations, arrows, boxes, or any markup. Generate the actual fixed image that a designer would create after applying the fix.
`;

    const response = await ai.models.generateContent({
      model: GEMINI_IMAGE_MODEL,
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
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: {
          aspectRatio: '16:9',
          imageSize: 'LARGE',
        },
      },
    });

    // Extract image from response
    const responseAny = response as any;
    
    // Access image through candidates[0].content.parts
    if (responseAny.candidates?.[0]?.content?.parts) {
      for (const part of responseAny.candidates[0].content.parts) {
        if (part.inlineData) {
          const imageData = part.inlineData.data;
          const imageMimeType = part.inlineData.mimeType || "image/png";
          return `data:${imageMimeType};base64,${imageData}`;
        }
      }
    }

    throw new Error("No image response received from AI");
  } catch (error) {
    console.error("Error generating auto-fix:", error);
    throw error;
  }
};

/**
 * Calculate compliance scores from results
 */
export const calculateComplianceScores = (
  results: ComplianceResult[]
): ComplianceScores => {
  const visualResults = results.filter(
    (result) => (result.engine || "visual") === "visual"
  );

  const breakdown = {
    passed: visualResults.filter((r) => r.status === "PASS").length,
    failed: visualResults.filter((r) => r.status === "FAIL").length,
    warnings: visualResults.filter((r) => r.status === "WARNING").length,
    total: visualResults.length,
  };

  // Calculate overall score with weighted severity
  const calculateWeightedScore = (items: ComplianceResult[]): number => {
    if (items.length === 0) return 100;

    let totalWeight = 0;
    let earnedPoints = 0;

    items.forEach((item) => {
      // Weight by severity
      const severityWeight =
        item.severity === "critical" ? 3 : item.severity === "major" ? 2 : 1;
      totalWeight += severityWeight;

      if (item.status === "PASS") {
        earnedPoints += severityWeight;
      } else if (item.status === "WARNING") {
        earnedPoints += severityWeight * 0.5; // Partial credit for warnings
      }
      // FAIL gets 0 points
    });

    return totalWeight > 0
      ? Math.round((earnedPoints / totalWeight) * 100)
      : 100;
  };

  // Group by category
  const brandRules = visualResults.filter((r) => r.category === "brand");
  const accessibilityRules = visualResults.filter(
    (r) => r.category === "accessibility"
  );
  const policyRules = visualResults.filter((r) => r.category === "policy");
  const qualityRules = visualResults.filter((r) => r.category === "quality");

  return {
    overall: calculateWeightedScore(visualResults),
    brand: calculateWeightedScore(brandRules),
    accessibility: calculateWeightedScore(accessibilityRules),
    policy: calculateWeightedScore(policyRules),
    quality: calculateWeightedScore(qualityRules),
    breakdown,
  };
};
