import { AnalysisResult, ComplianceResult, ComplianceScores } from "./types.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

/**
 * Analyzes an image to extract text and visual elements with bounding boxes.
 */
export const analyzeImageWithGemini = async (
  base64Image: string,
  mimeType: string,
  customPrompt?: string
): Promise<AnalysisResult> => {
  console.log(`[Gemini] analyzeImageWithGemini called`);
  console.log(`[Gemini] API Key present: ${!!GEMINI_API_KEY}`);
  console.log(`[Gemini] API Key length: ${GEMINI_API_KEY?.length || 0}`);
  console.log(`[Gemini] Image base64 length: ${base64Image.length}`);
  console.log(`[Gemini] MimeType: ${mimeType}`);
  console.log(`[Gemini] Custom prompt provided: ${!!customPrompt}`);

  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }

  const defaultPrompt = `
    Analyze this advertisement or design image in extreme detail.
    
    Your task is to decompose the image into its constituent parts for a design system.
    Identify all distinct elements:
    1. Text blocks (headlines, body copy, disclaimers, prices).
    2. Visual elements (product shots, logos, icons, buttons, graphical shapes).
    
    For each element identified:
    - Classify it into one of these categories: 'Text', 'Logo', 'Product', 'Button', 'Other'.
    - Provide the exact text content (if it is text) or a concise visual description (if it is an image).
    - precise bounding box coordinates (ymin, xmin, ymax, xmax) normalized to 0-1000 scale.
    
    Be very precise with the bounding boxes.
  `;

  const prompt = customPrompt || defaultPrompt;
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

  console.log(`[Gemini] Making API request to Gemini...`);

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Image,
                },
              },
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              elements: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    content: { type: "STRING" },
                    category: {
                      type: "STRING",
                      enum: [
                        "Text",
                        "Logo",
                        "Product",
                        "Button",
                        "Other",
                        "Partner",
                      ],
                    },
                    ymin: { type: "NUMBER" },
                    xmin: { type: "NUMBER" },
                    ymax: { type: "NUMBER" },
                    xmax: { type: "NUMBER" },
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
      }),
    });

    console.log(`[Gemini] API Response status: ${response.status}`);
    console.log(`[Gemini] API Response ok: ${response.ok}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Gemini] API Error response: ${errorText}`);
      throw new Error(`Gemini API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    console.log(
      `[Gemini] Response received. Candidates: ${data.candidates?.length || 0}`
    );

    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!resultText) {
      console.error(
        `[Gemini] No text in response. Full response:`,
        JSON.stringify(data, null, 2)
      );
      throw new Error("No response from AI");
    }

    console.log(`[Gemini] Result text length: ${resultText.length}`);

    const parsedData = JSON.parse(resultText);
    console.log(
      `[Gemini] Parsed elements count: ${parsedData.elements?.length || 0}`
    );

    // Normalize coordinates from 0-1000 to 0-1
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
    }));

    console.log(`[Gemini] ✅ Analysis complete. Elements: ${elements.length}`);
    return { elements };
  } catch (error: any) {
    console.error(`[Gemini] ❌ analyzeImageWithGemini error:`, error);
    console.error(`[Gemini] Error stack:`, error.stack);
    throw error;
  }
};

/**
 * Checks an image against compliance rules.
 */
export const checkComplianceWithGemini = async (
  base64Image: string,
  mimeType: string,
  rules: string[]
): Promise<ComplianceResult[]> => {
  console.log(`[Gemini] checkComplianceWithGemini called`);
  console.log(`[Gemini] Rules count: ${rules.length}`);
  console.log(`[Gemini] Image base64 length: ${base64Image.length}`);

  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }

  const prompt = `
    You are a Strict Brand Compliance Officer. 
    Evaluate the provided advertisement image against the following rules.
    
    For each rule:
    1. Determine if the image passes, fails, or has a warning.
    2. Provide specific reasoning for your decision.
    3. If FAIL or WARNING, provide a specific, actionable suggestion to fix it.
    4. Categorize: "brand", "accessibility", "policy", or "quality"
    5. Assign severity: "critical", "major", or "minor"
    
    Rules to Check:
    ${rules.map((rule, i) => `${i + 1}. ${rule}`).join("\n")}
  `;

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
  console.log(`[Gemini] Making compliance API request...`);

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Image,
                },
              },
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              results: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    ruleIndex: { type: "INTEGER" },
                    status: {
                      type: "STRING",
                      enum: ["PASS", "FAIL", "WARNING"],
                    },
                    reasoning: { type: "STRING" },
                    suggestion: { type: "STRING" },
                    category: {
                      type: "STRING",
                      enum: ["brand", "accessibility", "policy", "quality"],
                    },
                    severity: {
                      type: "STRING",
                      enum: ["critical", "major", "minor"],
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
      }),
    });

    console.log(`[Gemini] Compliance API Response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Gemini] Compliance API Error: ${errorText}`);
      throw new Error(`Gemini API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    console.log(
      `[Gemini] Compliance response received. Candidates: ${
        data.candidates?.length || 0
      }`
    );

    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!resultText) {
      console.error(
        `[Gemini] No text in compliance response. Full response:`,
        JSON.stringify(data, null, 2)
      );
      throw new Error("No response from Compliance Check");
    }

    console.log(`[Gemini] Compliance result text length: ${resultText.length}`);

    const parsedData = JSON.parse(resultText);
    console.log(
      `[Gemini] Parsed compliance results: ${parsedData.results?.length || 0}`
    );

    const results = rules.map((rule, index) => {
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

    console.log(
      `[Gemini] ✅ Compliance check complete. Results: ${results.length}`
    );
    return results;
  } catch (error: any) {
    console.error(`[Gemini] ❌ checkComplianceWithGemini error:`, error);
    console.error(`[Gemini] Error stack:`, error.stack);
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

  const calculateWeightedScore = (items: ComplianceResult[]): number => {
    if (items.length === 0) return 100;

    let totalWeight = 0;
    let earnedPoints = 0;

    items.forEach((item) => {
      const severityWeight =
        item.severity === "critical" ? 3 : item.severity === "major" ? 2 : 1;
      totalWeight += severityWeight;

      if (item.status === "PASS") {
        earnedPoints += severityWeight;
      } else if (item.status === "WARNING") {
        earnedPoints += severityWeight * 0.5;
      }
    });

    return totalWeight > 0
      ? Math.round((earnedPoints / totalWeight) * 100)
      : 100;
  };

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
