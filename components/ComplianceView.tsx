
import React, { useState, useEffect } from 'react';
import { ComplianceResult } from '../types';
import { checkComplianceWithGemini } from '../services/gemini';
import { ShieldCheck, AlertTriangle, XCircle, CheckCircle2, Play } from 'lucide-react';
import { Spinner } from './Spinner';

interface ComplianceViewProps {
  imageSrc: string;
  rules: string[];
}

export const ComplianceView: React.FC<ComplianceViewProps> = ({ imageSrc, rules }) => {
  const [results, setResults] = useState<ComplianceResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  const runComplianceCheck = async () => {
    setIsLoading(true);
    try {
      const base64Data = imageSrc.split(',')[1];
      // Assuming generic mimeType for now or extracting from src header
      const mimeType = imageSrc.substring(imageSrc.indexOf(':') + 1, imageSrc.indexOf(';'));
      
      const data = await checkComplianceWithGemini(base64Data, mimeType, rules);
      setResults(data);
      setHasRun(true);
    } catch (error) {
      console.error("Compliance check failed", error);
    } finally {
      setIsLoading(false);
    }
  };

  const passedCount = results.filter(r => r.status === 'PASS').length;
  const failedCount = results.filter(r => r.status === 'FAIL').length;
  const warningCount = results.filter(r => r.status === 'WARNING').length;

  if (!rules || rules.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center text-slate-500">
        <ShieldCheck size={48} className="mb-4 text-slate-300" />
        <p className="text-lg font-medium">No compliance rules defined.</p>
        <p className="text-sm">Configure rules for this platform in Settings.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50/50">
      {!hasRun ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
           <ShieldCheck size={64} className="text-indigo-200 mb-6" />
           <h3 className="text-xl font-bold text-slate-800 mb-2">Brand Compliance Check</h3>
           <p className="text-slate-600 mb-8 max-w-md">
             Verify this creative against {rules.length} specific brand guidelines for this platform.
           </p>
           <button 
             onClick={runComplianceCheck}
             disabled={isLoading}
             className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium shadow-md shadow-indigo-200 transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
           >
             {isLoading ? <Spinner className="w-5 h-5 text-white" /> : <Play size={20} />}
             {isLoading ? 'Verifying Rules...' : 'Run Compliance Check'}
           </button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Summary Header */}
          <div className="bg-white p-4 border-b border-slate-200 flex justify-between items-center shadow-sm z-10">
             <div>
               <h3 className="font-bold text-slate-800">Compliance Report</h3>
               <p className="text-xs text-slate-500">{rules.length} rules checked</p>
             </div>
             <div className="flex gap-3 text-sm font-medium">
                <span className="flex items-center gap-1 text-green-600 bg-green-50 px-2 py-1 rounded-md border border-green-100">
                  <CheckCircle2 size={16} /> {passedCount} Pass
                </span>
                {warningCount > 0 && (
                  <span className="flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-1 rounded-md border border-amber-100">
                    <AlertTriangle size={16} /> {warningCount} Warning
                  </span>
                )}
                <span className={`flex items-center gap-1 px-2 py-1 rounded-md border ${failedCount > 0 ? 'text-red-600 bg-red-50 border-red-100' : 'text-slate-400 bg-slate-50 border-slate-100'}`}>
                  <XCircle size={16} /> {failedCount} Fail
                </span>
             </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto p-4 space-y-3 flex-1">
            {results.map((res, idx) => (
              <div key={idx} className={`p-4 rounded-xl border bg-white transition-all ${
                res.status === 'FAIL' ? 'border-red-200 shadow-sm ring-1 ring-red-50' : 
                res.status === 'WARNING' ? 'border-amber-200' : 
                'border-slate-200 hover:border-slate-300'
              }`}>
                <div className="flex gap-3 items-start">
                   <div className="mt-0.5 flex-shrink-0">
                      {res.status === 'PASS' && <CheckCircle2 className="text-green-500" size={20} />}
                      {res.status === 'FAIL' && <XCircle className="text-red-500" size={20} />}
                      {res.status === 'WARNING' && <AlertTriangle className="text-amber-500" size={20} />}
                   </div>
                   <div className="flex-1">
                      <p className={`text-sm font-medium mb-1 ${
                        res.status === 'FAIL' ? 'text-red-900' : 'text-slate-800'
                      }`}>
                        {res.rule}
                      </p>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        <span className="font-semibold">Analysis:</span> {res.reasoning}
                      </p>
                   </div>
                   <div className="flex-shrink-0">
                      <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase ${
                         res.status === 'PASS' ? 'bg-green-100 text-green-700' :
                         res.status === 'FAIL' ? 'bg-red-100 text-red-700' :
                         'bg-amber-100 text-amber-700'
                      }`}>
                        {res.status}
                      </span>
                   </div>
                </div>
              </div>
            ))}
          </div>
          
           <div className="p-3 border-t border-slate-200 bg-slate-50 flex justify-center">
            <button 
              onClick={runComplianceCheck} 
              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-2"
            >
              <Play size={14} /> Re-run Check
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
