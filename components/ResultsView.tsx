
import React, { useEffect, useRef, useState } from 'react';
import {
  AnalysisResult,
  AnalyzedElement,
  ComplianceResult,
  ImageMetadata,
  ImageSpec,
} from "../types";
import {
  Download,
  Type,
  Image as ImageIcon,
  Box,
  MousePointerClick,
  Eye,
  Handshake,
  ToggleLeft,
  ToggleRight,
  ShieldCheck,
  LayoutList,
  Info,
  Sparkles,
} from "lucide-react";
import { Popover } from "antd";
import { ComplianceView } from "./ComplianceView";
import { ZoomPanControls } from "./ZoomPanControls";
import {
  ImageMetadataDisplay,
  extractImageMetadata,
} from "./ImageMetadataDisplay";

interface ResultsViewProps {
  imageSrc: string;
  analysis: AnalysisResult;
  onReset: () => void;
  platformName?: string;
  complianceRules?: string[];
  complianceResults?: ComplianceResult[] | null;
  isComplianceLoading?: boolean;
  imageFile?: File | null;
  imageSpecs?: ImageSpec;
}

type ViewMode = "box" | "outline";
type TabMode = "extraction" | "compliance";

export const ResultsView: React.FC<ResultsViewProps> = ({
  imageSrc,
  analysis,
  onReset,
  platformName,
  complianceRules,
  complianceResults,
  isComplianceLoading,
  imageFile,
  imageSpecs,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [elementsWithCrops, setElementsWithCrops] = useState<AnalyzedElement[]>(
    []
  );
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [viewMode, setViewMode] = useState<ViewMode>("box");
  const [activeTab, setActiveTab] = useState<TabMode>("extraction");
  const [imageMetadata, setImageMetadata] = useState<ImageMetadata | null>(
    null
  );
  const [showMetadata, setShowMetadata] = useState(false);
  // Image versions: original + all generated fixes
  const [imageVersions, setImageVersions] = useState<
    Array<{ id: string; src: string; label: string; ruleIndex?: number }>
  >([]);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number>(0);

  // Extract image metadata
  useEffect(() => {
    extractImageMetadata(imageFile || null, imageSrc).then(setImageMetadata);
  }, [imageSrc, imageFile]);

  // Initialize image versions with original image
  useEffect(() => {
    if (imageSrc) {
      setImageVersions([{ id: "original", src: imageSrc, label: "Original" }]);
      setSelectedImageIndex(0);
    }
  }, [imageSrc]);

  // Get the currently displayed image
  const displayImageSrc = imageVersions[selectedImageIndex]?.src || imageSrc;

  // Generate crops when image loads (always use original image for overlays)
  useEffect(() => {
    const img = new Image();
    img.src = imageSrc; // Always use original for element detection
    img.onload = () => {
      const newElements = analysis.elements.map((el) => {
        const canvas = document.createElement("canvas");
        const width = img.width * (el.box.xmax - el.box.xmin);
        const height = img.height * (el.box.ymax - el.box.ymin);

        // Add some padding to crop if possible, but keep strict for now
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);

        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(
            img,
            el.box.xmin * img.width,
            el.box.ymin * img.height,
            width,
            height,
            0,
            0,
            canvas.width,
            canvas.height
          );
        }
        return { ...el, croppedImageUrl: canvas.toDataURL() };
      });
      setElementsWithCrops(newElements);
    };
  }, [imageSrc, analysis]);

  // Filter logic
  const categories = [
    "All",
    ...Array.from(new Set(elementsWithCrops.map((e) => e.category))),
  ];
  const filteredElements =
    selectedCategory === "All"
      ? elementsWithCrops
      : elementsWithCrops.filter((e) => e.category === selectedCategory);

  // Helper to get color by category
  const getColor = (category: string) => {
    switch (category) {
      case "Text":
        return "text-blue-500 border-blue-500 bg-blue-500/10";
      case "Button":
        return "text-green-500 border-green-500 bg-green-500/10";
      case "Logo":
        return "text-purple-500 border-purple-500 bg-purple-500/10";
      case "Product":
        return "text-orange-500 border-orange-500 bg-orange-500/10";
      case "Partner":
        return "text-teal-600 border-teal-600 bg-teal-500/10";
      default:
        return "text-gray-500 border-gray-500 bg-gray-500/10";
    }
  };

  const getStrokeColor = (category: string) => {
    switch (category) {
      case "Text":
        return "#3b82f6";
      case "Button":
        return "#22c55e";
      case "Logo":
        return "#a855f7";
      case "Product":
        return "#f97316";
      case "Partner":
        return "#0d9488";
      default:
        return "#6b7280";
    }
  };

  const getIcon = (category: string) => {
    switch (category) {
      case "Text":
        return <Type size={16} />;
      case "Button":
        return <MousePointerClick size={16} />;
      case "Logo":
        return <Box size={16} />;
      case "Product":
        return <ImageIcon size={16} />;
      case "Partner":
        return <Handshake size={16} />;
      default:
        return <Eye size={16} />;
    }
  };

  // Helper to create polygon points string for SVG
  const getPolygonPoints = (points: { x: number; y: number }[]) => {
    return points.map((p) => `${p.x * 100},${p.y * 100}`).join(" ");
  };

  return (
    <div className="flex flex-col lg:flex-row h-full gap-6 overflow-hidden">
      {/* Left: Vertical Carousel (only show if there are multiple versions) */}
      {imageVersions.length > 1 && (
        <div className="w-20 flex-shrink-0 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="p-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
            <h3 className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 uppercase text-center">
              Versions
            </h3>
          </div>
          <div className="p-2 space-y-2 overflow-y-auto h-[calc(100%-50px)]">
            {imageVersions.map((version, idx) => (
              <button
                key={version.id}
                onClick={() => setSelectedImageIndex(idx)}
                className={`w-full aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                  selectedImageIndex === idx
                    ? "border-indigo-600 dark:border-indigo-400 ring-2 ring-indigo-200 dark:ring-indigo-800"
                    : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                }`}
                title={version.label}
              >
                <img
                  src={version.src}
                  alt={version.label}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Center Panel: Image Overlay */}
      <div className="flex-1 flex flex-col bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden min-h-[400px]">
        <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
          <h2 className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
            <ImageIcon size={18} /> Original with Outlines
          </h2>
          <div className="flex items-center gap-4">
            <Popover
              content={
                imageMetadata ? (
                  <div className="w-96 max-w-[90vw]">
                    <ImageMetadataDisplay
                      metadata={imageMetadata}
                      specs={imageSpecs}
                    />
                  </div>
                ) : (
                  <div className="p-2 text-slate-500">Loading metadata...</div>
                )
              }
              title={
                <div className="flex items-center gap-2">
                  <Info size={16} />
                  Image Specifications
                </div>
              }
              trigger="click"
              open={showMetadata}
              onOpenChange={setShowMetadata}
              placement="bottomRight"
            >
              <button
                className={`flex items-center gap-2 text-sm font-medium transition-colors ${
                  showMetadata
                    ? "text-indigo-600 dark:text-indigo-400"
                    : "text-slate-600 dark:text-slate-400 hover:text-indigo-600"
                }`}
                title="Toggle Image Info"
              >
                <Info size={18} />
                Specs
              </button>
            </Popover>
            <button
              onClick={() =>
                setViewMode((prev) => (prev === "box" ? "outline" : "box"))
              }
              className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            >
              {viewMode === "box" ? (
                <ToggleLeft size={20} />
              ) : (
                <ToggleRight
                  size={20}
                  className="text-indigo-600 dark:text-indigo-400"
                />
              )}
              {viewMode === "box" ? "Box View" : "Outline View"}
            </button>
            <button
              onClick={onReset}
              className="text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium"
            >
              Analyze Another
            </button>
          </div>
        </div>

        <ZoomPanControls className="relative flex-1 bg-slate-100 dark:bg-slate-900 overflow-hidden">
          <div
            className="relative flex items-center justify-center p-4 w-full h-full"
            ref={containerRef}
          >
            <div className="relative shadow-lg inline-block">
              <img
                src={displayImageSrc}
                alt={imageVersions[selectedImageIndex]?.label || "Analyzed"}
                className="max-w-full max-h-[60vh] block object-contain"
              />
              {/* Version label overlay */}
              {imageVersions.length > 1 && (
                <div className="absolute top-2 left-2 bg-indigo-600 dark:bg-indigo-500 text-white px-2 py-1 rounded text-xs font-medium shadow-lg">
                  {imageVersions[selectedImageIndex]?.label}
                </div>
              )}
              {/* Overlay Layer - Only show on original image */}
              {selectedImageIndex === 0 && (
                <div className="absolute inset-0 pointer-events-none">
                  <svg
                    className="absolute inset-0 w-full h-full"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                  >
                    {elementsWithCrops.map((el) => (
                      <g key={`svg-${el.id}`}>
                        {viewMode === "outline" &&
                        el.polygon &&
                        el.polygon.length > 0 ? (
                          <polygon
                            points={getPolygonPoints(el.polygon)}
                            fill={
                              hoveredId === el.id
                                ? getStrokeColor(el.category)
                                : "transparent"
                            }
                            fillOpacity="0.2"
                            stroke={getStrokeColor(el.category)}
                            strokeWidth="0.5"
                            vectorEffect="non-scaling-stroke"
                            className="transition-all duration-200"
                          />
                        ) : (
                          <rect
                            x={el.box.xmin * 100}
                            y={el.box.ymin * 100}
                            width={(el.box.xmax - el.box.xmin) * 100}
                            height={(el.box.ymax - el.box.ymin) * 100}
                            fill={
                              hoveredId === el.id
                                ? getStrokeColor(el.category)
                                : "transparent"
                            }
                            fillOpacity="0.2"
                            stroke={getStrokeColor(el.category)}
                            strokeWidth="0.5"
                            vectorEffect="non-scaling-stroke"
                            className="transition-all duration-200"
                          />
                        )}
                      </g>
                    ))}
                  </svg>

                  {/* Interactive HTML Layer for tooltips/labels */}
                  {elementsWithCrops.map((el) => (
                    <div
                      key={el.id}
                      className="absolute"
                      style={{
                        top: `${el.box.ymin * 100}%`,
                        left: `${el.box.xmin * 100}%`,
                        width: `${(el.box.xmax - el.box.xmin) * 100}%`,
                        height: `${(el.box.ymax - el.box.ymin) * 100}%`,
                      }}
                    >
                      {/* Label tag on hover */}
                      {hoveredId === el.id && (
                        <div
                          className="absolute -top-6 left-0 px-2 py-0.5 text-xs text-white font-bold rounded shadow-sm whitespace-nowrap z-20"
                          style={{
                            backgroundColor: getStrokeColor(el.category),
                          }}
                        >
                          {el.category}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ZoomPanControls>
      </div>

      {/* Right Panel: Tabs and Content */}
      <div className="w-full lg:w-[420px] flex flex-col bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden h-full max-h-[80vh] lg:max-h-full">
        {/* Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <button
            onClick={() => setActiveTab("extraction")}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors ${
              activeTab === "extraction"
                ? "border-indigo-600 text-indigo-700 dark:text-indigo-400 bg-white dark:bg-slate-800"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
          >
            <LayoutList size={16} /> Extraction
          </button>
          <button
            onClick={() => setActiveTab("compliance")}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors ${
              activeTab === "compliance"
                ? "border-indigo-600 text-indigo-700 dark:text-indigo-400 bg-white dark:bg-slate-800"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
          >
            <ShieldCheck size={16} /> Compliance
          </button>
        </div>

        {/* Extraction Tab Content - Use CSS visibility to persist state */}
        <div
          className={`flex-1 flex flex-col overflow-hidden ${
            activeTab === "extraction" ? "flex" : "hidden"
          }`}
        >
          <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-slate-700 dark:text-slate-200">
                Detailed Results
              </h2>
              {platformName && (
                <span className="text-xs font-medium px-2 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-md border border-indigo-100 dark:border-indigo-800">
                  {platformName}
                </span>
              )}
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
                    selectedCategory === cat
                      ? "bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-800"
                      : "bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 dark:bg-slate-900/50">
            {filteredElements.map((el) => (
              <div
                key={el.id}
                onMouseEnter={() => setHoveredId(el.id)}
                onMouseLeave={() => setHoveredId(null)}
                className={`bg-white dark:bg-slate-800 rounded-xl p-3 border transition-all duration-200 cursor-pointer ${
                  hoveredId === el.id
                    ? "border-blue-400 dark:border-blue-500 shadow-md ring-1 ring-blue-100 dark:ring-blue-900"
                    : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 shadow-sm"
                }`}
              >
                <div className="flex gap-3">
                  {/* Cropped Thumbnail */}
                  <div className="w-20 h-20 flex-shrink-0 bg-slate-100 dark:bg-slate-700 rounded-lg overflow-hidden border border-slate-100 dark:border-slate-600 flex items-center justify-center">
                    {el.croppedImageUrl ? (
                      <img
                        src={el.croppedImageUrl}
                        alt={el.category}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="animate-pulse bg-slate-200 dark:bg-slate-600 w-full h-full" />
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${getColor(
                          el.category
                        )} flex items-center gap-1`}
                      >
                        {getIcon(el.category)}
                        {el.category}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700 dark:text-slate-200 line-clamp-3 font-medium leading-relaxed">
                      {el.content}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(el.content);
                        }}
                        className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 flex items-center gap-1"
                      >
                        <Download size={12} /> Copy Text
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {filteredElements.length === 0 && (
              <div className="text-center py-12 text-slate-400 dark:text-slate-500">
                <p>No elements found in this category.</p>
              </div>
            )}
          </div>
          <div className="p-3 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-center text-xs text-slate-400 dark:text-slate-500">
            {elementsWithCrops.length} elements detected
          </div>
        </div>

        {/* Compliance Tab Content - Use CSS visibility to persist state */}
        <div
          className={`flex-1 flex flex-col overflow-hidden ${
            activeTab === "compliance" ? "flex" : "hidden"
          }`}
        >
          <ComplianceView
            imageSrc={imageSrc}
            rules={complianceRules || []}
            initialResults={complianceResults}
            isComplianceLoading={isComplianceLoading}
            imageFile={imageFile}
            imageSpecs={imageSpecs}
            extractionResults={analysis}
            latestImageVersion={
              imageVersions[imageVersions.length - 1]?.src || imageSrc
            }
            onImageFixGenerated={(
              imageDataUrl: string,
              ruleIndex: number,
              ruleLabel: string
            ) => {
              // Add the new fixed image to versions
              const newVersion = {
                id: `fix-${ruleIndex}-${Date.now()}`,
                src: imageDataUrl,
                label: `Fix: ${ruleLabel.substring(0, 20)}${
                  ruleLabel.length > 20 ? "..." : ""
                }`,
                ruleIndex: ruleIndex,
              };
              setImageVersions((prev) => {
                const updated = [...prev, newVersion];
                setSelectedImageIndex(updated.length - 1); // Select the newly generated image
                return updated;
              });
            }}
          />
        </div>
      </div>
    </div>
  );
};
