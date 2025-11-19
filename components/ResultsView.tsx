import React, { useEffect, useRef, useState } from 'react';
import { AnalysisResult, AnalyzedElement } from '../types';
import { Download, Type, Image as ImageIcon, Box, MousePointerClick, Eye, Maximize, Spline } from 'lucide-react';

interface ResultsViewProps {
  imageSrc: string;
  analysis: AnalysisResult;
  onReset: () => void;
}

type ViewMode = 'box' | 'outline';

export const ResultsView: React.FC<ResultsViewProps> = ({ imageSrc, analysis, onReset }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [elementsWithCrops, setElementsWithCrops] = useState<AnalyzedElement[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [viewMode, setViewMode] = useState<ViewMode>('box');

  // Generate crops when image loads
  useEffect(() => {
    const img = new Image();
    img.src = imageSrc;
    img.onload = () => {
      const newElements = analysis.elements.map((el) => {
        const canvas = document.createElement('canvas');
        const width = img.width * (el.box.xmax - el.box.xmin);
        const height = img.height * (el.box.ymax - el.box.ymin);
        
        // Add some padding to crop if possible, but keep strict for now
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        
        const ctx = canvas.getContext('2d');
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
  const categories = ['All', ...Array.from(new Set(analysis.elements.map(e => e.category)))];
  const filteredElements = selectedCategory === 'All' 
    ? elementsWithCrops 
    : elementsWithCrops.filter(e => e.category === selectedCategory);

  // Helper to get color by category
  const getColor = (category: string) => {
    switch (category) {
      case 'Text': return 'text-blue-500 border-blue-500 bg-blue-500/10';
      case 'Button': return 'text-green-500 border-green-500 bg-green-500/10';
      case 'Logo': return 'text-purple-500 border-purple-500 bg-purple-500/10';
      case 'Product': return 'text-orange-500 border-orange-500 bg-orange-500/10';
      default: return 'text-gray-500 border-gray-500 bg-gray-500/10';
    }
  };
  
  const getStrokeColor = (category: string) => {
      switch (category) {
      case 'Text': return '#3b82f6';
      case 'Button': return '#22c55e';
      case 'Logo': return '#a855f7';
      case 'Product': return '#f97316';
      default: return '#6b7280';
    }
  };

  const getIcon = (category: string) => {
    switch (category) {
      case 'Text': return <Type size={16} />;
      case 'Button': return <MousePointerClick size={16} />;
      case 'Logo': return <Box size={16} />;
      case 'Product': return <ImageIcon size={16} />;
      default: return <Eye size={16} />;
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-full gap-6 overflow-hidden">
      {/* Left Panel: Image Overlay */}
      <div className="flex-1 flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden min-h-[400px]">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-4">
            <h2 className="font-semibold text-slate-700 flex items-center gap-2">
              <ImageIcon size={18} /> Analysis
            </h2>
            <div className="flex bg-slate-200 rounded-lg p-0.5">
              <button 
                onClick={() => setViewMode('box')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
                  viewMode === 'box' 
                    ? 'bg-white shadow text-slate-800' 
                    : 'text-slate-600 hover:text-slate-800 hover:bg-slate-200/50'
                }`}
              >
                <Maximize size={14} />
                Box
              </button>
              <button 
                onClick={() => setViewMode('outline')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
                  viewMode === 'outline' 
                    ? 'bg-white shadow text-slate-800' 
                    : 'text-slate-600 hover:text-slate-800 hover:bg-slate-200/50'
                }`}
              >
                <Spline size={14} />
                Outline
              </button>
            </div>
          </div>
           <button onClick={onReset} className="text-sm text-red-600 hover:text-red-700 font-medium">
            Analyze Another
          </button>
        </div>
        
        <div className="relative flex-1 bg-slate-100 overflow-auto flex items-center justify-center p-4" ref={containerRef}>
          <div className="relative shadow-lg inline-block">
            <img 
              src={imageSrc} 
              alt="Analyzed" 
              className="max-w-full max-h-[70vh] block object-contain select-none" 
            />
            
            {/* Bounding Box Overlay */}
            {viewMode === 'box' && (
              <div className="absolute inset-0 pointer-events-none">
                {elementsWithCrops.map((el) => (
                  <div
                    key={el.id}
                    className={`absolute border-2 transition-all duration-200 ${
                      hoveredId === el.id ? 'bg-opacity-20 z-10 shadow-sm' : 'bg-opacity-0 z-0'
                    }`}
                    style={{
                      top: `${el.box.ymin * 100}%`,
                      left: `${el.box.xmin * 100}%`,
                      width: `${(el.box.xmax - el.box.xmin) * 100}%`,
                      height: `${(el.box.ymax - el.box.ymin) * 100}%`,
                      borderColor: getStrokeColor(el.category),
                      backgroundColor: hoveredId === el.id ? getStrokeColor(el.category) + '33' : 'transparent',
                    }}
                  >
                    {hoveredId === el.id && (
                       <div 
                        className="absolute -top-6 left-0 px-2 py-0.5 text-xs text-white font-bold rounded shadow-sm whitespace-nowrap"
                        style={{ backgroundColor: getStrokeColor(el.category) }}
                       >
                         {el.category}
                       </div>
                     )}
                  </div>
                ))}
              </div>
            )}

            {/* Polygon Outline Overlay */}
            {viewMode === 'outline' && (
              <svg 
                className="absolute inset-0 pointer-events-none w-full h-full" 
                viewBox="0 0 1 1" 
                preserveAspectRatio="none"
              >
                {elementsWithCrops.map((el) => {
                  if (!el.polygon || el.polygon.length === 0) return null;
                  
                  const points = el.polygon.map(p => `${p.x},${p.y}`).join(' ');
                  const isActive = hoveredId === el.id;
                  const color = getStrokeColor(el.category);

                  return (
                    <g key={el.id}>
                      <polygon
                        points={points}
                        fill={isActive ? color + '33' : 'transparent'} // 33 is roughly 20% hex opacity
                        stroke={color}
                        strokeWidth={isActive ? "0.003" : "0.002"}
                        vectorEffect="non-scaling-stroke"
                        className="transition-all duration-200"
                      />
                      {isActive && (
                        <foreignObject 
                          x={el.polygon[0].x} 
                          y={el.polygon[0].y - 0.05} 
                          width="1" 
                          height="0.1"
                        >
                           <div 
                            className="px-2 py-0.5 text-xs text-white font-bold rounded shadow-sm inline-block whitespace-nowrap"
                            style={{ backgroundColor: color }}
                           >
                             {el.category}
                           </div>
                        </foreignObject>
                      )}
                    </g>
                  );
                })}
              </svg>
            )}
          </div>
        </div>
      </div>

      {/* Right Panel: Extracted Items */}
      <div className="w-full lg:w-[400px] flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden h-full max-h-[80vh] lg:max-h-full">
        <div className="p-4 border-b border-slate-100 bg-slate-50">
          <h2 className="font-semibold text-slate-700 mb-3">Extracted Contents</h2>
          
          {/* Category Filter */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
                  selectedCategory === cat 
                    ? 'bg-slate-800 text-white' 
                    : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
          {filteredElements.map((el) => (
            <div 
              key={el.id}
              onMouseEnter={() => setHoveredId(el.id)}
              onMouseLeave={() => setHoveredId(null)}
              className={`bg-white rounded-xl p-3 border transition-all duration-200 cursor-pointer ${
                hoveredId === el.id 
                  ? 'border-blue-400 shadow-md ring-1 ring-blue-100' 
                  : 'border-slate-200 hover:border-slate-300 shadow-sm'
              }`}
            >
              <div className="flex gap-3">
                {/* Cropped Thumbnail */}
                <div className="w-20 h-20 flex-shrink-0 bg-slate-100 rounded-lg overflow-hidden border border-slate-100 flex items-center justify-center">
                  {el.croppedImageUrl ? (
                    <img src={el.croppedImageUrl} alt={el.category} className="w-full h-full object-contain" />
                  ) : (
                    <div className="animate-pulse bg-slate-200 w-full h-full" />
                  )}
                </div>
                
                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${getColor(el.category)} flex items-center gap-1`}>
                      {getIcon(el.category)}
                      {el.category}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 line-clamp-3 font-medium leading-relaxed">
                    {el.content}
                  </p>
                  <div className="mt-2 flex gap-2">
                     <button 
                       onClick={(e) => {
                         e.stopPropagation();
                         navigator.clipboard.writeText(el.content);
                       }}
                       className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"
                     >
                       <Download size={12} /> Copy Text
                     </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
          
          {filteredElements.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <p>No elements found in this category.</p>
            </div>
          )}
        </div>
        
        <div className="p-3 border-t border-slate-100 bg-slate-50 text-center text-xs text-slate-400">
           {elementsWithCrops.length} elements detected
        </div>
      </div>
    </div>
  );
};