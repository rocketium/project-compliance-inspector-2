
import React, { useState, useEffect } from 'react';
import { analyzeImageWithGemini } from './services/gemini';
import { AnalysisResult, AppState, PlatformConfig } from './types';
import { ResultsView } from './components/ResultsView';
import { UploadCloud, FileImage, AlertCircle, Sparkles, Settings } from 'lucide-react';
import { AdminPanel } from './components/AdminPanel';

// Fallback platforms in case fetch fails
const DEFAULT_PLATFORMS: PlatformConfig[] = [
  {
    "id": "default",
    "name": "Default",
    "prompt": "Analyze this advertisement or design image in extreme detail. Identify all distinct elements: Text blocks, Visual elements. Classify into 'Text', 'Logo', 'Product', 'Button', 'Other'. Provide precise bounding boxes normalized to 0-1000 scale."
  },
  {
    "id": "am-fuse",
    "name": "Amazon Fuse",
    "prompt": "You are a Co-Branding Compliance AI specialized in Amazon Fuse. Identify Partner Attribution (Classify as 'Partner'), Service Attribution ('Logo'), Offer ('Text'), Compliance ('Text'), Key Art ('Product'), CTA ('Button')."
  },
  {
    "id": "am-ads",
    "name": "Amazon Ads",
    "prompt": "Analyze this image as an e-commerce ad. Identify Product, Brand Identity ('Logo'), Pricing ('Text'), Ratings ('Other'), CTA ('Button')."
  }
];

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [thinkingTime, setThinkingTime] = useState(0);
  const [showAdmin, setShowAdmin] = useState(false);
  
  // Platform Management
  const [platforms, setPlatforms] = useState<PlatformConfig[]>(DEFAULT_PLATFORMS);
  const [activePlatformId, setActivePlatformId] = useState<string>('default');

  const fetchPlatforms = async () => {
    try {
      const res = await fetch('/api/platforms');
      if (res.ok) {
        const data = await res.json();
        setPlatforms(data);
      } else {
        // Handle 404 or other errors without crashing
         console.warn("Could not fetch platforms from API, checking fallback...");
         try {
             // Fallback to json file if api is 404 (static hosting)
             const staticRes = await fetch('/platforms.json');
             if(staticRes.ok) {
                 const staticData = await staticRes.json();
                 setPlatforms(staticData);
             }
         } catch(e) {
             console.warn("Using default fallback configuration");
         }
      }
    } catch (err) {
      console.warn("Using default fallback configuration due to network error");
      // Keep DEFAULT_PLATFORMS
    }
  };

  useEffect(() => {
    // 1. Load Platforms
    fetchPlatforms();

    // 2. Check URL for platform param
    const params = new URLSearchParams(window.location.search);
    const p = params.get('platform');
    if (p) {
      setActivePlatformId(p);
    }
    
    // 3. Check routing
    if (window.location.pathname === '/admin') {
      setShowAdmin(true);
    }
  }, []);

  // Use derived active platform, strictly falling back if ID not found
  const activePlatform = platforms.find(p => p.id === activePlatformId) || platforms[0] || DEFAULT_PLATFORMS[0];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please upload a valid image file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
      setImageFile(file);
      setAppState(AppState.IDLE);
      setErrorMsg(null);
    };
    reader.readAsDataURL(file);
  };

  const handleAnalyze = async () => {
    if (!imagePreview || !imageFile) return;

    setAppState(AppState.ANALYZING);
    setErrorMsg(null);
    
    // Start timer for thinking mode visualization
    const startTime = Date.now();
    const timer = setInterval(() => {
      setThinkingTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    try {
      // Extract base64 data (remove "data:image/jpeg;base64," prefix)
      const base64Data = imagePreview.split(',')[1];
      const mimeType = imageFile.type;

      // Use the specific prompt for the active platform
      const result = await analyzeImageWithGemini(base64Data, mimeType, activePlatform.prompt);
      setAnalysisResult(result);
      setAppState(AppState.SUCCESS);
    } catch (err: any) {
      console.error(err);
      // Handle JSON parse errors from HTML responses
      let message = err.message || "An error occurred during analysis.";
      if (message.includes('Unexpected token') || message.includes('is not valid JSON')) {
        message = "API Error: The server returned an invalid response. Please check your connection or API key.";
      }
      setErrorMsg(message);
      setAppState(AppState.ERROR);
    } finally {
      clearInterval(timer);
      setThinkingTime(0);
    }
  };

  const handleReset = () => {
    setAppState(AppState.IDLE);
    setImageFile(null);
    setImagePreview(null);
    setAnalysisResult(null);
    setErrorMsg(null);
  };

  // Render Admin Panel
  if (showAdmin) {
      return (
          <div className="min-h-screen bg-slate-100 p-8">
              <div className="max-w-5xl mx-auto bg-white rounded-xl shadow-lg overflow-hidden min-h-[600px]">
                <AdminPanel 
                  onClose={() => {
                      setShowAdmin(false);
                      window.history.pushState({}, '', '/');
                      fetchPlatforms(); // Refresh data
                  }}
                  currentPlatforms={platforms}
                />
              </div>
          </div>
      )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-1.5 rounded-lg">
              <Sparkles className="text-white h-5 w-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">AdAnalyzer AI</h1>
          </div>
          <div className="flex items-center gap-3">
             {activePlatformId !== 'default' && (
               <span className="px-3 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full text-xs font-medium">
                 Platform: {activePlatform.name} 
                 <a href="/admin" onClick={(e) => { e.preventDefault(); setShowAdmin(true); }} className="ml-1 underline hover:text-indigo-900">Configure</a>
               </span>
             )}
             <button 
               onClick={() => setShowAdmin(true)}
               className="text-slate-400 hover:text-slate-600 transition-colors p-2 hover:bg-slate-100 rounded-full"
               title="Settings"
             >
               <Settings size={20} />
             </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        
        {/* IDLE STATE: Upload */}
        {appState === AppState.IDLE && !imagePreview && (
          <div className="max-w-2xl mx-auto mt-12">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold text-slate-800 mb-4">Extract logic from visual chaos</h2>
              <p className="text-lg text-slate-600 leading-relaxed">
                Upload an advertisement, flyer, or UI design. The AI will analyze the layout
                using the <strong className="text-indigo-600">{activePlatform.name}</strong> configuration.
              </p>
            </div>

            <div className="bg-white rounded-2xl border-2 border-dashed border-slate-300 p-12 text-center hover:border-indigo-500 transition-colors shadow-sm group">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-indigo-50 text-indigo-600 mb-6 group-hover:scale-110 transition-transform">
                <UploadCloud size={32} />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-2">Upload an image to analyze</h3>
              <p className="text-slate-500 mb-8">Supported formats: JPEG, PNG, WEBP</p>
              
              <label className="inline-flex">
                <input 
                  type="file" 
                  className="hidden" 
                  accept="image/*" 
                  onChange={handleFileChange}
                />
                <span className="cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-lg font-medium transition-colors shadow-sm hover:shadow flex items-center gap-2">
                  <FileImage size={18} />
                  Select Image
                </span>
              </label>
            </div>
            
            <div className="mt-8 flex justify-center gap-2 text-xs text-slate-400">
                {platforms.map(p => (
                    <React.Fragment key={p.id}>
                        <span 
                            onClick={() => {
                                setActivePlatformId(p.id);
                                const newUrl = new URL(window.location.href);
                                newUrl.searchParams.set('platform', p.id);
                                window.history.pushState({}, '', newUrl);
                            }}
                            className={`cursor-pointer hover:text-indigo-500 ${activePlatformId === p.id ? 'font-bold text-slate-600' : ''}`}
                        >
                            {p.name}
                        </span>
                        <span className="last:hidden">•</span>
                    </React.Fragment>
                ))}
            </div>
          </div>
        )}

        {/* IDLE STATE: Preview */}
        {appState === AppState.IDLE && imagePreview && (
          <div className="max-w-4xl mx-auto flex flex-col items-center">
            <div className="w-full bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden p-4 mb-8">
              <img 
                src={imagePreview} 
                alt="Preview" 
                className="max-h-[60vh] mx-auto object-contain rounded-lg" 
              />
            </div>
            
            <div className="flex gap-4">
              <button 
                onClick={handleReset}
                className="px-6 py-3 bg-white border border-slate-300 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleAnalyze}
                className="px-8 py-3 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 flex items-center gap-2"
              >
                <Sparkles size={18} />
                Run Deep Analysis
              </button>
            </div>
          </div>
        )}

        {/* ANALYZING STATE */}
        {appState === AppState.ANALYZING && (
          <div className="max-w-lg mx-auto text-center mt-20">
            <div className="relative w-24 h-24 mx-auto mb-8">
              <div className="absolute inset-0 border-4 border-slate-100 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center font-mono text-indigo-600 font-bold text-lg">
                {thinkingTime}s
              </div>
            </div>
            <h3 className="text-2xl font-bold text-slate-800 mb-3">Analyzing visual structure...</h3>
            <p className="text-slate-500 mb-8">
              Thinking mode enabled. Using <strong>{activePlatform.name}</strong> logic to deconstruct the image.
            </p>
             <div className="mb-6 inline-block bg-slate-100 px-4 py-2 rounded font-mono text-xs text-slate-500">
               Platform: {activePlatformId}
             </div>
            
            <div className="space-y-3 max-w-xs mx-auto text-left">
              <div className="flex items-center gap-3 text-sm text-slate-600 animate-pulse">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                Detecting text regions
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-600 animate-pulse delay-150">
                <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                Calculating bounding boxes
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-600 animate-pulse delay-300">
                <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                Categorizing visual elements
              </div>
            </div>
          </div>
        )}

        {/* ERROR STATE */}
        {appState === AppState.ERROR && (
          <div className="max-w-md mx-auto mt-20 text-center">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle size={32} />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">Analysis Failed</h3>
            <p className="text-slate-600 mb-8">{errorMsg}</p>
            <button 
              onClick={handleReset}
              className="px-6 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {/* SUCCESS STATE */}
        {appState === AppState.SUCCESS && imagePreview && analysisResult && (
          <div className="h-[calc(100vh-140px)] min-h-[600px]">
            <ResultsView 
              imageSrc={imagePreview} 
              analysis={analysisResult} 
              onReset={handleReset}
              platformName={activePlatform.name}
              complianceRules={activePlatform.complianceRules}
            />
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
