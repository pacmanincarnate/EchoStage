import React, { useState } from 'react';
import { MusicTrack, SfxClip, SfxType } from '../types/drama';
import { MUSIC_THEMES, MusicTheme } from '../utils/ambientMusicGenerator';
import {
  Music,
  Play,
  Pause,
  Sparkles,
  Volume2,
  Sliders,
  Check,
  Plus,
  Radio,
  Clock,
  VolumeX,
} from 'lucide-react';

interface MusicGeneratorPanelProps {
  musicTrack: MusicTrack;
  totalDuration: number;
  onUpdateMusicTrack: (track: Partial<MusicTrack>) => void;
  onGenerateMusic: (prompt: string, modelType: 'clip' | 'pro', durationSeconds: number) => void;
  onPreviewMusic: () => void;
  onStopMusicPreview: () => void;
  isPreviewingMusic: boolean;
  onAddSfxToTimeline: (type: SfxType) => void;
}

const SFX_OPTIONS: Array<{ type: SfxType; label: string; icon: string }> = [
  { type: 'rain', label: 'Rainfall', icon: '🌧️' },
  { type: 'thunder', label: 'Thunder Clap', icon: '⚡' },
  { type: 'footsteps', label: 'Footsteps', icon: '👞' },
  { type: 'door_creak', label: 'Creaking Door', icon: '🚪' },
  { type: 'siren', label: 'Police Siren', icon: '🚨' },
  { type: 'gunshot', label: 'Gunshot / Crack', icon: '💥' },
  { type: 'space_drone', label: 'Space Drone', icon: '🛸' },
  { type: 'heartbeat', label: 'Heartbeat Pulse', icon: '💓' },
];

export const MusicGeneratorPanel: React.FC<MusicGeneratorPanelProps> = ({
  musicTrack,
  totalDuration,
  onUpdateMusicTrack,
  onGenerateMusic,
  onPreviewMusic,
  onStopMusicPreview,
  isPreviewingMusic,
  onAddSfxToTimeline,
}) => {
  const [selectedTheme, setSelectedTheme] = useState<MusicTheme>('cyberpunk');
  const [customPrompt, setCustomPrompt] = useState<string>(
    musicTrack.prompt || MUSIC_THEMES.cyberpunk.defaultPrompt
  );
  const [modelType, setModelType] = useState<'clip' | 'pro'>(musicTrack.modelType || 'clip');
  const [targetDuration, setTargetDuration] = useState<number>(
    Math.max(15, Math.ceil(totalDuration || 30))
  );

  const handleSelectTheme = (themeKey: MusicTheme) => {
    setSelectedTheme(themeKey);
    const theme = MUSIC_THEMES[themeKey];
    setCustomPrompt(theme.defaultPrompt);
    onUpdateMusicTrack({
      genre: theme.name,
      prompt: theme.defaultPrompt,
    });
  };

  const handleGenerate = () => {
    onGenerateMusic(customPrompt, modelType, targetDuration);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-950 text-slate-100 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Music className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-bold tracking-tight text-white">AI Background Music & Foley</h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Composes on-theme soundtrack using{' '}
            <span className="text-amber-300 font-mono">lyria-3-clip-preview</span> or{' '}
            <span className="text-amber-300 font-mono">lyria-3-pro-preview</span> tailored to scene length and mood.
          </p>
        </div>

        {/* Master Track Toggle */}
        <label className="flex items-center gap-2 cursor-pointer bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg">
          <input
            type="checkbox"
            checked={musicTrack.enabled}
            onChange={(e) => onUpdateMusicTrack({ enabled: e.target.checked })}
            className="rounded bg-slate-800 border-slate-700 text-amber-500 focus:ring-0 w-4 h-4"
          />
          <span className="text-xs font-semibold text-slate-200">
            Music Track: {musicTrack.enabled ? 'ACTIVE' : 'MUTED'}
          </span>
        </label>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Music Generation Controls */}
        <div className="lg:col-span-2 space-y-5">
          {/* Genre / Mood Presets */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">
              1. Choose Scene Mood & Genre
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {(Object.keys(MUSIC_THEMES) as MusicTheme[]).map((themeKey) => {
                const theme = MUSIC_THEMES[themeKey];
                const isSelected = selectedTheme === themeKey;

                return (
                  <button
                    key={themeKey}
                    type="button"
                    onClick={() => handleSelectTheme(themeKey)}
                    className={`p-3 rounded-xl border text-left flex flex-col justify-between transition ${
                      isSelected
                        ? 'bg-amber-950/40 border-amber-500/80 shadow-md shadow-amber-500/10'
                        : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <span className="font-bold text-xs text-white leading-snug">{theme.name}</span>
                    <span className="text-[10px] text-slate-400 mt-1 line-clamp-2">
                      {theme.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* AI Model Selection */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                2. AI Music Model
              </label>
              <span className="text-[11px] text-amber-400 font-mono">Lyria 3 Music API</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setModelType('clip')}
                className={`p-2.5 rounded-lg border text-left transition ${
                  modelType === 'clip'
                    ? 'bg-amber-950/50 border-amber-500 text-amber-200'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="font-bold text-xs text-white">Lyria 3 Clip Preview</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Short clips (up to 30s)</div>
              </button>

              <button
                type="button"
                onClick={() => setModelType('pro')}
                className={`p-2.5 rounded-lg border text-left transition ${
                  modelType === 'pro'
                    ? 'bg-amber-950/50 border-amber-500 text-amber-200'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="font-bold text-xs text-white">Lyria 3 Pro Preview</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Full-length tracks</div>
              </button>
            </div>
          </div>

          {/* Custom Prompt */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                3. Music Prompt & Instrumentation
              </label>
              <button
                type="button"
                onClick={() => setCustomPrompt(MUSIC_THEMES[selectedTheme].defaultPrompt)}
                className="text-[10px] text-slate-400 hover:text-amber-400 transition"
              >
                Reset to theme default
              </button>
            </div>
            <textarea
              rows={3}
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-white focus:outline-none focus:border-amber-500 font-sans leading-relaxed"
              placeholder="Describe instruments, tempo, mood, and style..."
            />
          </div>

          {/* Length & Generation Button */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              <div>
                <div className="text-xs font-semibold text-white">Track Duration: {targetDuration}s</div>
                <div className="text-[10px] text-slate-400">
                  Matches current drama length (~{Math.ceil(totalDuration)}s)
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {musicTrack.audioBuffer && (
                <button
                  type="button"
                  onClick={isPreviewingMusic ? onStopMusicPreview : onPreviewMusic}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 text-xs font-bold transition"
                >
                  {isPreviewingMusic ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                  <span>{isPreviewingMusic ? 'Stop' : 'Preview'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleGenerate}
                disabled={musicTrack.isGenerating}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-bold shadow-md shadow-amber-500/20 transition"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{musicTrack.isGenerating ? 'Generating Music...' : 'Compose AI Music'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Ducking Controls & Foley SFX Insert */}
        <div className="space-y-5">
          {/* Dynamic Speech Ducking Card */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-violet-400" />
                <h3 className="font-bold text-xs text-white uppercase tracking-wider">
                  Speech Auto-Ducking
                </h3>
              </div>
              <input
                type="checkbox"
                checked={musicTrack.ducking}
                onChange={(e) => onUpdateMusicTrack({ ducking: e.target.checked })}
                className="rounded bg-slate-800 border-slate-700 text-violet-500 focus:ring-0 w-4 h-4"
              />
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Automatically dips background music volume whenever a character is speaking so dialogue stays crystal clear.
            </p>

            {musicTrack.ducking && (
              <div className="space-y-1.5 pt-2 border-t border-slate-800">
                <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                  <span>Ducking Volume:</span>
                  <span className="text-violet-300">
                    {Math.round((musicTrack.duckingAmount || 0.25) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="0.6"
                  step="0.05"
                  value={musicTrack.duckingAmount || 0.25}
                  onChange={(e) => onUpdateMusicTrack({ duckingAmount: parseFloat(e.target.value) })}
                  className="w-full bg-slate-800 rounded appearance-none cursor-pointer accent-violet-500"
                />
              </div>
            )}
          </div>

          {/* Foley & Sound Effects Insert Palette */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-xs text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="w-4 h-4" />
                <span>Instant Foley FX</span>
              </h3>
              <span className="text-[10px] text-slate-500">Click to add to timeline</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {SFX_OPTIONS.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => onAddSfxToTimeline(item.type)}
                  className="p-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-emerald-500/50 hover:bg-emerald-950/20 text-left flex items-center gap-2 transition group"
                >
                  <span className="text-base">{item.icon}</span>
                  <div className="truncate">
                    <span className="font-bold text-[11px] text-slate-300 group-hover:text-emerald-300 block truncate">
                      {item.label}
                    </span>
                    <span className="text-[9px] text-slate-500">Add to Track 3</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
