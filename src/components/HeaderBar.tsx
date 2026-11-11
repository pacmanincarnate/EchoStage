import React from 'react';
import {
  Play,
  Pause,
  Square,
  SkipBack,
  Volume2,
  VolumeX,
  FileAudio,
  Download,
  Sparkles,
  RotateCcw,
  Check,
  FilePlus,
  Sliders,
  FolderOpen,
} from 'lucide-react';
import { TtsModelType } from '../types/drama';

export type StudioTab = 'library' | 'timeline' | 'script' | 'stage' | 'voices' | 'music';

interface HeaderBarProps {
  title: string;
  genre: string;
  isPlaying: boolean;
  currentTime: number;
  totalDuration: number;
  masterVolume: number;
  activeTab: StudioTab;
  isGeneratingAll: boolean;
  projectCount?: number;
  saveStatus?: 'saved' | 'saving' | 'warning' | 'idle';
  lastSavedTime?: string | null;
  currentModel?: TtsModelType;
  onPlayPause: () => void;
  onStop: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (vol: number) => void;
  onTabChange: (tab: StudioTab) => void;
  onOpenExport: () => void;
  onGenerateAllAudio: () => void;
  onResetProject: () => void;
  onNewProject?: () => void;
  onOpenSettings?: () => void;
}

export function formatTimecode(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.floor((seconds % 1) * 10);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${millis}`;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  title,
  genre,
  isPlaying,
  currentTime,
  totalDuration,
  masterVolume,
  activeTab,
  isGeneratingAll,
  projectCount,
  saveStatus = 'saved',
  lastSavedTime,
  currentModel = 'gemini-3.8-flash-tts',
  onPlayPause,
  onStop,
  onSeek,
  onVolumeChange,
  onTabChange,
  onOpenExport,
  onGenerateAllAudio,
  onResetProject,
  onNewProject,
  onOpenSettings,
}) => {
  return (
    <header className="bg-slate-900 border-b border-slate-800 text-slate-100 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-30">
      {/* Brand & Project Info */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => onTabChange('library')}
          className="w-8 h-8 rounded-lg bg-violet-600 hover:bg-violet-500 flex items-center justify-center shrink-0 transition"
          title="Open Project Library"
        >
          <FileAudio className="w-4 h-4 text-white" />
        </button>
        <div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onTabChange('library')}
              className="font-bold text-sm md:text-base tracking-tight text-white hover:text-violet-300 leading-tight whitespace-nowrap transition text-left"
              title="Click to switch projects in Library"
            >
              {title || 'Untitled Audio Drama'}
            </button>
            <span className="text-xs text-slate-400 hidden sm:inline">· {genre || 'Drama'}</span>
            {onOpenSettings && (
              <button
                onClick={onOpenSettings}
                className="text-xs font-mono text-violet-300 hover:text-violet-200 transition flex items-center gap-1 ml-1 whitespace-nowrap shrink-0"
                title="Change TTS Model & Quota Settings"
              >
                <span>
                  {currentModel === 'gemini-3.8-flash-lite-tts' ? 'Flash-Lite TTS' : 'Flash TTS'}
                </span>
                <Sliders className="w-3 h-3 opacity-75" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
            <span>EchoStage Studio</span>
            <span>·</span>
            {saveStatus === 'saving' && (
              <span className="text-amber-300 font-mono">Saving to IndexedDB...</span>
            )}
            {saveStatus === 'saved' && (
              <span
                className="flex items-center gap-1 text-emerald-400/90 font-mono"
                title={
                  lastSavedTime
                    ? `Saved to IndexedDB & LocalStorage at ${new Date(
                        lastSavedTime
                      ).toLocaleTimeString()}`
                    : 'Saved to IndexedDB'
                }
              >
                <Check className="w-3 h-3 text-emerald-400" />
                <span>Saved (IndexedDB)</span>
              </span>
            )}
            {saveStatus === 'warning' && (
              <span className="text-amber-400 font-mono">Saved locally</span>
            )}
            {saveStatus === 'idle' && (
              <span className="text-slate-500 font-mono">Ready</span>
            )}
          </div>
        </div>
      </div>

      {/* Center Transport Controls */}
      <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-1.5">
        <button
          onClick={() => onSeek(0)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          title="Return to Start (0:00)"
        >
          <SkipBack className="w-4 h-4" />
        </button>

        <button
          onClick={onPlayPause}
          className={`px-3.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition font-bold whitespace-nowrap shrink-0 ${
            isPlaying
              ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
              : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
          }`}
          title={isPlaying ? 'Pause (Space)' : 'Play Timeline (Space)'}
        >
          {isPlaying ? (
            <Pause className="w-3.5 h-3.5 fill-current" />
          ) : (
            <Play className="w-3.5 h-3.5 fill-current" />
          )}
          <span>{isPlaying ? 'Pause' : 'Play'}</span>
        </button>

        <button
          onClick={onStop}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          title="Stop Playback"
        >
          <Square className="w-4 h-4" />
        </button>

        {/* Digital Timecode */}
        <div className="px-2.5 py-1 bg-black/60 rounded border border-slate-800 font-mono tabular-nums text-xs text-cyan-400 flex items-center gap-1 select-none whitespace-nowrap">
          <span>{formatTimecode(currentTime)}</span>
          <span className="text-slate-600">/</span>
          <span className="text-slate-400">{formatTimecode(totalDuration)}</span>
        </div>

        {/* Master Volume Slider */}
        <div className="hidden sm:flex items-center gap-1.5 pl-2 border-l border-slate-800">
          <button
            onClick={() => onVolumeChange(masterVolume > 0 ? 0 : 1)}
            className="text-slate-400 hover:text-slate-200"
          >
            {masterVolume === 0 ? (
              <VolumeX className="w-4 h-4 text-red-400" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>
          <input
            type="range"
            min="0"
            max="1.5"
            step="0.05"
            value={masterVolume}
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
            className="w-16 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            title={`Master Volume: ${Math.round(masterVolume * 100)}%`}
          />
        </div>
      </div>

      {/* Studio Navigation Tabs & Primary Actions */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <div className="flex items-center bg-slate-950/90 p-0.5 rounded-lg border border-slate-800 text-xs">
          <button
            onClick={() => onTabChange('library')}
            className={`px-2.5 py-1.5 rounded-md font-medium transition flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              activeTab === 'library'
                ? 'bg-violet-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Browse, duplicate, import, or delete saved audio drama projects"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Library</span>
            {typeof projectCount === 'number' && projectCount > 0 && (
              <span className="font-mono tabular-nums opacity-80">({projectCount})</span>
            )}
          </button>
          <button
            onClick={() => onTabChange('timeline')}
            className={`px-2.5 py-1.5 rounded-md font-medium transition whitespace-nowrap shrink-0 ${
              activeTab === 'timeline'
                ? 'bg-violet-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Timeline
          </button>
          <button
            onClick={() => onTabChange('script')}
            className={`px-2.5 py-1.5 rounded-md font-medium transition whitespace-nowrap shrink-0 ${
              activeTab === 'script'
                ? 'bg-violet-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Transcript
          </button>
          <button
            onClick={() => onTabChange('stage')}
            className={`px-2.5 py-1.5 rounded-md font-medium transition whitespace-nowrap shrink-0 ${
              activeTab === 'stage'
                ? 'bg-violet-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            2D Soundstage
          </button>
          <button
            onClick={() => onTabChange('voices')}
            className={`px-2.5 py-1.5 rounded-md font-medium transition whitespace-nowrap shrink-0 ${
              activeTab === 'voices'
                ? 'bg-violet-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Cast & Voices
          </button>
          <button
            onClick={() => onTabChange('music')}
            className={`px-2.5 py-1.5 rounded-md font-medium transition whitespace-nowrap shrink-0 ${
              activeTab === 'music'
                ? 'bg-violet-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Music & FX
          </button>
        </div>

        <button
          onClick={onGenerateAllAudio}
          disabled={isGeneratingAll}
          className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-600/20 text-violet-300 border border-violet-500/40 hover:bg-violet-600/40 disabled:opacity-50 transition whitespace-nowrap shrink-0"
          title="Synthesize all dialogue lines with Gemini TTS"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>{isGeneratingAll ? 'Synthesizing...' : 'Render Speech'}</span>
        </button>

        {onNewProject && (
          <button
            onClick={onNewProject}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition whitespace-nowrap shrink-0"
            title="Start a new audio drama or clear sample content"
          >
            <FilePlus className="w-3.5 h-3.5 text-violet-400" />
            <span className="hidden md:inline">New</span>
          </button>
        )}

        <button
          onClick={onOpenExport}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Export</span>
        </button>

        <button
          onClick={onResetProject}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          title="Reset to default sample drama"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
