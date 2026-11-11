import React, { useState } from 'react';
import {
  CharacterVoice,
  PrebuiltVoiceName,
  AVAILABLE_VOICES,
  VOCAL_BURSTS,
  CustomVoiceDefinition,
  PRESET_CUSTOM_VOICES,
} from '../types/drama';
import {
  Users,
  Plus,
  Play,
  Sparkles,
  Trash2,
  Edit2,
  Wand2,
  Volume2,
  Palette,
  Check,
  Star,
  Bookmark,
  Layers,
} from 'lucide-react';

interface VoiceCustomizerProps {
  characters: CharacterVoice[];
  customVoices: CustomVoiceDefinition[];
  onUpdateCharacter: (char: CharacterVoice) => void;
  onAddCharacter: (char: CharacterVoice) => void;
  onDeleteCharacter: (id: string) => void;
  onSaveCustomVoice: (voice: CustomVoiceDefinition) => void;
  onDeleteCustomVoice: (id: string) => void;
  onPreviewVoice: (
    voiceName: PrebuiltVoiceName,
    sampleText: string,
    style: string,
    voiceDescription?: string
  ) => void;
}

const PRESET_COLORS = [
  '#06b6d4', // Cyan
  '#ec4899', // Pink
  '#a855f7', // Purple
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#ef4444', // Red
  '#3b82f6', // Blue
  '#8b5cf6', // Violet
];

export const VoiceCustomizer: React.FC<VoiceCustomizerProps> = ({
  characters,
  customVoices = PRESET_CUSTOM_VOICES,
  onUpdateCharacter,
  onAddCharacter,
  onDeleteCharacter,
  onSaveCustomVoice,
  onDeleteCustomVoice,
  onPreviewVoice,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'cast' | 'designer'>('cast');

  // Character creation
  const [newCharName, setNewCharName] = useState('');

  // Voice Designer Form State
  const [designName, setDesignName] = useState('');
  const [designDescription, setDesignDescription] = useState('');
  const [designBaseVoice, setDesignBaseVoice] = useState<PrebuiltVoiceName>('Puck');
  const [designColor, setDesignColor] = useState('#06b6d4');
  const [designSamplePhrase, setDesignSamplePhrase] = useState(
    'In this line of work, you either stay one step ahead, or you end up in the archives.'
  );
  const [isPolishingAi, setIsPolishingAi] = useState(false);
  const [testingVoiceId, setTestingVoiceId] = useState<string | null>(null);

  const handleAddNewCharacter = () => {
    if (!newCharName.trim()) return;
    const name = newCharName.trim().toUpperCase();
    const usedVoices = characters.map((c) => c.voiceName);
    const available = AVAILABLE_VOICES.find((v) => !usedVoices.includes(v.name)) || AVAILABLE_VOICES[0];
    const color = PRESET_COLORS[characters.length % PRESET_COLORS.length];

    onAddCharacter({
      id: `char-${Date.now()}`,
      name,
      voiceName: available.name,
      stylePrompt: 'Dramatic, expressive audio drama performance',
      color,
      description: 'Custom character role',
    });
    setNewCharName('');
  };

  // Load a preset archetype into the Voice Designer form
  const handleLoadPresetToDesigner = (preset: CustomVoiceDefinition) => {
    setDesignName(preset.name);
    setDesignDescription(preset.description);
    setDesignBaseVoice(preset.baseVoice);
    setDesignColor(preset.avatarColor);
    if (preset.samplePhrase) {
      setDesignSamplePhrase(preset.samplePhrase);
    }
  };

  // AI Voice Polish: Expands a brief concept into a rich written voice description
  const handleAiPolishDescription = async () => {
    if (!designDescription.trim() && !designName.trim()) return;
    setIsPolishingAi(true);

    try {
      const res = await fetch('/api/design-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: designDescription.trim() || designName.trim(),
          gender: 'any',
        }),
      });

      const data = await res.json();
      if (data.name && !designName) {
        setDesignName(data.name);
      }
      if (data.description) {
        setDesignDescription(data.description);
      }
      if (data.recommendedBaseVoice) {
        setDesignBaseVoice(data.recommendedBaseVoice);
      }
      if (data.samplePhrase) {
        setDesignSamplePhrase(data.samplePhrase);
      }
      if (data.suggestedColor) {
        setDesignColor(data.suggestedColor);
      }
    } catch (err) {
      console.warn('AI polish error:', err);
    } finally {
      setIsPolishingAi(false);
    }
  };

  // Test the currently designed voice
  const handleTestDesignerVoice = () => {
    setTestingVoiceId('designer');
    onPreviewVoice(
      designBaseVoice,
      designSamplePhrase,
      'Expressive character test',
      designDescription
    );
    setTimeout(() => setTestingVoiceId(null), 3000);
  };

  // Save the newly defined voice to the studio library
  const handleSaveDefinedVoice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!designName.trim() || !designDescription.trim()) return;

    const newVoice: CustomVoiceDefinition = {
      id: `voice-custom-${Date.now()}`,
      name: designName.trim(),
      description: designDescription.trim(),
      baseVoice: designBaseVoice,
      avatarColor: designColor,
      samplePhrase: designSamplePhrase.trim(),
    };

    onSaveCustomVoice(newVoice);
    // Reset form with fresh placeholder
    setDesignName('');
    setDesignDescription('');
  };

  // Test an existing saved voice
  const handleTestSavedVoice = (voice: CustomVoiceDefinition) => {
    setTestingVoiceId(voice.id);
    onPreviewVoice(
      voice.baseVoice,
      voice.samplePhrase || 'Testing custom defined voice persona.',
      'Dramatic performance',
      voice.description
    );
    setTimeout(() => setTestingVoiceId(null), 3000);
  };

  // Test character voice
  const handleTestCharacterVoice = (char: CharacterVoice) => {
    setTestingVoiceId(char.id);
    const sample = `Hello, I am ${char.name}. <breath> Testing Gemini TTS voice delivery.`;
    onPreviewVoice(char.voiceName, sample, char.stylePrompt, char.voiceDescription);
    setTimeout(() => setTestingVoiceId(null), 3000);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-950 text-slate-100 max-w-6xl mx-auto space-y-6">
      {/* Top Banner & Sub-Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-violet-400" />
            <h2 className="text-lg font-bold tracking-tight text-white">Voice & Casting Studio</h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Powered by <span className="text-violet-300 font-mono">gemini-3.8-flash-tts</span> Voice Design. Define new custom voices with written descriptions or assign voices to roles.
          </p>
        </div>

        {/* View Switcher: Cast vs Voice Designer */}
        <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
          <button
            onClick={() => setActiveSubTab('cast')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition flex items-center gap-1.5 ${
              activeSubTab === 'cast'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Cast & Roles ({characters.length})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('designer')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition flex items-center gap-1.5 ${
              activeSubTab === 'designer'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Define New Voices ({customVoices.length})</span>
          </button>
        </div>
      </div>

      {/* SUB-TAB 1: CAST & ASSIGNED VOICES */}
      {activeSubTab === 'cast' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Quick Add Character Bar */}
          <div className="flex items-center justify-between flex-wrap gap-2 bg-slate-900/60 border border-slate-800 p-3 rounded-xl">
            <span className="text-xs text-slate-300 font-semibold">
              Add New Character to Script:
            </span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Character Name (e.g. MORIARTY)"
                value={newCharName}
                onChange={(e) => setNewCharName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddNewCharacter()}
                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 uppercase font-mono"
              />
              <button
                onClick={handleAddNewCharacter}
                disabled={!newCharName.trim()}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-semibold shadow-sm transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Role</span>
              </button>
            </div>
          </div>

          {/* Cast Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {characters.map((char) => {
              const assignedCustomVoice = customVoices.find((v) => v.id === char.customVoiceId);
              const currentVoice =
                AVAILABLE_VOICES.find((v) => v.name === char.voiceName) || AVAILABLE_VOICES[0];
              const isTesting = testingVoiceId === char.id;

              return (
                <div
                  key={char.id}
                  className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-md flex flex-col justify-between gap-3 hover:border-slate-700 transition"
                >
                  {/* Top Row: Character Name & Color */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="w-4 h-4 rounded-full flex-shrink-0 shadow"
                        style={{ backgroundColor: char.color }}
                      />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h3 className="font-bold text-sm text-white tracking-wide">{char.name}</h3>
                          {assignedCustomVoice && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-700/60 text-[9px] text-amber-300 font-semibold flex items-center gap-0.5">
                              <Star className="w-2.5 h-2.5 fill-current" />
                              <span>Defined Voice</span>
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 font-mono">
                          {assignedCustomVoice
                            ? assignedCustomVoice.name
                            : `${currentVoice.name} (${currentVoice.tone.split(',')[0]})`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* Test Voice Button */}
                      <button
                        onClick={() => handleTestCharacterVoice(char)}
                        disabled={isTesting}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
                          isTesting
                            ? 'bg-cyan-950 text-cyan-300 border border-cyan-700 animate-pulse'
                            : 'bg-slate-800 hover:bg-slate-700 text-cyan-400'
                        }`}
                        title="Synthesize test line with this character voice"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>{isTesting ? 'Playing...' : 'Test Voice'}</span>
                      </button>

                      {/* Delete Character */}
                      {characters.length > 1 && (
                        <button
                          onClick={() => onDeleteCharacter(char.id)}
                          className="p-1 rounded hover:bg-red-950 text-slate-500 hover:text-red-400 transition"
                          title="Remove Character"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Form Controls */}
                  <div className="space-y-2.5 text-xs">
                    {/* Voice Selection (Prebuilt or Custom Defined) */}
                    <div>
                      <label className="block text-slate-400 font-medium mb-1">
                        Assigned Voice (Prebuilt or Custom Defined)
                      </label>
                      <select
                        value={char.customVoiceId || char.voiceName}
                        onChange={(e) => {
                          const val = e.target.value;
                          const foundCustom = customVoices.find((cv) => cv.id === val);
                          if (foundCustom) {
                            onUpdateCharacter({
                              ...char,
                              customVoiceId: foundCustom.id,
                              voiceName: foundCustom.baseVoice,
                              voiceDescription: foundCustom.description,
                              color: foundCustom.avatarColor || char.color,
                            });
                          } else {
                            onUpdateCharacter({
                              ...char,
                              customVoiceId: undefined,
                              voiceName: val as PrebuiltVoiceName,
                              voiceDescription: undefined,
                            });
                          }
                        }}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-violet-500 font-mono"
                      >
                        <optgroup label="⭐ Custom Defined Voices (Written Descriptions)">
                          {customVoices.map((cv) => (
                            <option key={cv.id} value={cv.id}>
                              ⭐ {cv.name} ({cv.baseVoice})
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="Standard Gemini TTS Voices">
                          {AVAILABLE_VOICES.map((v) => (
                            <option key={v.name} value={v.name}>
                              {v.name} ({v.gender}) - {v.tone}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                    </div>

                    {/* Active Voice Description Preview */}
                    {char.voiceDescription && (
                      <div className="p-2 rounded bg-slate-950/80 border border-slate-800 text-[11px] text-amber-200/90 leading-snug">
                        <span className="font-semibold text-amber-400 block mb-0.5">
                          Written Voice Persona:
                        </span>
                        {char.voiceDescription}
                      </div>
                    )}

                    {/* Style Delivery Prompt */}
                    <div>
                      <label className="block text-slate-400 font-medium mb-1">
                        Line Acting Style / Emotional Delivery
                      </label>
                      <input
                        type="text"
                        value={char.stylePrompt}
                        onChange={(e) =>
                          onUpdateCharacter({
                            ...char,
                            stylePrompt: e.target.value,
                          })
                        }
                        placeholder="e.g. Whispering nervously, cynical detective, panicked gasp"
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-violet-500 text-xs"
                      />
                    </div>

                    {/* Acoustic Environment & Stereo Panning Row */}
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/80">
                      <div>
                        <label className="block text-slate-400 font-medium mb-1">
                          Acoustic Room / Comms DSP
                        </label>
                        <select
                          value={char.acousticPreset || 'studio_dry'}
                          onChange={(e) =>
                            onUpdateCharacter({
                              ...char,
                              acousticPreset: e.target.value as any,
                            })
                          }
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-white font-mono text-[11px]"
                        >
                          <option value="studio_dry">Studio Dry (Close Mic)</option>
                          <option value="walkie_talkie">Tactical Comms / Radio</option>
                          <option value="telephone">Vintage Telephone</option>
                          <option value="cave_vault">Cavernous Vault Reverb</option>
                          <option value="muffled_door">Behind Closed Door</option>
                          <option value="cyber_modulator">Cybernetic AI Modulator</option>
                        </select>
                      </div>

                      <div>
                        <div className="flex justify-between mb-1 font-mono tabular-nums">
                          <span className="text-slate-400">Default Pan:</span>
                          <span className="text-cyan-400">
                            {Math.abs(char.pan ?? 0) < 0.05
                              ? 'CENTER'
                              : (char.pan ?? 0) < 0
                              ? `L ${Math.round(Math.abs(char.pan ?? 0) * 100)}%`
                              : `R ${Math.round((char.pan ?? 0) * 100)}%`}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="-1"
                          max="1"
                          step="0.05"
                          value={char.pan ?? 0}
                          onChange={(e) =>
                            onUpdateCharacter({ ...char, pan: parseFloat(e.target.value) })
                          }
                          className="w-full mt-1.5 bg-slate-800 rounded appearance-none cursor-pointer accent-cyan-400"
                        />
                      </div>
                    </div>

                    {/* Color Palette Selector */}
                    <div>
                      <label className="block text-slate-400 font-medium mb-1">Track & Avatar Color</label>
                      <div className="flex items-center gap-2">
                        {PRESET_COLORS.map((c) => (
                          <button
                            key={c}
                            onClick={() => onUpdateCharacter({ ...char, color: c })}
                            style={{ backgroundColor: c }}
                            className={`w-5 h-5 rounded-full transition-transform ${
                              char.color === c ? 'ring-2 ring-white scale-110' : 'hover:scale-105'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SUB-TAB 2: VOICE DESIGNER (DEFINE NEW VOICES WITH WRITTEN DESCRIPTIONS) */}
      {activeSubTab === 'designer' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Preset Starters Banner */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                <span>Inspiration: Preset Voice Archetypes (Click to Load & Edit)</span>
              </span>
              <span className="text-[10px] text-slate-400 font-mono">Gemini Voice Design</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              {PRESET_CUSTOM_VOICES.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleLoadPresetToDesigner(preset)}
                  className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-amber-500/60 text-left transition flex flex-col justify-between group"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: preset.avatarColor }}
                    />
                    <span className="font-bold text-[11px] text-white group-hover:text-amber-300 truncate">
                      {preset.name}
                    </span>
                  </div>
                  <span className="text-[9px] text-slate-400 font-mono">Base: {preset.baseVoice}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Voice Creator Form */}
          <form
            onSubmit={handleSaveDefinedVoice}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span
                  className="w-3.5 h-3.5 rounded-full shadow"
                  style={{ backgroundColor: designColor }}
                />
                <h3 className="font-bold text-sm text-white">
                  Define New Voice Persona with Written Description
                </h3>
              </div>
              <span className="text-[11px] text-violet-300 font-mono">
                Target: Gemini 3.8 Flash TTS
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* Voice Name */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  1. Voice Persona Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Cursed Sea Captain, Noir Femme Fatale, Anxious Cyber-Doc"
                  value={designName}
                  onChange={(e) => setDesignName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-violet-500 font-semibold"
                />
              </div>

              {/* Base Voice Model */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  2. Base Gemini Voice Timbre
                </label>
                <select
                  value={designBaseVoice}
                  onChange={(e) => setDesignBaseVoice(e.target.value as PrebuiltVoiceName)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-violet-500 font-mono"
                >
                  {AVAILABLE_VOICES.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name} ({v.gender}) — {v.tone}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Written Voice Description Textarea */}
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <label className="text-slate-300 font-semibold flex items-center gap-1.5">
                  <span>3. Written Voice Description (Prompting the Custom Voice)</span>
                </label>

                <button
                  type="button"
                  onClick={handleAiPolishDescription}
                  disabled={isPolishingAi || (!designDescription.trim() && !designName.trim())}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-[11px] font-semibold transition"
                  title="Expands your brief note into a multi-attribute voice director prompt"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  <span>{isPolishingAi ? 'Polishing...' : 'AI Enrich Voice Description'}</span>
                </button>
              </div>

              <textarea
                rows={3}
                required
                value={designDescription}
                onChange={(e) => setDesignDescription(e.target.value)}
                placeholder="Describe the voice's pitch, timbre, age, accent, cadence, raspiness, and speech mannerisms (e.g. 'An ancient, gravelly pirate captain with a deep sea-dog rasp, low gravelly rumble, slow hearty drawl, and occasional guttural chuckle.')"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white focus:outline-none focus:border-amber-500 leading-relaxed font-sans text-xs resize-y"
              />
              <p className="text-[10px] text-slate-400">
                This description is injected directly into Gemini 3.8 Flash TTS{' '}
                <span className="font-mono text-violet-300">speechMetadata.style</span> to sculpt custom character personas from scratch.
              </p>
            </div>

            {/* Sample Phrase & Color */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs pt-1 border-t border-slate-800">
              <div className="md:col-span-2">
                <label className="block text-slate-300 font-semibold mb-1">
                  Sample Audition Line (Used for testing)
                </label>
                <input
                  type="text"
                  value={designSamplePhrase}
                  onChange={(e) => setDesignSamplePhrase(e.target.value)}
                  placeholder="Sample sentence with vocal bursts like <laugh> or <breath>..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-violet-500 text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Voice Avatar Color</label>
                <div className="flex items-center gap-1.5 mt-1">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setDesignColor(c)}
                      style={{ backgroundColor: c }}
                      className={`w-5 h-5 rounded-full transition-transform ${
                        designColor === c ? 'ring-2 ring-white scale-110' : 'hover:scale-105'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Form Action Buttons */}
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={handleTestDesignerVoice}
                disabled={testingVoiceId === 'designer' || !designDescription.trim()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 font-semibold text-xs transition disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{testingVoiceId === 'designer' ? 'Synthesizing...' : 'Audition Voice'}</span>
              </button>

              <button
                type="submit"
                disabled={!designName.trim() || !designDescription.trim()}
                className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold text-xs shadow-md shadow-violet-600/20 transition"
              >
                <Bookmark className="w-3.5 h-3.5" />
                <span>Save Voice to Studio</span>
              </button>
            </div>
          </form>

          {/* Saved Custom Voices Library */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-xs text-slate-300 uppercase tracking-wider">
                Saved Voice Library ({customVoices.length} Defined Personas)
              </h3>
              <span className="text-[11px] text-slate-500">Available to assign to any character</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {customVoices.map((voice) => {
                const isTesting = testingVoiceId === voice.id;

                return (
                  <div
                    key={voice.id}
                    className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between gap-3 hover:border-slate-700 transition"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: voice.avatarColor }}
                          />
                          <h4 className="font-bold text-xs text-white tracking-wide">{voice.name}</h4>
                          <span className="text-[10px] text-slate-400 font-mono">({voice.baseVoice})</span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleTestSavedVoice(voice)}
                            disabled={isTesting}
                            className={`p-1.5 rounded-md text-xs font-semibold transition ${
                              isTesting
                                ? 'bg-cyan-950 text-cyan-300 animate-pulse'
                                : 'bg-slate-800 hover:bg-slate-700 text-cyan-400'
                            }`}
                            title="Audition this voice"
                          >
                            <Play className="w-3 h-3 fill-current" />
                          </button>

                          {!voice.isPreset && (
                            <button
                              type="button"
                              onClick={() => onDeleteCustomVoice(voice.id)}
                              className="p-1.5 rounded hover:bg-red-950 text-slate-500 hover:text-red-400 transition"
                              title="Delete custom voice"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      <p className="text-xs text-slate-300 italic leading-relaxed">
                        "{voice.description}"
                      </p>
                    </div>

                    {/* Quick Assign Dropdown */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[11px]">
                      <span className="text-slate-400">Assign to role:</span>
                      <select
                        onChange={(e) => {
                          const targetCharId = e.target.value;
                          if (!targetCharId) return;
                          const targetChar = characters.find((c) => c.id === targetCharId);
                          if (targetChar) {
                            onUpdateCharacter({
                              ...targetChar,
                              customVoiceId: voice.id,
                              voiceName: voice.baseVoice,
                              voiceDescription: voice.description,
                              color: voice.avatarColor,
                            });
                          }
                          e.target.value = '';
                        }}
                        defaultValue=""
                        className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-200 text-[11px] focus:outline-none"
                      >
                        <option value="" disabled>
                          Select Character...
                        </option>
                        {characters.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
