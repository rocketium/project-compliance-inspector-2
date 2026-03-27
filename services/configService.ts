import { DEFAULT_BRANDS } from "../constants/brands";
import { DEFAULT_PLATFORMS } from "../constants/platforms";
import { supabase } from "../lib/supabase";
import { BrandConfig, LocalizationRule, PlatformConfig } from "../types";

const PLATFORM_STORAGE_KEY = "rocketium.platform-configs";
const BRAND_STORAGE_KEY = "rocketium.brand-configs";

const safeLocalStorageGet = <T,>(key: string): T[] | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as T[];
  } catch {
    return null;
  }
};

const safeLocalStorageSet = <T,>(key: string, value: T[]) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage failures
  }
};

const safeLocalStorageRemove = (key: string) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage failures
  }
};

const fetchStaticJson = async <T,>(path: string): Promise<T | null> => {
  try {
    const response = await fetch(path);
    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
};

const loadSupabaseConfigs = async <T,>(
  tableName: "platform_configs" | "brand_configs"
): Promise<T[] | null> => {
  try {
    const { data, error } = await supabase
      .from(tableName)
      .select("data")
      .order("updated_at", { ascending: false });

    if (error) {
      throw error;
    }

    const configs = (data || [])
      .map((row) => row.data)
      .filter(Boolean) as T[];

    return configs.length > 0 ? configs : null;
  } catch {
    return null;
  }
};

const upsertSupabaseConfig = async <T extends { id: string }>(
  tableName: "platform_configs" | "brand_configs",
  config: T
) => {
  try {
    await supabase.from(tableName).upsert(
      {
        id: config.id,
        data: config,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
  } catch {
    // Fall back to local storage only
  }
};

const deleteSupabaseConfig = async (
  tableName: "platform_configs" | "brand_configs",
  id: string
) => {
  try {
    await supabase.from(tableName).delete().eq("id", id);
  } catch {
    // Fall back to local storage only
  }
};

const resetSupabaseConfigs = async (
  tableName: "platform_configs" | "brand_configs"
) => {
  try {
    await supabase.from(tableName).delete().neq("id", "__never__");
  } catch {
    // Fall back to local storage only
  }
};

const dedupeById = <T extends { id: string }>(items: T[]): T[] => {
  const seen = new Map<string, T>();
  items.forEach((item) => {
    seen.set(item.id, item);
  });
  return Array.from(seen.values());
};

const mergeStringList = (base: string[] = [], override?: string[]) =>
  override && override.length > 0 ? Array.from(new Set(override)) : base;

const mergeLocalizationRules = (
  baseRules: LocalizationRule[] = [],
  overrideRules?: LocalizationRule[]
) => {
  if (!overrideRules || overrideRules.length === 0) {
    return baseRules;
  }

  const keyFor = (rule: LocalizationRule) =>
    `${rule.region}::${rule.language || ""}`;

  const merged = new Map<string, LocalizationRule>();
  baseRules.forEach((rule) => merged.set(keyFor(rule), rule));
  overrideRules.forEach((rule) => {
    const key = keyFor(rule);
    const baseRule = merged.get(key);
    merged.set(key, {
      ...baseRule,
      ...rule,
      rules: mergeStringList(baseRule?.rules || [], rule.rules),
    });
  });

  return Array.from(merged.values());
};

const mergePlatformConfig = (
  baseItem: PlatformConfig | undefined,
  override: PlatformConfig
): PlatformConfig => {
  if (!baseItem) {
    return override;
  }

  return {
    ...baseItem,
    ...override,
    complianceRules: mergeStringList(
      baseItem.complianceRules || [],
      override.complianceRules
    ),
    imageSpecs: {
      ...(baseItem.imageSpecs || {}),
      ...(override.imageSpecs || {}),
    },
    localizationRules: mergeLocalizationRules(
      baseItem.localizationRules || [],
      override.localizationRules
    ),
  };
};

const mergePlatformConfigs = (
  base: PlatformConfig[],
  overrides: PlatformConfig[]
): PlatformConfig[] =>
  dedupeById([
    ...base,
    ...overrides.map((override) =>
      mergePlatformConfig(
        base.find((item) => item.id === override.id),
        override
      )
    ),
  ]);

const mergeBrandRules = (
  baseRules: BrandConfig["rules"],
  overrideRules: BrandConfig["rules"]
) => {
  const overrideMap = new Map(overrideRules.map((rule) => [rule.id, rule]));
  const mergedRules = baseRules.map((rule) =>
    rule.id && overrideMap.has(rule.id)
      ? { ...rule, ...overrideMap.get(rule.id)! }
      : rule
  );

  const extraRules = overrideRules.filter(
    (rule) => !rule.id || !baseRules.some((baseRule) => baseRule.id === rule.id)
  );

  return [...mergedRules, ...extraRules];
};

const mergeBrandConfig = (
  baseItem: BrandConfig | undefined,
  override: BrandConfig
): BrandConfig => {
  if (!baseItem) {
    return override;
  }

  return {
    ...baseItem,
    ...override,
    checkTypes: Array.from(
      new Set([...(baseItem.checkTypes || []), ...(override.checkTypes || [])])
    ),
    rules: mergeBrandRules(baseItem.rules || [], override.rules || []),
  };
};

const mergeBrandConfigs = (
  base: BrandConfig[],
  overrides: BrandConfig[]
): BrandConfig[] =>
  dedupeById([
    ...base,
    ...overrides.map((override) =>
      mergeBrandConfig(
        base.find((item) => item.id === override.id),
        override
      )
    ),
  ]);

const getStaticPlatforms = async () =>
  (await fetchStaticJson<PlatformConfig[]>("/platforms.json")) ||
  DEFAULT_PLATFORMS;

const getStaticBrands = async () =>
  (await fetchStaticJson<BrandConfig[]>("/brands.json")) || DEFAULT_BRANDS;

export const loadPlatforms = async (): Promise<PlatformConfig[]> => {
  const staticConfigs = await getStaticPlatforms();

  const supabaseConfigs = await loadSupabaseConfigs<PlatformConfig>(
    "platform_configs"
  );
  if (supabaseConfigs?.length) {
    const merged = mergePlatformConfigs(staticConfigs, supabaseConfigs);
    safeLocalStorageSet(PLATFORM_STORAGE_KEY, merged);
    return merged;
  }

  const stored = safeLocalStorageGet<PlatformConfig>(PLATFORM_STORAGE_KEY);
  if (stored?.length) {
    const merged = mergePlatformConfigs(staticConfigs, stored);
    safeLocalStorageSet(PLATFORM_STORAGE_KEY, merged);
    return merged;
  }

  const apiConfigs = await fetchStaticJson<PlatformConfig[]>("/api/platforms");
  if (apiConfigs?.length) {
    const merged = mergePlatformConfigs(staticConfigs, apiConfigs);
    safeLocalStorageSet(PLATFORM_STORAGE_KEY, merged);
    return merged;
  }

  return dedupeById(staticConfigs);
};

export const savePlatformConfig = async (
  config: PlatformConfig
): Promise<PlatformConfig[]> => {
  const staticConfigs = await getStaticPlatforms();
  const normalizedConfig = mergePlatformConfig(
    staticConfigs.find((item) => item.id === config.id),
    config
  );
  const current = await loadPlatforms();
  const next = dedupeById([
    ...current.filter((item) => item.id !== normalizedConfig.id),
    normalizedConfig,
  ]);

  safeLocalStorageSet(PLATFORM_STORAGE_KEY, next);
  await upsertSupabaseConfig("platform_configs", normalizedConfig);
  return next;
};

export const deletePlatformConfig = async (
  id: string
): Promise<PlatformConfig[]> => {
  const current = await loadPlatforms();
  const next = current.filter((item) => item.id !== id);
  safeLocalStorageSet(PLATFORM_STORAGE_KEY, next);
  await deleteSupabaseConfig("platform_configs", id);
  return next;
};

export const resetPlatforms = async (): Promise<PlatformConfig[]> => {
  safeLocalStorageRemove(PLATFORM_STORAGE_KEY);
  await resetSupabaseConfigs("platform_configs");
  return getStaticPlatforms();
};

export const loadBrands = async (): Promise<BrandConfig[]> => {
  const staticConfigs = await getStaticBrands();

  const supabaseConfigs = await loadSupabaseConfigs<BrandConfig>("brand_configs");
  if (supabaseConfigs?.length) {
    const merged = mergeBrandConfigs(staticConfigs, supabaseConfigs);
    safeLocalStorageSet(BRAND_STORAGE_KEY, merged);
    return merged;
  }

  const stored = safeLocalStorageGet<BrandConfig>(BRAND_STORAGE_KEY);
  if (stored?.length) {
    const merged = mergeBrandConfigs(staticConfigs, stored);
    safeLocalStorageSet(BRAND_STORAGE_KEY, merged);
    return merged;
  }

  const apiConfigs = await fetchStaticJson<BrandConfig[]>("/api/brands");
  if (apiConfigs?.length) {
    const merged = mergeBrandConfigs(staticConfigs, apiConfigs);
    safeLocalStorageSet(BRAND_STORAGE_KEY, merged);
    return merged;
  }

  return dedupeById(staticConfigs);
};

export const saveBrandConfig = async (
  config: BrandConfig
): Promise<BrandConfig[]> => {
  const staticConfigs = await getStaticBrands();
  const normalizedConfig = mergeBrandConfig(
    staticConfigs.find((item) => item.id === config.id),
    config
  );
  const current = await loadBrands();
  const next = dedupeById([
    ...current.filter((item) => item.id !== normalizedConfig.id),
    normalizedConfig,
  ]);
  safeLocalStorageSet(BRAND_STORAGE_KEY, next);
  await upsertSupabaseConfig("brand_configs", normalizedConfig);
  return next;
};

export const deleteBrandConfig = async (
  id: string
): Promise<BrandConfig[]> => {
  const current = await loadBrands();
  const next = current.filter((item) => item.id !== id);
  safeLocalStorageSet(BRAND_STORAGE_KEY, next);
  await deleteSupabaseConfig("brand_configs", id);
  return next;
};

export const resetBrands = async (): Promise<BrandConfig[]> => {
  safeLocalStorageRemove(BRAND_STORAGE_KEY);
  await resetSupabaseConfigs("brand_configs");
  return getStaticBrands();
};
