
import React, { useState, useEffect } from 'react';
import { PlatformConfig } from '../types';
import { X, Plus, Trash2, Save, RotateCcw, AlertTriangle, Check, Edit2, ChevronLeft, GripVertical, Search } from 'lucide-react';
import { Spinner } from './Spinner';

interface AdminPanelProps {
  onClose: () => void;
  currentPlatforms: PlatformConfig[];
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onClose, currentPlatforms }) => {
  const [platforms, setPlatforms] =
    useState<PlatformConfig[]>(currentPlatforms);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<PlatformConfig>>({});
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Refresh data on mount
  useEffect(() => {
    fetchPlatforms();
  }, []);

  const fetchPlatforms = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/platforms");
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

  const handleSelect = (platform: PlatformConfig) => {
    setSelectedId(platform.id);
    setIsEditing(false);
    setFormData({
      ...platform,
      // Ensure complianceRules is an array
      complianceRules: platform.complianceRules
        ? [...platform.complianceRules]
        : [],
    });
    setError(null);
    setSuccessMsg(null);
  };

  const handleEdit = () => {
    setIsEditing(true);
    setError(null);
    setSuccessMsg(null);
  };

  const handleAddNew = () => {
    const newId = `platform-${Date.now()}`;
    setSelectedId(newId);
    setIsEditing(true);
    setFormData({
      id: newId,
      name: "New Platform",
      prompt: "Describe the prompt here...",
      complianceRules: [],
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
      const isNew = !platforms.find((p) => p.id === formData.id);

      const url = "/api/platforms" + (isNew ? "" : `/${formData.id}`);
      const method = isNew ? "POST" : "PUT";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Failed to save");

      await fetchPlatforms();
      setIsEditing(false);
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
      await fetch(`/api/platforms/${id}`, { method: "DELETE" });
      await fetchPlatforms();
      if (selectedId === id) {
        setSelectedId(null);
        setIsEditing(false);
      }
    } catch (e) {
      setError("Failed to delete.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestoreDefaults = async () => {
    if (
      !confirm(
        "This will overwrite all current platforms with the system defaults. Are you sure?"
      )
    )
      return;

    setIsLoading(true);
    try {
      await fetch("/api/platforms/reset", { method: "POST" });
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
    setFormData({ ...formData, complianceRules: [...currentRules, ""] });
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

  // Get currently selected platform
  const selectedPlatform = selectedId
    ? platforms.find((p) => p.id === selectedId)
    : null;

  // Filter platforms based on search query
  const filteredPlatforms = platforms.filter((platform) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      platform.name.toLowerCase().includes(query) ||
      platform.id.toLowerCase().includes(query) ||
      platform.prompt.toLowerCase().includes(query) ||
      platform.complianceRules?.some(rule => rule.toLowerCase().includes(query))
    );
  });

  // Render 2-Column Layout
  return (
    <div className="flex flex-col h-screen w-screen bg-white overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-slate-200 flex justify-between items-center flex-shrink-0">
        <h2 className="text-2xl font-bold text-slate-800">
          Platform Configuration
        </h2>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRestoreDefaults}
            className="text-slate-500 hover:text-slate-700 p-2 rounded-full hover:bg-slate-100"
            title="Restore Defaults"
          >
            <RotateCcw size={20} />
          </button>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-2"
          >
            <X size={24} />
          </button>
        </div>
      </div>

      {/* Success Message */}
      {successMsg && (
        <div className="mx-6 mt-4 bg-green-50 text-green-700 p-3 rounded-lg border border-green-100 flex items-center gap-2 flex-shrink-0">
          <Check size={18} /> {successMsg}
        </div>
      )}

      {/* 2-Column Layout */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left Column - Platform List */}
        <div className="w-80 border-r border-slate-200 flex flex-col bg-slate-50 flex-shrink-0 overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-white flex-shrink-0 space-y-3">
            <button
              onClick={handleAddNew}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-lg hover:bg-indigo-700 transition-colors font-medium"
            >
              <Plus size={18} /> Add New Platform
            </button>
            
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Search platforms..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
            {filteredPlatforms.length > 0 ? (
              filteredPlatforms.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleSelect(p)}
                  className={`w-full text-left p-4 rounded-lg border transition-all ${
                    selectedId === p.id
                      ? "bg-indigo-50 border-indigo-200 shadow-sm"
                      : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm"
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="font-semibold text-slate-800">{p.name}</h3>
                    {selectedId === p.id && (
                      <div className="w-2 h-2 bg-indigo-600 rounded-full"></div>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 line-clamp-2 mb-2">
                    {p.prompt.substring(0, 80)}...
                  </p>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">
                      {p.complianceRules?.length || 0} rules
                    </span>
                    <span className="font-mono text-slate-400">{p.id}</span>
                  </div>
                </button>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center text-center py-12 px-4">
                <Search className="text-slate-300 mb-3" size={48} />
                <p className="text-slate-500 font-medium mb-1">No platforms found</p>
                <p className="text-slate-400 text-sm">Try adjusting your search query</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column - Details/Edit View */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedId ? (
            <>
              {/* Details Header */}
              <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-white flex-shrink-0">
                <div>
                  <h3 className="text-xl font-bold text-slate-800">
                    {formData.name || "Platform Details"}
                  </h3>
                  <p className="text-sm text-slate-500 mt-1">
                    ID: {formData.id}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <>
                      <button
                        onClick={() => setIsEditing(false)}
                        className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={isLoading}
                        className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                      >
                        {isLoading ? (
                          <Spinner className="w-4 h-4" />
                        ) : (
                          <Save size={18} />
                        )}
                        Save Changes
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleDelete(formData.id!)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete Platform"
                      >
                        <Trash2 size={18} />
                      </button>
                      <button
                        onClick={handleEdit}
                        className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
                      >
                        <Edit2 size={18} /> Edit
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Details Content */}
              <div className="flex-1 overflow-y-auto p-6 bg-slate-50 min-h-0">
                {error && (
                  <div className="mb-4 bg-red-50 text-red-700 p-4 rounded-lg border border-red-100 flex items-center gap-2">
                    <AlertTriangle size={18} /> {error}
                  </div>
                )}

                <div className="space-y-6">
                  {/* Name and ID */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Platform Name
                      </label>
                      {isEditing ? (
                        <input
                          type="text"
                          value={formData.name || ""}
                          onChange={(e) =>
                            setFormData({ ...formData, name: e.target.value })
                          }
                          className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                      ) : (
                        <div className="p-2.5 bg-white border border-slate-200 rounded-lg text-slate-800">
                          {formData.name}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Platform ID
                      </label>
                      {isEditing ? (
                        <input
                          type="text"
                          value={formData.id || ""}
                          onChange={(e) =>
                            setFormData({ ...formData, id: e.target.value })
                          }
                          className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-sm"
                        />
                      ) : (
                        <div className="p-2.5 bg-white border border-slate-200 rounded-lg text-slate-800 font-mono text-sm">
                          {formData.id}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* System Prompt */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      System Prompt
                    </label>
                    <p className="text-xs text-slate-500 mb-2">
                      Define how the AI should analyze the image.
                    </p>
                    {isEditing ? (
                      <textarea
                        value={formData.prompt || ""}
                        onChange={(e) =>
                          setFormData({ ...formData, prompt: e.target.value })
                        }
                        className="w-full h-64 p-3 border border-slate-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    ) : (
                      <div className="p-3 bg-white border border-slate-200 rounded-lg font-mono text-sm text-slate-700 whitespace-pre-wrap max-h-64 overflow-y-auto">
                        {formData.prompt}
                      </div>
                    )}
                  </div>

                  {/* Compliance Rules */}
                  <div>
                    <label className="block text-base font-semibold text-slate-800 mb-1">
                      Compliance Rules
                    </label>
                    <p className="text-sm text-slate-500 mb-4">
                      Rules to pass/fail images in the compliance check.
                    </p>

                    {isEditing ? (
                      <div className="space-y-3">
                        {(formData.complianceRules || []).map((rule, index) => (
                          <div
                            key={index}
                            className="flex gap-2 items-center group"
                          >
                            <div className="text-slate-300 cursor-move">
                              <GripVertical size={20} />
                            </div>
                            <input
                              type="text"
                              value={rule}
                              onChange={(e) =>
                                updateRule(index, e.target.value)
                              }
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
                        <button
                          onClick={addRule}
                          className="mt-2 flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700 px-3 py-2 hover:bg-indigo-50 rounded-lg transition-colors"
                        >
                          <Plus size={18} /> Add New Rule
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {(formData.complianceRules || []).length > 0 ? (
                          (formData.complianceRules || []).map(
                            (rule, index) => (
                              <div
                                key={index}
                                className="flex items-start gap-3 p-3 bg-white border border-slate-200 rounded-lg"
                              >
                                <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">
                                  {index + 1}
                                </div>
                                <p className="text-sm text-slate-700 flex-1">
                                  {rule}
                                </p>
                              </div>
                            )
                          )
                        ) : (
                          <div className="p-4 bg-slate-100 rounded-lg text-sm text-slate-500 text-center">
                            No compliance rules defined
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-slate-50 min-h-0">
              <div className="text-center text-slate-400">
                <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Edit2 size={32} className="text-slate-400" />
                </div>
                <p className="text-lg font-medium">No Platform Selected</p>
                <p className="text-sm mt-1">
                  Select a platform from the list to view and edit its details
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
