import { GoogleGenAI, Type } from "@google/genai";
import {
  BrandRule,
  PrecisionFact,
  PrecisionLayerKind,
  PrecisionOperator,
  PrecisionRuleConfig,
  PrecisionSelectorType,
} from "../types";
import { createPrecisionRuleInstruction } from "./precisionRules";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const GEMINI_MODEL = "gemini-3.1-pro-preview";

const SUPPORTED_FACTS: PrecisionFact[] = [
  "fontSize",
  "fontWeight",
  "fontFamilyName",
  "fontFamilyId",
  "fontStyle",
  "textAlign",
  "textFill",
  "fill",
  "cornerRadius",
  "opacity",
  "objectFit",
  "imageWidth",
  "imageHeight",
  "imageLeft",
  "imageTop",
  "scale",
  "scaleX",
  "scaleY",
  "x",
  "y",
  "width",
  "height",
  "left",
  "right",
  "top",
  "bottom",
  "centerX",
  "centerY",
  "wordStyle.fontSize",
  "wordStyle.fontWeight",
  "wordStyle.fontFamilyName",
  "wordStyle.fontFamilyId",
  "wordStyle.fontStyle",
  "wordStyle.superscript",
  "wordStyle.subscript",
  "wordStyle.deltaY",
];

const SUPPORTED_OPERATORS: PrecisionOperator[] = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
];

const normalizePrompt = (value: string) =>
  value
    .replace(
      /(?:^|\s)(please\s+)?(add|create|set up|set)\s+(a\s+)?(fact-based\s+)?rule\b[:\-]?\s*/i,
      ""
    )
    .replace(/\bfor this\b/gi, "")
    .replace(/\bset this rule\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

const coerceExpectedValue = (
  value: string | number | boolean | undefined
): string | number | boolean | undefined => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed.length) {
    return undefined;
  }

  if (trimmed.toLowerCase() === "true") {
    return true;
  }

  if (trimmed.toLowerCase() === "false") {
    return false;
  }

  const numeric = Number(trimmed);
  return Number.isNaN(numeric) ? trimmed : numeric;
};

const cleanLayerKind = (
  value?: string | null
): PrecisionLayerKind | undefined => {
  if (value === "text" || value === "shape" || value === "image") {
    return value;
  }

  return undefined;
};

const cleanSelectorType = (value?: string | null): PrecisionSelectorType =>
  value === "textContent" ? "textContent" : "layerName";

const cleanFact = (value?: string | null): PrecisionFact =>
  SUPPORTED_FACTS.includes(value as PrecisionFact)
    ? (value as PrecisionFact)
    : "fontSize";

const cleanOperator = (value?: string | null): PrecisionOperator =>
  SUPPORTED_OPERATORS.includes(value as PrecisionOperator)
    ? (value as PrecisionOperator)
    : "eq";

const cleanSeverity = (value?: string | null): BrandRule["severity"] =>
  value === "critical" || value === "minor" || value === "major"
    ? value
    : "major";

export const createFactRuleDraftsFromPrompt = async ({
  brandId,
  prompt,
  checkTypes,
  indexStart,
}: {
  brandId: string;
  prompt: string;
  checkTypes: string[];
  indexStart: number;
}): Promise<BrandRule[]> => {
  const cleanedPrompt = normalizePrompt(prompt);

  if (!cleanedPrompt) {
    return [];
  }

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: `
You are converting a user's request into structured fact-based capsule QC rules.

Rules:
- Generate only fact-based rules.
- One user prompt may require multiple rules. Split them when needed.
- If the user describes "between" or "inside" positioning, decompose it into separate comparison rules instead of using a single between operator.
- Use only these selector types: layerName, textContent.
- Optional layerKind can be text, shape, image.
- Use only these facts: ${SUPPORTED_FACTS.join(", ")}.
- Use only these operators: ${SUPPORTED_OPERATORS.join(", ")}.
- Prefer exact, deterministic checks over vague intent.
- wordStyle.* facts require wordStyleText.
- Keep checkType to an existing option when possible.

Available check types:
${checkTypes.join("\n")}

User prompt:
${cleanedPrompt}
    `,
    config: {
      thinkingConfig: {
        thinkingBudget: 16000,
      },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          drafts: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                checkType: { type: Type.STRING },
                severity: {
                  type: Type.STRING,
                  enum: ["critical", "major", "minor"],
                },
                selectorType: {
                  type: Type.STRING,
                  enum: ["layerName", "textContent"],
                },
                selectorValue: { type: Type.STRING },
                layerKind: {
                  type: Type.STRING,
                  enum: ["text", "shape", "image"],
                },
                fact: {
                  type: Type.STRING,
                  enum: SUPPORTED_FACTS,
                },
                operator: {
                  type: Type.STRING,
                  enum: SUPPORTED_OPERATORS,
                },
                expected: { type: Type.STRING },
                wordStyleText: { type: Type.STRING },
              },
              required: [
                "title",
                "checkType",
                "severity",
                "selectorType",
                "selectorValue",
                "fact",
                "operator",
              ],
            },
          },
        },
        required: ["drafts"],
      },
    },
  });

  const resultText = response.text;
  if (!resultText) {
    throw new Error("No response from Gemini while drafting fact-based rules.");
  }

  const parsed = JSON.parse(resultText);
  const drafts = Array.isArray(parsed?.drafts) ? parsed.drafts : [];

  return drafts
    .filter((draft: any) => draft?.selectorValue?.trim())
    .map((draft: any, index: number) => {
      const precisionConfig: PrecisionRuleConfig = {
        selector: {
          type: cleanSelectorType(draft.selectorType),
          value: String(draft.selectorValue || "").trim(),
          layerKind: cleanLayerKind(draft.layerKind),
        },
        fact: cleanFact(draft.fact),
        operator: cleanOperator(draft.operator),
        expected: coerceExpectedValue(draft.expected),
        wordStyleText: draft.wordStyleText?.trim() || undefined,
      };

      return {
        id: `${brandId}-rule-${Date.now()}-${indexStart + index}`,
        title: String(draft.title || `Fact Rule ${index + 1}`).trim(),
        instruction: createPrecisionRuleInstruction(precisionConfig),
        checkType:
          checkTypes.includes(draft.checkType)
            ? draft.checkType
            : draft.checkType?.trim() || checkTypes[0] || "General",
        severity: cleanSeverity(draft.severity),
        enabled: true,
        engine: "precision" as const,
        source: "brand" as const,
        brandId,
        precisionConfig,
      } satisfies BrandRule;
    });
};
