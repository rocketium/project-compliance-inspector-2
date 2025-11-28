
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  ZoomIn, 
  ZoomOut, 
  Maximize, 
  Move, 
  RotateCcw,
  Crosshair
} from 'lucide-react';

interface ZoomPanControlsProps {
  children: React.ReactNode;
  className?: string;
  minZoom?: number;
  maxZoom?: number;
  zoomStep?: number;
}

interface Transform {
  scale: number;
  translateX: number;
  translateY: number;
}

export const ZoomPanControls: React.FC<ZoomPanControlsProps> = ({
  children,
  className = "",
  minZoom = 0.5,
  maxZoom = 4,
  zoomStep = 0.2,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const [transform, setTransform] = useState<Transform>({
    scale: 1,
    translateX: 0,
    translateY: 0,
  });

  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [panMode, setPanMode] = useState(false);

  const zoomIn = useCallback(() => {
    setTransform((prev) => ({
      ...prev,
      scale: Math.min(prev.scale + zoomStep, maxZoom),
    }));
  }, [zoomStep, maxZoom]);

  const zoomOut = useCallback(() => {
    setTransform((prev) => ({
      ...prev,
      scale: Math.max(prev.scale - zoomStep, minZoom),
    }));
  }, [zoomStep, minZoom]);

  const resetView = useCallback(() => {
    setTransform({ scale: 1, translateX: 0, translateY: 0 });
  }, []);

  const fitToView = useCallback(() => {
    // Reset to fit content in view
    setTransform({ scale: 1, translateX: 0, translateY: 0 });
  }, []);

  const centerView = useCallback(() => {
    setTransform((prev) => ({ ...prev, translateX: 0, translateY: 0 }));
  }, []);

  // Handle wheel zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -zoomStep : zoomStep;
        setTransform((prev) => ({
          ...prev,
          scale: Math.max(minZoom, Math.min(maxZoom, prev.scale + delta)),
        }));
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [minZoom, maxZoom, zoomStep]);

  // Handle panning
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (panMode || e.button === 1 || (e.button === 0 && e.altKey)) {
        e.preventDefault();
        setIsPanning(true);
        setPanStart({
          x: e.clientX - transform.translateX,
          y: e.clientY - transform.translateY,
        });
      }
    },
    [panMode, transform.translateX, transform.translateY]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning) return;
      setTransform((prev) => ({
        ...prev,
        translateX: e.clientX - panStart.x,
        translateY: e.clientY - panStart.y,
      }));
    },
    [isPanning, panStart]
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoomIn();
      } else if (e.key === "-") {
        e.preventDefault();
        zoomOut();
      } else if (e.key === "0") {
        e.preventDefault();
        resetView();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [zoomIn, zoomOut, resetView]);

  const zoomPercentage = Math.round(transform.scale * 100);

  return (
    <div className={`relative ${className}`}>
      {/* Control Bar */}
      <div className="absolute top-3 left-3 z-20 flex items-center gap-1 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 p-1">
        <button
          onClick={zoomOut}
          disabled={transform.scale <= minZoom}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-slate-600 dark:text-slate-300"
          title="Zoom Out (-)"
        >
          <ZoomOut size={18} />
        </button>

        <div className="px-2 min-w-[60px] text-center">
          <span className="text-sm font-mono font-medium text-slate-700 dark:text-slate-200">
            {zoomPercentage}%
          </span>
        </div>

        <button
          onClick={zoomIn}
          disabled={transform.scale >= maxZoom}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-slate-600 dark:text-slate-300"
          title="Zoom In (+)"
        >
          <ZoomIn size={18} />
        </button>

        <div className="w-px h-6 bg-slate-200 dark:bg-slate-600 mx-1" />

        <button
          onClick={() => setPanMode(!panMode)}
          className={`p-2 rounded-md transition-colors ${
            panMode
              ? "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400"
              : "hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
          }`}
          title="Pan Mode (Alt+Drag)"
        >
          <Move size={18} />
        </button>

        <button
          onClick={fitToView}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors text-slate-600 dark:text-slate-300"
          title="Fit to View"
        >
          <Maximize size={18} />
        </button>

        <button
          onClick={centerView}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors text-slate-600 dark:text-slate-300"
          title="Center View"
        >
          <Crosshair size={18} />
        </button>

        <button
          onClick={resetView}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors text-slate-600 dark:text-slate-300"
          title="Reset View (0)"
        >
          <RotateCcw size={18} />
        </button>
      </div>

      {/* Zoom indicator in corner */}
      {transform.scale !== 1 && (
        <div className="absolute bottom-3 right-3 z-20 bg-black/70 text-white text-xs font-mono px-2 py-1 rounded">
          {zoomPercentage}%
        </div>
      )}

      {/* Pan mode indicator */}
      {panMode && (
        <div className="absolute bottom-3 left-3 z-20 bg-indigo-600 text-white text-xs font-medium px-2 py-1 rounded flex items-center gap-1">
          <Move size={12} />
          Pan Mode Active
        </div>
      )}

      {/* Zoomable/Pannable Container */}
      <div
        ref={containerRef}
        className={`w-full h-full overflow-hidden ${
          panMode ? "cursor-grab" : ""
        } ${isPanning ? "cursor-grabbing" : ""}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          ref={contentRef}
          className="w-full h-full flex items-center justify-center transition-transform duration-100"
          style={{
            transform: `translate(${transform.translateX}px, ${transform.translateY}px) scale(${transform.scale})`,
            transformOrigin: "center center",
          }}
        >
          {children}
        </div>
      </div>

      {/* Help tooltip */}
      <div className="absolute top-3 right-3 z-20">
        <div className="text-[10px] text-slate-500 dark:text-slate-400 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm rounded px-2 py-1 border border-slate-200 dark:border-slate-700">
          <span className="font-medium">Ctrl+Scroll</span> to zoom •{" "}
          <span className="font-medium">Alt+Drag</span> to pan
        </div>
      </div>
    </div>
  );
};

