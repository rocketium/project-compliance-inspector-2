import React, { useState, useCallback } from 'react';
import { analyzeImageWithGemini } from './services/gemini';
import { AnalysisResult, AppState } from './types';
import { ResultsView } from './components/ResultsView';
import { Spinner } from './components/Spinner';
import { UploadCloud, FileImage, AlertCircle, Sparkles } from 'lucide-react';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [thinkingTime, setThinkingTime] = useState(0);

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

      const result = await analyzeImageWithGemini(base64Data, mimeType);
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
    setAnalysisResult(null);
    setErrorMsg(null);
  };

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
          <div className="flex items-center gap-4">
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
                Upload an advertisement, flyer, or UI design. The AI will analyze the layout, extract text, and isolate individual visual components for you.
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
              The AI is thinking deeply about the layout. It identifies text hierarchies, object boundaries, and visual relationships. This might take a moment.
            </p>
            
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
            />
          </div>
        )}
      </main>
    </div>
  );
};

export default App;