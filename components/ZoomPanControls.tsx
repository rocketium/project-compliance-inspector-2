import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  ZoomIn,
  ZoomOut,
  Maximize,
  Move,
  RotateCcw,
  Crosshair,
} from "lucide-react";

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
  minZoom = 0.25,
  maxZoom = 5,
  zoomStep = 0.15,
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
  const [lastPinchDistance, setLastPinchDistance] = useState<number | null>(null);

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

  // Handle touch events for pinch-to-zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const getDistance = (touches: TouchList) => {
      if (touches.length < 2) return 0;
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        setLastPinchDistance(getDistance(e.touches));
      } else if (e.touches.length === 1) {
        setIsPanning(true);
        setPanStart({
          x: e.touches[0].clientX - transform.translateX,
          y: e.touches[0].clientY - transform.translateY,
        });
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && lastPinchDistance !== null) {
        e.preventDefault();
        const newDistance = getDistance(e.touches);
        const scaleDelta = (newDistance - lastPinchDistance) * 0.01;
        setTransform((prev) => ({
          ...prev,
          scale: Math.max(minZoom, Math.min(maxZoom, prev.scale + scaleDelta)),
        }));
        setLastPinchDistance(newDistance);
      } else if (e.touches.length === 1 && isPanning) {
        setTransform((prev) => ({
          ...prev,
          translateX: e.touches[0].clientX - panStart.x,
          translateY: e.touches[0].clientY - panStart.y,
        }));
      }
    };

    const handleTouchEnd = () => {
      setLastPinchDistance(null);
      setIsPanning(false);
    };

    container.addEventListener("touchstart", handleTouchStart, { passive: false });
    container.addEventListener("touchmove", handleTouchMove, { passive: false });
    container.addEventListener("touchend", handleTouchEnd);

    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
    };
  }, [lastPinchDistance, isPanning, panStart, transform.translateX, transform.translateY, minZoom, maxZoom]);

  // Handle mouse panning
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

  // Double-click to zoom
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (transform.scale > 1) {
        resetView();
      } else {
        setTransform((prev) => ({
          ...prev,
          scale: Math.min(prev.scale * 2, maxZoom),
        }));
      }
    },
    [transform.scale, maxZoom, resetView]
  );

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
      {/* Control Bar - Compact */}
      <div className="absolute top-2 left-2 z-20 flex items-center gap-0.5 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm rounded-lg shadow-md border border-slate-200/80 dark:border-slate-700/80 p-0.5">
        <button
          onClick={zoomOut}
          disabled={transform.scale <= minZoom}
          className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-slate-600 dark:text-slate-300"
          title="Zoom Out (-)"
        >
          <ZoomOut size={14} />
        </button>

        <div className="px-1.5 min-w-[42px] text-center">
          <span className="text-[11px] font-mono font-medium text-slate-700 dark:text-slate-200">
            {zoomPercentage}%
          </span>
        </div>

        <button
          onClick={zoomIn}
          disabled={transform.scale >= maxZoom}
          className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-slate-600 dark:text-slate-300"
          title="Zoom In (+)"
        >
          <ZoomIn size={14} />
        </button>

        <div className="w-px h-5 bg-slate-200 dark:bg-slate-600 mx-0.5" />

        <button
          onClick={() => setPanMode(!panMode)}
          className={`p-1.5 rounded transition-colors ${
            panMode
              ? "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400"
              : "hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
          }`}
          title="Pan Mode (Alt+Drag)"
        >
          <Move size={14} />
        </button>

        <button
          onClick={fitToView}
          className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors text-slate-600 dark:text-slate-300"
          title="Fit to View"
        >
          <Maximize size={14} />
        </button>

        <button
          onClick={centerView}
          className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors text-slate-600 dark:text-slate-300"
          title="Center View"
        >
          <Crosshair size={14} />
        </button>

        <button
          onClick={resetView}
          className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors text-slate-600 dark:text-slate-300"
          title="Reset View (0)"
        >
          <RotateCcw size={14} />
        </button>
      </div>

      {/* Zoom indicator in corner */}
      {transform.scale !== 1 && (
        <div className="absolute bottom-2 right-2 z-20 bg-black/70 text-white text-[10px] font-mono px-1.5 py-0.5 rounded">
          {zoomPercentage}%
        </div>
      )}

      {/* Pan mode indicator */}
      {panMode && (
        <div className="absolute bottom-2 left-2 z-20 bg-indigo-600 text-white text-[10px] font-medium px-1.5 py-0.5 rounded flex items-center gap-1">
          <Move size={10} />
          Pan Mode
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
        onDoubleClick={handleDoubleClick}
      >
        <div
          ref={contentRef}
          className="w-full h-full flex items-center justify-center transition-transform duration-75"
          style={{
            transform: `translate(${transform.translateX}px, ${transform.translateY}px) scale(${transform.scale})`,
            transformOrigin: "center center",
          }}
        >
          {children}
        </div>
      </div>

      {/* Help tooltip - Compact */}
      <div className="absolute top-2 right-2 z-20">
        <div className="text-[9px] text-slate-500 dark:text-slate-400 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm rounded px-1.5 py-0.5 border border-slate-200 dark:border-slate-700">
          <span className="font-medium">Ctrl+Scroll</span> zoom •{" "}
          <span className="font-medium">Alt+Drag</span> pan •{" "}
          <span className="font-medium">Double-click</span> toggle
        </div>
      </div>
    </div>
  );
};
