import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  AudioSegment,
  CharacterVoice,
  MusicTrack,
  SfxClip,
  TensionNode,
  DEFAULT_TENSION_CURVES,
  ACOUSTIC_PRESETS,
  LUFS_PRESETS,
} from '../types/drama';
import {
  Play,
  Volume2,
  ZoomIn,
  ZoomOut,
  Music,
  Sliders,
  MoveHorizontal,
  Plus,
  Trash2,
  Edit2,
  RefreshCw,
  Lock,
  Unlock,
  Upload,
  Activity,
  Sparkles,
  Repeat,
  Check,
  Gauge,
  Compass,
} from 'lucide-react';
import { formatTimecode } from './HeaderBar';
import { evaluateTensionAtTime } from '../utils/timelineUtils';
import { formatGainDb, linearGainToDb } from '../utils/wavHelper';

interface TimelineProps {
  segments: AudioSegment[];
  characters: CharacterVoice[];
  musicTrack: MusicTrack;
  sfxClips: SfxClip[];
  tensionCurve?: TensionNode[];
  currentTime: number;
  totalDuration: number;
  isPlaying: boolean;
  onSeek: (time: number) => void;
  onUpdateSegment: (seg: AudioSegment) => void;
  onDeleteSegment: (id: string) => void;
  onEditSegment: (seg: AudioSegment) => void;
  onGenerateSingleTts: (seg: AudioSegment) => void;
  onPreviewBuffer: (seg: AudioSegment) => void;
  onUpdateMusicTrack: (track: Partial<MusicTrack>) => void;
  onUpdateSfx: (clip: SfxClip) => void;
  onDeleteSfx: (id: string) => void;
  onAddSfx: (type: SfxClip['type'], startTime: number) => void;
  onUploadCustomSfx: (file: File, startTime: number) => void;
  onRippleAlign?: () => void;
  onUpdateTensionCurve?: (nodes: TensionNode[]) => void;
  onApplyTensionToScene?: (nodes: TensionNode[]) => void;
  onNormalizeAllLufs?: (targetLufs: number) => void;
  normalizationSummary?: string | null;
  onOpenInStage?: (segmentId: string) => void;
}

export const Timeline: React.FC<TimelineProps> = ({
  segments,
  characters,
  musicTrack,
  sfxClips,
  tensionCurve = DEFAULT_TENSION_CURVES.rising_climax.nodes,
  currentTime,
  totalDuration,
  isPlaying,
  onSeek,
  onUpdateSegment,
  onDeleteSegment,
  onEditSegment,
  onGenerateSingleTts,
  onPreviewBuffer,
  onUpdateMusicTrack,
  onUpdateSfx,
  onDeleteSfx,
  onAddSfx,
  onUploadCustomSfx,
  onRippleAlign,
  onUpdateTensionCurve,
  onApplyTensionToScene,
  onNormalizeAllLufs,
  normalizationSummary,
  onOpenInStage,
}) => {
  const [pixelsPerSecond, setPixelsPerSecond] = useState<number>(65);
  const [targetLufs, setTargetLufs] = useState<number>(-16);
  const [draggingItem, setDraggingItem] = useState<{
    type: 'segment' | 'sfx';
    id: string;
    startX: number;
    originalTime: number;
  } | null>(null);
  const [snapToGrid, setSnapToGrid] = useState<boolean>(true);
  const [showTensionConductor, setShowTensionConductor] = useState<boolean>(true);
  const [draggingTensionNodeId, setDraggingTensionNodeId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const timelineContentRef = useRef<HTMLDivElement>(null);
  const tensionSvgRef = useRef<SVGSVGElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const timelineWidth = Math.max(1000, Math.ceil((totalDuration + 8) * pixelsPerSecond));
  const tickInterval = pixelsPerSecond > 80 ? 2 : 5;
  const numTicks = Math.ceil((totalDuration + 8) / tickInterval);
  const ticks = Array.from({ length: numTicks + 1 }, (_, i) => i * tickInterval);

  const characterMap = new Map(characters.map((c) => [c.name.toUpperCase(), c]));

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('.timeline-clip') || target.closest('.tension-node')) return;

    if (!timelineContentRef.current) return;
    const rect = timelineContentRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const seekTime = Math.max(0, Math.min(totalDuration, clickX / pixelsPerSecond));
    onSeek(seekTime);
  };

  // Dragging Dialogue Segments (Track 1) or Foley SFX Clips (Track 3)
  const handleMouseDownOnClip = (
    e: React.MouseEvent,
    type: 'segment' | 'sfx',
    id: string,
    startTime: number
  ) => {
    const target = e.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('input') ||
      target.closest('select') ||
      target.closest('.clip-volume-control')
    )
      return;

    e.preventDefault();
    setDraggingItem({
      type,
      id,
      startX: e.clientX,
      originalTime: startTime,
    });
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (draggingItem) {
        const deltaX = e.clientX - draggingItem.startX;
        const deltaTime = deltaX / pixelsPerSecond;
        let newTime = Math.max(0, draggingItem.originalTime + deltaTime);

        if (snapToGrid) {
          newTime = Math.round(newTime * 4) / 4;
        } else {
          newTime = Math.round(newTime * 100) / 100;
        }

        if (draggingItem.type === 'segment') {
          const seg = segments.find((s) => s.id === draggingItem.id);
          if (seg) {
            onUpdateSegment({ ...seg, startTime: newTime });
          }
        } else {
          const sfx = sfxClips.find((s) => s.id === draggingItem.id);
          if (sfx) {
            onUpdateSfx({ ...sfx, startTime: newTime });
          }
        }
      } else if (draggingTensionNodeId && tensionSvgRef.current && onUpdateTensionCurve) {
        const rect = tensionSvgRef.current.getBoundingClientRect();
        const ratioX = Math.max(0, Math.min(1, (e.clientX - rect.left) / (totalDuration * pixelsPerSecond)));
        const intensityY = Math.max(0.05, Math.min(0.98, 1 - (e.clientY - rect.top) / rect.height));

        const updatedNodes = tensionCurve.map((n) =>
          n.id === draggingTensionNodeId
            ? {
                ...n,
                timeRatio: Math.round(ratioX * 100) / 100,
                intensity: Math.round(intensityY * 100) / 100,
              }
            : n
        );
        onUpdateTensionCurve(updatedNodes);
      }
    },
    [
      draggingItem,
      draggingTensionNodeId,
      pixelsPerSecond,
      snapToGrid,
      segments,
      sfxClips,
      tensionCurve,
      totalDuration,
      onUpdateSegment,
      onUpdateSfx,
      onUpdateTensionCurve,
    ]
  );

  const handleMouseUp = useCallback(() => {
    setDraggingItem(null);
    setDraggingTensionNodeId(null);
  }, []);

  useEffect(() => {
    if (draggingItem || draggingTensionNodeId) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [draggingItem, draggingTensionNodeId, handleMouseMove, handleMouseUp]);

  // Auto-scroll timeline to follow playhead when playing
  useEffect(() => {
    if (!isPlaying || !containerRef.current) return;
    const playheadX = currentTime * pixelsPerSecond;
    const scrollLeft = containerRef.current.scrollLeft;
    const clientWidth = containerRef.current.clientWidth;

    if (playheadX > scrollLeft + clientWidth - 120 || playheadX < scrollLeft) {
      containerRef.current.scrollLeft = Math.max(0, playheadX - 100);
    }
  }, [currentTime, isPlaying, pixelsPerSecond]);

  const sortedTensionNodes = [...tensionCurve].sort((a, b) => a.timeRatio - b.timeRatio);
  const currentTension = evaluateTensionAtTime(
    sortedTensionNodes,
    Math.min(1, currentTime / Math.max(1, totalDuration))
  );

  // Build SVG path for Tension Conductor Curve
  const curveHeight = 68;
  const activeSpanPx = totalDuration * pixelsPerSecond;
  const tensionPoints = sortedTensionNodes
    .map((n) => `${n.timeRatio * activeSpanPx},${(1 - n.intensity) * (curveHeight - 14) + 7}`)
    .join(' ');
  const areaPoints =
    sortedTensionNodes.length > 0
      ? `0,${curveHeight} ${tensionPoints} ${activeSpanPx},${curveHeight}`
      : '';

  const formatPanShort = (pan = 0) => {
    if (Math.abs(pan) < 0.05) return 'C';
    return pan < 0 ? `L${Math.round(Math.abs(pan) * 100)}` : `R${Math.round(pan * 100)}`;
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 select-none overflow-hidden">
      {/* Timeline Toolbar */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-2 flex items-center justify-between flex-wrap gap-2 text-xs">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-semibold text-slate-200">Multi-Track DAW</span>
          <span className="text-slate-600">·</span>

          <label className="flex items-center gap-1.5 cursor-pointer text-slate-400 hover:text-slate-200">
            <input
              type="checkbox"
              checked={snapToGrid}
              onChange={(e) => setSnapToGrid(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-0 w-3.5 h-3.5"
            />
            <span>Snap (0.25s)</span>
          </label>

          {onRippleAlign && (
            <button
              onClick={onRippleAlign}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 hover:text-cyan-200 border border-slate-700 transition whitespace-nowrap shrink-0"
              title="Ripple Align unlocked clips using each clip's Pause/Overlap setting"
            >
              <MoveHorizontal className="w-3.5 h-3.5" />
              <span>Align Pacing</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowTensionConductor((prev) => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded border transition whitespace-nowrap shrink-0 ${
              showTensionConductor
                ? 'bg-amber-950/60 border-amber-600/60 text-amber-300'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Tension Conductor ({Math.round(currentTension * 100)}%)</span>
          </button>

          {/* Global LUFS Loudness Normalization Control */}
          {onNormalizeAllLufs && (
            <div className="flex items-center gap-1.5 bg-slate-950/90 border border-slate-800 rounded-lg px-2 py-0.5">
              <Gauge className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <select
                value={targetLufs}
                onChange={(e) => setTargetLufs(Number(e.target.value))}
                className="bg-transparent text-slate-200 font-mono tabular-nums text-[11px] focus:outline-none cursor-pointer"
                title="Target Integrated Loudness (ITU-R BS.1770 LUFS)"
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
                disabled={!segments.some((s) => !!s.audioBuffer)}
                className="px-2 py-0.5 rounded bg-emerald-600/30 hover:bg-emerald-600/50 disabled:opacity-40 text-emerald-200 border border-emerald-500/40 font-semibold text-[11px] transition whitespace-nowrap shrink-0"
                title="Analyze all rendered dialogue audio buffers and normalize their volume gain to match this target LUFS level"
              >
                Normalize LUFS
              </button>
            </div>
          )}

          {normalizationSummary && (
            <span className="text-[11px] text-emerald-400 font-mono tabular-nums flex items-center gap-1">
              <Check className="w-3 h-3 shrink-0" />
              <span>{normalizationSummary}</span>
            </span>
          )}
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-2">
          <span className="text-slate-400 text-[11px]">Zoom:</span>
          <button
            onClick={() => setPixelsPerSecond((prev) => Math.max(30, prev - 15))}
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <input
            type="range"
            min="30"
            max="140"
            step="5"
            value={pixelsPerSecond}
            onChange={(e) => setPixelsPerSecond(parseInt(e.target.value))}
            className="w-20 h-1 bg-slate-800 rounded appearance-none cursor-pointer accent-violet-500"
          />
          <button
            onClick={() => setPixelsPerSecond((prev) => Math.min(140, prev + 15))}
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Multi-Track Scroll Area */}
      <div ref={containerRef} className="flex-1 overflow-x-auto overflow-y-auto relative bg-slate-950">
        <div
          ref={timelineContentRef}
          onClick={handleTimelineClick}
          style={{ width: `${timelineWidth}px` }}
          className="min-h-full flex flex-col relative pb-16 cursor-crosshair"
        >
          {/* Time Ruler */}
          <div className="h-8 bg-slate-900/90 border-b border-slate-800 sticky top-0 z-20 flex items-end">
            {ticks.map((t) => (
              <div
                key={t}
                style={{ left: `${t * pixelsPerSecond}px` }}
                className="absolute flex flex-col items-start"
              >
                <span className="font-mono tabular-nums text-[10px] text-slate-400 pl-1 -translate-y-1">
                  {formatTimecode(t)}
                </span>
                <div className="h-2 w-px bg-slate-700" />
              </div>
            ))}
          </div>

          {/* Real-Time Playhead Scrubber */}
          <div
            style={{ left: `${currentTime * pixelsPerSecond}px` }}
            className="absolute top-0 bottom-0 w-0.5 bg-cyan-400 z-30 pointer-events-none"
          >
            <div className="w-3 h-3 -ml-[5px] bg-cyan-400 rotate-45 transform -translate-y-1" />
          </div>

          {/* MOONSHOT 1: Emotional Arc & Tension Conductor Lane */}
          {showTensionConductor && (
            <div className="border-b border-slate-800 bg-slate-900/40 relative py-2">
              <div className="sticky left-0 z-10 inline-flex items-center gap-3 px-3 py-1 bg-slate-900/95 border-r border-b border-slate-800 rounded-br text-[11px]">
                <span className="font-bold text-amber-400 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5" />
                  <span>Emotional Arc & Tension Conductor</span>
                </span>

                <div className="flex items-center gap-1 text-[10px]">
                  {Object.entries(DEFAULT_TENSION_CURVES).map(([key, preset]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateTensionCurve?.(preset.nodes);
                      }}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-300 transition whitespace-nowrap"
                      title={preset.description}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>

                {onApplyTensionToScene && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onApplyTensionToScene(sortedTensionNodes);
                    }}
                    className="flex items-center gap-1 px-2.5 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[10px] transition whitespace-nowrap"
                    title="Modulate acting prompts, vocal bursts, and overlapping dialogue gaps across the scene to match this curve"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Apply Tension to Scene</span>
                  </button>
                )}
              </div>

              <div className="relative h-[68px] mt-1">
                <svg
                  ref={tensionSvgRef}
                  width={timelineWidth}
                  height={curveHeight}
                  className="overflow-visible select-none"
                >
                  <defs>
                    <linearGradient id="tensionAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.32" />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.02" />
                    </linearGradient>
                  </defs>

                  {areaPoints && <polygon points={areaPoints} fill="url(#tensionAreaGrad)" />}
                  {tensionPoints && (
                    <polyline
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="2"
                      points={tensionPoints}
                    />
                  )}

                  {sortedTensionNodes.map((node) => {
                    const cx = node.timeRatio * activeSpanPx;
                    const cy = (1 - node.intensity) * (curveHeight - 14) + 7;
                    return (
                      <g
                        key={node.id}
                        className="tension-node cursor-grab active:cursor-grabbing"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setDraggingTensionNodeId(node.id);
                        }}
                      >
                        <circle
                          cx={cx}
                          cy={cy}
                          r={6}
                          fill="#020617"
                          stroke="#f59e0b"
                          strokeWidth={2.5}
                        />
                        <text
                          x={cx + 8}
                          y={cy + 3}
                          fill="#fcd34d"
                          fontSize="10"
                          fontFamily="monospace"
                        >
                          {node.label ? `${node.label} · ` : ''}
                          {Math.round(node.intensity * 100)}%
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>
          )}

          {/* TRACK 1: Character Dialogue Segments */}
          <div className="border-b border-slate-800/80 bg-slate-900/30 min-h-[172px] relative py-2">
            <div className="sticky left-0 z-10 inline-block px-3 py-1 bg-slate-900/95 border-r border-b border-slate-800 rounded-br text-[11px] font-bold text-violet-400">
              Track 1: Character Dialogue (Gemini TTS · LUFS Gain Trim & Acoustic DSP)
            </div>

            <div className="relative h-36 mt-2">
              {segments.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center text-slate-500 text-xs">
                    <p className="font-semibold text-slate-400">No dialogue clips on timeline</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Switch to Transcript tab to write or sync your script, or add a dialogue line.
                    </p>
                  </div>
                </div>
              )}

              {segments.map((seg, idx) => {
                const char = characterMap.get(seg.speaker.toUpperCase());
                const clipLeft = seg.startTime * pixelsPerSecond;
                const clipWidth = Math.max(125, seg.duration * pixelsPerSecond);
                const charColor = char?.color || '#8b5cf6';
                const isDragging = draggingItem?.type === 'segment' && draggingItem.id === seg.id;
                const effectivePan = seg.pan ?? char?.pan ?? 0;
                const effectiveDistance = seg.distance ?? char?.distance ?? 0.15;
                const effectivePreset = seg.acousticPreset ?? char?.acousticPreset ?? 'studio_dry';
                const presetObj = ACOUSTIC_PRESETS.find((p) => p.id === effectivePreset);
                const takeCount = seg.takes?.length || (seg.audioBuffer ? 1 : 0);
                const clipVol = seg.volume ?? 1.0;
                const effectiveLufs =
                  typeof seg.measuredLufs === 'number'
                    ? Math.round((seg.measuredLufs + linearGainToDb(clipVol)) * 10) / 10
                    : undefined;
                // Alternate slight vertical offset when clips overlap so both remain easy to grab
                const prevSeg = idx > 0 ? segments[idx - 1] : null;
                const isOverlappingPrev =
                  prevSeg && seg.startTime < prevSeg.startTime + prevSeg.duration - 0.05;

                return (
                  <div
                    key={seg.id}
                    onMouseDown={(e) => handleMouseDownOnClip(e, 'segment', seg.id, seg.startTime)}
                    style={{
                      left: `${clipLeft}px`,
                      width: `${clipWidth}px`,
                      borderColor: charColor,
                      top: isOverlappingPrev ? '10px' : '4px',
                      bottom: isOverlappingPrev ? '2px' : '6px',
                    }}
                    className={`timeline-clip absolute rounded-lg border bg-slate-900/95 shadow-md flex flex-col justify-between p-2 overflow-hidden transition-shadow select-none ${
                      isDragging
                        ? 'ring-2 ring-cyan-400 shadow-xl z-30 opacity-95'
                        : 'hover:border-slate-400 z-10'
                    }`}
                  >
                    {/* Clip Header */}
                    <div className="flex items-center justify-between gap-1 text-[11px] border-b border-slate-800/80 pb-1">
                      <div className="flex items-center gap-1.5 truncate">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: charColor }}
                        />
                        <span className="font-bold text-slate-200 truncate">{seg.speaker}</span>
                        <span className="text-[10px] text-slate-400 font-mono truncate">
                          · {seg.voiceName}
                        </span>
                      </div>

                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateSegment({ ...seg, lockedPosition: !seg.lockedPosition });
                          }}
                          className={`p-1 rounded transition ${
                            seg.lockedPosition
                              ? 'text-amber-400 bg-amber-950/50'
                              : 'text-slate-500 hover:text-slate-300'
                          }`}
                          title={
                            seg.lockedPosition
                              ? 'Position Locked (immune to ripple align)'
                              : 'Lock Clip Position'
                          }
                        >
                          {seg.lockedPosition ? (
                            <Lock className="w-3 h-3" />
                          ) : (
                            <Unlock className="w-3 h-3" />
                          )}
                        </button>

                        {seg.audioBuffer ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onPreviewBuffer(seg);
                            }}
                            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400"
                            title="Preview Dialogue Line (with Volume Gain, Acoustic DSP & Pan)"
                          >
                            <Play className="w-3 h-3 fill-current" />
                          </button>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onGenerateSingleTts(seg);
                            }}
                            disabled={seg.isGenerating}
                            className={`p-1 rounded bg-violet-600/30 text-violet-300 hover:bg-violet-600/60 ${
                              seg.isGenerating ? 'animate-spin' : ''
                            }`}
                            title="Synthesize Line with Gemini TTS"
                          >
                            <RefreshCw className="w-3 h-3" />
                          </button>
                        )}

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditSegment(seg);
                          }}
                          className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200"
                          title="Open Clip Director (Volume Dynamics, Takes, Mic Reference, Acoustics & Pan)"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteSegment(seg.id);
                          }}
                          className="p-1 rounded hover:bg-red-950/60 text-slate-500 hover:text-red-400"
                          title="Delete Clip"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Spoken Text Snippet */}
                    <p className="text-[11px] text-slate-300 line-clamp-1 italic my-0.5">
                      {seg.isDirtyText && (
                        <span className="text-amber-400 font-semibold not-italic mr-1">
                          [Edited]
                        </span>
                      )}
                      "{seg.text}"
                    </p>

                    {/* Waveform Visualization (Scaled by Clip Volume Gain) */}
                    <div className="h-5 w-full flex items-center gap-0.5 bg-slate-950/80 rounded px-1 overflow-hidden">
                      {seg.isGenerating ? (
                        <div className="flex items-center justify-center w-full text-[10px] text-violet-400">
                          <span>Synthesizing speech...</span>
                        </div>
                      ) : seg.waveformPeaks && seg.waveformPeaks.length > 0 ? (
                        seg.waveformPeaks.map((peak, pIdx) => (
                          <div
                            key={pIdx}
                            style={{
                              height: `${Math.min(100, Math.max(12, peak * clipVol * 100))}%`,
                              backgroundColor: charColor,
                            }}
                            className="flex-1 min-w-[2px] rounded-full opacity-80 transition-all duration-100"
                          />
                        ))
                      ) : (
                        <div className="flex items-center justify-between w-full text-[10px] text-slate-500">
                          <span>Click synthesize</span>
                          <span className="font-mono tabular-nums">{seg.duration.toFixed(1)}s</span>
                        </div>
                      )}
                    </div>

                    {/* Direct Clip Volume / Gain Trim Row (Whisper <-> Yell) */}
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="clip-volume-control flex items-center justify-between gap-1.5 bg-slate-950/90 border border-slate-800/90 rounded px-1.5 py-0.5 text-[9px] font-mono tabular-nums mt-0.5"
                    >
                      <div className="flex items-center gap-1 min-w-0">
                        <Volume2 className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateSegment({
                              ...seg,
                              volume: Math.max(0.1, Math.round((clipVol - 0.15) * 100) / 100),
                            })
                          }
                          className="px-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                          title="Lower volume (towards whisper)"
                        >
                          -
                        </button>
                        <input
                          type="range"
                          min="0.1"
                          max="2.2"
                          step="0.05"
                          value={clipVol}
                          onChange={(e) =>
                            onUpdateSegment({ ...seg, volume: parseFloat(e.target.value) })
                          }
                          className="w-14 h-1 bg-slate-800 rounded appearance-none cursor-pointer accent-emerald-400"
                          title={`Clip Volume: ${Math.round(clipVol * 100)}% (${formatGainDb(
                            clipVol
                          )}) — Drag down for whisper or up for yelling`}
                        />
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateSegment({
                              ...seg,
                              volume: Math.min(2.4, Math.round((clipVol + 0.15) * 100) / 100),
                            })
                          }
                          className="px-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                          title="Boost volume (towards yelling)"
                        >
                          +
                        </button>
                      </div>

                      <div className="flex items-center gap-1 truncate">
                        <span
                          className={
                            clipVol < 0.7
                              ? 'text-cyan-300'
                              : clipVol > 1.25
                              ? 'text-amber-300'
                              : 'text-emerald-300'
                          }
                          title="Clip Gain (dB)"
                        >
                          {formatGainDb(clipVol)}
                        </span>
                        {effectiveLufs !== undefined && (
                          <span className="text-slate-400 hidden sm:inline">
                            · {effectiveLufs} LUFS
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Footer Metadata Bar (Unboxed with · separators) */}
                    <div className="flex items-center justify-between text-[9px] text-slate-400 font-mono tabular-nums mt-0.5 cursor-grab active:cursor-grabbing truncate">
                      <div className="flex items-center gap-1 truncate">
                        <span>{formatTimecode(seg.startTime)}</span>
                        <span>·</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenInStage?.(seg.id);
                          }}
                          className="inline-flex items-center gap-0.5 text-cyan-400 hover:text-cyan-200 transition"
                          title="Open this clip in the 2D Binaural Soundstage to block character movement"
                        >
                          <Compass className="w-2.5 h-2.5 shrink-0" />
                          <span>
                            {formatPanShort(effectivePan)}/{Math.round(effectiveDistance * 10)}m
                          </span>
                        </button>
                        {effectivePreset !== 'studio_dry' && (
                          <>
                            <span>·</span>
                            <span className="text-violet-300">{presetObj?.shortLabel}</span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {takeCount > 0 && (
                          <span className="text-amber-300">
                            {takeCount} {takeCount === 1 ? 'take' : 'takes'}
                          </span>
                        )}
                        {typeof seg.pauseAfterSec === 'number' && seg.pauseAfterSec < 0 && (
                          <span className="text-rose-400">· {seg.pauseAfterSec}s</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* TRACK 2: Background Music Track */}
          <div className="border-b border-slate-800/80 bg-slate-900/20 min-h-[90px] relative py-2">
            <div className="sticky left-0 z-10 inline-flex items-center gap-2 px-3 py-1 bg-slate-900/95 border-r border-b border-slate-800 rounded-br text-[11px] font-bold text-amber-400">
              <Music className="w-3.5 h-3.5 text-amber-400" />
              <span>
                Track 2: AI Background Music (
                {musicTrack.modelType === 'pro' ? 'Lyria 3 Pro' : 'Lyria 3 Clip'})
              </span>
              {musicTrack.ducking && (
                <span className="text-[10px] text-amber-300 font-normal">· Auto-Ducking Active</span>
              )}
            </div>

            <div className="relative h-16 mt-2">
              {musicTrack.enabled ? (
                <div
                  style={{
                    left: 0,
                    width: `${Math.max(
                      timelineWidth - 100,
                      (musicTrack.durationSeconds || 30) * pixelsPerSecond
                    )}px`,
                  }}
                  className="absolute top-1 bottom-1 rounded-lg border border-amber-500/50 bg-amber-950/20 shadow flex items-center justify-between px-3 overflow-hidden"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-amber-500/20 flex items-center justify-center text-amber-400">
                      <Music className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-bold text-xs text-amber-300 truncate max-w-sm">
                        {musicTrack.genre || 'Cinematic Music'}:{' '}
                        {musicTrack.prompt || 'Atmospheric score'}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono tabular-nums">
                        Looping Score · Vol {Math.round(musicTrack.volume * 100)}% · Ducking:{' '}
                        {musicTrack.ducking ? 'ON' : 'OFF'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 bg-slate-900/80 px-2 py-1 rounded border border-slate-800">
                    <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={musicTrack.volume}
                      onChange={(e) => onUpdateMusicTrack({ volume: parseFloat(e.target.value) })}
                      className="w-16 h-1 bg-slate-800 rounded appearance-none cursor-pointer accent-amber-400"
                      title="Music Track Volume"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-slate-600 text-xs italic">
                  Music track muted or disabled. Enable in "Music & FX" tab.
                </div>
              )}
            </div>
          </div>

          {/* TRACK 3: Draggable Foley & Sound Effects Track + Custom Audio Upload */}
          <div className="border-b border-slate-800/80 bg-slate-900/10 min-h-[110px] relative py-2">
            <div className="sticky left-0 z-10 inline-flex items-center gap-2 px-3 py-1 bg-slate-900/95 border-r border-b border-slate-800 rounded-br text-[11px] font-bold text-emerald-400">
              <Sliders className="w-3.5 h-3.5 text-emerald-400" />
              <span>Track 3: Foley & Sound Effects (Draggable · Spatial Pan)</span>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddSfx('rain', currentTime);
                }}
                className="ml-2 flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-600/30 hover:bg-emerald-600/50 text-[10px] text-emerald-200 border border-emerald-500/30 whitespace-nowrap"
              >
                <Plus className="w-2.5 h-2.5" />
                <span>Add SFX at Scrubber</span>
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-200 border border-slate-700 whitespace-nowrap"
                title="Upload your own .wav, .mp3, or .ogg sound effect at current playhead"
              >
                <Upload className="w-2.5 h-2.5 text-emerald-400" />
                <span>Upload Audio (.wav/.mp3)</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    onUploadCustomSfx(file, currentTime);
                    e.target.value = '';
                  }
                }}
              />
            </div>

            {/* Draggable & Resizable SFX Clips */}
            <div className="relative h-20 mt-2">
              {sfxClips.map((sfx) => {
                const sfxLeft = sfx.startTime * pixelsPerSecond;
                const sfxWidth = Math.max(115, sfx.duration * pixelsPerSecond);
                const isDraggingSfx = draggingItem?.type === 'sfx' && draggingItem.id === sfx.id;

                return (
                  <div
                    key={sfx.id}
                    onMouseDown={(e) => handleMouseDownOnClip(e, 'sfx', sfx.id, sfx.startTime)}
                    style={{
                      left: `${sfxLeft}px`,
                      width: `${sfxWidth}px`,
                    }}
                    className={`timeline-clip absolute top-1 bottom-1 rounded-lg border border-emerald-500/60 bg-emerald-950/40 p-2 flex flex-col justify-between shadow-sm cursor-grab active:cursor-grabbing ${
                      isDraggingSfx ? 'ring-2 ring-emerald-400 z-30 opacity-95' : 'z-10'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                        <span className="font-bold text-[10px] text-emerald-200 truncate">
                          {sfx.name}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateSfx({
                              ...sfx,
                              duration: Math.max(1, Math.round((sfx.duration - 1) * 10) / 10),
                            });
                          }}
                          className="px-1 rounded bg-slate-900/80 hover:bg-slate-800 text-[9px] font-mono text-slate-300"
                          title="Shorten SFX (-1s)"
                        >
                          -1s
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateSfx({
                              ...sfx,
                              duration: Math.round((sfx.duration + 1) * 10) / 10,
                            });
                          }}
                          className="px-1 rounded bg-slate-900/80 hover:bg-slate-800 text-[9px] font-mono text-slate-300"
                          title="Extend SFX (+1s)"
                        >
                          +1s
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateSfx({ ...sfx, loop: !sfx.loop });
                          }}
                          className={`p-0.5 rounded ${
                            sfx.loop ? 'bg-emerald-600/50 text-white' : 'text-slate-400 hover:text-white'
                          }`}
                          title="Toggle Loop"
                        >
                          <Repeat className="w-2.5 h-2.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteSfx(sfx.id);
                          }}
                          className="p-0.5 rounded hover:bg-red-950 text-slate-400 hover:text-red-400"
                          title="Remove SFX"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* SFX Volume & Timecode Row */}
                    <div className="flex items-center justify-between gap-2 text-[9px] font-mono tabular-nums text-emerald-300/90 mt-1">
                      <span>
                        {formatTimecode(sfx.startTime)} · {sfx.duration.toFixed(1)}s ·{' '}
                        {formatPanShort(sfx.pan ?? 0)}
                      </span>
                      <div className="flex items-center gap-1">
                        <Volume2 className="w-2.5 h-2.5" />
                        <input
                          type="range"
                          min="0.05"
                          max="1.5"
                          step="0.05"
                          value={sfx.volume ?? 0.7}
                          onChange={(e) =>
                            onUpdateSfx({ ...sfx, volume: parseFloat(e.target.value) })
                          }
                          className="w-12 h-1 bg-slate-800 rounded appearance-none cursor-pointer accent-emerald-400"
                          title={`SFX Volume: ${Math.round((sfx.volume ?? 0.7) * 100)}%`}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}

              {sfxClips.length === 0 && (
                <div className="flex items-center justify-center h-full text-slate-600 text-xs italic">
                  No sound effects placed. Click "Add SFX at Scrubber" or upload an audio file.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
