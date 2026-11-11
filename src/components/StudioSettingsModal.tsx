import React from 'react';
import { X, Sliders, Zap, Sparkles, Layers, ShieldCheck, Clock } from 'lucide-react';
import { StudioSettings, TtsModelType } from '../types/drama';

interface StudioSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: StudioSettings;
  onUpdateSettings: (newSettings: Partial<StudioSettings>) => void;
}

export const StudioSettingsModal: React.FC<StudioSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col text-slate-100 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-violet-600/20 border border-violet-500/40 flex items-center justify-center">
              <Sliders className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-white">TTS Studio & Quota Settings</h2>
              <p className="text-[11px] text-slate-400">
                Optimize voice acting quality and manage API request volume
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5 overflow-y-auto max-h-[75vh]">
          {/* Section 1: TTS Model Selection */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                <span>Gemini TTS Model</span>
              </label>
              <span className="text-[11px] text-slate-400 font-mono">
                {settings.ttsModel === 'gemini-3.8-flash-lite-tts' ? 'High-Throughput' : 'Acting & Styles'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Option A: Flash TTS */}
              <button
                type="button"
                onClick={() => onUpdateSettings({ ttsModel: 'gemini-3.8-flash-tts' })}
                className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between gap-2 ${
                  settings.ttsModel === 'gemini-3.8-flash-tts'
                    ? 'bg-violet-950/40 border-violet-500 shadow-sm shadow-violet-500/20 ring-1 ring-violet-500/30'
                    : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-white">gemini-3.8-flash-tts</span>
                    <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-violet-600/30 text-violet-300 border border-violet-500/40">
                      Standard
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight">
                    Nuanced character acting, dynamic delivery styles, vocal bursts (&lt;laugh&gt;, &lt;gasp&gt;), and Voice Design personas.
                  </p>
                </div>
                <span className="text-[10px] text-violet-300 font-medium">Recommended for final audio dramas</span>
              </button>

              {/* Option B: Flash-Lite TTS */}
              <button
                type="button"
                onClick={() => onUpdateSettings({ ttsModel: 'gemini-3.8-flash-lite-tts' })}
                className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between gap-2 ${
                  settings.ttsModel === 'gemini-3.8-flash-lite-tts'
                    ? 'bg-cyan-950/40 border-cyan-500 shadow-sm shadow-cyan-500/20 ring-1 ring-cyan-500/30'
                    : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-white">gemini-3.8-flash-lite-tts</span>
                    <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-cyan-600/30 text-cyan-300 border border-cyan-500/40">
                      High-Volume
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight">
                    Lower latency and lighter resource footprint. Best for rapid dialogue rendering and bulk screenplay drafts.
                  </p>
                </div>
                <span className="text-[10px] text-cyan-300 font-medium">Fast & high-throughput rendering</span>
              </button>
            </div>
          </div>

          {/* Section 2: Scene-Level Multi-Speaker Batching */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-emerald-950/80 border border-emerald-700/50 text-emerald-400">
                  <Layers className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="font-bold text-xs text-white">Scene-Level Multi-Speaker Batching</h3>
                  <p className="text-[11px] text-slate-400">
                    Saves ~70% API calls by combining two-speaker dialogue into a single prompt
                  </p>
                </div>
              </div>

              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.enableSceneBatching}
                  onChange={(e) => onUpdateSettings({ enableSceneBatching: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>

            <p className="text-[10px] text-slate-500 pt-1 leading-normal border-t border-slate-800/80">
              When enabled and using <code>gemini-3.8-flash-tts</code>, consecutive dialogue between two characters is synthesized using Google’s native dual-speaker screenplay configuration in 1 single API call instead of separate calls for each line.
            </p>
          </div>

          {/* Section 3: Background Rendering Queue & Smart Throttling */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-amber-950/80 border border-amber-700/50 text-amber-400">
                  <Clock className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="font-bold text-xs text-white">Background Queue Pacing</h3>
                  <p className="text-[11px] text-slate-400">
                    Delay between batch synthesis requests
                  </p>
                </div>
              </div>

              <span className="font-mono text-xs font-bold text-amber-300">
                {settings.throttlePacingSeconds === 0
                  ? '0s (Fast)'
                  : `${settings.throttlePacingSeconds}s Delay`}
              </span>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => onUpdateSettings({ throttlePacingSeconds: 20 })}
                className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-medium border text-center transition ${
                  settings.throttlePacingSeconds === 20
                    ? 'bg-amber-950/60 border-amber-500 text-amber-200'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Safe Free Tier (20s)
              </button>
              <button
                type="button"
                onClick={() => onUpdateSettings({ throttlePacingSeconds: 10 })}
                className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-medium border text-center transition ${
                  settings.throttlePacingSeconds === 10
                    ? 'bg-amber-950/60 border-amber-500 text-amber-200'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Moderate (10s)
              </button>
              <button
                type="button"
                onClick={() => onUpdateSettings({ throttlePacingSeconds: 0 })}
                className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-medium border text-center transition ${
                  settings.throttlePacingSeconds === 0
                    ? 'bg-amber-950/60 border-amber-500 text-amber-200'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Paid Tier (0s)
              </button>
            </div>

            <div className="pt-2">
              <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                <span>Custom Delay Slider:</span>
                <span className="font-mono">{settings.throttlePacingSeconds} seconds</span>
              </div>
              <input
                type="range"
                min="0"
                max="30"
                step="2"
                value={settings.throttlePacingSeconds}
                onChange={(e) =>
                  onUpdateSettings({ throttlePacingSeconds: parseInt(e.target.value) })
                }
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
              <span className="text-[11px] text-slate-300">
                Auto-recover & countdown on 429 rate limit
              </span>
              <input
                type="checkbox"
                checked={settings.autoRetryOnRateLimit}
                onChange={(e) => onUpdateSettings({ autoRetryOnRateLimit: e.target.checked })}
                className="rounded bg-slate-800 border-slate-700 text-amber-500 focus:ring-0 w-3.5 h-3.5"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Settings saved automatically to browser</span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold shadow-md shadow-violet-600/20 transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
