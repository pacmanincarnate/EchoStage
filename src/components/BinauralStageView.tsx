import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import {
  CharacterVoice,
  SfxClip,
  AudioSegment,
  ACOUSTIC_PRESETS,
  AcousticPreset,
} from '../types/drama';
import {
  Compass,
  Play,
  Pause,
  Radio,
  RotateCcw,
  Headphones,
  Sliders,
  ChevronLeft,
  ChevronRight,
  Navigation,
  CopyCheck,
  GitCommit,
  Footprints,
  Eye,
  Layers,
} from 'lucide-react';
import { formatTimecode } from './HeaderBar';

interface BinauralStageViewProps {
  characters: CharacterVoice[];
  sfxClips: SfxClip[];
  segments: AudioSegment[];
  selectedSegmentId?: string | null;
  onSelectSegment?: (segmentId: string) => void;
  currentTime?: number;
  isPlaying?: boolean;
  onSeek?: (time: number) => void;
  onPlayPause?: () => void;
  onUpdateSegment: (segment: AudioSegment) => void;
  onUpdateSegments: (segments: AudioSegment[]) => void;
  onUpdateCharacter: (char: CharacterVoice) => void;
  onUpdateSfxClip: (clip: SfxClip) => void;
  onApplyRoomPresetToAll: (preset: AcousticPreset) => void;
  onPreviewSegment: (segment: AudioSegment) => void;
  onAuditionCharacterInSpace: (char: CharacterVoice) => void;
  onAuditionSfxInSpace: (clip: SfxClip) => void;
}

export const BinauralStageView: React.FC<BinauralStageViewProps> = ({
  characters,
  sfxClips,
  segments,
  selectedSegmentId,
  onSelectSegment,
  currentTime = 0,
  isPlaying = false,
  onSeek,
  onPlayPause,
  onUpdateSegment,
  onUpdateSegments,
  onUpdateCharacter,
  onUpdateSfxClip,
  onApplyRoomPresetToAll,
  onPreviewSegment,
  onAuditionSfxInSpace,
}) => {
  const stageRef = useRef<HTMLDivElement>(null);

  // Sort dialogue clips chronologically
  const sortedSegments = useMemo(
    () => [...segments].sort((a, b) => a.startTime - b.startTime),
    [segments]
  );

  const [internalSelectedSegId, setInternalSelectedSegId] = useState<string | null>(() => {
    if (selectedSegmentId) return selectedSegmentId;
    return sortedSegments[0]?.id || null;
  });

  // Sync external selectedSegmentId when provided
  useEffect(() => {
    if (selectedSegmentId) {
      setInternalSelectedSegId(selectedSegmentId);
    }
  }, [selectedSegmentId]);

  // Keep valid selection if segments change
  useEffect(() => {
    if (sortedSegments.length === 0) {
      setInternalSelectedSegId(null);
      return;
    }
    if (!internalSelectedSegId || !sortedSegments.some((s) => s.id === internalSelectedSegId)) {
      setInternalSelectedSegId(sortedSegments[0].id);
    }
  }, [sortedSegments, internalSelectedSegId]);

  const selectClip = useCallback(
    (segId: string, seekToClip = false) => {
      setInternalSelectedSegId(segId);
      onSelectSegment?.(segId);
      if (seekToClip && onSeek) {
        const target = sortedSegments.find((s) => s.id === segId);
        if (target) onSeek(target.startTime);
      }
    },
    [onSelectSegment, onSeek, sortedSegments]
  );

  // Auto-follow playhead during scene playback so characters visibly move clip-by-clip
  const [followPlayhead, setFollowPlayhead] = useState<boolean>(true);
  const [showMovementPaths, setShowMovementPaths] = useState<boolean>(true);
  const [stageMode, setStageMode] = useState<'active_scene' | 'all_clips'>('active_scene');
  const [showAllSfx, setShowAllSfx] = useState<boolean>(true);
  const [choreographyNotice, setChoreographyNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!followPlayhead || !isPlaying || sortedSegments.length === 0) return;
    // Find segment active at currentTime, or most recently started segment
    const activeNow =
      sortedSegments.find(
        (s) => currentTime >= s.startTime && currentTime <= s.startTime + s.duration + 0.15
      ) ||
      [...sortedSegments]
        .reverse()
        .find((s) => currentTime >= s.startTime);

    if (activeNow && activeNow.id !== internalSelectedSegId) {
      setInternalSelectedSegId(activeNow.id);
      onSelectSegment?.(activeNow.id);
    }
  }, [currentTime, isPlaying, followPlayhead, sortedSegments, internalSelectedSegId, onSelectSegment]);

  const activeSegmentIndex = useMemo(() => {
    const idx = sortedSegments.findIndex((s) => s.id === internalSelectedSegId);
    return idx >= 0 ? idx : 0;
  }, [sortedSegments, internalSelectedSegId]);

  const activeSegment: AudioSegment | null = sortedSegments[activeSegmentIndex] || null;

  const charMap = useMemo(
    () => new Map(characters.map((c) => [c.name.toUpperCase(), c])),
    [characters]
  );

  // Helper to resolve effective pan, distance, and acousticPreset for any segment
  const getSegmentSpatial = useCallback(
    (seg: AudioSegment) => {
      const char = charMap.get(seg.speaker.toUpperCase());
      return {
        pan: seg.pan ?? char?.pan ?? 0,
        distance: seg.distance ?? char?.distance ?? 0.15,
        acousticPreset: (seg.acousticPreset ?? char?.acousticPreset ?? 'studio_dry') as AcousticPreset,
        color: char?.color || '#06b6d4',
      };
    },
    [charMap]
  );

  // Dragging state: supports dragging a specific dialogue segment ('seg') or an SFX clip ('sfx')
  const [draggingToken, setDraggingToken] = useState<{
    type: 'seg' | 'sfx';
    id: string;
  } | null>(null);

  const handleStagePointerDown = (
    e: React.MouseEvent,
    type: 'seg' | 'sfx',
    id: string
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (type === 'seg') {
      selectClip(id, false);
    }
    setDraggingToken({ type, id });
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!draggingToken || !stageRef.current) return;
      const rect = stageRef.current.getBoundingClientRect();
      // X maps to Stereo Pan: left edge = -1.0, center = 0.0, right edge = +1.0
      const normX = Math.max(0.05, Math.min(0.95, (e.clientX - rect.left) / rect.width));
      // Y maps to Distance from listener (bottom = 0.0 close, top = 0.92 far)
      const normY = Math.max(0.06, Math.min(0.92, (e.clientY - rect.top) / rect.height));

      const pan = Math.round((normX - 0.5) * 2 * 100) / 100;
      const distance = Math.round((1 - normY) * 100) / 100;

      if (draggingToken.type === 'seg') {
        const seg = segments.find((s) => s.id === draggingToken.id);
        if (seg) {
          onUpdateSegment({
            ...seg,
            pan,
            distance,
          });
        }
      } else {
        const clip = sfxClips.find((s) => s.id === draggingToken.id);
        if (clip) {
          onUpdateSfxClip({
            ...clip,
            pan,
            distance,
          });
        }
      }
    },
    [draggingToken, segments, sfxClips, onUpdateSegment, onUpdateSfxClip]
  );

  const handleMouseUp = useCallback(() => {
    setDraggingToken(null);
  }, []);

  useEffect(() => {
    if (draggingToken) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [draggingToken, handleMouseMove, handleMouseUp]);

  // Convert (pan, distance) to % coordinates on the 2D canvas
  const toStageCoords = (pan = 0, distance = 0.15) => ({
    leftPct: 50 + pan * 44,
    topPct: (1 - distance) * 80 + 8,
  });

  // For 'active_scene' mode: determine each character's active/nearest clip at activeSegment's time
  const castStageTokens = useMemo(() => {
    if (!activeSegment) return [];
    const activeTime = activeSegment.startTime;

    return characters.map((char) => {
      const charUpper = char.name.toUpperCase();
      const charSegs = sortedSegments.filter((s) => s.speaker.toUpperCase() === charUpper);

      if (charSegs.length === 0) {
        return {
          char,
          segment: null as AudioSegment | null,
          clipNumber: null as number | null,
          isSpeakingNow: false,
          pan: char.pan ?? 0,
          distance: char.distance ?? 0.15,
          acousticPreset: (char.acousticPreset || 'studio_dry') as AcousticPreset,
        };
      }

      // If this character is the speaker of the currently selected clip, use activeSegment
      if (activeSegment.speaker.toUpperCase() === charUpper) {
        const spatial = getSegmentSpatial(activeSegment);
        return {
          char,
          segment: activeSegment,
          clipNumber: activeSegmentIndex + 1,
          isSpeakingNow: true,
          ...spatial,
        };
      }

      // Otherwise find this character's most recent clip at or before activeTime, or their first clip
      const priorOrCurrent =
        [...charSegs].reverse().find((s) => s.startTime <= activeTime) || charSegs[0];
      const globalIdx = sortedSegments.findIndex((s) => s.id === priorOrCurrent.id);
      const spatial = getSegmentSpatial(priorOrCurrent);

      return {
        char,
        segment: priorOrCurrent,
        clipNumber: globalIdx >= 0 ? globalIdx + 1 : 1,
        isSpeakingNow: false,
        ...spatial,
      };
    });
  }, [activeSegment, activeSegmentIndex, characters, sortedSegments, getSegmentSpatial]);

  // Compute movement trajectory for the active clip's speaker (all clips of that speaker in order)
  const activeSpeakerClips = useMemo(() => {
    if (!activeSegment) return [];
    const spk = activeSegment.speaker.toUpperCase();
    return sortedSegments
      .map((seg, idx) => ({
        seg,
        clipNumber: idx + 1,
        ...getSegmentSpatial(seg),
      }))
      .filter((item) => item.seg.speaker.toUpperCase() === spk);
  }, [activeSegment, sortedSegments, getSegmentSpatial]);

  // Previous clip of the same speaker (to detect movement delta or snap back)
  const previousSameSpeakerClip = useMemo(() => {
    if (!activeSegment) return null;
    const idxInSpeaker = activeSpeakerClips.findIndex((c) => c.seg.id === activeSegment.id);
    if (idxInSpeaker > 0) {
      return activeSpeakerClips[idxInSpeaker - 1];
    }
    return null;
  }, [activeSegment, activeSpeakerClips]);

  // Carry active clip's position forward to all subsequent clips of the same speaker
  const handleCarryPositionForward = () => {
    if (!activeSegment) return;
    const spk = activeSegment.speaker.toUpperCase();
    const { pan, distance, acousticPreset } = getSegmentSpatial(activeSegment);
    let updatedCount = 0;

    const updated = segments.map((s) => {
      if (
        s.speaker.toUpperCase() === spk &&
        s.startTime >= activeSegment.startTime &&
        s.id !== activeSegment.id
      ) {
        updatedCount++;
        return {
          ...s,
          pan,
          distance,
          acousticPreset,
        };
      }
      return s;
    });

    onUpdateSegments(updated);
    setChoreographyNotice(
      `Carried ${activeSegment.speaker}'s position (${formatPanLabel(pan)}, ${Math.round(
        distance * 100
      )}% dist) forward to ${updatedCount} subsequent clip${updatedCount === 1 ? '' : 's'}.`
    );
  };

  // Match active clip's position to the speaker's previous clip
  const handleMatchPreviousClipPosition = () => {
    if (!activeSegment || !previousSameSpeakerClip) return;
    onUpdateSegment({
      ...activeSegment,
      pan: previousSameSpeakerClip.pan,
      distance: previousSameSpeakerClip.distance,
      acousticPreset: previousSameSpeakerClip.acousticPreset,
    });
    setChoreographyNotice(
      `Matched Clip #${activeSegmentIndex + 1} to Clip #${previousSameSpeakerClip.clipNumber}'s position.`
    );
  };

  // Smoothly interpolate movement path across all clips of the active speaker between their first and last clip
  const handleInterpolateSpeakerWalk = () => {
    if (!activeSegment || activeSpeakerClips.length < 2) return;
    const spk = activeSegment.speaker.toUpperCase();
    const first = activeSpeakerClips[0];
    const last = activeSpeakerClips[activeSpeakerClips.length - 1];

    // If first and last are identical, create a natural walk from Far Left/Right to Close Center
    const startPan = first.pan;
    const startDist = first.distance;
    const endPan =
      Math.abs(last.pan - first.pan) < 0.05 && Math.abs(last.distance - first.distance) < 0.05
        ? -startPan || 0.45
        : last.pan;
    const endDist =
      Math.abs(last.pan - first.pan) < 0.05 && Math.abs(last.distance - first.distance) < 0.05
        ? Math.max(0.08, 0.65 - startDist)
        : last.distance;

    const total = activeSpeakerClips.length - 1;
    const posMap = new Map<string, { pan: number; distance: number }>();

    activeSpeakerClips.forEach((item, i) => {
      const t = total > 0 ? i / total : 0;
      posMap.set(item.seg.id, {
        pan: Math.round((startPan + (endPan - startPan) * t) * 100) / 100,
        distance: Math.round((startDist + (endDist - startDist) * t) * 100) / 100,
      });
    });

    const updated = segments.map((s) => {
      const target = posMap.get(s.id);
      if (target) {
        return { ...s, pan: target.pan, distance: target.distance };
      }
      return s;
    });

    onUpdateSegments(updated);
    setChoreographyNotice(
      `Interpolated smooth walking trajectory across ${activeSpeakerClips.length} clips for ${spk}.`
    );
  };

  // Scene-wide clip-by-clip choreography generators
  const applySceneChoreography = (
    mode: 'approach_walk' | 'cross_stage' | 'standoff' | 'reset_character_defaults'
  ) => {
    if (sortedSegments.length === 0) return;

    const total = Math.max(1, sortedSegments.length - 1);
    const updatedMap = new Map<string, { pan: number; distance: number }>();

    sortedSegments.forEach((seg, idx) => {
      const charIdx = characters.findIndex(
        (c) => c.name.toUpperCase() === seg.speaker.toUpperCase()
      );
      const char = characters[charIdx >= 0 ? charIdx : 0];
      const baseSide = (charIdx >= 0 ? charIdx : idx) % 2 === 0 ? -1 : 1;
      const progress = idx / total; // 0.0 at start of scene -> 1.0 at end of scene

      if (mode === 'approach_walk') {
        // Characters start far & wide and gradually step closer to center sweet spot clip-by-clip
        const pan = Math.round(baseSide * (0.65 - progress * 0.45) * 100) / 100;
        const distance = Math.round((0.68 - progress * 0.56) * 100) / 100;
        updatedMap.set(seg.id, { pan, distance });
      } else if (mode === 'cross_stage') {
        // Characters cross from one side of the stereo room to the other over the course of the scene
        const pan = Math.round(baseSide * (-0.65 + progress * 1.3) * 100) / 100;
        const distance = Math.round((0.2 + Math.sin(progress * Math.PI) * 0.28) * 100) / 100;
        updatedMap.set(seg.id, { pan, distance });
      } else if (mode === 'standoff') {
        // Dynamic left/right standoff with subtle pacing shifts per clip
        const jitter = ((idx % 3) - 1) * 0.08;
        const pan = Math.round((baseSide * 0.6 + jitter) * 100) / 100;
        const distance = Math.round((charIdx === 0 ? 0.18 : 0.48 + jitter) * 100) / 100;
        updatedMap.set(seg.id, { pan: Math.max(-0.9, Math.min(0.9, pan)), distance: Math.max(0.05, Math.min(0.85, distance)) });
      } else {
        updatedMap.set(seg.id, {
          pan: char?.pan ?? (baseSide * 0.3),
          distance: char?.distance ?? 0.15,
        });
      }
    });

    const nextSegments = segments.map((s) => {
      const coords = updatedMap.get(s.id);
      return coords ? { ...s, pan: coords.pan, distance: coords.distance } : s;
    });

    onUpdateSegments(nextSegments);
    const labelMap = {
      approach_walk: 'Applied "Approach Listener" clip-by-clip walk across all dialogue clips.',
      cross_stage: 'Applied "Stereo Cross-Stage Walk" across all dialogue clips.',
      standoff: 'Applied "Dynamic Standoff" clip-by-clip blocking.',
      reset_character_defaults: 'Reset all clips to character base positions.',
    };
    setChoreographyNotice(labelMap[mode]);
  };

  const formatPanLabel = (pan = 0) => {
    if (Math.abs(pan) < 0.05) return 'CENTER';
    return pan < 0 ? `L ${Math.round(Math.abs(pan) * 100)}%` : `R ${Math.round(pan * 100)}%`;
  };

  // Filter SFX clips if user chooses only SFX overlapping active clip
  const visibleSfxClips = useMemo(() => {
    if (showAllSfx || !activeSegment) return sfxClips;
    const segStart = activeSegment.startTime - 1.0;
    const segEnd = activeSegment.startTime + activeSegment.duration + 1.0;
    return sfxClips.filter(
      (sfx) => sfx.startTime <= segEnd && sfx.startTime + sfx.duration >= segStart
    );
  }, [sfxClips, showAllSfx, activeSegment]);

  const activeSpatial = activeSegment ? getSegmentSpatial(activeSegment) : null;

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-950 text-slate-100 max-w-7xl mx-auto space-y-5">
      {/* Top Header & Scene Choreography Presets */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Compass className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold tracking-tight text-white">
              Clip-by-Clip 2D Binaural Soundstage
            </h2>
            <span className="text-xs font-mono text-emerald-400 tabular-nums">
              · {sortedSegments.length} Dialogue Clips
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Step through dialogue clips or press Play to block character movement across the room clip-by-clip with live stereo panning, distance attenuation, and room acoustics.
          </p>
        </div>

        {/* Dynamic Scene Movement Choreography Presets */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
            <Footprints className="w-3.5 h-3.5 text-cyan-400" />
            <span>Scene Choreography:</span>
          </span>
          <button
            type="button"
            onClick={() => applySceneChoreography('approach_walk')}
            className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-cyan-300 transition whitespace-nowrap shrink-0"
            title="Characters start distant and walk closer to the listener clip-by-clip"
          >
            Approach Walk (Far → Near)
          </button>
          <button
            type="button"
            onClick={() => applySceneChoreography('cross_stage')}
            className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-violet-300 transition whitespace-nowrap shrink-0"
            title="Characters cross Left ↔ Right across the stereo stage over the course of the scene"
          >
            Cross-Stage Walk (L ↔ R)
          </button>
          <button
            type="button"
            onClick={() => applySceneChoreography('standoff')}
            className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-amber-300 transition whitespace-nowrap shrink-0"
            title="Wide L/R standoff with subtle per-clip movement shifts"
          >
            Dynamic Standoff
          </button>
          <button
            type="button"
            onClick={() => applySceneChoreography('reset_character_defaults')}
            className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-400 hover:text-white transition flex items-center gap-1 whitespace-nowrap shrink-0"
            title="Reset all dialogue clips to their character's base position"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset Base</span>
          </button>
        </div>
      </div>

      {/* Clip-by-Clip Scrubber & Stepper Ribbon */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (activeSegmentIndex > 0) {
                  selectClip(sortedSegments[activeSegmentIndex - 1].id, true);
                }
              }}
              disabled={activeSegmentIndex <= 0}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 transition"
              title="Previous Dialogue Clip"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="text-xs font-mono tabular-nums text-white font-bold">
              {sortedSegments.length > 0
                ? `CLIP #${activeSegmentIndex + 1} OF ${sortedSegments.length}`
                : 'NO DIALOGUE CLIPS'}
            </div>

            <button
              type="button"
              onClick={() => {
                if (activeSegmentIndex < sortedSegments.length - 1) {
                  selectClip(sortedSegments[activeSegmentIndex + 1].id, true);
                }
              }}
              disabled={activeSegmentIndex >= sortedSegments.length - 1}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 transition"
              title="Next Dialogue Clip"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            {activeSegment && (
              <div className="flex items-center gap-2 ml-2 pl-2 border-l border-slate-800">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: activeSpatial?.color || '#06b6d4' }}
                />
                <span className="text-xs font-bold text-white">{activeSegment.speaker}</span>
                <span className="text-xs font-mono tabular-nums text-slate-400">
                  · {formatTimecode(activeSegment.startTime)}
                </span>
                <span className="text-xs text-slate-300 italic truncate max-w-xs sm:max-w-md">
                  "{activeSegment.text}"
                </span>
              </div>
            )}
          </div>

          {/* Playback & Stage Display Toggles */}
          <div className="flex items-center gap-2 flex-wrap">
            {activeSegment && (
              <button
                type="button"
                onClick={() => onPreviewSegment(activeSegment)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 text-xs font-semibold transition whitespace-nowrap"
                title="Audition this specific dialogue clip at its 2D position"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>Audition Clip #{activeSegmentIndex + 1}</span>
              </button>
            )}

            {onPlayPause && (
              <button
                type="button"
                onClick={onPlayPause}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition whitespace-nowrap ${
                  isPlaying
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                    : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                }`}
                title="Play/Pause timeline to watch characters move clip-by-clip"
              >
                {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                <span>{isPlaying ? 'Pause Scene' : 'Play Scene Walk'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setFollowPlayhead((v) => !v)}
              className={`px-2 py-1 rounded-lg text-[11px] font-mono border transition ${
                followPlayhead
                  ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300'
                  : 'bg-slate-950 border-slate-800 text-slate-400'
              }`}
              title="Automatically step through clips as the scene playhead moves"
            >
              Follow Playhead: {followPlayhead ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>

        {/* Horizontal Clip Sequence Pills */}
        {sortedSegments.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5">
            {sortedSegments.map((seg, idx) => {
              const isSelected = seg.id === activeSegment?.id;
              const spatial = getSegmentSpatial(seg);
              // Check if character moved since their previous clip
              const prevSameSpeaker = sortedSegments
                .slice(0, idx)
                .reverse()
                .find((s) => s.speaker.toUpperCase() === seg.speaker.toUpperCase());
              const prevSpatial = prevSameSpeaker ? getSegmentSpatial(prevSameSpeaker) : null;
              const didMove =
                prevSpatial &&
                (Math.abs(prevSpatial.pan - spatial.pan) >= 0.06 ||
                  Math.abs(prevSpatial.distance - spatial.distance) >= 0.06);

              return (
                <button
                  key={seg.id}
                  type="button"
                  onClick={() => selectClip(seg.id, true)}
                  className={`px-2.5 py-1.5 rounded-lg border text-left transition flex items-center gap-1.5 shrink-0 ${
                    isSelected
                      ? 'bg-slate-800 border-cyan-400 text-white shadow-sm'
                      : 'bg-slate-950/90 border-slate-800/90 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: spatial.color }}
                  />
                  <span className="text-[11px] font-mono tabular-nums font-bold text-slate-200">
                    #{idx + 1}
                  </span>
                  <span className="text-[11px] font-semibold truncate max-w-[82px]">
                    {seg.speaker}
                  </span>
                  <span className="text-[10px] font-mono tabular-nums text-cyan-400">
                    {formatPanLabel(spatial.pan)}
                  </span>
                  {didMove && (
                    <span
                      className="text-[9px] font-mono text-amber-300"
                      title="Character moved position from their previous clip"
                    >
                      ↗
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {choreographyNotice && (
        <div className="px-3.5 py-2 rounded-lg bg-emerald-950/60 border border-emerald-700/60 text-xs text-emerald-200 flex items-center justify-between">
          <span className="font-mono">{choreographyNotice}</span>
          <button
            type="button"
            onClick={() => setChoreographyNotice(null)}
            className="text-[11px] text-emerald-400 hover:text-white underline ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left 2 Columns: Interactive 2D Soundstage Canvas */}
        <div className="lg:col-span-2 space-y-3">
          {/* Canvas Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setStageMode('active_scene')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition ${
                  stageMode === 'active_scene'
                    ? 'bg-cyan-950/80 border-cyan-500/60 text-cyan-200'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Clip #{activeSegmentIndex + 1} Blocking + Path</span>
              </button>
              <button
                type="button"
                onClick={() => setStageMode('all_clips')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition ${
                  stageMode === 'all_clips'
                    ? 'bg-violet-950/80 border-violet-500/60 text-violet-200'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>All Clips Pin Map ({sortedSegments.length})</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowMovementPaths((v) => !v)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-mono transition ${
                  showMovementPaths
                    ? 'bg-amber-950/60 border-amber-500/50 text-amber-300'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
              >
                <Navigation className="w-3 h-3" />
                <span>Movement Trajectory: {showMovementPaths ? 'ON' : 'OFF'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowAllSfx((v) => !v)}
                className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-400 hover:text-slate-200 transition"
              >
                SFX: {showAllSfx ? 'All Scene' : 'Active Clip Only'}
              </button>
            </div>
          </div>

          <div
            ref={stageRef}
            className="relative w-full h-[460px] rounded-xl bg-slate-900/90 border border-slate-800 overflow-hidden select-none shadow-inner"
          >
            {/* Acoustic Depth Rings, Stereo Axis Grid & Movement Trajectory Vectors */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
              <defs>
                <radialGradient id="stageGlow" cx="50%" cy="92%" r="75%">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.18" />
                  <stop offset="55%" stopColor="#8b5cf6" stopOpacity="0.06" />
                  <stop offset="100%" stopColor="#020617" stopOpacity="0" />
                </radialGradient>
                <marker
                  id="trajArrow"
                  viewBox="0 0 10 10"
                  refX="6"
                  refY="5"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#38bdf8" />
                </marker>
              </defs>

              <rect width="100%" height="100%" fill="url(#stageGlow)" />

              {/* Center Stereo Axis */}
              <line
                x1="50%"
                y1="0"
                x2="50%"
                y2="100%"
                stroke="#334155"
                strokeOpacity="0.5"
                strokeDasharray="4 4"
              />
              {/* Distance Arcs from Listener */}
              <circle
                cx="50%"
                cy="92%"
                r="120"
                fill="none"
                stroke="#334155"
                strokeOpacity="0.5"
                strokeDasharray="3 3"
              />
              <circle
                cx="50%"
                cy="92%"
                r="240"
                fill="none"
                stroke="#334155"
                strokeOpacity="0.5"
                strokeDasharray="3 3"
              />
              <circle
                cx="50%"
                cy="92%"
                r="360"
                fill="none"
                stroke="#334155"
                strokeOpacity="0.5"
                strokeDasharray="3 3"
              />

              {/* Movement Trajectory Lines for Active Speaker (or All Speakers in Pin Map mode) */}
              {showMovementPaths &&
                stageMode === 'active_scene' &&
                activeSpeakerClips.length > 1 &&
                activeSpeakerClips.map((pt, idx) => {
                  if (idx === 0) return null;
                  const prev = activeSpeakerClips[idx - 1];
                  const from = toStageCoords(prev.pan, prev.distance);
                  const to = toStageCoords(pt.pan, pt.distance);
                  return (
                    <line
                      key={`traj-${prev.seg.id}-${pt.seg.id}`}
                      x1={`${from.leftPct}%`}
                      y1={`${from.topPct}%`}
                      x2={`${to.leftPct}%`}
                      y2={`${to.topPct}%`}
                      stroke={pt.color}
                      strokeWidth="2"
                      strokeDasharray="5 4"
                      strokeOpacity="0.75"
                      markerEnd="url(#trajArrow)"
                    />
                  );
                })}

              {showMovementPaths &&
                stageMode === 'all_clips' &&
                characters.map((char) => {
                  const charClips = sortedSegments
                    .filter((s) => s.speaker.toUpperCase() === char.name.toUpperCase())
                    .map((s) => ({ s, ...getSegmentSpatial(s) }));
                  if (charClips.length < 2) return null;
                  return charClips.map((pt, idx) => {
                    if (idx === 0) return null;
                    const prev = charClips[idx - 1];
                    const from = toStageCoords(prev.pan, prev.distance);
                    const to = toStageCoords(pt.pan, pt.distance);
                    return (
                      <line
                        key={`alltraj-${prev.s.id}-${pt.s.id}`}
                        x1={`${from.leftPct}%`}
                        y1={`${from.topPct}%`}
                        x2={`${to.leftPct}%`}
                        y2={`${to.topPct}%`}
                        stroke={char.color}
                        strokeWidth="1.75"
                        strokeDasharray="4 4"
                        strokeOpacity="0.55"
                      />
                    );
                  });
                })}
            </svg>

            {/* Zone Labels */}
            <div className="absolute top-3 left-4 text-[11px] font-mono text-slate-500 pointer-events-none">
              FAR LEFT · DISTANT REVERB ZONE
            </div>
            <div className="absolute top-3 right-4 text-[11px] font-mono text-slate-500 pointer-events-none">
              FAR RIGHT · DISTANT REVERB ZONE
            </div>
            <div className="absolute bottom-14 left-4 text-[11px] font-mono text-slate-500 pointer-events-none">
              HARD LEFT (-100%)
            </div>
            <div className="absolute bottom-14 right-4 text-[11px] font-mono text-slate-500 pointer-events-none">
              HARD RIGHT (+100%)
            </div>

            {/* Listener Sweet Spot Anchor (Bottom Center) */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none">
              <div className="w-10 h-10 rounded-full bg-cyan-950/90 border border-cyan-500/60 flex items-center justify-center text-cyan-300 shadow-lg">
                <Headphones className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-mono text-cyan-300 mt-1 tracking-wider">
                LISTENER SWEET SPOT (0.0m)
              </span>
            </div>

            {/* Draggable SFX Tokens */}
            {visibleSfxClips.map((clip) => {
              const pan = clip.pan ?? 0;
              const distance = clip.distance ?? 0.25;
              const { leftPct, topPct } = toStageCoords(pan, distance);

              return (
                <div
                  key={clip.id}
                  onMouseDown={(e) => handleStagePointerDown(e, 'sfx', clip.id)}
                  style={{ left: `${leftPct}%`, top: `${topPct}%` }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing group z-10"
                >
                  <div className="px-2.5 py-1 rounded-lg bg-emerald-950/90 border border-emerald-500/70 text-emerald-200 shadow-md flex items-center gap-1.5 hover:border-emerald-300 transition">
                    <Radio className="w-3 h-3 text-emerald-400" />
                    <span className="text-[10px] font-semibold whitespace-nowrap">
                      {clip.name}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAuditionSfxInSpace(clip);
                      }}
                      className="p-0.5 rounded bg-emerald-900/80 hover:bg-emerald-800 text-emerald-200"
                      title="Hear SFX at this 2D position"
                    >
                      <Play className="w-2.5 h-2.5 fill-current" />
                    </button>
                  </div>
                  <div className="text-[9px] font-mono text-center text-emerald-400/90 mt-0.5 tabular-nums">
                    {formatPanLabel(pan)} · {Math.round(distance * 10)}m
                  </div>
                </div>
              );
            })}

            {/* Waypoint Ghost Nodes for the Active Speaker's Other Clips in the Scene */}
            {stageMode === 'active_scene' &&
              showMovementPaths &&
              activeSpeakerClips.map((wp) => {
                if (wp.seg.id === activeSegment?.id) return null;
                const { leftPct, topPct } = toStageCoords(wp.pan, wp.distance);
                return (
                  <div
                    key={`wp-${wp.seg.id}`}
                    onMouseDown={(e) => handleStagePointerDown(e, 'seg', wp.seg.id)}
                    style={{ left: `${leftPct}%`, top: `${topPct}%` }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing z-15 group"
                    title={`Clip #${wp.clipNumber} (${wp.seg.speaker}): "${wp.seg.text}" — Click or drag to adjust this waypoint`}
                  >
                    <div
                      style={{ borderColor: wp.color }}
                      className="px-2 py-0.5 rounded-md bg-slate-950/90 border border-dashed text-[10px] font-mono tabular-nums text-slate-300 hover:text-white hover:scale-110 transition flex items-center gap-1 shadow"
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: wp.color }}
                      />
                      <span>#{wp.clipNumber}</span>
                    </div>
                  </div>
                );
              })}

            {/* MODE 1: Active Clip + Cast Scene Positions */}
            {stageMode === 'active_scene' &&
              castStageTokens.map((token) => {
                const { leftPct, topPct } = toStageCoords(token.pan, token.distance);
                const presetInfo =
                  ACOUSTIC_PRESETS.find((p) => p.id === token.acousticPreset) ||
                  ACOUSTIC_PRESETS[0];

                return (
                  <div
                    key={token.char.id}
                    onMouseDown={(e) => {
                      if (token.segment) {
                        handleStagePointerDown(e, 'seg', token.segment.id);
                      }
                    }}
                    style={{ left: `${leftPct}%`, top: `${topPct}%` }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing transition-all duration-150 ${
                      token.isSpeakingNow ? 'z-30 scale-105' : 'z-20 opacity-85 hover:opacity-100'
                    }`}
                  >
                    <div
                      style={{ borderColor: token.char.color }}
                      className={`px-3 py-2 rounded-xl bg-slate-950/95 border-2 shadow-xl flex flex-col items-center gap-1 min-w-[132px] ${
                        token.isSpeakingNow
                          ? 'ring-2 ring-cyan-400/70 shadow-cyan-950/50'
                          : ''
                      }`}
                    >
                      <div className="flex items-center justify-between w-full gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: token.char.color }}
                          />
                          <span className="font-bold text-xs text-white truncate">
                            {token.char.name}
                          </span>
                        </div>
                        <span
                          className={`text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded ${
                            token.isSpeakingNow
                              ? 'bg-cyan-500/20 text-cyan-300 font-bold'
                              : 'bg-slate-900 text-slate-400'
                          }`}
                        >
                          {token.clipNumber ? `Clip #${token.clipNumber}` : 'Idle'}
                        </span>
                      </div>

                      {token.segment && (
                        <div className="text-[10px] text-slate-300 italic truncate max-w-[160px]">
                          "{token.segment.text}"
                        </div>
                      )}

                      <div className="flex items-center justify-between w-full gap-2 pt-0.5 border-t border-slate-800/80 text-[10px] font-mono text-slate-400 tabular-nums">
                        <span>
                          {formatPanLabel(token.pan)} · {Math.round(token.distance * 10)}m ·{' '}
                          {presetInfo.shortLabel}
                        </span>
                        {token.segment && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onPreviewSegment(token.segment!);
                            }}
                            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400 shrink-0"
                            title={`Audition Clip #${token.clipNumber} at this 2D position`}
                          >
                            <Play className="w-2.5 h-2.5 fill-current" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

            {/* MODE 2: All Dialogue Clips Pin Map */}
            {stageMode === 'all_clips' &&
              sortedSegments.map((seg, idx) => {
                const spatial = getSegmentSpatial(seg);
                const { leftPct, topPct } = toStageCoords(spatial.pan, spatial.distance);
                const isSelected = seg.id === activeSegment?.id;

                return (
                  <div
                    key={seg.id}
                    onMouseDown={(e) => handleStagePointerDown(e, 'seg', seg.id)}
                    style={{ left: `${leftPct}%`, top: `${topPct}%` }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing transition-transform ${
                      isSelected ? 'z-30 scale-110' : 'z-20 hover:scale-105'
                    }`}
                  >
                    <div
                      style={{ borderColor: spatial.color }}
                      className={`px-2.5 py-1.5 rounded-xl bg-slate-950/95 border-2 shadow-lg flex items-center gap-1.5 ${
                        isSelected ? 'ring-2 ring-cyan-400' : ''
                      }`}
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: spatial.color }}
                      />
                      <span className="text-[11px] font-mono tabular-nums font-bold text-white">
                        #{idx + 1}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-200 max-w-[75px] truncate">
                        {seg.speaker}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onPreviewSegment(seg);
                        }}
                        className="p-0.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400"
                        title={`Audition Clip #${idx + 1}: "${seg.text}"`}
                      >
                        <Play className="w-2.5 h-2.5 fill-current" />
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Right Column: Active Clip Spatial Inspector & Chronological Clip Blocking List */}
        <div className="space-y-4">
          {/* Active Clip Spatial Blocking Card */}
          {activeSegment && activeSpatial ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3.5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: activeSpatial.color }}
                  />
                  <div className="truncate">
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>
                        Clip #{activeSegmentIndex + 1} · {activeSegment.speaker}
                      </span>
                      <span className="text-[11px] font-mono tabular-nums text-slate-400">
                        ({formatTimecode(activeSegment.startTime)})
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 italic truncate">
                      "{activeSegment.text}"
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onPreviewSegment(activeSegment)}
                  className="p-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 shrink-0"
                  title="Audition this clip with its 2D Pan, Distance & Room Reverb"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                </button>
              </div>

              {/* Pan & Distance Sliders for Selected Clip */}
              <div className="grid grid-cols-2 gap-3 text-xs font-mono tabular-nums">
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Clip Pan:</span>
                    <span className="text-cyan-400 font-bold">
                      {formatPanLabel(activeSpatial.pan)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="-1"
                    max="1"
                    step="0.05"
                    value={activeSpatial.pan}
                    onChange={(e) =>
                      onUpdateSegment({
                        ...activeSegment,
                        pan: parseFloat(e.target.value),
                      })
                    }
                    className="w-full h-1.5 bg-slate-800 rounded appearance-none cursor-pointer accent-cyan-400"
                  />
                  <div className="flex justify-between text-[9px] text-slate-500">
                    <span>L 100%</span>
                    <span>C</span>
                    <span>R 100%</span>
                  </div>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Clip Depth:</span>
                    <span className="text-amber-400 font-bold">
                      {Math.round(activeSpatial.distance * 100)}% ({Math.round(activeSpatial.distance * 10)}m)
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="0.9"
                    step="0.05"
                    value={activeSpatial.distance}
                    onChange={(e) =>
                      onUpdateSegment({
                        ...activeSegment,
                        distance: parseFloat(e.target.value),
                      })
                    }
                    className="w-full h-1.5 bg-slate-800 rounded appearance-none cursor-pointer accent-amber-400"
                  />
                  <div className="flex justify-between text-[9px] text-slate-500">
                    <span>0m Close</span>
                    <span>4.5m</span>
                    <span>9m Far</span>
                  </div>
                </div>
              </div>

              {/* Quick Single-Clip Movement Buttons */}
              <div className="space-y-1.5">
                <span className="text-[11px] text-slate-400 font-medium">
                  Quick Position / Movement for Clip #{activeSegmentIndex + 1}:
                </span>
                <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateSegment({
                        ...activeSegment,
                        distance: Math.max(0.05, Math.round((activeSpatial.distance - 0.2) * 100) / 100),
                      })
                    }
                    className="px-2 py-1.5 rounded bg-slate-950 hover:bg-slate-800 border border-slate-800 text-cyan-300 transition"
                  >
                    Step Closer
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateSegment({
                        ...activeSegment,
                        distance: Math.min(0.88, Math.round((activeSpatial.distance + 0.22) * 100) / 100),
                      })
                    }
                    className="px-2 py-1.5 rounded bg-slate-950 hover:bg-slate-800 border border-slate-800 text-amber-300 transition"
                  >
                    Step Back
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateSegment({
                        ...activeSegment,
                        pan: 0,
                        distance: 0.12,
                      })
                    }
                    className="px-2 py-1.5 rounded bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200 transition"
                  >
                    Center Close
                  </button>
                </div>
              </div>

              {/* Movement Path Propagation Tools */}
              <div className="pt-2 border-t border-slate-800 space-y-1.5">
                <span className="text-[11px] text-slate-400 font-medium">
                  Character Path Continuity ({activeSegment.speaker}):
                </span>
                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={handleCarryPositionForward}
                    className="w-full px-3 py-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/70 border border-emerald-600/40 text-emerald-200 text-xs font-medium flex items-center justify-between transition"
                    title="Keep this character at this new position for their remaining clips in the scene"
                  >
                    <span className="flex items-center gap-1.5">
                      <CopyCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Carry Position Forward (Remaining {activeSegment.speaker} Clips)</span>
                    </span>
                    <span className="font-mono text-[10px] text-emerald-400">Apply →</span>
                  </button>

                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      disabled={!previousSameSpeakerClip}
                      onClick={handleMatchPreviousClipPosition}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 disabled:opacity-40 border border-slate-800 text-slate-300 text-[11px] flex items-center justify-center gap-1 transition"
                      title="Snap this clip back to where this character stood in their previous line"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>
                        {previousSameSpeakerClip
                          ? `Match Clip #${previousSameSpeakerClip.clipNumber}`
                          : 'First Line'}
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={activeSpeakerClips.length < 2}
                      onClick={handleInterpolateSpeakerWalk}
                      className="px-2.5 py-1.5 rounded-lg bg-violet-950/60 hover:bg-violet-900/70 disabled:opacity-40 border border-violet-600/40 text-violet-200 text-[11px] flex items-center justify-center gap-1 transition"
                      title="Smoothly interpolate a walking path between this character's first and last clip"
                    >
                      <GitCommit className="w-3 h-3 text-violet-400" />
                      <span>Interpolate Walk</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Per-Clip vs Scene Acoustic Environment (DSP) */}
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-white flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-violet-400" />
                    <span>Clip Acoustic Environment (DSP)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onApplyRoomPresetToAll(activeSpatial.acousticPreset)}
                    className="text-[10px] font-mono text-violet-300 hover:text-white underline"
                    title="Apply this clip's room acoustic preset to all clips in the scene"
                  >
                    Apply to All Clips
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  {ACOUSTIC_PRESETS.map((preset) => {
                    const isSelected = activeSpatial.acousticPreset === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() =>
                          onUpdateSegment({
                            ...activeSegment,
                            acousticPreset: preset.id,
                          })
                        }
                        className={`p-2 rounded-lg border text-left transition ${
                          isSelected
                            ? 'bg-violet-950/60 border-violet-500 text-white'
                            : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div className="font-semibold text-[11px] text-white truncate">
                          {preset.shortLabel}
                        </div>
                        <div className="text-[9px] text-slate-400 truncate">
                          {preset.description}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center text-xs text-slate-400">
              No dialogue clips available. Add or parse a script to block clips in 2D space.
            </div>
          )}

          {/* Scene Clip-by-Clip Blocking Schedule */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-xs text-white">
                Scene Clip Blocking Schedule ({sortedSegments.length})
              </h3>
              <span className="text-[10px] font-mono text-slate-400">Click to select clip</span>
            </div>

            <div className="space-y-1.5 max-h-[250px] overflow-y-auto pr-1">
              {sortedSegments.map((seg, idx) => {
                const isSelected = seg.id === activeSegment?.id;
                const spatial = getSegmentSpatial(seg);
                const presetObj =
                  ACOUSTIC_PRESETS.find((p) => p.id === spatial.acousticPreset) ||
                  ACOUSTIC_PRESETS[0];

                return (
                  <div
                    key={seg.id}
                    onClick={() => selectClip(seg.id, true)}
                    className={`p-2 rounded-lg border text-xs cursor-pointer transition flex items-center justify-between gap-2 ${
                      isSelected
                        ? 'bg-slate-800/90 border-cyan-500/70 text-white'
                        : 'bg-slate-950 border-slate-800/90 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: spatial.color }}
                        />
                        <span className="font-mono font-bold text-[11px] text-slate-200 tabular-nums">
                          #{idx + 1}
                        </span>
                        <span className="font-bold text-[11px] text-white truncate">
                          {seg.speaker}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500 tabular-nums">
                          {formatTimecode(seg.startTime)}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 truncate italic mt-0.5">
                        "{seg.text}"
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 font-mono text-[10px] tabular-nums">
                      <div className="text-right">
                        <div className="text-cyan-400">{formatPanLabel(spatial.pan)}</div>
                        <div className="text-slate-400">
                          {Math.round(spatial.distance * 10)}m · {presetObj.shortLabel}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onPreviewSegment(seg);
                        }}
                        className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400"
                        title="Audition Clip"
                      >
                        <Play className="w-3 h-3 fill-current" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
