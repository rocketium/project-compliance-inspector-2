
import React from 'react';
import { ImageMetadata, ImageSpec } from '../types';
import { 
  Ruler, 
  FileType, 
  HardDrive, 
  Scan, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Maximize2
} from 'lucide-react';

interface ImageMetadataDisplayProps {
  metadata: ImageMetadata;
  specs?: ImageSpec;
  className?: string;
}

interface SpecCheckResult {
  label: string;
  value: string;
  status: 'pass' | 'fail' | 'warning' | 'info';
  detail?: string;
}

export const ImageMetadataDisplay: React.FC<ImageMetadataDisplayProps> = ({
  metadata,
  specs,
  className = ''
}) => {
  const checkSpecs = (): SpecCheckResult[] => {
    const results: SpecCheckResult[] = [];

    // Dimensions check
    let dimensionStatus: 'pass' | 'fail' | 'warning' | 'info' = 'info';
    let dimensionDetail = '';
    
    if (specs) {
      const widthOk = (!specs.minWidth || metadata.width >= specs.minWidth) && 
                      (!specs.maxWidth || metadata.width <= specs.maxWidth);
      const heightOk = (!specs.minHeight || metadata.height >= specs.minHeight) && 
                       (!specs.maxHeight || metadata.height <= specs.maxHeight);
      
      if (widthOk && heightOk) {
        dimensionStatus = 'pass';
        dimensionDetail = 'Meets dimension requirements';
      } else {
        dimensionStatus = 'fail';
        if (specs.minWidth && metadata.width < specs.minWidth) {
          dimensionDetail = `Min width: ${specs.minWidth}px`;
        } else if (specs.maxWidth && metadata.width > specs.maxWidth) {
          dimensionDetail = `Max width: ${specs.maxWidth}px`;
        } else if (specs.minHeight && metadata.height < specs.minHeight) {
          dimensionDetail = `Min height: ${specs.minHeight}px`;
        } else if (specs.maxHeight && metadata.height > specs.maxHeight) {
          dimensionDetail = `Max height: ${specs.maxHeight}px`;
        }
      }
    }
    
    results.push({
      label: 'Dimensions',
      value: `${metadata.width} × ${metadata.height}px`,
      status: dimensionStatus,
      detail: dimensionDetail
    });

    // Aspect ratio check
    let aspectStatus: 'pass' | 'fail' | 'warning' | 'info' = 'info';
    let aspectDetail = '';
    
    if (specs?.aspectRatios && specs.aspectRatios.length > 0) {
      const matches = specs.aspectRatios.some(ratio => {
        const [w, h] = ratio.split(':').map(Number);
        const expectedRatio = w / h;
        const actualRatio = metadata.width / metadata.height;
        return Math.abs(expectedRatio - actualRatio) < 0.05; // 5% tolerance
      });
      
      aspectStatus = matches ? 'pass' : 'warning';
      aspectDetail = matches 
        ? 'Matches allowed ratios' 
        : `Expected: ${specs.aspectRatios.join(' or ')}`;
    }
    
    results.push({
      label: 'Aspect Ratio',
      value: metadata.aspectRatio,
      status: aspectStatus,
      detail: aspectDetail
    });

    // File size check
    let sizeStatus: 'pass' | 'fail' | 'warning' | 'info' = 'info';
    let sizeDetail = '';
    
    if (specs?.maxFileSizeKB) {
      if (metadata.fileSizeKB <= specs.maxFileSizeKB) {
        sizeStatus = 'pass';
        sizeDetail = `Under ${specs.maxFileSizeKB}KB limit`;
      } else {
        sizeStatus = 'fail';
        sizeDetail = `Exceeds ${specs.maxFileSizeKB}KB limit`;
      }
    }
    
    const sizeValue = metadata.fileSizeKB >= 1024 
      ? `${(metadata.fileSizeKB / 1024).toFixed(2)} MB`
      : `${metadata.fileSizeKB.toFixed(1)} KB`;
    
    results.push({
      label: 'File Size',
      value: sizeValue,
      status: sizeStatus,
      detail: sizeDetail
    });

    // Format check
    let formatStatus: 'pass' | 'fail' | 'warning' | 'info' = 'info';
    let formatDetail = '';
    
    if (specs?.allowedFormats && specs.allowedFormats.length > 0) {
      const formatLower = metadata.format.toLowerCase();
      const matches = specs.allowedFormats.some(f => 
        f.toLowerCase() === formatLower || 
        f.toLowerCase() === formatLower.replace('jpeg', 'jpg')
      );
      
      formatStatus = matches ? 'pass' : 'fail';
      formatDetail = matches 
        ? 'Allowed format' 
        : `Allowed: ${specs.allowedFormats.join(', ')}`;
    }
    
    results.push({
      label: 'Format',
      value: metadata.format.toUpperCase(),
      status: formatStatus,
      detail: formatDetail
    });

    // DPI check (if available)
    if (metadata.dpi) {
      let dpiStatus: 'pass' | 'fail' | 'warning' | 'info' = 'info';
      let dpiDetail = '';
      
      if (specs?.minDPI) {
        dpiStatus = metadata.dpi >= specs.minDPI ? 'pass' : 'fail';
        dpiDetail = metadata.dpi >= specs.minDPI 
          ? `Meets ${specs.minDPI} DPI requirement`
          : `Below ${specs.minDPI} DPI requirement`;
      }
      
      results.push({
        label: 'Resolution',
        value: `${metadata.dpi} DPI`,
        status: dpiStatus,
        detail: dpiDetail
      });
    }

    return results;
  };

  const results = checkSpecs();
  const hasFailures = results.some(r => r.status === 'fail');
  const hasWarnings = results.some(r => r.status === 'warning');

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pass':
        return <CheckCircle2 size={14} className="text-green-500" />;
      case 'fail':
        return <XCircle size={14} className="text-red-500" />;
      case 'warning':
        return <AlertTriangle size={14} className="text-amber-500" />;
      default:
        return null;
    }
  };

  const getIcon = (label: string) => {
    switch (label) {
      case 'Dimensions':
        return <Maximize2 size={14} />;
      case 'Aspect Ratio':
        return <Ruler size={14} />;
      case 'File Size':
        return <HardDrive size={14} />;
      case 'Format':
        return <FileType size={14} />;
      case 'Resolution':
        return <Scan size={14} />;
      default:
        return null;
    }
  };

  return (
    <div className={`bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden ${className}`}>
      {/* Header */}
      <div className={`px-4 py-3 border-b flex items-center justify-between ${
        hasFailures 
          ? 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800' 
          : hasWarnings 
            ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800' 
            : 'bg-slate-50 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600'
      }`}>
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Image Specifications</span>
        {specs && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            hasFailures 
              ? 'bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-200' 
              : hasWarnings 
                ? 'bg-amber-100 dark:bg-amber-800 text-amber-700 dark:text-amber-200' 
                : 'bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-200'
          }`}>
            {hasFailures ? 'Specs Not Met' : hasWarnings ? 'Check Required' : 'Specs Met'}
          </span>
        )}
      </div>

      {/* Specs Grid */}
      <div className="p-3 grid grid-cols-2 gap-2">
        {results.map((result, idx) => (
          <div 
            key={idx}
            className={`p-2.5 rounded-lg border ${
              result.status === 'fail' 
                ? 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800' 
                : result.status === 'warning'
                  ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800'
                  : result.status === 'pass'
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-800'
                    : 'bg-slate-50 dark:bg-slate-700/50 border-slate-100 dark:border-slate-600'
            }`}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-slate-400 dark:text-slate-500">{getIcon(result.label)}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">{result.label}</span>
              {getStatusIcon(result.status)}
            </div>
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{result.value}</div>
            {result.detail && (
              <div className={`text-[10px] mt-0.5 ${
                result.status === 'fail' 
                  ? 'text-red-600 dark:text-red-400' 
                  : result.status === 'warning'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-slate-500 dark:text-slate-400'
              }`}>
                {result.detail}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// Utility function to extract metadata from a File or base64 image
export const extractImageMetadata = async (
  file: File | null,
  base64Src: string
): Promise<ImageMetadata> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      // Calculate aspect ratio
      const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
      const divisor = gcd(img.width, img.height);
      const aspectRatio = `${img.width / divisor}:${img.height / divisor}`;
      
      // Simplify common ratios
      const ratioMap: Record<string, string> = {
        '16:9': '16:9',
        '9:16': '9:16',
        '4:3': '4:3',
        '3:4': '3:4',
        '1:1': '1:1',
        '3:2': '3:2',
        '2:3': '2:3',
      };
      
      const simplifiedRatio = ratioMap[aspectRatio] || aspectRatio;

      // Get file size
      let fileSizeKB = 0;
      if (file) {
        fileSizeKB = file.size / 1024;
      } else {
        // Estimate from base64
        const base64Data = base64Src.split(',')[1] || base64Src;
        fileSizeKB = (base64Data.length * 0.75) / 1024;
      }

      // Get format
      let format = 'unknown';
      if (file) {
        format = file.type.split('/')[1] || 'unknown';
      } else {
        const match = base64Src.match(/data:image\/(\w+)/);
        if (match) format = match[1];
      }

      resolve({
        width: img.width,
        height: img.height,
        fileSizeKB,
        format,
        aspectRatio: simplifiedRatio,
        dpi: undefined // DPI not easily extractable from browser, would need EXIF parsing
      });
    };
    img.src = base64Src;
  });
};

