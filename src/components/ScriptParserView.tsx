import React, { useState } from 'react';
import {
  AudioSegment,
  CharacterVoice,
  ACOUSTIC_PRESETS,
  LUFS_PRESETS,
} from '../types/drama';
import {
  FileText,
  Sparkles,
  Play,
  Wand2,
  Plus,
  RefreshCw,
  CheckCircle,
  Trash2,
  GitCompare,
  Theater,
  Layers,
  Volume2,
  Gauge,
} from 'lucide-react';
import { formatGainDb, linearGainToDb } from '../utils/wavHelper';

interface ScriptParserViewProps {
  transcript: string;
  segments: AudioSegment[];
  characters: CharacterVoice[];
  isParsing: boolean;
  isDirectingSubtext?: boolean;
  subtextSummary?: string | null;
  lastDiffStats?: {
    unchanged: number;
    modified: number;
    added: number;
    removed: number;
  } | null;
  isGeneratingAll: boolean;
  generationProgress: { current: number; total: number };
  onUpdateTranscript: (text: string) => void;
  onParseScript: (text: string) => void;
  onDiffSyncScript: (text: string) => void;
  onDirectSubtext: (subtextNote: string, rewriteTextWithBursts: boolean) => void;
  onGenerateDramaScript: (genre: string, premise: string) => void;
  onGenerateAllTts: () => void;
  onGenerateModifiedTts?: () => void;
  onGenerateSingleTts: (segment: AudioSegment) => void;
  onPreviewBuffer: (segment: AudioSegment) => void;
  onEditSegment: (segment: AudioSegment) => void;
  onUpdateSegment?: (segment: AudioSegment) => void;
  onDeleteSegment: (id: string) => void;
  onAddManualSegment: () => void;
  onLoadPresetDrama: (key: string) => void;
  onStartBlankProject?: () => void;
  onClearAllSegments?: () => void;
  onNormalizeAllLufs?: (targetLufs: number) => void;
  normalizationSummary?: string | null;
}

const SUBTEXT_PRESETS = [
  'Polite teammates on comms, but each secretly suspects the other is the mole who sabotaged the airlock.',
  'Ex-partners reunited after a betrayal—trying to sound strictly professional while old resentment simmers.',
  'Terrified survivors whispering in the dark to avoid waking an apex predator in the next room.',
  'A cat-and-mouse interrogation where the suspect is subtly mocking the detective with calm arrogance.',
];

export const ScriptParserView: React.FC<ScriptParserViewProps> = ({
  transcript,
  segments,
  characters,
  isParsing,
  isDirectingSubtext = false,
  subtextSummary,
  lastDiffStats,
  isGeneratingAll,
  generationProgress,
  onUpdateTranscript,
  onParseScript,
  onDiffSyncScript,
  onDirectSubtext,
  onGenerateDramaScript,
  onGenerateAllTts,
  onGenerateModifiedTts,
  onGenerateSingleTts,
  onPreviewBuffer,
  onEditSegment,
  onUpdateSegment,
  onDeleteSegment,
  onAddManualSegment,
  onLoadPresetDrama,
  onStartBlankProject,
  onClearAllSegments,
  onNormalizeAllLufs,
  normalizationSummary,
}) => {
  const [showAiWriter, setShowAiWriter] = useState(false);
  const [showSubtextRoom, setShowSubtextRoom] = useState(false);
  const [targetLufs, setTargetLufs] = useState<number>(-16);
  const [aiGenre, setAiGenre] = useState('Cyberpunk Thriller');
  const [aiPremise, setAiPremise] = useState(
    'Two rogues bypass orbital AI firewalls during a blackout'
  );
  const [subtextNote, setSubtextNote] = useState(SUBTEXT_PRESETS[0]);
  const [rewriteWithBursts, setRewriteWithBursts] = useState(true);

  const handleAiWriterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onGenerateDramaScript(aiGenre, aiPremise);
    setShowAiWriter(false);
  };

  const handleSubtextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subtextNote.trim()) return;
    onDirectSubtext(subtextNote, rewriteWithBursts);
  };

  const renderedCount = segments.filter((s) => !!s.audioBuffer).length;
  const dirtyOrUnrenderedCount = segments.filter((s) => !s.audioBuffer || s.isDirtyText).length;

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-950 text-slate-100 max-w-6xl mx-auto space-y-6">
      {/* Top Banner & Presets */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-violet-400" />
            <h2 className="text-lg font-bold tracking-tight text-white">
              Transcript, Diff-Sync & Subtext Director
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Format: <span className="font-mono text-violet-300">CHARACTER: Spoken text</span> ·
            Use <span className="text-cyan-300 font-semibold">Sync Edits</span> to update modified
            lines without losing already-rendered audio buffers.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-slate-400 font-semibold">Load Preset:</span>
          <button
            onClick={() => onLoadPresetDrama('cyberpunk')}
            className="px-2.5 py-1 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-300 text-xs font-medium transition"
          >
            Cyberpunk Heist
          </button>
          <button
            onClick={() => onLoadPresetDrama('noir')}
            className="px-2.5 py-1 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-700 text-amber-300 text-xs font-medium transition"
          >
            Classic Noir
          </button>
          <button
            onClick={() => onLoadPresetDrama('horror')}
            className="px-2.5 py-1 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-700 text-emerald-300 text-xs font-medium transition"
          >
            Gothic Horror
          </button>
          <button
            onClick={() => onLoadPresetDrama('scifi')}
            className="px-2.5 py-1 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-700 text-blue-300 text-xs font-medium transition"
          >
            Deep Space
          </button>
          {onStartBlankProject && (
            <button
              onClick={onStartBlankProject}
              className="px-2.5 py-1 rounded-md bg-red-950/40 hover:bg-red-900/60 border border-red-800/60 text-red-300 text-xs font-semibold transition flex items-center gap-1 ml-auto"
              title="Flush out all sample content and start with an empty canvas"
            >
              <Trash2 className="w-3 h-3" />
              <span>Start Blank</span>
            </button>
          )}
        </div>
      </div>

      {/* Script Input Box & Non-Destructive Sync / AI Parse Actions */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-xs text-white">Script Transcript Input</span>
            <span className="text-[11px] text-slate-400 font-mono tabular-nums">
              · {transcript.split('\n').filter((l) => l.trim().length > 0).length} lines
            </span>
            {transcript.trim() && (
              <button
                type="button"
                onClick={() => onUpdateTranscript('')}
                className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-red-400 ml-2 transition"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear Text</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => {
                setShowSubtextRoom(!showSubtextRoom);
                setShowAiWriter(false);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition whitespace-nowrap ${
                showSubtextRoom
                  ? 'bg-amber-500 text-slate-950 border-amber-400'
                  : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border-amber-700/40'
              }`}
            >
              <Theater className="w-3.5 h-3.5" />
              <span>Subtext Rehearsal Room</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setShowAiWriter(!showAiWriter);
                setShowSubtextRoom(false);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-violet-300 text-xs font-semibold border border-violet-800/40 transition whitespace-nowrap"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>AI Scriptwriter</span>
            </button>

            <button
              type="button"
              onClick={() => onDiffSyncScript(transcript)}
              disabled={!transcript.trim()}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-slate-950 text-xs font-bold transition whitespace-nowrap"
              title="Non-destructively sync script text changes while preserving existing rendered audio buffers and takes"
            >
              <GitCompare className="w-3.5 h-3.5" />
              <span>Sync Edits (Keep Audio)</span>
            </button>

            <button
              type="button"
              onClick={() => onParseScript(transcript)}
              disabled={isParsing || !transcript.trim()}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-bold transition whitespace-nowrap"
              title="Full AI scene parse and automatic voice casting"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isParsing ? 'Parsing...' : 'Full AI Parse & Cast'}</span>
            </button>
          </div>
        </div>

        {/* MOONSHOT 2: Subtext & Chemistry Rehearsal Room Panel */}
        {showSubtextRoom && (
          <form
            onSubmit={handleSubtextSubmit}
            className="p-4 bg-slate-950 rounded-xl border border-amber-700/50 space-y-3"
          >
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="font-bold text-xs text-amber-300 flex items-center gap-1.5">
                <Theater className="w-4 h-4" />
                <span>Subtext & Chemistry Rehearsal Director (Gemini 3.8 Flash)</span>
              </div>
              <span className="text-[11px] text-slate-400">
                Coaches unspoken tension, micro-pauses, interruptions & vocal bursts across all{' '}
                {segments.length} lines
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {SUBTEXT_PRESETS.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSubtextNote(preset)}
                  className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] text-slate-300 hover:text-amber-300 transition text-left"
                >
                  Preset {idx + 1}: "{preset.slice(0, 56)}..."
                </button>
              ))}
            </div>

            <div>
              <label className="block text-xs text-slate-300 font-medium mb-1">
                Relationship Dynamic & Unspoken Subtext Note:
              </label>
              <textarea
                rows={2}
                value={subtextNote}
                onChange={(e) => setSubtextNote(e.target.value)}
                placeholder="Describe what the characters are hiding, feeling beneath the surface, or their relationship tension..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rewriteWithBursts}
                  onChange={(e) => setRewriteWithBursts(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-amber-500 focus:ring-0"
                />
                <span>
                  Allow AI Director to inject subtle vocal bursts (&lt;breath&gt;, &lt;gasp&gt;,
                  |yeah|) and adjust pause/overlap timings
                </span>
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowSubtextRoom(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={isDirectingSubtext || segments.length === 0}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs transition"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>
                    {isDirectingSubtext ? 'Coaching Scene Subtext...' : 'Direct Scene Subtext'}
                  </span>
                </button>
              </div>
            </div>
          </form>
        )}

        {/* AI Writer Panel */}
        {showAiWriter && (
          <form
            onSubmit={handleAiWriterSubmit}
            className="p-3.5 bg-slate-950 rounded-xl border border-violet-800/40 space-y-3"
          >
            <div className="font-bold text-xs text-violet-300 flex items-center gap-1.5">
              <Wand2 className="w-3.5 h-3.5" />
              <span>AI Audio Drama Scriptwriter (Gemini 3.8 Flash)</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Genre</label>
                <input
                  type="text"
                  value={aiGenre}
                  onChange={(e) => setAiGenre(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-violet-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Premise / Conflict</label>
                <input
                  type="text"
                  value={aiPremise}
                  onChange={(e) => setAiPremise(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-violet-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAiWriter(false)}
                className="px-3 py-1 rounded bg-slate-800 text-slate-300 text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-1 rounded bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold"
              >
                Draft Audio Drama
              </button>
            </div>
          </form>
        )}

        <textarea
          rows={7}
          value={transcript}
          onChange={(e) => onUpdateTranscript(e.target.value)}
          placeholder={`DETECTIVE VANCE: The rain was falling like shattered glass on 5th Avenue.
[thunder]
SARAH (whispering): Vance, did you find the cipher? <breath>
DETECTIVE VANCE: Not yet. But someone turned off the power in the vault.
THE SPECTER: <laugh> You're too late!`}
          className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-violet-500 leading-relaxed resize-y"
        />

        {/* Diff-Sync & Subtext Confirmation Notifications */}
        {lastDiffStats && (
          <div className="px-3 py-2 rounded-lg bg-cyan-950/40 border border-cyan-800/60 text-cyan-200 text-xs flex items-center justify-between flex-wrap gap-2">
            <span>
              <strong>Non-Destructive Sync Complete:</strong> {lastDiffStats.unchanged} untouched
              lines kept their audio buffers · {lastDiffStats.modified} modified ·{' '}
              {lastDiffStats.added} added · {lastDiffStats.removed} removed.
            </span>
            {dirtyOrUnrenderedCount > 0 && onGenerateModifiedTts && (
              <button
                type="button"
                onClick={onGenerateModifiedTts}
                className="px-2.5 py-1 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-[11px]"
              >
                Render {dirtyOrUnrenderedCount} Modified/New Lines Only
              </button>
            )}
          </div>
        )}

        {subtextSummary && (
          <div className="px-3 py-2 rounded-lg bg-amber-950/40 border border-amber-800/60 text-amber-200 text-xs flex items-center gap-2">
            <Theater className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Subtext Director:</strong> {subtextSummary}
            </span>
          </div>
        )}
      </div>

      {/* Parsed Segments Table */}
      <div className="space-y-3">
        {segments.length > 0 && (
          <div className="p-3 bg-emerald-950/30 border border-emerald-800/50 rounded-xl text-emerald-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>
                <strong>{segments.length} Dialogue Lines</strong> across{' '}
                <strong>{characters.length} Characters</strong>:{' '}
                {characters.map((c) => `${c.name} (${c.voiceName})`).join(' · ')}
              </span>
            </div>
            <span className="text-[11px] text-emerald-400 font-mono tabular-nums flex-shrink-0">
              {renderedCount}/{segments.length} Rendered
            </span>
          </div>
        )}

        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-xs text-slate-300">
              Dialogue Lines ({segments.length})
            </h3>
            <span className="text-[11px] text-cyan-400 font-mono tabular-nums">
              · {renderedCount}/{segments.length} Synthesized
            </span>
            {normalizationSummary && (
              <span className="text-[11px] text-emerald-400 font-mono tabular-nums">
                · {normalizationSummary}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {onNormalizeAllLufs && segments.length > 0 && (
              <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs">
                <Gauge className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <select
                  value={targetLufs}
                  onChange={(e) => setTargetLufs(Number(e.target.value))}
                  className="bg-transparent text-slate-200 font-mono tabular-nums text-xs focus:outline-none cursor-pointer"
                  title="Select Target Integrated Loudness (LUFS)"
                >
                  {LUFS_PRESETS.map((p) => (
                    <option key={p.lufs} value={p.lufs} className="bg-slate-900 text-slate-100">
                      {p.shortLabel}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => onNormalizeAllLufs(targetLufs)}
                  disabled={renderedCount === 0}
                  className="px-2 py-0.5 rounded bg-emerald-600/30 hover:bg-emerald-600/50 disabled:opacity-40 text-emerald-200 border border-emerald-500/40 font-semibold text-[11px] transition whitespace-nowrap"
                  title="Analyze all rendered segment buffers and normalize their volume gain to achieve a consistent LUFS level"
                >
                  Normalize LUFS
                </button>
              </div>
            )}

            {segments.length > 0 && onClearAllSegments && (
              <button
                onClick={onClearAllSegments}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-300 text-xs font-medium border border-red-800/50 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Lines</span>
              </button>
            )}

            <button
              onClick={onAddManualSegment}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Dialogue Line</span>
            </button>

            {dirtyOrUnrenderedCount > 0 &&
              dirtyOrUnrenderedCount < segments.length &&
              onGenerateModifiedTts && (
                <button
                  onClick={onGenerateModifiedTts}
                  disabled={isGeneratingAll}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-slate-950 text-xs font-bold transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Render Modified ({dirtyOrUnrenderedCount})</span>
                </button>
              )}

            <button
              onClick={onGenerateAllTts}
              disabled={isGeneratingAll || segments.length === 0}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-violet-600/20 transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>
                {isGeneratingAll
                  ? `Rendering (${generationProgress.current}/${generationProgress.total})...`
                  : 'Render All Lines (TTS)'}
              </span>
            </button>
          </div>
        </div>

        {/* List of Dialogue Lines */}
        <div className="space-y-2">
          {segments.map((seg, idx) => {
            const hasAudio = !!seg.audioBuffer;
            const takeCount = seg.takes?.length || (hasAudio ? 1 : 0);
            const char = characters.find(
              (c) => c.name.toUpperCase() === seg.speaker.toUpperCase()
            );
            const effectivePreset = seg.acousticPreset ?? char?.acousticPreset ?? 'studio_dry';
            const presetLabel =
              ACOUSTIC_PRESETS.find((p) => p.id === effectivePreset)?.shortLabel || 'Dry';
            const clipVol = seg.volume ?? 1.0;
            const effectiveLufs =
              typeof seg.measuredLufs === 'number'
                ? Math.round((seg.measuredLufs + linearGainToDb(clipVol)) * 10) / 10
                : undefined;

            return (
              <div
                key={seg.id}
                className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3 hover:border-slate-700 transition"
              >
                {/* Left Speaker & Timing */}
                <div className="flex items-center gap-3 min-w-[190px]">
                  <span className="font-mono tabular-nums text-[10px] text-slate-500 w-5">
                    #{idx + 1}
                  </span>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: char?.color || '#8b5cf6' }}
                      />
                      <span className="font-bold text-xs text-white">{seg.speaker}</span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        · {seg.voiceName}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono tabular-nums mt-0.5">
                      {seg.startTime.toFixed(1)}s · {presetLabel}
                      {takeCount > 0 ? ` · ${takeCount} takes` : ''}
                      {effectiveLufs !== undefined ? ` · ${effectiveLufs} LUFS` : ''}
                    </div>
                  </div>
                </div>

                {/* Spoken Text, Style Note & Subtext */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white leading-relaxed font-sans">
                    {seg.isDirtyText && (
                      <span className="text-amber-400 font-semibold mr-1.5">
                        [Text Edited — Ready to Re-render]
                      </span>
                    )}
                    {seg.text}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                    {seg.stylePrompt && <span className="italic">Style: {seg.stylePrompt}</span>}
                    {seg.subtextNote && (
                      <span className="text-amber-300/90">
                        · Subtext: {seg.subtextNote}
                      </span>
                    )}
                    {typeof seg.pauseAfterSec === 'number' && seg.pauseAfterSec !== 0.45 && (
                      <span className="font-mono text-cyan-300">
                        · {seg.pauseAfterSec < 0 ? `Overlap ${seg.pauseAfterSec}s` : `Pause +${seg.pauseAfterSec}s`}
                      </span>
                    )}
                  </div>
                </div>

                {/* Inline Manual Clip Volume Control (Whisper / Normal / Yell) */}
                {onUpdateSegment && (
                  <div className="flex items-center gap-2 bg-slate-950/90 border border-slate-800 rounded-lg px-2.5 py-1.5 text-[11px] font-mono tabular-nums shrink-0">
                    <Volume2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <input
                      type="range"
                      min="0.1"
                      max="2.2"
                      step="0.05"
                      value={clipVol}
                      onChange={(e) =>
                        onUpdateSegment({ ...seg, volume: parseFloat(e.target.value) })
                      }
                      className="w-20 h-1 bg-slate-800 rounded appearance-none cursor-pointer accent-emerald-400"
                      title={`Manual Volume Trim: ${Math.round(clipVol * 100)}% (${formatGainDb(
                        clipVol
                      )})`}
                    />
                    <span
                      className={`w-14 text-right ${
                        clipVol < 0.7
                          ? 'text-cyan-300'
                          : clipVol > 1.25
                          ? 'text-amber-300'
                          : 'text-emerald-300'
                      }`}
                    >
                      {formatGainDb(clipVol)}
                    </span>
                    <div className="hidden xl:flex items-center gap-1 pl-1 border-l border-slate-800 font-sans">
                      <button
                        type="button"
                        onClick={() => onUpdateSegment({ ...seg, volume: 0.35 })}
                        className={`px-1.5 py-0.5 rounded text-[10px] transition ${
                          clipVol <= 0.45
                            ? 'bg-cyan-950 text-cyan-300 border border-cyan-700/60'
                            : 'bg-slate-900 hover:bg-slate-800 text-slate-400'
                        }`}
                        title="Set clip gain to Whisper level (-9.1 dB)"
                      >
                        Whisper
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdateSegment({ ...seg, volume: 1.0 })}
                        className={`px-1.5 py-0.5 rounded text-[10px] transition ${
                          Math.abs(clipVol - 1.0) < 0.08
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
                            : 'bg-slate-900 hover:bg-slate-800 text-slate-400'
                        }`}
                        title="Reset clip gain to Normal (0.0 dB)"
                      >
                        Normal
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdateSegment({ ...seg, volume: 1.75 })}
                        className={`px-1.5 py-0.5 rounded text-[10px] transition ${
                          clipVol >= 1.5
                            ? 'bg-amber-950 text-amber-300 border border-amber-700/60'
                            : 'bg-slate-900 hover:bg-slate-800 text-slate-400'
                        }`}
                        title="Boost clip gain for Yelling (+4.9 dB)"
                      >
                        Yell
                      </button>
                    </div>
                  </div>
                )}

                {/* Status & Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {hasAudio && (
                    <button
                      onClick={() => onPreviewBuffer(seg)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-cyan-950/80 hover:bg-cyan-900/80 border border-cyan-800 text-cyan-300 text-xs font-semibold"
                      title="Preview Active Take"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>Play</span>
                    </button>
                  )}

                  <button
                    onClick={() => onGenerateSingleTts(seg)}
                    disabled={seg.isGenerating}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-violet-600/30 hover:bg-violet-600/50 border border-violet-500/40 text-violet-200 text-xs font-semibold"
                    title="Synthesize new take with Gemini TTS"
                  >
                    <RefreshCw className={`w-3 h-3 ${seg.isGenerating ? 'animate-spin' : ''}`} />
                    <span>
                      {seg.isGenerating
                        ? 'Synthesizing...'
                        : hasAudio
                        ? 'New Take'
                        : 'Synthesize'}
                    </span>
                  </button>

                  <button
                    onClick={() => onEditSegment(seg)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs"
                    title="Open Clip Director (Audition Takes, Mic Prosody Transfer, Acoustics & Pan)"
                  >
                    <Layers className="w-3.5 h-3.5 text-amber-400" />
                    <span>Direct</span>
                  </button>

                  <button
                    onClick={() => onDeleteSegment(seg.id)}
                    className="p-1.5 rounded-lg hover:bg-red-950 text-slate-500 hover:text-red-400"
                    title="Delete Line"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}

          {segments.length === 0 && (
            <div className="p-8 text-center bg-slate-900/40 rounded-xl border border-dashed border-slate-800 text-slate-500 text-xs">
              No dialogue lines detected. Paste a transcript above or load a sample drama to begin!
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
