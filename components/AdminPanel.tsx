import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  Check,
  Eye,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  deleteBrandConfig,
  deletePlatformConfig,
  loadBrands,
  loadPlatforms,
  resetBrands,
  resetPlatforms,
  saveBrandConfig,
  savePlatformConfig,
} from "../services/configService";
import {
  BrandConfig,
  BrandRule,
  PlatformConfig,
  PrecisionFact,
  PrecisionLayerKind,
  PrecisionLayerFactRef,
  PrecisionOperator,
  PrecisionRuleConfig,
  PrecisionSelector,
} from "../types";
import { createFactRuleDraftsFromPrompt } from "../lib/brandRuleDraft";
import { createPrecisionRuleInstruction } from "../lib/precisionRules";

interface AdminPanelProps {
  onClose: () => void;
  currentPlatforms: PlatformConfig[];
}

type AdminDomain = "platforms" | "brands";
type BrandAdminMode = "view" | "edit";
type BrandRuleEngineFilter = "all" | "visual" | "precision";

const PRECISION_FACT_OPTIONS: Array<{
  value: PrecisionFact;
  label: string;
}> = [
  { value: "fontSize", label: "Font Size" },
  { value: "fontWeight", label: "Font Weight" },
  { value: "fontFamilyName", label: "Font Name" },
  { value: "fontFamilyId", label: "Font ID" },
  { value: "fontStyle", label: "Font Style" },
  { value: "textAlign", label: "Text Align" },
  { value: "textFill", label: "Text Fill" },
  { value: "fill", label: "Fill" },
  { value: "cornerRadius", label: "Corner Radius" },
  { value: "opacity", label: "Opacity" },
  { value: "objectFit", label: "Object Fit" },
  { value: "imageWidth", label: "Image Width" },
  { value: "imageHeight", label: "Image Height" },
  { value: "imageLeft", label: "Image Left" },
  { value: "imageTop", label: "Image Top" },
  { value: "scale", label: "Scale" },
  { value: "scaleX", label: "Scale X" },
  { value: "scaleY", label: "Scale Y" },
  { value: "x", label: "X" },
  { value: "y", label: "Y" },
  { value: "width", label: "Width" },
  { value: "height", label: "Height" },
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
  { value: "top", label: "Top" },
  { value: "bottom", label: "Bottom" },
  { value: "centerX", label: "Center X" },
  { value: "centerY", label: "Center Y" },
  { value: "wordStyle.fontSize", label: "Word Style Font Size" },
  { value: "wordStyle.fontWeight", label: "Word Style Font Weight" },
  { value: "wordStyle.fontFamilyName", label: "Word Style Font Name" },
  { value: "wordStyle.fontFamilyId", label: "Word Style Font ID" },
  { value: "wordStyle.fontStyle", label: "Word Style Font Style" },
  { value: "wordStyle.superscript", label: "Word Style Superscript" },
  { value: "wordStyle.subscript", label: "Word Style Subscript" },
  { value: "wordStyle.deltaY", label: "Word Style Delta Y" },
];

const PRECISION_LAYER_KIND_OPTIONS: Array<{
  value: PrecisionLayerKind | "";
  label: string;
}> = [
  { value: "", label: "Any Layer Type" },
  { value: "text", label: "Text Layer" },
  { value: "shape", label: "Shape Layer" },
  { value: "image", label: "Image Layer" },
];

const PRECISION_OPERATOR_OPTIONS: Array<{
  value: PrecisionOperator;
  label: string;
}> = [
  { value: "eq", label: "Equals" },
  { value: "neq", label: "Does Not Equal" },
  { value: "gt", label: "Greater Than" },
  { value: "gte", label: "Greater Than or Equal" },
  { value: "lt", label: "Less Than" },
  { value: "lte", label: "Less Than or Equal" },
  { value: "between", label: "Between" },
];

const createDefaultSelector = (): PrecisionSelector => ({
  type: "layerName",
  value: "",
  layerKind: undefined,
});

const createDefaultPrecisionConfig = (): PrecisionRuleConfig => ({
  selector: createDefaultSelector(),
  fact: "fontSize",
  operator: "eq",
  expected: 0,
});

const createDefaultLayerReference = (): PrecisionLayerFactRef => ({
  kind: "layerFact",
  selector: createDefaultSelector(),
  fact: "top",
});

const isWordStyleFact = (fact?: PrecisionFact | string) =>
  Boolean(fact && fact.startsWith("wordStyle."));

const toEditableValue = (value: string | number | boolean | undefined) =>
  value === undefined ? "" : String(value);

const isBooleanFact = (fact?: PrecisionFact) =>
  fact === "wordStyle.superscript" || fact === "wordStyle.subscript";

const createEmptyPlatform = (): PlatformConfig => ({
  id: `platform-${Date.now()}`,
  name: "New Platform",
  prompt: "Describe how this platform should analyze creatives.",
  systemPrompt: "",
  category: "other",
  complianceRules: [],
});

const createEmptyBrand = (): BrandConfig => ({
  id: `brand-${Date.now()}`,
  name: "New Brand",
  description: "",
  systemPrompt: "",
  checkTypes: ["General"],
  rules: [],
});

const createEmptyBrandRule = (brandId: string, index: number): BrandRule => ({
  id: `${brandId}-rule-${Date.now()}-${index}`,
  title: "New Rule",
  instruction: "",
  checkType: "General",
  severity: "major",
  enabled: true,
  engine: "visual",
  source: "brand",
  brandId,
  precisionConfig: createDefaultPrecisionConfig(),
});

export const AdminPanel: React.FC<AdminPanelProps> = ({
  onClose,
  currentPlatforms,
}) => {
  const [activeDomain, setActiveDomain] = useState<AdminDomain>("brands");
  const [platforms, setPlatforms] = useState<PlatformConfig[]>(currentPlatforms);
  const [brands, setBrands] = useState<BrandConfig[]>([]);
  const [selectedPlatformId, setSelectedPlatformId] = useState<string | null>(null);
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  const [platformForm, setPlatformForm] = useState<PlatformConfig | null>(null);
  const [brandForm, setBrandForm] = useState<BrandConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [brandRulePrompt, setBrandRulePrompt] = useState("");
  const [promptRuleDrafts, setPromptRuleDrafts] = useState<BrandRule[]>([]);
  const [isGeneratingPromptDrafts, setIsGeneratingPromptDrafts] = useState(false);
  const [brandAdminMode, setBrandAdminMode] =
    useState<BrandAdminMode>("view");
  const [brandRuleSearch, setBrandRuleSearch] = useState("");
  const [brandRuleTypeFilter, setBrandRuleTypeFilter] = useState<string[]>([]);
  const [brandRuleEngineFilter, setBrandRuleEngineFilter] =
    useState<BrandRuleEngineFilter>("all");
  const [isBrandSettingsOpen, setIsBrandSettingsOpen] = useState(false);
  const [brandSettingsDraft, setBrandSettingsDraft] =
    useState<BrandConfig | null>(null);
  const [editingRuleIndex, setEditingRuleIndex] = useState<number | null>(null);
  const [ruleDraft, setRuleDraft] = useState<BrandRule | null>(null);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const [isCheckTypeModalOpen, setIsCheckTypeModalOpen] = useState(false);
  const [newCheckTypeName, setNewCheckTypeName] = useState("");
  const [isTypeFilterOpen, setIsTypeFilterOpen] = useState(false);
  const [isMainActionsMenuOpen, setIsMainActionsMenuOpen] = useState(false);
  const [openRuleActionIndex, setOpenRuleActionIndex] = useState<number | null>(
    null
  );

  const loadAll = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [loadedPlatforms, loadedBrands] = await Promise.all([
        loadPlatforms(),
        loadBrands(),
      ]);

      setPlatforms(loadedPlatforms);
      setBrands(loadedBrands);

      if (!selectedPlatformId && loadedPlatforms[0]) {
        setSelectedPlatformId(loadedPlatforms[0].id);
        setPlatformForm({
          ...loadedPlatforms[0],
          complianceRules: [...(loadedPlatforms[0].complianceRules || [])],
        });
      }

      if (!selectedBrandId && loadedBrands[0]) {
        setSelectedBrandId(loadedBrands[0].id);
        setBrandForm({
          ...loadedBrands[0],
          checkTypes: [...(loadedBrands[0].checkTypes || [])],
          rules: loadedBrands[0].rules.map((rule) => ({ ...rule })),
        });
      }
    } catch (loadError: any) {
      setError(loadError.message || "Failed to load configuration.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const filteredPlatforms = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return platforms;
    return platforms.filter((platform) => {
      return (
        platform.name.toLowerCase().includes(query) ||
        platform.id.toLowerCase().includes(query) ||
        platform.prompt.toLowerCase().includes(query) ||
        platform.systemPrompt?.toLowerCase().includes(query) ||
        platform.complianceRules?.some((rule) => rule.toLowerCase().includes(query))
      );
    });
  }, [platforms, searchQuery]);

  const filteredBrands = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return brands;
    return brands.filter((brand) => {
      return (
        brand.name.toLowerCase().includes(query) ||
        brand.id.toLowerCase().includes(query) ||
        brand.description?.toLowerCase().includes(query) ||
        brand.systemPrompt?.toLowerCase().includes(query) ||
        brand.checkTypes.some((checkType) =>
          checkType.toLowerCase().includes(query)
        ) ||
        brand.rules.some(
          (rule) =>
            rule.title.toLowerCase().includes(query) ||
            rule.instruction.toLowerCase().includes(query) ||
            (rule.checkType || "").toLowerCase().includes(query)
        )
      );
    });
  }, [brands, searchQuery]);

  const filteredBrandRules = useMemo(() => {
    if (!brandForm) {
      return [];
    }

    const query = brandRuleSearch.trim().toLowerCase();

    return brandForm.rules
      .map((rule, index) => ({ rule, index }))
      .filter(({ rule }) => {
        const matchesQuery =
          !query ||
          rule.title.toLowerCase().includes(query) ||
          rule.instruction.toLowerCase().includes(query) ||
          (rule.checkType || "").toLowerCase().includes(query) ||
          (rule.severity || "").toLowerCase().includes(query);

        const matchesType =
          brandRuleTypeFilter.length === 0 ||
          brandRuleTypeFilter.includes(rule.checkType || "General");

        const matchesEngine =
          brandRuleEngineFilter === "all" ||
          (rule.engine || "visual") === brandRuleEngineFilter;

        return matchesQuery && matchesType && matchesEngine;
      });
  }, [
    brandForm,
    brandRuleSearch,
    brandRuleTypeFilter,
    brandRuleEngineFilter,
  ]);

  const handleSelectPlatform = (platform: PlatformConfig) => {
    setSelectedPlatformId(platform.id);
    setPlatformForm({
      ...platform,
      complianceRules: [...(platform.complianceRules || [])],
    });
    setError(null);
    setSuccess(null);
    setBrandRulePrompt("");
  };

  const handleSelectBrand = (brand: BrandConfig) => {
    setSelectedBrandId(brand.id);
    setBrandForm({
      ...brand,
      checkTypes: [...brand.checkTypes],
      rules: brand.rules.map((rule) => ({ ...rule })),
    });
    setError(null);
    setSuccess(null);
    setBrandAdminMode("view");
    setBrandRuleSearch("");
    setBrandRuleTypeFilter([]);
    setBrandRuleEngineFilter("all");
    setIsBrandSettingsOpen(false);
    setBrandSettingsDraft(null);
    setEditingRuleIndex(null);
    setRuleDraft(null);
    setIsAddMenuOpen(false);
    setIsPromptModalOpen(false);
    setIsCheckTypeModalOpen(false);
    setNewCheckTypeName("");
    setBrandRulePrompt("");
    setPromptRuleDrafts([]);
    setIsTypeFilterOpen(false);
    setIsMainActionsMenuOpen(false);
    setOpenRuleActionIndex(null);
  };

  const flashSuccess = (message: string) => {
    setSuccess(message);
    window.setTimeout(() => setSuccess(null), 2500);
  };

  const updateRuleDraft = (patch: Partial<BrandRule>) => {
    setRuleDraft((current) => (current ? { ...current, ...patch } : current));
  };

  const updatePrecisionConfig = (patch: Partial<PrecisionRuleConfig>) => {
    setRuleDraft((current) => {
      if (!current) return current;
      const precisionConfig = {
        ...(current.precisionConfig || createDefaultPrecisionConfig()),
        ...patch,
      };
      return { ...current, precisionConfig };
    });
  };

  const updatePrecisionSelector = (patch: Partial<PrecisionSelector>) => {
    setRuleDraft((current) => {
      if (!current) return current;
      const precisionConfig = current.precisionConfig || createDefaultPrecisionConfig();
      return {
        ...current,
        precisionConfig: {
          ...precisionConfig,
          selector: {
            ...precisionConfig.selector,
            ...patch,
          },
        },
      };
    });
  };

  const updatePromptRuleDraft = (index: number, patch: Partial<BrandRule>) => {
    setPromptRuleDrafts((current) =>
      current.map((rule, currentIndex) =>
        currentIndex === index ? { ...rule, ...patch } : rule
      )
    );
  };

  const updatePromptRulePrecisionConfig = (
    index: number,
    patch: Partial<PrecisionRuleConfig>
  ) => {
    setPromptRuleDrafts((current) =>
      current.map((rule, currentIndex) => {
        if (currentIndex !== index) {
          return rule;
        }

        const nextPrecisionConfig = {
          ...(rule.precisionConfig || createDefaultPrecisionConfig()),
          ...patch,
        };

        return {
          ...rule,
          precisionConfig: nextPrecisionConfig,
          instruction: createPrecisionRuleInstruction(nextPrecisionConfig),
        };
      })
    );
  };

  const updatePromptRuleSelector = (
    index: number,
    patch: Partial<PrecisionSelector>
  ) => {
    setPromptRuleDrafts((current) =>
      current.map((rule, currentIndex) => {
        if (currentIndex !== index) {
          return rule;
        }

        const precisionConfig = rule.precisionConfig || createDefaultPrecisionConfig();
        const nextPrecisionConfig = {
          ...precisionConfig,
          selector: {
            ...precisionConfig.selector,
            ...patch,
          },
        };

        return {
          ...rule,
          precisionConfig: nextPrecisionConfig,
          instruction: createPrecisionRuleInstruction(nextPrecisionConfig),
        };
      })
    );
  };

  const updateLayerReference = (
    key: "reference" | "min" | "max",
    patch: Partial<PrecisionLayerFactRef>
  ) => {
    setRuleDraft((current) => {
      if (!current) return current;
      const precisionConfig = current.precisionConfig || createDefaultPrecisionConfig();
      const existing =
        key === "reference" && precisionConfig.reference?.kind === "layerFact"
          ? precisionConfig.reference
          : key !== "reference" &&
            precisionConfig[key]?.kind === "layerFact"
          ? (precisionConfig[key] as PrecisionLayerFactRef)
          : createDefaultLayerReference();

      return {
        ...current,
        precisionConfig: {
          ...precisionConfig,
          [key]: {
            ...existing,
            ...patch,
            selector: {
              ...existing.selector,
              ...(patch.selector || {}),
            },
          },
        },
      };
    });
  };

  const openBrandSettings = () => {
    if (!brandForm) return;
    setBrandSettingsDraft({
      ...brandForm,
      checkTypes: [...brandForm.checkTypes],
      rules: brandForm.rules.map((rule) => ({ ...rule })),
    });
    setIsBrandSettingsOpen(true);
  };

  const saveBrandSettings = async () => {
    if (!brandSettingsDraft) return;
    const saved = await persistBrand(
      {
        ...brandForm!,
        id: brandSettingsDraft.id,
        name: brandSettingsDraft.name,
        description: brandSettingsDraft.description,
        systemPrompt: brandSettingsDraft.systemPrompt,
      },
      "Brand settings saved."
    );
    if (!saved) return;
    setIsBrandSettingsOpen(false);
    setBrandSettingsDraft(null);
  };

  const openRuleEditor = (index?: number) => {
    if (!brandForm) return;

    if (typeof index === "number" && brandForm.rules[index]) {
      setEditingRuleIndex(index);
      setRuleDraft({
        ...brandForm.rules[index],
        precisionConfig:
          brandForm.rules[index].precisionConfig || createDefaultPrecisionConfig(),
      });
      return;
    }

    setEditingRuleIndex(null);
    setRuleDraft(createEmptyBrandRule(brandForm.id, brandForm.rules.length));
  };

  const openPrecisionRuleEditor = () => {
    if (!brandForm) return;
    setEditingRuleIndex(null);
    setRuleDraft({
      ...createEmptyBrandRule(brandForm.id, brandForm.rules.length),
      title: "New Fact-Based Rule",
      engine: "precision",
      precisionConfig: createDefaultPrecisionConfig(),
      instruction: createPrecisionRuleInstruction(createDefaultPrecisionConfig()),
    });
  };

  const saveRuleDraft = async () => {
    if (!brandForm || !ruleDraft) return;

    const isPrecision = (ruleDraft.engine || "visual") === "precision";
    const precisionConfig = ruleDraft.precisionConfig || createDefaultPrecisionConfig();
    const hasReferenceValue = Boolean(
      precisionConfig.reference?.selector.value?.trim()
    );
    const generatedInstruction = isPrecision
      ? createPrecisionRuleInstruction(precisionConfig)
      : ruleDraft.instruction.trim();

    const cleanedRule: BrandRule = {
      ...ruleDraft,
      id:
        ruleDraft.id ||
        `${brandForm.id}-rule-${Date.now()}-${brandForm.rules.length}`,
      title: ruleDraft.title.trim() || "New Rule",
      instruction: generatedInstruction,
      checkType:
        ruleDraft.checkType || brandForm.checkTypes[0] || "General",
      severity: ruleDraft.severity || "major",
      engine: ruleDraft.engine || "visual",
      enabled: ruleDraft.enabled !== false,
      source: "brand",
      brandId: brandForm.id,
      precisionConfig,
    };

    if (!cleanedRule.instruction) {
      setError("Rule instruction is required.");
      return;
    }

    if (isPrecision) {
      if (!precisionConfig.selector.value.trim()) {
        setError("Precision rule selector value is required.");
        return;
      }

      if (isWordStyleFact(precisionConfig.fact) && !precisionConfig.wordStyleText?.trim()) {
        setError("Word style text is required for word style precision rules.");
        return;
      }

      if (precisionConfig.operator === "between") {
        if (!precisionConfig.min || !precisionConfig.max) {
          setError("Between rules require both minimum and maximum bounds.");
          return;
        }
      } else if (
        (precisionConfig.expected === undefined ||
          String(precisionConfig.expected).trim() === "") &&
        !hasReferenceValue
      ) {
        setError("Precision rules require an expected value or a reference layer.");
        return;
      }
    }

    const nextRules = [...brandForm.rules];

    if (editingRuleIndex === null) {
      nextRules.push(cleanedRule);
    } else {
      nextRules[editingRuleIndex] = cleanedRule;
    }

    const saved = await persistBrand(
      { ...brandForm, rules: nextRules },
      editingRuleIndex === null ? "Rule added." : "Rule updated."
    );
    if (!saved) return;
    setEditingRuleIndex(null);
    setRuleDraft(null);
    setIsAddMenuOpen(false);
    setError(null);
  };

  const removeBrandRule = async (index: number) => {
    if (!brandForm) return;
    const nextRules = [...brandForm.rules];
    nextRules.splice(index, 1);
    await persistBrand({ ...brandForm, rules: nextRules }, "Rule deleted.");
  };

  const addCheckType = async () => {
    if (!brandForm) return;

    const cleaned = newCheckTypeName.trim();
    if (!cleaned) {
      setError("Check type name is required.");
      return;
    }

    if (brandForm.checkTypes.includes(cleaned)) {
      setError("That check type already exists.");
      return;
    }

    const saved = await persistBrand(
      {
        ...brandForm,
        checkTypes: [...brandForm.checkTypes, cleaned],
      },
      "Check type added."
    );
    if (!saved) return;
    setNewCheckTypeName("");
    setIsCheckTypeModalOpen(false);
    setIsAddMenuOpen(false);
    setError(null);
  };

  const toggleBrandRuleTypeFilter = (checkType: string) => {
    setBrandRuleTypeFilter((current) =>
      current.includes(checkType)
        ? current.filter((item) => item !== checkType)
        : [...current, checkType]
    );
  };

  const persistBrand = async (
    nextBrand: BrandConfig,
    successMessage = "Brand rule library saved."
  ) => {
    if (!nextBrand.id || !nextBrand.name.trim()) {
      setError("Brand ID and name are required.");
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const cleanedCheckTypes = nextBrand.checkTypes
        .map((checkType) => checkType.trim())
        .filter(Boolean);

      const cleanedRules = nextBrand.rules
        .map((rule, index) => ({
          ...rule,
          id: rule.id || `${nextBrand.id}-rule-${index}`,
          title: rule.title.trim() || `Rule ${index + 1}`,
          instruction: rule.instruction.trim(),
          checkType: rule.checkType || cleanedCheckTypes[0] || "General",
          severity: rule.severity || "major",
          enabled: rule.enabled !== false,
          engine: rule.engine || "visual",
          source: "brand" as const,
          brandId: nextBrand.id,
        }))
        .filter((rule) => rule.instruction.length > 0);

      const cleaned: BrandConfig = {
        ...nextBrand,
        name: nextBrand.name.trim(),
        description: nextBrand.description?.trim() || "",
        systemPrompt: nextBrand.systemPrompt?.trim() || "",
        checkTypes: cleanedCheckTypes.length > 0 ? cleanedCheckTypes : ["General"],
        rules: cleanedRules,
      };

      const next = await saveBrandConfig(cleaned);
      setBrands(next);
      setSelectedBrandId(cleaned.id);
      setBrandForm(cleaned);
      flashSuccess(successMessage);
      return cleaned;
    } catch (saveError: any) {
      setError(saveError.message || "Failed to save brand.");
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const handleSavePlatform = async () => {
    if (!platformForm?.id || !platformForm.name.trim() || !platformForm.prompt.trim()) {
      setError("Platform ID, name, and prompt are required.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const cleaned: PlatformConfig = {
        ...platformForm,
        name: platformForm.name.trim(),
        prompt: platformForm.prompt.trim(),
        systemPrompt: platformForm.systemPrompt?.trim() || "",
        complianceRules: (platformForm.complianceRules || [])
          .map((rule) => rule.trim())
          .filter(Boolean),
      };

      const next = await savePlatformConfig(cleaned);
      setPlatforms(next);
      setSelectedPlatformId(cleaned.id);
      setPlatformForm(cleaned);
      flashSuccess("Platform saved.");
    } catch (saveError: any) {
      setError(saveError.message || "Failed to save platform.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveBrand = async () => {
    if (!brandForm) return;
    await persistBrand(brandForm);
  };

  const handleDelete = async () => {
    if (activeDomain === "platforms" && selectedPlatformId) {
      if (!confirm("Delete this platform configuration?")) return;
      setIsLoading(true);
      try {
        const next = await deletePlatformConfig(selectedPlatformId);
        setPlatforms(next);
        const nextPlatform = next[0] || null;
        setSelectedPlatformId(nextPlatform?.id || null);
        setPlatformForm(
          nextPlatform
            ? {
                ...nextPlatform,
                complianceRules: [...(nextPlatform.complianceRules || [])],
              }
            : null
        );
        flashSuccess("Platform deleted.");
      } catch (deleteError: any) {
        setError(deleteError.message || "Failed to delete platform.");
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (activeDomain === "brands" && selectedBrandId) {
      if (!confirm("Delete this brand rule set?")) return;
      setIsLoading(true);
      try {
        const next = await deleteBrandConfig(selectedBrandId);
        setBrands(next);
        const nextBrand = next[0] || null;
        setSelectedBrandId(nextBrand?.id || null);
        setBrandForm(
          nextBrand
            ? {
                ...nextBrand,
                checkTypes: [...nextBrand.checkTypes],
                rules: nextBrand.rules.map((rule) => ({ ...rule })),
              }
            : null
        );
        flashSuccess("Brand deleted.");
      } catch (deleteError: any) {
        setError(deleteError.message || "Failed to delete brand.");
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleReset = async () => {
    if (
      !confirm(
        activeDomain === "platforms"
          ? "Restore platform defaults and clear saved overrides?"
          : "Restore brand defaults and clear saved overrides?"
      )
    ) {
      return;
    }

    setIsLoading(true);
    try {
      if (activeDomain === "platforms") {
        const next = await resetPlatforms();
        setPlatforms(next);
        setSelectedPlatformId(next[0]?.id || null);
        setPlatformForm(
          next[0]
            ? { ...next[0], complianceRules: [...(next[0].complianceRules || [])] }
            : null
        );
        flashSuccess("Platform defaults restored.");
      } else {
        const next = await resetBrands();
        setBrands(next);
        setSelectedBrandId(next[0]?.id || null);
        setBrandForm(
          next[0]
            ? {
                ...next[0],
                checkTypes: [...next[0].checkTypes],
                rules: next[0].rules.map((rule) => ({ ...rule })),
              }
            : null
        );
        flashSuccess("Brand defaults restored.");
      }
    } catch (resetError: any) {
      setError(resetError.message || "Failed to reset configuration.");
    } finally {
      setIsLoading(false);
    }
  };

  const savePromptDraftAtIndex = async (index: number) => {
    if (!brandForm) {
      setError("Select or create a brand first.");
      return;
    }

    const draft = promptRuleDrafts[index];
    if (!draft) {
      return;
    }

    const precisionConfig = draft.precisionConfig || createDefaultPrecisionConfig();
    const nextCheckType = draft.checkType || "General";
    const nextCheckTypes = brandForm.checkTypes.includes(nextCheckType)
      ? brandForm.checkTypes
      : [...brandForm.checkTypes, nextCheckType];

    const cleanedDraft: BrandRule = {
      ...draft,
      title: draft.title.trim() || `Fact Rule ${index + 1}`,
      checkType: nextCheckType,
      instruction: createPrecisionRuleInstruction(precisionConfig),
      severity: draft.severity || "major",
      enabled: draft.enabled !== false,
      engine: "precision",
      source: "brand",
      brandId: brandForm.id,
      precisionConfig,
    };

    const saved = await persistBrand(
      {
        ...brandForm,
        checkTypes: nextCheckTypes,
        rules: [...brandForm.rules, cleanedDraft],
      },
      "Fact-based rule saved."
    );

    if (!saved) {
      return;
    }

    setPromptRuleDrafts((current) => current.filter((_, currentIndex) => currentIndex !== index));
    setError(null);
  };

  const saveAllPromptDrafts = async () => {
    if (!brandForm || promptRuleDrafts.length === 0) {
      return;
    }

    const nextCheckTypes = Array.from(
      new Set([
        ...brandForm.checkTypes,
        ...promptRuleDrafts.map((rule) => rule.checkType || "General"),
      ])
    );

    const saved = await persistBrand(
      {
        ...brandForm,
        checkTypes: nextCheckTypes,
        rules: [
          ...brandForm.rules,
          ...promptRuleDrafts.map((draft, index) => ({
            ...draft,
            title: draft.title.trim() || `Fact Rule ${index + 1}`,
            instruction: createPrecisionRuleInstruction(
              draft.precisionConfig || createDefaultPrecisionConfig()
            ),
            severity: draft.severity || "major",
            enabled: draft.enabled !== false,
            engine: "precision",
            source: "brand",
            brandId: brandForm.id,
            precisionConfig:
              draft.precisionConfig || createDefaultPrecisionConfig(),
          })),
        ],
      },
      `${promptRuleDrafts.length} fact-based draft${promptRuleDrafts.length === 1 ? "" : "s"} saved.`
    );

    if (!saved) {
      return;
    }

    setPromptRuleDrafts([]);
    setBrandRulePrompt("");
    setIsPromptModalOpen(false);
    setIsAddMenuOpen(false);
    setError(null);
  };

  const handleCreateBrandRuleFromPrompt = async () => {
    if (!brandForm) {
      setError("Select or create a brand first.");
      return;
    }

    if (!brandRulePrompt.trim()) {
      setError("Enter a fact-based rule idea to generate drafts.");
      return;
    }

    setIsGeneratingPromptDrafts(true);
    setError(null);

    try {
      const drafts = await createFactRuleDraftsFromPrompt({
        brandId: brandForm.id,
        prompt: brandRulePrompt,
        checkTypes: brandForm.checkTypes,
        indexStart: brandForm.rules.length,
      });

      if (drafts.length === 0) {
        setError("No fact-based drafts were generated from that prompt.");
        return;
      }

      setPromptRuleDrafts(drafts);
      flashSuccess(`Generated ${drafts.length} fact-based draft${drafts.length === 1 ? "" : "s"}.`);
    } catch (generationError: any) {
      setError(
        generationError.message || "Failed to generate fact-based rule drafts."
      );
    } finally {
      setIsGeneratingPromptDrafts(false);
    }
  };

  const activeList = activeDomain === "platforms" ? filteredPlatforms : filteredBrands;

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-100 dark:bg-zinc-950 overflow-hidden text-slate-900 dark:text-zinc-100">
      <div className="bg-white dark:bg-zinc-950 border-b border-slate-200 dark:border-zinc-800 px-6 py-3 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-zinc-100 leading-tight">
            Configuration Admin
          </h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            Manage platform prompts and brand QC rule libraries.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleReset}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-900 text-slate-600 dark:text-zinc-400"
            title="Restore defaults"
          >
            <RotateCcw size={16} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-900 text-slate-600 dark:text-zinc-400"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {success && (
        <div className="mx-6 mt-4 rounded-lg border border-emerald-100 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 px-4 py-3 flex items-center gap-2">
          <Check size={18} />
          {success}
        </div>
      )}

      {error && (
        <div className="mx-6 mt-4 rounded-lg border border-rose-100 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 px-4 py-3 flex items-center gap-2">
          <AlertTriangle size={18} />
          {error}
        </div>
      )}

      <div className="flex-1 min-h-0 flex overflow-hidden p-6 gap-6">
        <aside className="w-[340px] bg-white dark:bg-zinc-950 rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-200 dark:border-zinc-800 space-y-3">
            <div className="inline-flex rounded-xl bg-slate-100 dark:bg-zinc-900 p-1 w-full">
              {(["brands", "platforms"] as AdminDomain[]).map((domain) => (
                <button
                  key={domain}
                  onClick={() => {
                    setActiveDomain(domain);
                    setSearchQuery("");
                    setIsMainActionsMenuOpen(false);
                  }}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    activeDomain === domain
                      ? "bg-white dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 shadow-sm"
                      : "text-slate-500 dark:text-zinc-500 hover:text-slate-900 dark:hover:text-zinc-100"
                  }`}
                >
                  {domain === "platforms" ? "Platforms" : "Brands"}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search ${activeDomain}...`}
                className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <button
              onClick={() => {
                if (activeDomain === "platforms") {
                  const platform = createEmptyPlatform();
                  setSelectedPlatformId(platform.id);
                  setPlatformForm(platform);
                } else {
                  const brand = createEmptyBrand();
                  setSelectedBrandId(brand.id);
                  setBrandForm(brand);
                  setBrandAdminMode("edit");
                  setBrandRuleSearch("");
                  setBrandRuleTypeFilter([]);
                  setIsBrandSettingsOpen(false);
                  setBrandSettingsDraft(null);
                  setEditingRuleIndex(null);
                  setRuleDraft(null);
                  setIsAddMenuOpen(false);
                  setIsPromptModalOpen(false);
                  setIsCheckTypeModalOpen(false);
                  setNewCheckTypeName("");
                  setIsTypeFilterOpen(false);
                  setIsMainActionsMenuOpen(false);
                  setOpenRuleActionIndex(null);
                }
                setError(null);
                setSuccess(null);
              }}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-500 text-white px-4 py-2.5 text-sm font-medium"
            >
              <Plus size={16} />
              Add New {activeDomain === "platforms" ? "Platform" : "Brand"}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {activeList.length > 0 ? (
              activeDomain === "platforms" ? (
                filteredPlatforms.map((platform) => (
                  <button
                    key={platform.id}
                    onClick={() => handleSelectPlatform(platform)}
                    className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${
                      selectedPlatformId === platform.id
                        ? "border-indigo-200 bg-indigo-50 dark:border-zinc-700 dark:bg-zinc-900"
                        : "border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:border-slate-300 dark:hover:border-zinc-700"
                    }`}
                  >
                    <div className="font-medium text-slate-900 dark:text-zinc-100">{platform.name}</div>
                    <div className="text-xs text-slate-500 dark:text-zinc-400 mt-1">{platform.id}</div>
                    <div className="text-xs text-slate-400 dark:text-zinc-500 mt-2">
                      {platform.complianceRules?.length || 0} rules
                    </div>
                  </button>
                ))
              ) : (
                filteredBrands.map((brand) => (
                  <button
                    key={brand.id}
                    onClick={() => handleSelectBrand(brand)}
                    className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${
                      selectedBrandId === brand.id
                        ? "border-indigo-200 bg-indigo-50 dark:border-zinc-700 dark:bg-zinc-900"
                        : "border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:border-slate-300 dark:hover:border-zinc-700"
                    }`}
                  >
                    <div className="font-medium text-slate-900 dark:text-zinc-100">{brand.name}</div>
                    <div className="text-xs text-slate-500 dark:text-zinc-400 mt-1">{brand.id}</div>
                    <div className="text-xs text-slate-400 dark:text-zinc-500 mt-2">
                      {brand.rules.length} rules · {brand.checkTypes.length} check types
                    </div>
                  </button>
                ))
              )
            ) : (
              <div className="text-center text-sm text-slate-400 dark:text-zinc-500 py-10">
                No matching {activeDomain}.
              </div>
            )}
          </div>
        </aside>

        <main className="flex-1 min-w-0 bg-white dark:bg-zinc-950 rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-zinc-800 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-zinc-100">
                {activeDomain === "platforms"
                  ? platformForm?.name || "Platform Details"
                  : brandForm?.name || "Brand Details"}
              </h3>
              <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
                {activeDomain === "platforms"
                  ? platformForm?.id || "Select a platform to edit."
                  : brandForm?.id || "Select a brand to review."}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {activeDomain === "brands" && brandForm && (
                <>
                  <div className="inline-flex rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 p-1">
                    <button
                      onClick={() => setBrandAdminMode("view")}
                      className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        brandAdminMode === "view"
                          ? "bg-white dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 shadow-sm"
                          : "text-slate-500 dark:text-zinc-500 hover:text-slate-900 dark:hover:text-zinc-100"
                      }`}
                    >
                      <Eye size={14} />
                      View
                    </button>
                    <button
                      onClick={() => setBrandAdminMode("edit")}
                      className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        brandAdminMode === "edit"
                          ? "bg-white dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 shadow-sm"
                          : "text-slate-500 dark:text-zinc-500 hover:text-slate-900 dark:hover:text-zinc-100"
                      }`}
                    >
                      <Pencil size={14} />
                      Edit
                    </button>
                  </div>

                  <button
                    onClick={openBrandSettings}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-zinc-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-900"
                  >
                    <Settings2 size={14} />
                    Settings
                  </button>

                  <div className="relative">
                    <button
                      onClick={() => setIsAddMenuOpen((open) => !open)}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-zinc-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-900"
                    >
                      <Plus size={14} />
                      Add New
                      <ChevronDown size={14} />
                    </button>

                    {isAddMenuOpen && (
                      <div className="absolute right-0 mt-2 w-52 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lg z-20 overflow-hidden">
                        <button
                          onClick={() => {
                            openRuleEditor();
                            setIsAddMenuOpen(false);
                          }}
                          className="w-full px-4 py-3 text-left text-sm text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800"
                        >
                          Add visual rule
                        </button>
                        <button
                          onClick={() => {
                            openPrecisionRuleEditor();
                            setIsAddMenuOpen(false);
                          }}
                          className="w-full px-4 py-3 text-left text-sm text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800"
                        >
                          Add fact-based rule
                        </button>
                        <button
                          onClick={() => {
                            setIsPromptModalOpen(true);
                            setIsAddMenuOpen(false);
                            setPromptRuleDrafts([]);
                          }}
                          className="w-full px-4 py-3 text-left text-sm text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800"
                        >
                          Add fact-based rule with prompt
                        </button>
                        <button
                          onClick={() => {
                            setIsCheckTypeModalOpen(true);
                            setIsAddMenuOpen(false);
                          }}
                          className="w-full px-4 py-3 text-left text-sm text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800"
                        >
                          Add check type
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}

              <div className="relative">
                <button
                  onClick={() => setIsMainActionsMenuOpen((open) => !open)}
                  disabled={
                    isLoading ||
                    (activeDomain === "platforms"
                      ? !selectedPlatformId
                      : !selectedBrandId)
                  }
                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 dark:border-zinc-800 p-2.5 text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-900 disabled:opacity-50"
                  title="More actions"
                >
                  <MoreHorizontal size={16} />
                </button>

                {isMainActionsMenuOpen && (
                  <div className="absolute right-0 mt-2 w-44 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lg z-20 overflow-hidden">
                    <button
                      onClick={() => {
                        setIsMainActionsMenuOpen(false);
                        handleDelete();
                      }}
                      className="w-full px-4 py-3 text-left text-sm text-rose-600 hover:bg-rose-50"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>

              {(activeDomain === "platforms" || brandAdminMode === "edit") && (
                <button
                  onClick={
                    activeDomain === "platforms"
                      ? handleSavePlatform
                      : handleSaveBrand
                  }
                  disabled={
                    isLoading ||
                    (activeDomain === "platforms" ? !platformForm : !brandForm)
                  }
                  className="inline-flex items-center justify-center rounded-xl bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500 p-2.5 text-white disabled:opacity-50"
                  title="Save"
                >
                  {isLoading ? (
                    <RotateCcw size={14} className="animate-spin" />
                  ) : (
                    <Save size={14} />
                  )}
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-6">
            {activeDomain === "platforms" ? (
              platformForm ? (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="block">
                      <span className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                        Platform ID
                      </span>
                      <input
                        value={platformForm.id}
                        onChange={(e) =>
                          setPlatformForm({ ...platformForm, id: e.target.value })
                        }
                        className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </label>
                    <label className="block">
                      <span className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                        Name
                      </span>
                      <input
                        value={platformForm.name}
                        onChange={(e) =>
                          setPlatformForm({ ...platformForm, name: e.target.value })
                        }
                        className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </label>
                  </div>

                  <label className="block">
                    <span className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                      Prompt
                    </span>
                    <textarea
                      value={platformForm.prompt}
                      onChange={(e) =>
                        setPlatformForm({
                          ...platformForm,
                          prompt: e.target.value,
                        })
                      }
                      rows={8}
                      className="w-full rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </label>

                  <label className="block">
                    <span className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                      System Prompt Layer
                    </span>
                    <textarea
                      value={platformForm.systemPrompt || ""}
                      onChange={(e) =>
                        setPlatformForm({
                          ...platformForm,
                          systemPrompt: e.target.value,
                        })
                      }
                      rows={4}
                      placeholder="Optional stable reviewer instructions layered before the task prompt."
                      className="w-full rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </label>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                        Compliance Rules
                      </h4>
                      <button
                        onClick={() =>
                          setPlatformForm({
                            ...platformForm,
                            complianceRules: [
                              ...(platformForm.complianceRules || []),
                              "",
                            ],
                          })
                        }
                        className="text-sm text-indigo-600 dark:text-zinc-300 font-medium"
                      >
                        + Add Rule
                      </button>
                    </div>

                    <div className="space-y-3">
                      {(platformForm.complianceRules || []).map((rule, index) => (
                        <div
                          key={`${platformForm.id}-rule-${index}`}
                          className="rounded-2xl border border-slate-200 dark:border-zinc-800 p-4 bg-slate-50 dark:bg-zinc-900"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-zinc-500">
                              Rule {index + 1}
                            </span>
                            <button
                              onClick={() => {
                                const nextRules = [
                                  ...(platformForm.complianceRules || []),
                                ];
                                nextRules.splice(index, 1);
                                setPlatformForm({
                                  ...platformForm,
                                  complianceRules: nextRules,
                                });
                              }}
                            className="text-sm text-rose-600 dark:text-rose-300"
                            >
                              Remove
                            </button>
                          </div>
                          <textarea
                            value={rule}
                            onChange={(e) => {
                              const nextRules = [
                                ...(platformForm.complianceRules || []),
                              ];
                              nextRules[index] = e.target.value;
                              setPlatformForm({
                                ...platformForm,
                                complianceRules: nextRules,
                              });
                            }}
                            rows={3}
                            className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-3 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-400 dark:text-zinc-500">
                  Select or create a platform to edit.
                </div>
              )
            ) : brandForm ? (
              <div className="space-y-6">
                <section className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 px-5 py-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                        {brandForm.name}
                      </div>
                      <div className="mt-1 text-sm text-slate-500 dark:text-zinc-400">
                        {brandForm.description || "No description added yet."}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2 text-xs text-slate-600 dark:text-zinc-300 lg:justify-end">
                      <span className="rounded-full bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 px-3 py-1.5">
                        {brandForm.rules.length} rules
                      </span>
                      <span className="rounded-full bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 px-3 py-1.5">
                        {brandForm.checkTypes.length} check types
                      </span>
                      <span className="rounded-full bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 px-3 py-1.5 capitalize">
                        {brandAdminMode} mode
                      </span>
                    </div>
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-visible">
                  <div className="border-b border-slate-200 dark:border-zinc-800 px-5 py-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between relative z-10 bg-white dark:bg-zinc-950 rounded-t-2xl">
                    <div>
                      <h4 className="text-base font-semibold text-slate-900 dark:text-zinc-100">
                        Brand Rules
                      </h4>
                      <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
                        Filter by check type or search across titles and instructions.
                      </p>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <div className="relative">
                        <Search
                          size={16}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500"
                        />
                        <input
                          type="text"
                          value={brandRuleSearch}
                          onChange={(e) => setBrandRuleSearch(e.target.value)}
                          placeholder="Filter rules..."
                          className="w-full sm:w-72 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>

                      <div className="relative">
                        <button
                          onClick={() => setIsTypeFilterOpen((open) => !open)}
                          className="inline-flex min-w-[220px] items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-slate-700 dark:text-zinc-200"
                        >
                          <span className="truncate">
                            {brandRuleTypeFilter.length === 0
                              ? "All types"
                              : brandRuleTypeFilter.length === 1
                              ? brandRuleTypeFilter[0]
                              : `${brandRuleTypeFilter.length} types selected`}
                          </span>
                          <ChevronDown size={14} />
                        </button>

                        {isTypeFilterOpen && (
                          <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lg z-20 overflow-hidden">
                            <button
                              onClick={() => setBrandRuleTypeFilter([])}
                              className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800"
                            >
                              <span
                                className={`inline-flex h-4 w-4 items-center justify-center rounded border ${
                                  brandRuleTypeFilter.length === 0
                                    ? "border-indigo-600 bg-indigo-600 text-white"
                                    : "border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-transparent"
                                }`}
                              >
                                <Check size={12} />
                              </span>
                              All types
                            </button>
                            <div className="max-h-72 overflow-y-auto border-t border-slate-100 dark:border-zinc-800">
                              {brandForm.checkTypes.map((checkType) => {
                                const isSelected =
                                  brandRuleTypeFilter.includes(checkType);
                                return (
                                  <button
                                    key={checkType}
                                    onClick={() =>
                                      toggleBrandRuleTypeFilter(checkType)
                                    }
                                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800"
                                  >
                                    <span
                                      className={`inline-flex h-4 w-4 items-center justify-center rounded border ${
                                        isSelected
                                          ? "border-indigo-600 bg-indigo-600 text-white"
                                          : "border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-transparent"
                                      }`}
                                    >
                                      <Check size={12} />
                                    </span>
                                    {checkType}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>

                      <select
                        value={brandRuleEngineFilter}
                        onChange={(e) =>
                          setBrandRuleEngineFilter(
                            e.target.value as BrandRuleEngineFilter
                          )
                        }
                        className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-slate-700 dark:text-zinc-200"
                      >
                        <option value="all">All engines</option>
                        <option value="visual">Visual only</option>
                        <option value="precision">Fact-based only</option>
                      </select>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-b-2xl">
                    <table className="min-w-full divide-y divide-slate-200 dark:divide-zinc-800">
                      <thead className="bg-slate-50 dark:bg-zinc-900">
                        <tr>
                          <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-500">
                            Type
                          </th>
                          <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-500">
                            Rule
                          </th>
                          <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-500">
                            Status
                          </th>
                          <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-500">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-zinc-800 bg-white dark:bg-zinc-950">
                        {filteredBrandRules.length > 0 ? (
                          filteredBrandRules.map(({ rule, index }) => (
                            <tr key={rule.id} className="align-top">
                              <td className="px-5 py-4 text-sm text-slate-700 dark:text-zinc-300 whitespace-nowrap">
                                <div className="font-medium text-slate-900 dark:text-zinc-100">
                                  {rule.checkType || "General"}
                                </div>
                                <div className="text-xs text-slate-500 dark:text-zinc-500 mt-1 capitalize">
                                  {(rule.engine || "visual") === "precision"
                                    ? "fact-based"
                                    : "visual"}{" "}
                                  · {rule.severity || "major"}
                                </div>
                              </td>
                              <td className="px-5 py-4 text-sm text-slate-700 dark:text-zinc-300">
                                <div className="font-medium text-slate-900 dark:text-zinc-100">
                                  {rule.title}
                                </div>
                                <div className="text-slate-600 dark:text-zinc-400 mt-1 whitespace-pre-line">
                                  {rule.instruction}
                                </div>
                              </td>
                              <td className="px-5 py-4 text-sm">
                                <span
                                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                                    rule.enabled !== false
                                      ? "bg-emerald-50 text-emerald-700"
                                      : "bg-slate-100 dark:bg-zinc-900 text-slate-500 dark:text-zinc-500"
                                  }`}
                                >
                                  {rule.enabled !== false ? "Enabled" : "Disabled"}
                                </span>
                              </td>
                              <td className="px-5 py-4">
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => openRuleEditor(index)}
                                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-zinc-800 px-3 py-2 text-sm font-medium text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-900"
                                  >
                                    <Pencil size={14} />
                                    Edit
                                  </button>
                                  {brandAdminMode === "edit" && (
                                    <div className="relative">
                                      <button
                                        onClick={() =>
                                          setOpenRuleActionIndex((current) =>
                                            current === index ? null : index
                                          )
                                        }
                                        className="inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-zinc-800 p-2 text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-900"
                                        title="Rule actions"
                                      >
                                        <MoreHorizontal size={14} />
                                      </button>

                                      {openRuleActionIndex === index && (
                                        <div className="absolute right-0 mt-2 w-36 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lg z-20 overflow-hidden">
                                          <button
                                            onClick={() => {
                                              removeBrandRule(index);
                                              setOpenRuleActionIndex(null);
                                            }}
                                            className="w-full px-4 py-3 text-left text-sm text-rose-600 hover:bg-rose-50"
                                          >
                                            Delete
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td
                              colSpan={4}
                              className="px-5 py-10 text-center text-sm text-slate-400 dark:text-zinc-500"
                            >
                              No rules match the current filters.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            ) : (
              <div className="text-sm text-slate-400 dark:text-zinc-500">
                Select or create a brand rule set to review.
              </div>
            )}
          </div>
        </main>
      </div>

      {isBrandSettingsOpen && brandSettingsDraft && (
        <div className="fixed inset-0 z-40 bg-zinc-950/70 backdrop-blur-sm flex items-center justify-center px-6">
          <div className="w-full max-w-3xl rounded-3xl bg-white dark:bg-zinc-950 shadow-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <h4 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">
                  Brand Settings
                </h4>
                <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
                  Manage brand ID, name, description, and system prompt.
                </p>
              </div>
              <button
                onClick={() => {
                  setIsBrandSettingsOpen(false);
                  setBrandSettingsDraft(null);
                }}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-900 text-slate-500 dark:text-zinc-400"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block">
                  <span className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                    Brand ID
                  </span>
                  <input
                    value={brandSettingsDraft.id}
                    disabled={brandAdminMode !== "edit"}
                    onChange={(e) =>
                      setBrandSettingsDraft({
                        ...brandSettingsDraft,
                        id: e.target.value,
                      })
                    }
                    className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50 dark:disabled:bg-zinc-900 disabled:text-slate-500 dark:disabled:text-zinc-500"
                  />
                </label>

                <label className="block">
                  <span className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                    Name
                  </span>
                  <input
                    value={brandSettingsDraft.name}
                    disabled={brandAdminMode !== "edit"}
                    onChange={(e) =>
                      setBrandSettingsDraft({
                        ...brandSettingsDraft,
                        name: e.target.value,
                      })
                    }
                    className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50 dark:disabled:bg-zinc-900 disabled:text-slate-500 dark:disabled:text-zinc-500"
                  />
                </label>
              </div>

              <label className="block">
                <span className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                  Description
                </span>
                <textarea
                  value={brandSettingsDraft.description || ""}
                  disabled={brandAdminMode !== "edit"}
                  onChange={(e) =>
                    setBrandSettingsDraft({
                      ...brandSettingsDraft,
                      description: e.target.value,
                    })
                  }
                  rows={3}
                  className="w-full rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50 dark:disabled:bg-zinc-900 disabled:text-slate-500 dark:disabled:text-zinc-500"
                />
              </label>

              <label className="block">
                <span className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                  System Prompt Layer
                </span>
                <textarea
                  value={brandSettingsDraft.systemPrompt || ""}
                  disabled={brandAdminMode !== "edit"}
                  onChange={(e) =>
                    setBrandSettingsDraft({
                      ...brandSettingsDraft,
                      systemPrompt: e.target.value,
                    })
                  }
                  rows={8}
                  placeholder="Stable reviewer instructions for this brand."
                  className="w-full rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50 dark:disabled:bg-zinc-900 disabled:text-slate-500 dark:disabled:text-zinc-500"
                />
              </label>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setIsBrandSettingsOpen(false);
                  setBrandSettingsDraft(null);
                }}
                className="rounded-xl border border-slate-200 dark:border-zinc-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-900"
              >
                Close
              </button>
              {brandAdminMode === "edit" && (
                <button
                  onClick={saveBrandSettings}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500 px-4 py-2 text-sm font-medium text-white"
                >
                  <Save size={14} />
                  Apply
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {ruleDraft && (
        <div className="fixed inset-0 z-40 bg-zinc-950/70 backdrop-blur-sm flex items-center justify-center px-6">
          <div className="w-full max-w-3xl rounded-3xl bg-white dark:bg-zinc-950 shadow-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <h4 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">
                  {editingRuleIndex === null ? "Add Rule" : "Edit Rule"}
                </h4>
                <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
                  Update the rule details, then save the draft back to this brand.
                </p>
              </div>
              <button
                onClick={() => {
                  setEditingRuleIndex(null);
                  setRuleDraft(null);
                }}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-900 text-slate-500 dark:text-zinc-400"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block">
                  <span className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                    Type
                  </span>
                  <select
                    value={ruleDraft.checkType || ""}
                    onChange={(e) =>
                      setRuleDraft({ ...ruleDraft, checkType: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {(brandForm?.checkTypes.length
                      ? brandForm.checkTypes
                      : ["General"]
                    ).map((checkType) => (
                      <option key={checkType} value={checkType}>
                        {checkType}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                    Title
                  </span>
                  <input
                    value={ruleDraft.title}
                    onChange={(e) =>
                      setRuleDraft({ ...ruleDraft, title: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </label>
              </div>

              {(ruleDraft.engine || "visual") === "visual" ? (
                <label className="block">
                  <span className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                    Rule
                  </span>
                  <textarea
                    value={ruleDraft.instruction}
                    onChange={(e) =>
                      updateRuleDraft({ instruction: e.target.value })
                    }
                    rows={5}
                    className="w-full rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </label>
              ) : (
                <div className="space-y-4 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/50 p-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <label className="block">
                      <span className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                        Match By
                      </span>
                      <select
                        value={ruleDraft.precisionConfig?.selector.type || "layerName"}
                        onChange={(e) =>
                          updatePrecisionSelector({
                            type: e.target.value as PrecisionSelector["type"],
                          })
                        }
                        className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="layerName">Layer Name</option>
                        <option value="textContent">Text Content</option>
                      </select>
                    </label>

                    <label className="block">
                      <span className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                        Match Value
                      </span>
                      <input
                        value={ruleDraft.precisionConfig?.selector.value || ""}
                        onChange={(e) =>
                          updatePrecisionSelector({ value: e.target.value })
                        }
                        className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </label>

                    <label className="block">
                      <span className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                        Layer Type
                      </span>
                      <select
                        value={ruleDraft.precisionConfig?.selector.layerKind || ""}
                        onChange={(e) =>
                          updatePrecisionSelector({
                            layerKind: (e.target.value || undefined) as
                              | PrecisionLayerKind
                              | undefined,
                          })
                        }
                        className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        {PRECISION_LAYER_KIND_OPTIONS.map((option) => (
                          <option key={option.value || "any"} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="block">
                      <span className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                        Fact
                      </span>
                      <select
                        value={ruleDraft.precisionConfig?.fact || "fontSize"}
                        onChange={(e) =>
                          updatePrecisionConfig({
                            fact: e.target.value as PrecisionFact,
                          })
                        }
                        className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        {PRECISION_FACT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                        Operator
                      </span>
                      <select
                        value={ruleDraft.precisionConfig?.operator || "eq"}
                        onChange={(e) =>
                          updatePrecisionConfig({
                            operator: e.target.value as PrecisionOperator,
                          })
                        }
                        className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        {PRECISION_OPERATOR_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {isWordStyleFact(ruleDraft.precisionConfig?.fact) && (
                    <label className="block">
                      <span className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                        Word Style Text
                      </span>
                      <input
                        value={ruleDraft.precisionConfig?.wordStyleText || ""}
                        onChange={(e) =>
                          updatePrecisionConfig({ wordStyleText: e.target.value })
                        }
                        placeholder="Example: Buy now"
                        className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </label>
                  )}

                  {ruleDraft.precisionConfig?.operator === "between" ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <label className="block">
                        <span className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                          Min Value
                        </span>
                        <input
                          value={toEditableValue(
                            ruleDraft.precisionConfig?.min?.kind === "literal"
                              ? ruleDraft.precisionConfig.min.value
                              : undefined
                          )}
                          onChange={(e) =>
                            updatePrecisionConfig({
                              min: {
                                kind: "literal",
                                value: e.target.value,
                              },
                            })
                          }
                          className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </label>
                      <label className="block">
                        <span className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                          Max Value
                        </span>
                        <input
                          value={toEditableValue(
                            ruleDraft.precisionConfig?.max?.kind === "literal"
                              ? ruleDraft.precisionConfig.max.value
                              : undefined
                          )}
                          onChange={(e) =>
                            updatePrecisionConfig({
                              max: {
                                kind: "literal",
                                value: e.target.value,
                              },
                            })
                          }
                          className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <label className="block">
                        <span className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                          Expected Value
                        </span>
                        {isBooleanFact(ruleDraft.precisionConfig?.fact) ? (
                          <select
                            value={
                              typeof ruleDraft.precisionConfig?.expected === "boolean"
                                ? String(ruleDraft.precisionConfig.expected)
                                : ""
                            }
                            onChange={(e) =>
                              updatePrecisionConfig({
                                expected:
                                  e.target.value === ""
                                    ? undefined
                                    : e.target.value === "true",
                              })
                            }
                            className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="">Select value</option>
                            <option value="true">True</option>
                            <option value="false">False</option>
                          </select>
                        ) : (
                          <input
                            value={toEditableValue(ruleDraft.precisionConfig?.expected)}
                            onChange={(e) =>
                              updatePrecisionConfig({ expected: e.target.value })
                            }
                            className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        )}
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        <label className="block">
                          <span className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                            Ref Match By
                          </span>
                          <select
                            value={
                              ruleDraft.precisionConfig?.reference?.selector.type ||
                              "layerName"
                            }
                            onChange={(e) =>
                              updateLayerReference("reference", {
                                selector: {
                                  ...(ruleDraft.precisionConfig?.reference?.selector ||
                                    createDefaultSelector()),
                                  type: e.target.value as PrecisionSelector["type"],
                                },
                              })
                            }
                            className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="layerName">Layer Name</option>
                            <option value="textContent">Text Content</option>
                          </select>
                        </label>
                        <label className="block">
                          <span className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                            Ref Layer Type
                          </span>
                          <select
                            value={
                              ruleDraft.precisionConfig?.reference?.selector.layerKind || ""
                            }
                            onChange={(e) =>
                              updateLayerReference("reference", {
                                selector: {
                                  ...(ruleDraft.precisionConfig?.reference?.selector ||
                                    createDefaultSelector()),
                                  layerKind: (e.target.value || undefined) as
                                    | PrecisionLayerKind
                                    | undefined,
                                },
                              })
                            }
                            className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            {PRECISION_LAYER_KIND_OPTIONS.map((option) => (
                              <option key={option.value || "any"} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block">
                          <span className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                            Ref Fact
                          </span>
                          <select
                            value={ruleDraft.precisionConfig?.reference?.fact || "top"}
                            onChange={(e) =>
                              updateLayerReference("reference", {
                                fact: e.target.value as PrecisionFact,
                              })
                            }
                            className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            {PRECISION_FACT_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>
                  )}

                  {ruleDraft.precisionConfig?.operator !== "between" && (
                    <label className="block">
                      <span className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                        Reference Layer Value (optional)
                      </span>
                      <input
                        value={ruleDraft.precisionConfig?.reference?.selector.value || ""}
                        onChange={(e) =>
                          updateLayerReference("reference", {
                            selector: {
                              ...(ruleDraft.precisionConfig?.reference?.selector ||
                                createDefaultSelector()),
                              value: e.target.value,
                            },
                          })
                        }
                        placeholder="Leave blank to use Expected Value"
                        className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </label>
                  )}

                  <div className="rounded-xl border border-dashed border-slate-300 dark:border-zinc-700 px-4 py-3 text-sm text-slate-600 dark:text-zinc-300">
                    {createPrecisionRuleInstruction(
                      ruleDraft.precisionConfig || createDefaultPrecisionConfig()
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <label className="block">
                  <span className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                    Severity
                  </span>
                  <select
                    value={ruleDraft.severity || "major"}
                    onChange={(e) =>
                      setRuleDraft({
                        ...ruleDraft,
                        severity: e.target.value as BrandRule["severity"],
                      })
                    }
                    className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="critical">Critical</option>
                    <option value="major">Major</option>
                    <option value="minor">Minor</option>
                  </select>
                </label>

                <label className="block">
                  <span className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                    Engine
                  </span>
                  <select
                    value={ruleDraft.engine || "visual"}
                    onChange={(e) =>
                      setRuleDraft({
                        ...ruleDraft,
                        engine: e.target.value as BrandRule["engine"],
                        precisionConfig:
                          e.target.value === "precision"
                            ? ruleDraft.precisionConfig ||
                              createDefaultPrecisionConfig()
                            : ruleDraft.precisionConfig,
                      })
                    }
                    className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="visual">Visual</option>
                    <option value="precision">Fact-Based</option>
                  </select>
                </label>

                <label className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-zinc-800 px-4 py-2.5 mt-6 text-slate-700 dark:text-zinc-200">
                  <input
                    type="checkbox"
                    checked={ruleDraft.enabled !== false}
                    onChange={(e) =>
                      setRuleDraft({ ...ruleDraft, enabled: e.target.checked })
                    }
                  />
                  <span className="text-sm text-slate-700 dark:text-zinc-200">Enabled</span>
                </label>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setEditingRuleIndex(null);
                  setRuleDraft(null);
                }}
                className="rounded-xl border border-slate-200 dark:border-zinc-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-900"
              >
                Cancel
              </button>
              <button
                onClick={saveRuleDraft}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500 px-4 py-2 text-sm font-medium text-white"
              >
                <Save size={14} />
                Save Rule
              </button>
            </div>
          </div>
        </div>
      )}

      {isPromptModalOpen && (
        <div className="fixed inset-0 z-40 bg-zinc-950/70 backdrop-blur-sm flex items-center justify-center px-6">
          <div className="w-full max-w-4xl rounded-3xl bg-white dark:bg-zinc-950 shadow-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <h4 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">
                  Add Fact-Based Rules With Prompt
                </h4>
                <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
                  Describe the intent once and we’ll draft one or more fact-based rules for review.
                </p>
              </div>
              <button
                onClick={() => {
                  setIsPromptModalOpen(false);
                  setBrandRulePrompt("");
                  setPromptRuleDrafts([]);
                }}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-900 text-slate-500 dark:text-zinc-400"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-6 space-y-4">
              <label className="block">
                <span className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                  Prompt
                </span>
                <textarea
                  value={brandRulePrompt}
                  onChange={(e) => setBrandRulePrompt(e.target.value)}
                  rows={5}
                  placeholder='Example: For CTA layers, keep font size at 10px, brand blue fill, and make the "TM" suffix superscript.'
                  className="w-full rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>

              {promptRuleDrafts.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h5 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                        Generated Drafts
                      </h5>
                      <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                        Review each draft before saving it into this brand.
                      </p>
                    </div>
                    <button
                      onClick={saveAllPromptDrafts}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3 py-2 text-sm font-medium text-white"
                    >
                      <Save size={14} />
                      Save All
                    </button>
                  </div>

                  <div className="max-h-[420px] overflow-y-auto space-y-3 pr-1">
                    {promptRuleDrafts.map((draft, index) => (
                      <div
                        key={draft.id || `prompt-rule-${index}`}
                        className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/60 p-4 space-y-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                              Draft {index + 1}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                              {draft.engine === "precision" ? "Fact-Based" : "Visual"} ·{" "}
                              {draft.severity || "major"}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => savePromptDraftAtIndex(index)}
                              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3 py-2 text-sm font-medium text-white"
                            >
                              <Save size={14} />
                              Save
                            </button>
                            <button
                              onClick={() =>
                                setPromptRuleDrafts((current) =>
                                  current.filter((_, currentIndex) => currentIndex !== index)
                                )
                              }
                              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-zinc-800 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                            >
                              <Trash2 size={14} />
                              Remove
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <label className="block">
                            <span className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                              Type
                            </span>
                            <select
                              value={draft.checkType || ""}
                              onChange={(e) =>
                                updatePromptRuleDraft(index, {
                                  checkType: e.target.value,
                                })
                              }
                              className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              {(brandForm?.checkTypes.length
                                ? brandForm.checkTypes
                                : ["General"]
                              ).map((checkType) => (
                                <option key={checkType} value={checkType}>
                                  {checkType}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="block">
                            <span className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                              Title
                            </span>
                            <input
                              value={draft.title}
                              onChange={(e) =>
                                updatePromptRuleDraft(index, {
                                  title: e.target.value,
                                })
                              }
                              className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </label>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <label className="block">
                            <span className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                              Match By
                            </span>
                            <select
                              value={draft.precisionConfig?.selector.type || "layerName"}
                              onChange={(e) =>
                                updatePromptRuleSelector(index, {
                                  type: e.target.value as PrecisionSelector["type"],
                                })
                              }
                              className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              <option value="layerName">Layer Name</option>
                              <option value="textContent">Text Content</option>
                            </select>
                          </label>

                          <label className="block">
                            <span className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                              Match Value
                            </span>
                            <input
                              value={draft.precisionConfig?.selector.value || ""}
                              onChange={(e) =>
                                updatePromptRuleSelector(index, {
                                  value: e.target.value,
                                })
                              }
                              className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </label>

                          <label className="block">
                            <span className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                              Layer Type
                            </span>
                            <select
                              value={draft.precisionConfig?.selector.layerKind || ""}
                              onChange={(e) =>
                                updatePromptRuleSelector(index, {
                                  layerKind: (e.target.value || undefined) as
                                    | PrecisionLayerKind
                                    | undefined,
                                })
                              }
                              className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              {PRECISION_LAYER_KIND_OPTIONS.map((option) => (
                                <option key={option.value || "any"} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <label className="block">
                            <span className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                              Fact
                            </span>
                            <select
                              value={draft.precisionConfig?.fact || "fontSize"}
                              onChange={(e) =>
                                updatePromptRulePrecisionConfig(index, {
                                  fact: e.target.value as PrecisionFact,
                                })
                              }
                              className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              {PRECISION_FACT_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="block">
                            <span className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                              Operator
                            </span>
                            <select
                              value={draft.precisionConfig?.operator || "eq"}
                              onChange={(e) =>
                                updatePromptRulePrecisionConfig(index, {
                                  operator: e.target.value as PrecisionOperator,
                                })
                              }
                              className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              {PRECISION_OPERATOR_OPTIONS.filter(
                                (option) => option.value !== "between"
                              ).map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="block">
                            <span className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                              Severity
                            </span>
                            <select
                              value={draft.severity || "major"}
                              onChange={(e) =>
                                updatePromptRuleDraft(index, {
                                  severity: e.target.value as BrandRule["severity"],
                                })
                              }
                              className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              <option value="critical">Critical</option>
                              <option value="major">Major</option>
                              <option value="minor">Minor</option>
                            </select>
                          </label>
                        </div>

                        {isWordStyleFact(draft.precisionConfig?.fact) && (
                          <label className="block">
                            <span className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                              Word Style Text
                            </span>
                            <input
                              value={draft.precisionConfig?.wordStyleText || ""}
                              onChange={(e) =>
                                updatePromptRulePrecisionConfig(index, {
                                  wordStyleText: e.target.value,
                                })
                              }
                              placeholder="Example: TM"
                              className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </label>
                        )}

                        <label className="block">
                          <span className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                            Expected Value
                          </span>
                          {isBooleanFact(draft.precisionConfig?.fact) ? (
                            <select
                              value={
                                typeof draft.precisionConfig?.expected === "boolean"
                                  ? String(draft.precisionConfig.expected)
                                  : ""
                              }
                              onChange={(e) =>
                                updatePromptRulePrecisionConfig(index, {
                                  expected:
                                    e.target.value === ""
                                      ? undefined
                                      : e.target.value === "true",
                                })
                              }
                              className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              <option value="">Select value</option>
                              <option value="true">True</option>
                              <option value="false">False</option>
                            </select>
                          ) : (
                            <input
                              value={toEditableValue(draft.precisionConfig?.expected)}
                              onChange={(e) =>
                                updatePromptRulePrecisionConfig(index, {
                                  expected: e.target.value,
                                })
                              }
                              className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          )}
                        </label>

                        <div className="rounded-xl border border-dashed border-slate-300 dark:border-zinc-700 px-4 py-3 text-sm text-slate-600 dark:text-zinc-300">
                          {createPrecisionRuleInstruction(
                            draft.precisionConfig || createDefaultPrecisionConfig()
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setIsPromptModalOpen(false);
                  setBrandRulePrompt("");
                  setPromptRuleDrafts([]);
                }}
                className="rounded-xl border border-slate-200 dark:border-zinc-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-900"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateBrandRuleFromPrompt}
                disabled={isGeneratingPromptDrafts}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-500 text-white px-4 py-2 text-sm font-medium"
              >
                {isGeneratingPromptDrafts ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    Generate Drafts
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {isCheckTypeModalOpen && (
        <div className="fixed inset-0 z-40 bg-zinc-950/70 backdrop-blur-sm flex items-center justify-center px-6">
          <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-zinc-950 shadow-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <h4 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">
                  Add Check Type
                </h4>
                <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
                  Add a new type for filtering and organizing rules.
                </p>
              </div>
              <button
                onClick={() => {
                  setIsCheckTypeModalOpen(false);
                  setNewCheckTypeName("");
                }}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-900 text-slate-500 dark:text-zinc-400"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-6">
              <label className="block">
                <span className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                  Check Type
                </span>
                <input
                  value={newCheckTypeName}
                  onChange={(e) => setNewCheckTypeName(e.target.value)}
                  placeholder="Example: Legal & Disclaimer Review"
                  className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setIsCheckTypeModalOpen(false);
                  setNewCheckTypeName("");
                }}
                className="rounded-xl border border-slate-200 dark:border-zinc-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-900"
              >
                Cancel
              </button>
              <button
                onClick={addCheckType}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-500 px-4 py-2 text-sm font-medium text-white"
              >
                <Plus size={14} />
                Add Check Type
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
