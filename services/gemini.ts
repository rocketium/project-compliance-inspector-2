
import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult, ComplianceResult, ComplianceScores } from "../types";

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
      id: `el-${index}-${Date.now()}`,
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
  rules: string[]
): Promise<ComplianceResult[]> => {
  try {
    const model = "gemini-3-pro-preview";

    const prompt = `
      You are a Strict Brand Compliance Officer and Creative Director. 
      Evaluate the provided advertisement image against the following list of rules.
      
      For each rule:
      1. Determine if the image passes, fails, or has a warning.
      2. Provide specific reasoning for your decision.
      3. If the rule FAILS or has a WARNING, provide a SPECIFIC, ACTIONABLE suggestion to fix it.
         - Be precise with measurements, colors, and positions when possible.
         - Example suggestions:
           * "Move the logo 15-20px right to meet the 10% safe-area margin requirement"
           * "Reduce headline from 32 characters to under 25 characters"
           * "Increase text contrast ratio from ~2.5:1 to at least 4.5:1 by darkening the text or lightening the background"
           * "Add a visible CTA button in the lower-right quadrant"
      4. Categorize each rule into one of these categories:
         - "brand": Logo usage, brand identity, co-branding rules
         - "accessibility": Contrast, readability, alt-text, screen reader
         - "policy": Platform-specific policies, prohibited content
         - "quality": Creative quality, layout, cart-fit, visual appeal
      5. Assign a severity level:
         - "critical": Will cause rejection or major brand damage
         - "major": Significant issue that should be fixed
         - "minor": Improvement suggestion, not blocking
      
      Be extremely strict. Visual consistency is key.
      
      Rules to Check:
      ${rules.map((rule, i) => `${i + 1}. ${rule}`).join("\n")}
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
    return rules.map((rule, index) => {
      const found = parsedData.results.find(
        (r: any) => r.ruleIndex === index + 1
      );
      return {
        rule: rule,
        status: found?.status || "WARNING",
        reasoning: found?.reasoning || "Could not verify this rule.",
        suggestion: found?.suggestion,
        category: found?.category || "policy",
        severity: found?.severity || "major",
      };
    });
  } catch (error) {
    console.error("Error checking compliance:", error);
    throw error;
  }
};

/**
 * Calculate compliance scores from results
 */
export const calculateComplianceScores = (
  results: ComplianceResult[]
): ComplianceScores => {
  const breakdown = {
    passed: results.filter((r) => r.status === "PASS").length,
    failed: results.filter((r) => r.status === "FAIL").length,
    warnings: results.filter((r) => r.status === "WARNING").length,
    total: results.length,
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
  const brandRules = results.filter((r) => r.category === "brand");
  const accessibilityRules = results.filter(
    (r) => r.category === "accessibility"
  );
  const policyRules = results.filter((r) => r.category === "policy");
  const qualityRules = results.filter((r) => r.category === "quality");

  return {
    overall: calculateWeightedScore(results),
    brand: calculateWeightedScore(brandRules),
    accessibility: calculateWeightedScore(accessibilityRules),
    policy: calculateWeightedScore(policyRules),
    quality: calculateWeightedScore(qualityRules),
    breakdown,
  };
};
