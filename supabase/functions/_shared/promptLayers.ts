import { ComplianceRuleDefinition } from "./types.ts";

export interface PromptLayerConfig {
  platformName?: string;
  platformSystemPrompt?: string;
  brandName?: string;
  brandDescription?: string;
  brandSystemPrompt?: string;
  ruleMode?: "platform" | "brand" | "combined";
}

const clean = (value?: string | null) => value?.trim() || "";

const section = (label: string, value?: string | null) => {
  const normalized = clean(value);
  return normalized ? `${label}:\n${normalized}` : "";
};

const joinSections = (parts: Array<string | undefined>) =>
  parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join("\n\n");

const getRulePromptLabel = (rule: ComplianceRuleDefinition) =>
  rule.title?.trim()
    ? `${rule.title.trim()}: ${rule.instruction}`
    : rule.instruction;

export const normalizePromptLayerConfig = (
  value?: PromptLayerConfig | string
): PromptLayerConfig => {
  if (!value || typeof value === "string") {
    return {};
  }

  return value;
};

export const DEFAULT_ANALYSIS_SYSTEM_PROMPT = `
You are a meticulous creative-operations analyst.
Follow the extraction task exactly, be literal, and avoid inventing elements.
Favor precise visual observation over assumptions.
`.trim();

export const DEFAULT_COMPLIANCE_SYSTEM_PROMPT = `
You are a strict creative QC reviewer and brand compliance specialist.
Be conservative, specific, and actionable.
Only mark PASS when the creative clearly satisfies the requirement.
`.trim();

const buildContextSection = (config: PromptLayerConfig) =>
  joinSections([
    config.platformName
      ? `Platform: ${config.platformName}`
      : undefined,
    config.brandName ? `Brand: ${config.brandName}` : undefined,
    section("Brand Description", config.brandDescription),
    config.ruleMode ? `Rule Mode: ${config.ruleMode}` : undefined,
  ]);

export const buildAnalysisPrompt = ({
  taskPrompt,
  config,
}: {
  taskPrompt: string;
  config?: PromptLayerConfig | string;
}) => {
  const layers = normalizePromptLayerConfig(config);

  return joinSections([
    section("System Prompt", DEFAULT_ANALYSIS_SYSTEM_PROMPT),
    section("Platform System Prompt", layers.platformSystemPrompt),
    section("Brand System Prompt", layers.brandSystemPrompt),
    section("Context", buildContextSection(layers)),
    section("Task Prompt", taskPrompt),
  ]);
};

export const buildCompliancePrompt = ({
  rules,
  config,
}: {
  rules: ComplianceRuleDefinition[];
  config?: PromptLayerConfig | string;
}) => {
  const layers = normalizePromptLayerConfig(config);
  const ruleModeLabel = layers.ruleMode || "platform";

  return joinSections([
    section("System Prompt", DEFAULT_COMPLIANCE_SYSTEM_PROMPT),
    section("Platform System Prompt", layers.platformSystemPrompt),
    section("Brand System Prompt", layers.brandSystemPrompt),
    section("Context", buildContextSection(layers)),
    section(
      "Task Prompt",
      `
Evaluate the provided advertisement image against the rule list.

For each rule:
1. Determine if the image passes, fails, or has a warning.
2. Provide specific reasoning for your decision.
3. If the rule FAILS or has a WARNING, provide a specific, actionable suggestion to fix it.
4. Categorize each rule into one of these categories:
   - "brand"
   - "accessibility"
   - "policy"
   - "quality"
5. Assign a severity level:
   - "critical"
   - "major"
   - "minor"

Be extremely strict. Visual consistency is key.
Current rule mode: ${ruleModeLabel}.
      `.trim()
    ),
    section(
      "Rules To Check",
      rules.map((rule, index) => `${index + 1}. ${getRulePromptLabel(rule)}`).join("\n")
    ),
  ]);
};
