import type {
  ComplianceResult,
  ComplianceRuleDefinition,
  PrecisionFact,
  PrecisionLayerKind,
  PrecisionLayerFactRef,
  PrecisionOperator,
  PrecisionRuleConfig,
  PrecisionSelector,
} from "../types";

type CapsuleObject = Record<string, any>;

export interface WordStyleSegment {
  text: string;
  normalizedText: string;
  start: number;
  end: number;
  fontSize?: number;
  fontWeight?: number;
  fontFamilyName?: string;
  fontFamilyId?: string;
  fontStyle?: string;
  superscript?: boolean;
  subscript?: boolean;
  deltaY?: number;
}

export interface FlattenedLayerRow {
  layerId: string;
  layerName: string;
  layerType: string;
  layerKind?: PrecisionLayerKind;
  groupPath?: string | null;
  text?: string;
  normalizedText?: string;
  fontSize?: number;
  fontWeight?: number;
  fontFamilyId?: string;
  fontFamilyName?: string;
  fontStyle?: string;
  textAlign?: string;
  textFill?: string;
  fill?: string;
  cornerRadius?: number;
  opacity?: number;
  objectFit?: string;
  imageWidth?: number;
  imageHeight?: number;
  imageLeft?: number;
  imageTop?: number;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  width?: number;
  height?: number;
  left?: number;
  top?: number;
  x?: number;
  y?: number;
  right?: number;
  bottom?: number;
  centerX?: number;
  centerY?: number;
  wordStyles: WordStyleSegment[];
  raw: CapsuleObject;
}

export interface CapsuleSnapshot {
  capsuleId?: string;
  sizeId: string;
  sizeDisplayName?: string;
  width?: number;
  height?: number;
  layers: FlattenedLayerRow[];
}

const normalizeText = (value: string | undefined | null) =>
  (value || "").replace(/\s+/g, " ").trim();

const normalizeColor = (value: unknown) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "string") {
    return value.trim().toLowerCase();
  }

  return JSON.stringify(value).toLowerCase();
};

const toComparable = (value: unknown) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed.length) {
      return "";
    }
    if (trimmed.toLowerCase() === "true") {
      return true;
    }
    if (trimmed.toLowerCase() === "false") {
      return false;
    }
    const numeric = Number(trimmed);
    return Number.isNaN(numeric) ? trimmed : numeric;
  }

  return value;
};

const isWordStyleFact = (fact: PrecisionFact) => fact.startsWith("wordStyle.");

const getRuleLabel = (rule: ComplianceRuleDefinition) =>
  rule.title?.trim() || rule.instruction?.trim() || "Precision Rule";

const getSelectorLabel = (selector: PrecisionSelector) =>
  `${selector.layerKind ? `${selector.layerKind} ` : ""}${
    selector.type === "layerName" ? "layer" : "text"
  } "${selector.value}"`;

const getFactLabel = (fact: PrecisionFact) => fact.replace(/^wordStyle\./, "word style ");

export const createPrecisionRuleInstruction = (
  config: PrecisionRuleConfig
): string => {
  const target = getSelectorLabel(config.selector);
  const fact = getFactLabel(config.fact);

  if (config.operator === "between") {
    const min = config.min
      ? config.min.kind === "literal"
        ? String(config.min.value)
        : `${getSelectorLabel(config.min.selector)} ${getFactLabel(config.min.fact)}`
      : "?";
    const max = config.max
      ? config.max.kind === "literal"
        ? String(config.max.value)
        : `${getSelectorLabel(config.max.selector)} ${getFactLabel(config.max.fact)}`
      : "?";
    return `${fact} for ${target} should be between ${min} and ${max}.`;
  }

  const rhs = config.reference
    ? `${getSelectorLabel(config.reference.selector)} ${getFactLabel(config.reference.fact)}`
    : config.expected !== undefined
    ? String(config.expected)
    : "?";

  const operatorText: Record<Exclude<PrecisionOperator, "between">, string> = {
    eq: "equal",
    neq: "not equal",
    gt: "be greater than",
    gte: "be greater than or equal to",
    lt: "be less than",
    lte: "be less than or equal to",
  };

  return `${fact} for ${target} should ${operatorText[config.operator as Exclude<PrecisionOperator, "between">]} ${rhs}.`;
};

const mergeResolvedObject = (baseObject: CapsuleObject, sizeId: string): CapsuleObject => ({
  ...baseObject,
  ...(baseObject.overrides?.[sizeId] || {}),
});

const getFontFamilyName = (object: CapsuleObject) =>
  object.fontMetaData?.name?.trim() ||
  object.fontMetaDataWS?.name?.trim() ||
  undefined;

const getLayerKind = (object: CapsuleObject): PrecisionLayerKind | undefined => {
  const type = String(object.type || "").toLowerCase();

  if (type.includes("text")) {
    return "text";
  }

  if (type.includes("image")) {
    return "image";
  }

  if (
    type.includes("shape") ||
    type === "rect" ||
    type === "rounded-rect" ||
    type === "circle"
  ) {
    return "shape";
  }

  return undefined;
};

const extractWordStyles = (object: CapsuleObject): WordStyleSegment[] => {
  const text = object.text || object.serializedText || "";
  const wordStyles = Array.isArray(object.wordStyle) ? object.wordStyle : [];

  return wordStyles
    .map((entry: any) => {
      const start = entry?.data?.start;
      const end = entry?.data?.end;
      if (typeof start !== "number" || typeof end !== "number") {
        return null;
      }

      const styles = entry?.data?.styles || {};
      const segmentText = text.slice(start, end);
      return {
        text: segmentText,
        normalizedText: normalizeText(segmentText),
        start,
        end,
        fontSize:
          typeof styles.fontSize === "number" ? styles.fontSize : undefined,
        fontWeight:
          typeof styles.fontWeight === "number" ? styles.fontWeight : undefined,
        fontFamilyId:
          styles.fontFamily || entry?.fontMetaDataWS?.fontId || undefined,
        fontFamilyName:
          entry?.fontMetaDataWS?.name?.trim() || undefined,
        fontStyle:
          typeof styles.fontStyle === "string" ? styles.fontStyle : undefined,
        superscript:
          typeof styles.superscript === "boolean" ? styles.superscript : undefined,
        subscript:
          typeof styles.subscript === "boolean" ? styles.subscript : undefined,
        deltaY:
          typeof styles.deltaY === "number" ? styles.deltaY : undefined,
      } satisfies WordStyleSegment;
    })
    .filter(Boolean) as WordStyleSegment[];
};

const getAbsoluteOffsets = (
  objects: Record<string, CapsuleObject>,
  sizeId: string,
  objectId: string,
  memo: Map<string, { left: number; top: number }>
): { left: number; top: number } => {
  if (memo.has(objectId)) {
    return memo.get(objectId)!;
  }

  const object = objects[objectId];
  if (!object) {
    const fallback = { left: 0, top: 0 };
    memo.set(objectId, fallback);
    return fallback;
  }

  const resolved = mergeResolvedObject(object, sizeId);
  const ownLeft = typeof resolved.left === "number" ? resolved.left : 0;
  const ownTop = typeof resolved.top === "number" ? resolved.top : 0;

  if (!resolved.groupPath) {
    const value = { left: ownLeft, top: ownTop };
    memo.set(objectId, value);
    return value;
  }

  const parentOffsets = getAbsoluteOffsets(objects, sizeId, resolved.groupPath, memo);
  const value = {
    left: parentOffsets.left + ownLeft,
    top: parentOffsets.top + ownTop,
  };
  memo.set(objectId, value);
  return value;
};

export const resolveCapsuleSizeId = ({
  capsuleDoc,
  dimensionKey,
  width,
  height,
}: {
  capsuleDoc: any;
  dimensionKey?: string;
  width?: number;
  height?: number;
}): string | null => {
  const sizes = capsuleDoc?.canvasData?.variant?.sizes || {};
  const sizeIds = Object.keys(sizes);

  if (dimensionKey && sizes[dimensionKey]) {
    return dimensionKey;
  }

  if (width && height) {
    const matches = sizeIds.filter((sizeId) => {
      const size = sizes[sizeId];
      return size?.width === width && size?.height === height;
    });

    if (matches.length === 1) {
      return matches[0];
    }
  }

  return sizeIds[0] || null;
};

export const buildCapsuleSnapshot = ({
  capsuleDoc,
  sizeId,
}: {
  capsuleDoc: any;
  sizeId: string;
}): CapsuleSnapshot => {
  const variant = capsuleDoc?.canvasData?.variant;
  const size = variant?.sizes?.[sizeId];
  const objects = (variant?.objects || {}) as Record<string, CapsuleObject>;
  const offsetsMemo = new Map<string, { left: number; top: number }>();

  const layers = Object.entries(objects).map(([objectId, object]) => {
    const resolved = mergeResolvedObject(object, sizeId);
    const offsets = getAbsoluteOffsets(objects, sizeId, objectId, offsetsMemo);
    const width = typeof resolved.width === "number" ? resolved.width : undefined;
    const height = typeof resolved.height === "number" ? resolved.height : undefined;

    return {
      layerId: objectId,
      layerName:
        resolved.displayText ||
        resolved.name ||
        resolved.id ||
        objectId,
      layerType: resolved.type || "unknown",
      layerKind: getLayerKind(resolved),
      groupPath: resolved.groupPath,
      text: resolved.text || resolved.serializedText || undefined,
      normalizedText: normalizeText(resolved.text || resolved.serializedText),
      fontSize:
        typeof resolved.fontSize === "number" ? resolved.fontSize : undefined,
      fontWeight:
        typeof resolved.fontWeight === "number"
          ? resolved.fontWeight
          : undefined,
      fontFamilyId: resolved.fontFamily || resolved.fontMetaData?.fontId,
      fontFamilyName: getFontFamilyName(resolved),
      fontStyle:
        typeof resolved.fontStyle === "string" ? resolved.fontStyle : undefined,
      textAlign:
        typeof resolved.textAlign === "string" ? resolved.textAlign : undefined,
      textFill: normalizeColor(resolved.textFill),
      fill: normalizeColor(resolved.fill),
      cornerRadius:
        typeof resolved.cornerRadius === "number" ? resolved.cornerRadius : undefined,
      opacity:
        typeof resolved.opacity === "number" ? resolved.opacity : undefined,
      objectFit:
        typeof resolved.objectFit === "string" ? resolved.objectFit : undefined,
      imageWidth:
        typeof resolved.imageWidth === "number" ? resolved.imageWidth : undefined,
      imageHeight:
        typeof resolved.imageHeight === "number" ? resolved.imageHeight : undefined,
      imageLeft:
        typeof resolved.imageLeft === "number" ? resolved.imageLeft : undefined,
      imageTop:
        typeof resolved.imageTop === "number" ? resolved.imageTop : undefined,
      scale: typeof resolved.scale === "number" ? resolved.scale : undefined,
      scaleX: typeof resolved.scaleX === "number" ? resolved.scaleX : undefined,
      scaleY: typeof resolved.scaleY === "number" ? resolved.scaleY : undefined,
      width,
      height,
      left: offsets.left,
      top: offsets.top,
      x: offsets.left,
      y: offsets.top,
      right: width !== undefined ? offsets.left + width : undefined,
      bottom: height !== undefined ? offsets.top + height : undefined,
      centerX: width !== undefined ? offsets.left + width / 2 : undefined,
      centerY: height !== undefined ? offsets.top + height / 2 : undefined,
      wordStyles: extractWordStyles(resolved),
      raw: resolved,
    } satisfies FlattenedLayerRow;
  });

  return {
    capsuleId: capsuleDoc?.capsuleId,
    sizeId,
    sizeDisplayName: size?.displayName,
    width: size?.width,
    height: size?.height,
    layers,
  };
};

const matchRows = (
  snapshot: CapsuleSnapshot,
  selector: PrecisionSelector
): FlattenedLayerRow[] => {
  const target = normalizeText(selector.value);
  if (!target) {
    return [];
  }

  return snapshot.layers.filter((layer) => {
    if (selector.layerKind && layer.layerKind !== selector.layerKind) {
      return false;
    }
    if (selector.type === "layerName") {
      return normalizeText(layer.layerName) === target;
    }

    return normalizeText(layer.normalizedText) === target;
  });
};

const getWordStyleSegment = (
  row: FlattenedLayerRow,
  wordStyleText?: string
): WordStyleSegment | null => {
  if (!wordStyleText) {
    return null;
  }

  const normalized = normalizeText(wordStyleText);
  const matches = row.wordStyles.filter(
    (segment) => normalizeText(segment.normalizedText) === normalized
  );

  return matches.length === 1 ? matches[0] : null;
};

const readFactValue = (
  row: FlattenedLayerRow,
  fact: PrecisionFact,
  wordStyleText?: string
): string | number | boolean | undefined => {
  if (isWordStyleFact(fact)) {
    const segment = getWordStyleSegment(row, wordStyleText);
    if (!segment) {
      return undefined;
    }

    switch (fact) {
      case "wordStyle.fontSize":
        return segment.fontSize;
      case "wordStyle.fontWeight":
        return segment.fontWeight;
      case "wordStyle.fontFamilyName":
        return segment.fontFamilyName;
      case "wordStyle.fontFamilyId":
        return segment.fontFamilyId;
      case "wordStyle.fontStyle":
        return segment.fontStyle;
      case "wordStyle.superscript":
        return segment.superscript;
      case "wordStyle.subscript":
        return segment.subscript;
      case "wordStyle.deltaY":
        return segment.deltaY;
      default:
        return undefined;
    }
  }

  return row[fact as keyof FlattenedLayerRow] as
    | string
    | number
    | boolean
    | undefined;
};

const compareValues = (
  operator: PrecisionOperator,
  actual: unknown,
  expected: unknown,
  min?: unknown,
  max?: unknown
): boolean => {
  const actualComparable = toComparable(actual);
  const expectedComparable = toComparable(expected);
  const minComparable = toComparable(min);
  const maxComparable = toComparable(max);

  switch (operator) {
    case "eq":
      return actualComparable === expectedComparable;
    case "neq":
      return actualComparable !== expectedComparable;
    case "gt":
      return Number(actualComparable) > Number(expectedComparable);
    case "gte":
      return Number(actualComparable) >= Number(expectedComparable);
    case "lt":
      return Number(actualComparable) < Number(expectedComparable);
    case "lte":
      return Number(actualComparable) <= Number(expectedComparable);
    case "between":
      return (
        Number(actualComparable) >= Number(minComparable) &&
        Number(actualComparable) <= Number(maxComparable)
      );
    default:
      return false;
  }
};

const warningResult = ({
  rule,
  reason,
  matchedLayer,
}: {
  rule: ComplianceRuleDefinition;
  reason: string;
  matchedLayer?: FlattenedLayerRow;
}): ComplianceResult => ({
  rule: rule.instruction,
  status: "WARNING",
  reasoning: reason,
  suggestion: "Check the capsule data or rule selector and try again.",
  category: "brand",
  severity: rule.severity || "major",
  ruleId: rule.id,
  ruleTitle: getRuleLabel(rule),
  ruleSource: rule.source || "brand",
  checkType: rule.checkType,
  brandId: rule.brandId,
  engine: "precision",
  matchedLayerName: matchedLayer?.layerName,
  matchedLayerId: matchedLayer?.layerId,
  evaluationMessage: reason,
});

const resolveReference = (
  snapshot: CapsuleSnapshot,
  reference: PrecisionLayerFactRef
): {
  value?: string | number | boolean;
  layer?: FlattenedLayerRow;
  warning?: string;
} => {
  const matches = matchRows(snapshot, reference.selector);
  if (matches.length === 0) {
    return {
      warning: `No ${getSelectorLabel(reference.selector)} matched for reference lookup.`,
    };
  }
  if (matches.length > 1) {
    return {
      warning: `Multiple ${getSelectorLabel(reference.selector)} layers matched for reference lookup.`,
    };
  }

  const layer = matches[0];
  const value = readFactValue(layer, reference.fact, reference.wordStyleText);
  if (value === undefined) {
    return {
      warning: `Could not read ${getFactLabel(reference.fact)} from ${layer.layerName}.`,
      layer,
    };
  }

  return { value, layer };
};

const buildPassOrFailResult = ({
  rule,
  matchedLayer,
  actual,
  expected,
  status,
  referenceLayerName,
}: {
  rule: ComplianceRuleDefinition;
  matchedLayer: FlattenedLayerRow;
  actual: string | number | boolean;
  expected: string | number | boolean;
  status: "PASS" | "FAIL";
  referenceLayerName?: string;
}): ComplianceResult => {
  const fact = rule.precisionConfig?.fact || "value";
  const reasoning =
    status === "PASS"
      ? `${matchedLayer.layerName} ${getFactLabel(fact as PrecisionFact)} is ${actual}, matching the rule.`
      : `${matchedLayer.layerName} ${getFactLabel(fact as PrecisionFact)} is ${actual}, expected ${expected}.`;

  return {
    rule: rule.instruction,
    status,
    reasoning,
    suggestion:
      status === "FAIL"
        ? `Update ${matchedLayer.layerName} so ${getFactLabel(
            fact as PrecisionFact
          )} matches ${expected}.`
        : undefined,
    category: "brand",
    severity: rule.severity || "major",
    ruleId: rule.id,
    ruleTitle: getRuleLabel(rule),
    ruleSource: rule.source || "brand",
    checkType: rule.checkType,
    brandId: rule.brandId,
    engine: "precision",
    actualValue: actual,
    expectedValue: expected,
    matchedLayerName: matchedLayer.layerName,
    matchedLayerId: matchedLayer.layerId,
    referenceLayerName,
    evaluationMessage: reasoning,
  };
};

export const createPrecisionUnavailableResults = (
  rules: ComplianceRuleDefinition[],
  reason: string
): ComplianceResult[] =>
  rules
    .filter((rule) => (rule.engine || "visual") === "precision")
    .map((rule) =>
      warningResult({
        rule,
        reason,
      })
    );

export const partitionRulesByEngine = (
  rules: ComplianceRuleDefinition[]
): {
  visualRules: ComplianceRuleDefinition[];
  precisionRules: ComplianceRuleDefinition[];
} => ({
  visualRules: rules.filter((rule) => (rule.engine || "visual") === "visual"),
  precisionRules: rules.filter((rule) => (rule.engine || "visual") === "precision"),
});

export const evaluatePrecisionRules = ({
  snapshot,
  rules,
}: {
  snapshot: CapsuleSnapshot;
  rules: ComplianceRuleDefinition[];
}): ComplianceResult[] =>
  rules.map((rule) => {
    const config = rule.precisionConfig;
    if (!config) {
      return warningResult({
        rule,
        reason: "Precision rule configuration is missing.",
      });
    }

    const matches = matchRows(snapshot, config.selector);
    if (matches.length === 0) {
      return warningResult({
        rule,
        reason: `No ${getSelectorLabel(config.selector)} matched in capsule size ${snapshot.sizeDisplayName || snapshot.sizeId}.`,
      });
    }

    if (matches.length > 1) {
      return warningResult({
        rule,
        reason: `Multiple ${getSelectorLabel(config.selector)} layers matched in capsule size ${snapshot.sizeDisplayName || snapshot.sizeId}.`,
      });
    }

    const matchedLayer = matches[0];
    const actual = readFactValue(matchedLayer, config.fact, config.wordStyleText);

    if (actual === undefined) {
      return warningResult({
        rule,
        matchedLayer,
        reason: `Could not read ${getFactLabel(config.fact)} from ${matchedLayer.layerName}.`,
      });
    }

    if (config.operator === "between") {
      const minResolved =
        config.min?.kind === "literal"
          ? { value: config.min.value }
          : config.min
          ? resolveReference(snapshot, config.min)
          : {};
      const maxResolved =
        config.max?.kind === "literal"
          ? { value: config.max.value }
          : config.max
          ? resolveReference(snapshot, config.max)
          : {};

      if (minResolved.warning) {
        return warningResult({
          rule,
          matchedLayer,
          reason: minResolved.warning,
        });
      }

      if (maxResolved.warning) {
        return warningResult({
          rule,
          matchedLayer,
          reason: maxResolved.warning,
        });
      }

      if (minResolved.value === undefined || maxResolved.value === undefined) {
        return warningResult({
          rule,
          matchedLayer,
          reason: "The precision rule is missing one or both range bounds.",
        });
      }

      const passes = compareValues(
        "between",
        actual,
        undefined,
        minResolved.value,
        maxResolved.value
      );

      return buildPassOrFailResult({
        rule,
        matchedLayer,
        actual,
        expected: `${minResolved.value} → ${maxResolved.value}`,
        status: passes ? "PASS" : "FAIL",
        referenceLayerName:
          minResolved.layer?.layerName || maxResolved.layer?.layerName,
      });
    }

    let expected: string | number | boolean | undefined = config.expected;
    let referenceLayerName: string | undefined;

    if (config.reference) {
      const referenceResolved = resolveReference(snapshot, config.reference);
      if (referenceResolved.warning) {
        return warningResult({
          rule,
          matchedLayer,
          reason: referenceResolved.warning,
        });
      }
      expected = referenceResolved.value;
      referenceLayerName = referenceResolved.layer?.layerName;
    }

    if (expected === undefined) {
      return warningResult({
        rule,
        matchedLayer,
        reason: "The precision rule is missing an expected value.",
      });
    }

    const passes = compareValues(config.operator, actual, expected);
    return buildPassOrFailResult({
      rule,
      matchedLayer,
      actual,
      expected,
      status: passes ? "PASS" : "FAIL",
      referenceLayerName,
    });
  });
