
import React, { useState, useEffect } from 'react';
import { PlatformConfig } from '../types';
import { X, Plus, Trash2, Save, RotateCcw, AlertTriangle, Check, Edit2, ChevronLeft, GripVertical } from 'lucide-react';
import { Spinner } from './Spinner';

interface AdminPanelProps {
  onClose: () => void;
  currentPlatforms: PlatformConfig[];
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onClose, currentPlatforms }) => {
  const [platforms, setPlatforms] = useState<PlatformConfig[]>(currentPlatforms);
  const [isLoading, setIsLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<PlatformConfig>>({});
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Refresh data on mount
  useEffect(() => {
    fetchPlatforms();
  }, []);

  const fetchPlatforms = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/platforms');
      if (res.ok) {
        const data = await res.json();
        setPlatforms(data);
      }
    } catch (e) {
      console.error("Failed to fetch platforms", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (platform: PlatformConfig) => {
    setEditingId(platform.id);
    setFormData({
      ...platform,
      // Ensure complianceRules is an array
      complianceRules: platform.complianceRules ? [...platform.complianceRules] : []
    });
    setError(null);
    setSuccessMsg(null);
  };

  const handleAddNew = () => {
    const newId = `platform-${Date.now()}`;
    setEditingId(newId);
    setFormData({
      id: newId,
      name: 'New Platform',
      prompt: 'Describe the prompt here...',
      complianceRules: []
    });
    setError(null);
    setSuccessMsg(null);
  };

  const handleSave = async () => {
    if (!formData.id || !formData.name || !formData.prompt) {
      setError("ID, Name, and Prompt are required.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Filter out empty rules
      const rulesArray = (formData.complianceRules || [])
        .map((r) => r.trim())
        .filter((r) => r.length > 0);

      const payload = { ...formData, complianceRules: rulesArray };
      const isNew = !platforms.find(p => p.id === formData.id);
      
      const url = '/api/platforms' + (isNew ? '' : `/${formData.id}`);
      const method = isNew ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error("Failed to save");

      await fetchPlatforms();
      setEditingId(null);
      setSuccessMsg("Platform saved successfully.");
      
      // Clear success message after 3s
      setTimeout(() => setSuccessMsg(null), 3000);

    } catch (e) {
      setError("Failed to save platform. Check console.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this platform?")) return;
    
    setIsLoading(true);
    try {
      await fetch(`/api/platforms/${id}`, { method: 'DELETE' });
      await fetchPlatforms();
      if (editingId === id) setEditingId(null);
    } catch (e) {
      setError("Failed to delete.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestoreDefaults = async () => {
    if (!confirm("This will overwrite all current platforms with the system defaults. Are you sure?")) return;
    
    setIsLoading(true);
    try {
      await fetch('/api/platforms/reset', { method: 'POST' });
      await fetchPlatforms();
      setSuccessMsg("Restored default platforms.");
    } catch (e) {
      setError("Failed to restore defaults.");
    } finally {
      setIsLoading(false);
    }
  };

  // Rule Management Helpers
  const addRule = () => {
    const currentRules = formData.complianceRules || [];
    setFormData({ ...formData, complianceRules: [...currentRules, ''] });
  };

  const updateRule = (index: number, value: string) => {
    const currentRules = [...(formData.complianceRules || [])];
    currentRules[index] = value;
    setFormData({ ...formData, complianceRules: currentRules });
  };

  const removeRule = (index: number) => {
    const currentRules = [...(formData.complianceRules || [])];
    currentRules.splice(index, 1);
    setFormData({ ...formData, complianceRules: currentRules });
  };

  // Render Editor Mode
  if (editingId) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-white sticky top-0 z-10">
          <button onClick={() => setEditingId(null)} className="flex items-center gap-2 text-slate-600 hover:text-slate-900">
            <ChevronLeft size={20} /> Back to List
          </button>
          <h2 className="font-bold text-slate-800">{formData.name || 'New Platform'}</h2>
          <button 
            onClick={handleSave}
            disabled={isLoading}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {isLoading ? <Spinner className="w-4 h-4" /> : <Save size={18} />}
            Save Changes
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50">
          {error && (
            <div className="bg-red-50 text-red-700 p-4 rounded-lg border border-red-100 flex items-center gap-2">
              <AlertTriangle size={18} /> {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Platform Name</label>
              <input 
                type="text" 
                value={formData.name || ''}
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">ID (Unique)</label>
              <input 
                type="text" 
                value={formData.id || ''}
                onChange={e => setFormData({...formData, id: e.target.value})}
                className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">System Prompt</label>
            <p className="text-xs text-slate-500 mb-2">Define how the AI should analyze the image.</p>
            <textarea 
              value={formData.prompt || ''}
              onChange={e => setFormData({...formData, prompt: e.target.value})}
              className="w-full h-64 p-3 border border-slate-300 rounded-md font-mono text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          <div className="border-t border-slate-200 pt-6">
            <label className="block text-base font-semibold text-slate-800 mb-1">Compliance Rules</label>
            <p className="text-sm text-slate-500 mb-4">Define the rules to pass/fail images in the Compliance check.</p>
            
            <div className="space-y-3">
              {(formData.complianceRules || []).map((rule, index) => (
                <div key={index} className="flex gap-2 items-center group">
                  <div className="text-slate-300 cursor-move">
                    <GripVertical size={20} />
                  </div>
                  <input 
                    type="text"
                    value={rule}
                    onChange={(e) => updateRule(index, e.target.value)}
                    placeholder="e.g. Do not place logo on dark background"
                    className="flex-1 p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <button 
                    onClick={() => removeRule(index)}
                    className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-50 group-hover:opacity-100"
                    title="Remove Rule"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>

            <button 
              onClick={addRule}
              className="mt-4 flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700 px-3 py-2 hover:bg-indigo-50 rounded-lg transition-colors"
            >
              <Plus size={18} /> Add New Rule
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render List Mode
  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-white">
        <h2 className="text-2xl font-bold text-slate-800">Platform Configuration</h2>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleRestoreDefaults}
            className="text-slate-500 hover:text-slate-700 p-2 rounded-full hover:bg-slate-100"
            title="Restore Defaults"
          >
            <RotateCcw size={20} />
          </button>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-2">
            <X size={24} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
        {successMsg && (
            <div className="mb-4 bg-green-50 text-green-700 p-3 rounded-lg border border-green-100 flex items-center gap-2">
              <Check size={18} /> {successMsg}
            </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {platforms.map(p => (
            <div key={p.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
              <div className="p-5">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-lg text-slate-800">{p.name}</h3>
                  <span className="text-xs font-mono bg-slate-100 text-slate-500 px-2 py-1 rounded">{p.id}</span>
                </div>
                <p className="text-sm text-slate-500 line-clamp-3 mb-4 h-10">
                  {p.prompt.substring(0, 100)}...
                </p>
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-50">
                   <div className="text-xs text-slate-400">
                     {p.complianceRules?.length || 0} Rules
                   </div>
                   <div className="flex gap-2">
                     <button 
                       onClick={() => handleDelete(p.id)}
                       className="text-red-400 hover:text-red-600 p-1.5 hover:bg-red-50 rounded"
                       title="Delete"
                     >
                       <Trash2 size={16} />
                     </button>
                     <button 
                       onClick={() => handleEdit(p)}
                       className="text-indigo-600 hover:text-indigo-800 font-medium text-sm flex items-center gap-1 px-3 py-1.5 bg-indigo-50 rounded hover:bg-indigo-100 transition-colors"
                     >
                       <Edit2 size={14} /> Configure
                     </button>
                   </div>
                </div>
              </div>
            </div>
          ))}

          {/* Add New Card */}
          <button 
            onClick={handleAddNew}
            className="bg-white rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center p-8 text-slate-400 hover:text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50/50 transition-all min-h-[200px]"
          >
            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-3 group-hover:bg-indigo-100">
              <Plus size={24} />
            </div>
            <span className="font-medium">Add New Platform</span>
          </button>
        </div>
      </div>
    </div>
  );
};
