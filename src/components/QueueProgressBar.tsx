import React from 'react';
import { Play, Pause, X, Sparkles, Clock, Sliders, Layers, CheckCircle2 } from 'lucide-react';
import { TtsModelType } from '../types/drama';

export interface QueueProgressState {
  isActive: boolean;
  isPaused: boolean;
  isCoolingDown: boolean;
  cooldownSeconds: number;
  currentStep: number;
  totalSteps: number;
  currentSpeaker?: string;
  isBatchScene?: boolean;
  model: TtsModelType;
}

interface QueueProgressBarProps {
  queue: QueueProgressState;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onOpenSettings: () => void;
}

export const QueueProgressBar: React.FC<QueueProgressBarProps> = ({
  queue,
  onPause,
  onResume,
  onCancel,
  onOpenSettings,
}) => {
  if (!queue.isActive) return null;

  const percent = queue.totalSteps > 0 ? Math.round((queue.currentStep / queue.totalSteps) * 100) : 0;

  return (
    <div className="fixed bottom-4 right-4 z-40 max-w-md w-full bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-2xl p-4 shadow-2xl text-slate-100 animate-in slide-in-from-bottom-5 duration-200">
      {/* Top row */}
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-violet-600/30 border border-violet-500/40 flex items-center justify-center">
            {queue.isCoolingDown ? (
              <Clock className="w-4 h-4 text-amber-400 animate-spin" />
            ) : queue.isPaused ? (
              <Pause className="w-4 h-4 text-slate-300" />
            ) : (
              <Sparkles className="w-4 h-4 text-violet-400 animate-pulse" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-xs text-white">
                {queue.isCoolingDown
                  ? `Rate Limit Cooldown (${queue.cooldownSeconds}s)`
                  : queue.isPaused
                  ? 'Queue Paused'
                  : 'Background TTS Queue'}
              </span>
              {queue.isBatchScene && (
                <span className="px-1.5 py-0.2 rounded bg-emerald-950 border border-emerald-700/50 text-emerald-300 text-[9px] font-bold">
                  Scene Batch
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-400">
              {queue.isCoolingDown
                ? 'Throttling automatically to respect API limits...'
                : queue.currentSpeaker
                ? `Synthesizing lines for ${queue.currentSpeaker}...`
                : 'Processing queued dialogue in background'}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={onOpenSettings}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Adjust Queue Pacing / Model in Settings"
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>

          {queue.isPaused ? (
            <button
              onClick={onResume}
              className="p-1.5 rounded-lg bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/40 transition"
              title="Resume Background Queue"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
            </button>
          ) : (
            <button
              onClick={onPause}
              className="p-1.5 rounded-lg bg-amber-600/20 text-amber-300 hover:bg-amber-600/40 transition"
              title="Pause Background Queue"
            >
              <Pause className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={onCancel}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 transition"
            title="Cancel Remaining Queue Items"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
          <span>
            Progress: {queue.currentStep} / {queue.totalSteps} lines
          </span>
          <span className="font-bold text-violet-300">{percent}%</span>
        </div>

        <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
          <div
            className={`h-full transition-all duration-300 ${
              queue.isCoolingDown
                ? 'bg-amber-400'
                : queue.isPaused
                ? 'bg-slate-500'
                : 'bg-gradient-to-r from-violet-500 to-cyan-400'
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Footer Info */}
      <div className="flex items-center justify-between text-[10px] text-slate-500 mt-2 font-mono">
        <span className="truncate max-w-[200px]">
          Model: {queue.model === 'gemini-3.8-flash-lite-tts' ? 'Flash-Lite (Speed)' : 'Flash TTS (Acting)'}
        </span>
        <span>Studio remains fully playable</span>
      </div>
    </div>
  );
};
