import React, { useState, useEffect } from 'react';
import { PlatformConfig } from '../types';
import { X, Plus, Save, Trash2, Edit2, Check, UploadCloud, Image as ImageIcon } from 'lucide-react';

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onPlatformsUpdate: () => void; // Callback to refresh main app state
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ isOpen, onClose, onPlatformsUpdate }) => {
  const [platforms, setPlatforms] = useState<PlatformConfig[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<PlatformConfig>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchPlatforms();
    }
  }, [isOpen]);

  const fetchPlatforms = async () => {
    try {
      setLoading(true);
      const res = await fetch('http://localhost:3000/api/platforms');
      const data = await res.json();
      setPlatforms(data);
    } catch (err) {
      console.error("Failed to fetch platforms", err);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (platform: PlatformConfig) => {
    setEditingId(platform.id);
    setFormData({ ...platform });
  };

  const handleCreate = () => {
    setEditingId('new');
    setFormData({
      id: '',
      name: '',
      description: '',
      prompt: 'Analyze this image...',
      referenceLogo: undefined
    });
  };

  const handleCancel = () => {
    setEditingId(null);
    setFormData({});
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      const isNew = editingId === 'new';
      const url = isNew 
        ? 'http://localhost:3000/api/platforms' 
        : `http://localhost:3000/api/platforms/${editingId}`;
      
      const method = isNew ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        await fetchPlatforms();
        handleCancel();
        onPlatformsUpdate();
      } else {
        alert('Failed to save platform');
      }
    } catch (err) {
      console.error(err);
      alert('Error saving platform');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this platform?')) return;
    try {
      setLoading(true);
      await fetch(`http://localhost:3000/api/platforms/${id}`, { method: 'DELETE' });
      await fetchPlatforms();
      onPlatformsUpdate();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target?.result as string;
        // Strip the data:image/xxx;base64, part for storage if desired, 
        // or store full string. The server currently accepts base64 strings.
        // The current app logic splits it in some places, but let's store clean base64.
        const cleanBase64 = base64.split(',')[1];
        setFormData(prev => ({ ...prev, referenceLogo: cleanBase64 }));
      };
      reader.readAsDataURL(file);
    }
  };

  const removeLogo = () => {
    setFormData(prev => ({ ...prev, referenceLogo: undefined }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white w-full max-w-4xl h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <h2 className="text-xl font-bold text-slate-800">Platform Configuration</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X size={20} className="text-slate-600" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
          {loading && (
            <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10">
              <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full"></div>
            </div>
          )}

          {editingId ? (
            /* Edit Form */
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Platform ID (URL slug)</label>
                  <input 
                    type="text" 
                    value={formData.id}
                    onChange={e => setFormData({...formData, id: e.target.value})}
                    disabled={editingId !== 'new'}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-500"
                    placeholder="e.g. my-platform"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Display Name</label>
                  <input 
                    type="text" 
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g. My Platform"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <input 
                  type="text" 
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                  placeholder="Brief description of this platform's purpose"
                />
              </div>

              {/* Reference Logo Section */}
              <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <label className="block text-sm font-bold text-slate-700">Reference Logo (Optional)</label>
                    <p className="text-xs text-slate-500 mt-1">
                      This logo will be automatically used as a reference to improve detection accuracy for this platform.
                    </p>
                  </div>
                  {formData.referenceLogo && (
                    <button 
                      onClick={removeLogo} 
                      className="text-xs text-red-600 hover:text-red-700 font-medium"
                    >
                      Remove Logo
                    </button>
                  )}
                </div>
                
                <div className="mt-3 flex items-center gap-4">
                  {formData.referenceLogo ? (
                    <div className="h-20 w-20 bg-white border border-slate-200 rounded-lg p-2 flex items-center justify-center shadow-sm">
                      <img 
                        src={`data:image/png;base64,${formData.referenceLogo}`} 
                        alt="Reference Logo" 
                        className="max-h-full max-w-full object-contain" 
                      />
                    </div>
                  ) : (
                    <div className="h-20 w-20 bg-slate-200 rounded-lg flex items-center justify-center text-slate-400">
                      <ImageIcon size={24} />
                    </div>
                  )}
                  
                  <label className="cursor-pointer bg-white border border-slate-300 hover:bg-slate-50 px-4 py-2 rounded-lg text-sm font-medium text-slate-700 shadow-sm transition-colors flex items-center gap-2">
                    <UploadCloud size={16} />
                    Upload Logo
                    <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">System Prompt</label>
                <textarea 
                  value={formData.prompt}
                  onChange={e => setFormData({...formData, prompt: e.target.value})}
                  className="w-full h-64 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button 
                  onClick={handleCancel}
                  className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSave}
                  className="px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 flex items-center gap-2"
                >
                  <Save size={18} /> Save Platform
                </button>
              </div>
            </div>
          ) : (
            /* List View */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {platforms.map(p => (
                <div key={p.id} className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 hover:border-indigo-300 transition-colors group">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-bold text-slate-800">{p.name}</h3>
                      <span className="text-xs font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{p.id}</span>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleEdit(p)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={() => handleDelete(p.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-slate-600 mb-4 h-10 line-clamp-2">{p.description}</p>
                  <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-50">
                    <div className="flex items-center gap-2">
                      {p.referenceLogo ? (
                        <span className="text-xs flex items-center gap-1 text-green-600 font-medium">
                          <Check size={12} /> Custom Logo
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">No logo</span>
                      )}
                    </div>
                    <button 
                      onClick={() => handleEdit(p)}
                      className="text-sm text-indigo-600 font-medium hover:underline"
                    >
                      Configure
                    </button>
                  </div>
                </div>
              ))}
              
              {/* Add New Card */}
              <button 
                onClick={handleCreate}
                className="flex flex-col items-center justify-center p-6 rounded-xl border-2 border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/30 transition-all group min-h-[200px]"
              >
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-indigo-100 group-hover:text-indigo-600 mb-3 transition-colors">
                  <Plus size={24} />
                </div>
                <span className="font-medium text-slate-600 group-hover:text-indigo-700">Add New Platform</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};