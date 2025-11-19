import React, { useState, useEffect, useCallback } from 'react';
import { analyzeImageWithGemini } from './services/gemini';
import { AnalysisResult, AppState, PlatformConfig } from './types';
import { ResultsView } from './components/ResultsView';
import { AdminPanel } from './components/AdminPanel';
import { UploadCloud, FileImage, AlertCircle, Sparkles, Layers, Target, X, Settings } from 'lucide-react';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  
  // Reference image state
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);

  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [thinkingTime, setThinkingTime] = useState(0);

  // Platform Configuration State
  const [platforms, setPlatforms] = useState<PlatformConfig[]>([]);
  const [showAdmin, setShowAdmin] = useState(false);

  // Get platform from URL query params
  const searchParams = new URLSearchParams(window.location.search);
  const platformIdParam = searchParams.get('platform') || 'default';
  
  // Find current platform config or fallback to default
  const activePlatform = platforms.find(p => p.id === platformIdParam) || platforms[0];

  useEffect(() => {
    fetchPlatforms();
  }, []);

  const fetchPlatforms = async () => {
    try {
      const res = await fetch('http://localhost:3000/api/platforms');
      const data = await res.json();
      setPlatforms(data);
    } catch (err) {
      console.error("Error fetching platforms:", err);
      // Fallback if server not running, just so UI doesn't crash immediately
      if (platforms.length === 0) {
        setPlatforms([{
          id: 'default',
          name: 'Default',
          description: 'Offline fallback',
          prompt: 'Analyze this image...'
        }]);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleReferenceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setReferencePreview(ev.target?.result as string);
        setReferenceFile(file);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearReference = () => {
    setReferenceFile(null);
    setReferencePreview(null);
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
    if (!imagePreview || !imageFile || !activePlatform) return;

    setAppState(AppState.ANALYZING);
    setErrorMsg(null);
    
    const startTime = Date.now();
    const timer = setInterval(() => {
      setThinkingTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    try {
      const base64Data = imagePreview.split(',')[1];
      const mimeType = imageFile.type;

      // Priority: User Uploaded Reference > Platform Config Reference > None
      let finalReferenceBase64 = undefined;
      
      if (referencePreview) {
        finalReferenceBase64 = referencePreview.split(',')[1];
      } else if (activePlatform.referenceLogo) {
        finalReferenceBase64 = activePlatform.referenceLogo;
      }

      // Pass the raw prompt text from the configuration object
      const result = await analyzeImageWithGemini(
        base64Data, 
        mimeType, 
        activePlatform.prompt, 
        finalReferenceBase64
      );
      
      setAnalysisResult(result);
      setAppState(AppState.SUCCESS);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "An error occurred during analysis. Please try again.");
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
    setReferenceFile(null);
    setReferencePreview(null);
    setAnalysisResult(null);
    setErrorMsg(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      
      <AdminPanel 
        isOpen={showAdmin} 
        onClose={() => setShowAdmin(false)} 
        onPlatformsUpdate={fetchPlatforms}
      />

      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-1.5 rounded-lg">
              <Sparkles className="text-white h-5 w-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">AdAnalyzer AI</h1>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setShowAdmin(true)}
              className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-all"
              title="Admin Settings"
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
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-slate-200 shadow-sm text-slate-600 text-xs font-medium mb-6">
                <Layers size={12} className="text-indigo-500" />
                Platform: 
                <span className="font-mono text-indigo-600 font-bold ml-1">
                  {activePlatform ? activePlatform.name : 'Loading...'}
                </span>
              </div>
              <h2 className="text-3xl font-bold text-slate-800 mb-4">Extract logic from visual chaos</h2>
              <p className="text-lg text-slate-600 leading-relaxed">
                Upload an advertisement, flyer, or UI design. The AI will analyze the layout using the <strong>{activePlatform?.name || 'Default'}</strong> configuration.
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
          </div>
        )}

        {/* IDLE STATE: Preview */}
        {appState === AppState.IDLE && imagePreview && (
          <div className="max-w-4xl mx-auto flex flex-col items-center">
            
            {/* Main Preview */}
            <div className="w-full bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden p-4 mb-4 relative">
              <img 
                src={imagePreview} 
                alt="Preview" 
                className="max-h-[50vh] mx-auto object-contain rounded-lg" 
              />
            </div>

            {/* Reference Image Section */}
            <div className="w-full bg-indigo-50 border border-indigo-100 rounded-xl p-4 mb-8 flex items-center justify-between">
              <div className="flex-1">
                 <h3 className="font-semibold text-indigo-900 flex items-center gap-2">
                   <Target size={18} /> Improve Logo Detection
                 </h3>
                 <p className="text-sm text-indigo-700/80 mt-1">
                   {activePlatform?.referenceLogo 
                     ? `Using configured reference logo for ${activePlatform.name}. You can override it here.`
                     : "Provide a reference image for pixel-perfect logo extraction."}
                 </p>
              </div>

              {referencePreview ? (
                <div className="flex items-center gap-3 bg-white p-2 rounded-lg border border-indigo-100 shadow-sm">
                  <img src={referencePreview} alt="Reference" className="h-12 w-12 object-contain" />
                  <button onClick={clearReference} className="text-slate-400 hover:text-red-500 p-1">
                    <X size={16} />
                  </button>
                </div>
              ) : activePlatform?.referenceLogo ? (
                 <div className="flex items-center gap-3 bg-white/50 p-2 rounded-lg border border-indigo-100 shadow-sm">
                    <span className="text-xs text-indigo-600 font-semibold px-2">Default Active</span>
                    <img 
                      src={`data:image/png;base64,${activePlatform.referenceLogo}`} 
                      alt="Platform Reference" 
                      className="h-12 w-12 object-contain opacity-70" 
                    />
                    <label className="cursor-pointer text-xs bg-white border border-indigo-200 text-indigo-600 px-2 py-1 rounded hover:bg-indigo-50 transition-colors ml-2">
                      Override
                      <input type="file" className="hidden" accept="image/*" onChange={handleReferenceChange} />
                    </label>
                 </div>
              ) : (
                <label className="cursor-pointer bg-white text-indigo-600 border border-indigo-200 hover:border-indigo-400 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm">
                  <UploadCloud size={14} />
                  Upload Reference Logo
                  <input 
                    type="file" 
                    className="hidden" 
                    accept="image/*" 
                    onChange={handleReferenceChange}
                  />
                </label>
              )}
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
              The AI is thinking deeply about the layout. It identifies text hierarchies, object boundaries, and visual relationships.
            </p>
            
            <div className="mt-8 flex flex-col items-center gap-2">
              <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-100 rounded-full text-indigo-900 text-sm font-medium">
                <Sparkles size={14} className="text-indigo-600" />
                <span>Platform: <span className="font-mono font-bold">{activePlatform?.name}</span></span>
              </div>
              {(referencePreview || activePlatform?.referenceLogo) && (
                 <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-100 rounded-full text-green-900 text-sm font-medium">
                  <Target size={14} className="text-green-600" />
                  <span>Reference Logic: <span className="font-bold">Active</span></span>
                </div>
              )}
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
              platform={activePlatform?.name || 'Unknown'}
            />
          </div>
        )}
      </main>
    </div>
  );
};

export default App;