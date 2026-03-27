import {
  BrandConfig,
  ComplianceResult,
  ComplianceRuleDefinition,
  PlatformConfig,
  PromptLayerConfig,
  RuleMode,
} from "../types";

const sanitizeTitle = (value: string) => value.trim() || "Rule";

export const buildPlatformRuleDefinitions = (
  platform?: PlatformConfig | null
): ComplianceRuleDefinition[] => {
  if (!platform?.complianceRules?.length) {
    return [];
  }

  return platform.complianceRules
    .map((instruction, index) => instruction.trim())
    .filter(Boolean)
    .map((instruction, index) => ({
      id: `platform:${platform.id}:${index}`,
      title: `Platform Rule ${index + 1}`,
      instruction,
      enabled: true,
      engine: "visual" as const,
      source: "platform" as const,
    }));
};

export const buildBrandRuleDefinitions = (
  brand?: BrandConfig | null
): ComplianceRuleDefinition[] => {
  if (!brand?.rules?.length) {
    return [];
  }

  return brand.rules
    .filter((rule) => rule.enabled !== false)
    .map((rule, index) => ({
      ...rule,
      id: rule.id || `brand:${brand.id}:${index}`,
      title: sanitizeTitle(rule.title),
      instruction: rule.instruction.trim(),
      enabled: rule.enabled !== false,
      engine: rule.engine || "visual",
      severity: rule.severity || "major",
      source: "brand",
      brandId: brand.id,
    }))
    .filter((rule) => rule.instruction.length > 0);
};

export const buildEvaluationRules = ({
  platform,
  brand,
  ruleMode = "platform",
}: {
  platform?: PlatformConfig | null;
  brand?: BrandConfig | null;
  ruleMode?: RuleMode;
}): ComplianceRuleDefinition[] => {
  const rules: ComplianceRuleDefinition[] = [];

  if (ruleMode === "platform" || ruleMode === "combined") {
    rules.push(...buildPlatformRuleDefinitions(platform));
  }

  if (ruleMode === "brand" || ruleMode === "combined") {
    rules.push(...buildBrandRuleDefinitions(brand));
  }

  return rules.filter((rule) => rule.enabled !== false);
};

export const buildPromptLayerConfig = ({
  platform,
  brand,
  ruleMode = "platform",
}: {
  platform?: PlatformConfig | null;
  brand?: BrandConfig | null;
  ruleMode?: RuleMode;
}): PromptLayerConfig => ({
  platformName: platform?.name,
  platformSystemPrompt: platform?.systemPrompt,
  brandName: brand?.name,
  brandDescription: brand?.description,
  brandSystemPrompt: brand?.systemPrompt,
  ruleMode,
});

export const getRulePromptLabel = (rule: ComplianceRuleDefinition): string => {
  const title = sanitizeTitle(rule.title);
  return title === "Rule" ? rule.instruction : `${title}: ${rule.instruction}`;
};

export const groupResultsByCheckType = (
  results: ComplianceResult[]
): Array<{ checkType: string; results: ComplianceResult[] }> => {
  const grouped = new Map<string, ComplianceResult[]>();

  results.forEach((result) => {
    const key = result.checkType || "General";
    const bucket = grouped.get(key) || [];
    bucket.push(result);
    grouped.set(key, bucket);
  });

  return Array.from(grouped.entries()).map(([checkType, groupedResults]) => ({
    checkType,
    results: groupedResults,
  }));
};

export const groupResultsByEngineAndCheckType = (
  results: ComplianceResult[]
): Array<{
  engine: "visual" | "precision";
  label: string;
  groups: Array<{ checkType: string; results: ComplianceResult[] }>;
}> => {
  const visual = results.filter((result) => (result.engine || "visual") === "visual");
  const precision = results.filter((result) => result.engine === "precision");

  return [
    {
      engine: "visual",
      label: "Visual Rules",
      groups: groupResultsByCheckType(visual),
    },
    {
      engine: "precision",
      label: "Fact-Based Rules",
      groups: groupResultsByCheckType(precision),
    },
  ].filter((entry) => entry.groups.length > 0);
};

export const groupRuleDefinitionsByEngineAndCheckType = (
  rules: ComplianceRuleDefinition[]
): Array<{
  engine: "visual" | "precision";
  label: string;
  groups: Array<{ checkType: string; rules: ComplianceRuleDefinition[] }>;
}> => {
  const groupRulesByCheckType = (engineRules: ComplianceRuleDefinition[]) => {
    const grouped = new Map<string, ComplianceRuleDefinition[]>();

    engineRules.forEach((rule) => {
      const key = rule.checkType || "General";
      const bucket = grouped.get(key) || [];
      bucket.push(rule);
      grouped.set(key, bucket);
    });

    return Array.from(grouped.entries()).map(([checkType, groupedRules]) => ({
      checkType,
      rules: groupedRules,
    }));
  };

  const visual = rules.filter((rule) => (rule.engine || "visual") === "visual");
  const precision = rules.filter((rule) => rule.engine === "precision");

  return [
    {
      engine: "visual",
      label: "Visual Rules",
      groups: groupRulesByCheckType(visual),
    },
    {
      engine: "precision",
      label: "Fact-Based Rules",
      groups: groupRulesByCheckType(precision),
    },
  ].filter((entry) => entry.groups.length > 0);
};
