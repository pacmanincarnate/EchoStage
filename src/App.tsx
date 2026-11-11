import React, { useState, useEffect, useRef } from 'react';
import {
  DramaProject,
  AudioSegment,
  CharacterVoice,
  SfxClip,
  PrebuiltVoiceName,
  AVAILABLE_VOICES,
  SfxType,
  PRESET_CUSTOM_VOICES,
  StudioSettings,
  DEFAULT_STUDIO_SETTINGS,
  DEFAULT_TENSION_CURVES,
  TensionNode,
  AudioTake,
  AcousticPreset,
} from './types/drama';
import { DramaAudioEngine } from './utils/audioEngine';
import {
  decodeBase64Audio,
  extractWaveformPeaks,
  sliceSceneAudioBuffer,
  audioBufferToBase64,
  decodeUploadedAudioFile,
  measureAudioBufferLufs,
  normalizeAllSegmentsLufs,
} from './utils/wavHelper';
import { generateProceduralSfx } from './utils/sfxGenerator';
import { generateAtmosphericTrack, MUSIC_THEMES } from './utils/ambientMusicGenerator';
import { synthesizeProceduralSpeech, speakBrowserSpeech } from './utils/speechSynthesizer';
import { parseTranscriptToDrama } from './utils/transcriptParser';
import {
  estimateSpokenDuration,
  rippleAlignSegments,
  smartDeltaRippleSegments,
  calculateTotalProjectDuration,
  diffSyncTranscriptToProject,
  applyTensionCurveToSegments,
} from './utils/timelineUtils';
import {
  saveProjectToStorage,
  getStoredProjectRaw,
  rehydrateProjectFromStorage,
  clearStoredProject,
  SavedProjectSummary,
  getLibraryProjectsSync,
  listLibraryProjects,
  loadProjectFromLibrary,
  duplicateProjectInLibrary,
  deleteProjectFromLibrary,
  importProjectJsonToLibrary,
  saveProjectRecordToLibrary,
  getRawProjectFromLibrary,
  updateProjectMetadataInLibrary,
} from './utils/projectStorage';
import { SAMPLE_DRAMAS } from './utils/sampleDramas';

import { HeaderBar, StudioTab } from './components/HeaderBar';
import { Timeline } from './components/Timeline';
import { ScriptParserView } from './components/ScriptParserView';
import { BinauralStageView } from './components/BinauralStageView';
import { VoiceCustomizer } from './components/VoiceCustomizer';
import { MusicGeneratorPanel } from './components/MusicGeneratorPanel';
import { ClipEditorModal } from './components/ClipEditorModal';
import { ExportModal } from './components/ExportModal';
import { NewProjectModal } from './components/NewProjectModal';
import { StudioSettingsModal } from './components/StudioSettingsModal';
import { QueueProgressBar, QueueProgressState } from './components/QueueProgressBar';
import { ProjectLibraryView } from './components/ProjectLibraryView';

export default function App() {
  // Global Audio Playback Engine
  const audioEngineRef = useRef<DramaAudioEngine | null>(null);
  if (!audioEngineRef.current) {
    audioEngineRef.current = new DramaAudioEngine();
  }
  const engine = audioEngineRef.current;

  // Active view tab
  const [activeTab, setActiveTab] = useState<StudioTab>('timeline');

  // Transport playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [masterVolume, setMasterVolume] = useState<number>(1.0);

  // Auto-Save Status & Timestamp
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'warning' | 'idle'>('saved');
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(() => {
    return getStoredProjectRaw().lastSaved;
  });

  // Saved Projects Library State
  const [libraryProjects, setLibraryProjects] = useState<SavedProjectSummary[]>(() =>
    getLibraryProjectsSync()
  );
  const [isLoadingLibraryProject, setIsLoadingLibraryProject] = useState<boolean>(false);

  // Script text in transcript editor
  const [transcript, setTranscript] = useState<string>(() => {
    const stored = getStoredProjectRaw();
    if (stored.transcript && typeof stored.transcript === 'string') {
      return stored.transcript;
    }
    return SAMPLE_DRAMAS.cyberpunk.transcript;
  });
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [isDirectingSubtext, setIsDirectingSubtext] = useState<boolean>(false);
  const [subtextSummary, setSubtextSummary] = useState<string | null>(null);
  const [normalizationSummary, setNormalizationSummary] = useState<string | null>(null);
  const [lastDiffStats, setLastDiffStats] = useState<{
    unchanged: number;
    modified: number;
    added: number;
    removed: number;
  } | null>(null);

  // Batch TTS generation state
  const [isGeneratingAll, setIsGeneratingAll] = useState<boolean>(false);
  const [generationProgress, setGenerationProgress] = useState<{ current: number; total: number }>({
    current: 0,
    total: 0,
  });
  const [rateLimitCooldown, setRateLimitCooldown] = useState<number>(0);

  // Rate limit countdown timer
  useEffect(() => {
    if (rateLimitCooldown <= 0) return;
    const timer = setInterval(() => {
      setRateLimitCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [rateLimitCooldown]);

  // Music preview state
  const [isPreviewingMusic, setIsPreviewingMusic] = useState<boolean>(false);
  const musicStopFnRef = useRef<(() => void) | null>(null);

  // Modals & Stage Focus
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [stageSelectedSegmentId, setStageSelectedSegmentId] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [showNewProjectModal, setShowNewProjectModal] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);

  // Studio Settings (Persistent)
  const [studioSettings, setStudioSettings] = useState<StudioSettings>(() => {
    try {
      const stored = localStorage.getItem('drama_studio_settings_v1');
      if (stored) return { ...DEFAULT_STUDIO_SETTINGS, ...JSON.parse(stored) };
    } catch (e) {}
    return DEFAULT_STUDIO_SETTINGS;
  });

  const handleUpdateStudioSettings = (newSettings: Partial<StudioSettings>) => {
    setStudioSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      try {
        localStorage.setItem('drama_studio_settings_v1', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  // Background Rendering Queue State
  const [queueState, setQueueState] = useState<QueueProgressState>({
    isActive: false,
    isPaused: false,
    isCoolingDown: false,
    cooldownSeconds: 0,
    currentStep: 0,
    totalSteps: 0,
    currentSpeaker: undefined,
    isBatchScene: false,
    model: studioSettings.ttsModel,
  });

  const queueCancelledRef = useRef<boolean>(false);
  const queuePausedRef = useRef<boolean>(false);

  // Core Audio Drama Project State
  const [project, setProject] = useState<DramaProject>(() => {
    const stored = getStoredProjectRaw();
    if (stored.project && stored.project.id && Array.isArray(stored.project.segments)) {
      return {
        ...stored.project,
        tensionCurve:
          stored.project.tensionCurve && stored.project.tensionCurve.length > 0
            ? stored.project.tensionCurve
            : DEFAULT_TENSION_CURVES.rising_climax.nodes,
        customVoices:
          stored.project.customVoices && stored.project.customVoices.length > 0
            ? stored.project.customVoices
            : PRESET_CUSTOM_VOICES,
      };
    }

    const initialPreset = SAMPLE_DRAMAS.cyberpunk;
    const initialCharacters: CharacterVoice[] = (
      initialPreset.characters || [
        {
          id: 'char-1',
          name: 'VEX',
          voiceName: 'Puck',
          stylePrompt: 'Daring gritty netrunner',
          color: '#06b6d4',
          pan: -0.3,
          distance: 0.15,
          acousticPreset: 'studio_dry',
        },
        {
          id: 'char-2',
          name: 'NYX',
          voiceName: 'Kore',
          stylePrompt: 'Breathless tense scout',
          color: '#ec4899',
          pan: 0.3,
          distance: 0.2,
          acousticPreset: 'walkie_talkie',
        },
        {
          id: 'char-3',
          name: 'AI OVERLORD',
          voiceName: 'Charon',
          stylePrompt: 'Cold robotic mainframe voice',
          color: '#a855f7',
          pan: 0,
          distance: 0.35,
          acousticPreset: 'cyber_modulator',
        },
      ]
    ).map((c, idx) => ({
      ...c,
      pan: c.pan ?? (idx === 0 ? -0.3 : idx === 1 ? 0.3 : 0),
      distance: c.distance ?? 0.15,
      acousticPreset: c.acousticPreset ?? 'studio_dry',
    }));

    const rawLines = initialPreset.transcript.split('\n').filter((l) => l.trim().length > 0);
    const initialSegments: AudioSegment[] = [];
    let runningTime = 0.5;

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i].trim();
      if (line.startsWith('[') && line.endsWith(']')) {
        continue;
      }
      const match = line.match(/^([^:(]+)(?:\(([^)]+)\))?:\s*(.+)$/i);
      if (match) {
        const speaker = match[1].trim().toUpperCase();
        const emotion = match[2] ? match[2].trim() : '';
        const text = match[3].trim();
        const char = initialCharacters.find((c) => c.name.toUpperCase() === speaker);
        const voice = char ? char.voiceName : 'Puck';
        const estDuration = estimateSpokenDuration(text);

        const basePan = char?.pan ?? 0;
        const baseDist = char?.distance ?? 0.15;
        // Subtle clip-by-clip movement progression so characters naturally move in the scene
        const clipShiftPan = Math.max(
          -0.85,
          Math.min(0.85, Math.round((basePan + ((i % 3) - 1) * 0.14) * 100) / 100)
        );
        const clipShiftDist = Math.max(
          0.06,
          Math.min(0.8, Math.round((baseDist + (i % 2 === 0 ? 0.12 : -0.04)) * 100) / 100)
        );

        initialSegments.push({
          id: `seg-${i}-${Date.now()}`,
          speaker,
          text,
          stylePrompt: emotion || char?.stylePrompt || 'Dramatic performance',
          voiceName: voice,
          startTime: runningTime,
          duration: estDuration,
          volume: 1.0,
          pan: clipShiftPan,
          distance: clipShiftDist,
          acousticPreset: char?.acousticPreset ?? 'studio_dry',
          pauseAfterSec: 0.45,
        });

        runningTime += estDuration + 0.45;
      }
    }

    const alignedSegments = rippleAlignSegments(initialSegments, 0.45);
    const calculatedDuration = calculateTotalProjectDuration(alignedSegments, []);

    return {
      id: initialPreset.id || 'drama-cyberpunk',
      title: initialPreset.title || 'Neon Vault 7: The Final Decryption',
      genre: initialPreset.genre || 'Cyberpunk Thriller',
      totalDuration: Math.max(25, calculatedDuration),
      characters: initialCharacters,
      customVoices: PRESET_CUSTOM_VOICES,
      segments: alignedSegments,
      tensionCurve: DEFAULT_TENSION_CURVES.rising_climax.nodes,
      musicTrack: {
        enabled: true,
        prompt: MUSIC_THEMES.cyberpunk.defaultPrompt,
        genre: 'Cyberpunk Synthwave',
        modelType: 'clip',
        durationSeconds: 30,
        volume: 0.35,
        ducking: true,
        duckingAmount: 0.2,
      },
      sfxClips: [
        {
          id: 'sfx-init-1',
          name: 'Sci-Fi Hum',
          type: 'sci_fi_hum',
          startTime: 1.5,
          duration: 4,
          volume: 0.5,
          pan: -0.25,
          distance: 0.2,
        },
        {
          id: 'sfx-init-2',
          name: 'Footsteps',
          type: 'footsteps',
          startTime: 10.2,
          duration: 3,
          volume: 0.7,
          pan: 0.35,
          distance: 0.15,
        },
      ],
    };
  });

  const editingSegment = editingSegmentId
    ? project.segments.find((s) => s.id === editingSegmentId) || null
    : null;

  // Calculate and sync project totalDuration based on segments, music, and SFX
  useEffect(() => {
    let maxTime = 15;
    for (const seg of project.segments) {
      const end = seg.startTime + seg.duration;
      if (end > maxTime) maxTime = end;
    }
    for (const sfx of project.sfxClips) {
      const end = sfx.startTime + sfx.duration;
      if (end > maxTime) maxTime = end;
    }
    if (project.musicTrack.enabled && project.musicTrack.durationSeconds) {
      if (project.musicTrack.durationSeconds > maxTime) {
        maxTime = project.musicTrack.durationSeconds;
      }
    }

    const rounded = Math.ceil(maxTime + 1.5);
    if (rounded !== project.totalDuration) {
      setProject((prev) => ({ ...prev, totalDuration: rounded }));
    }
  }, [
    project.segments,
    project.sfxClips,
    project.musicTrack.durationSeconds,
    project.musicTrack.enabled,
  ]);

  // Connect Audio Engine Playhead updates to UI
  useEffect(() => {
    engine.onTimeUpdate((time) => {
      setCurrentTime(time);
    });
    engine.onEnded(() => {
      setIsPlaying(false);
      setCurrentTime(0);
    });
  }, [engine]);

  // Master volume sync
  const handleVolumeChange = (vol: number) => {
    setMasterVolume(vol);
    engine.setMasterVolume(vol);
  };

  // Keyboard shortcut for Play / Pause (Space)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlayPause();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, currentTime, project]);

  // Rehydrate audio buffers from IndexedDB / LocalStorage or initialize backing audio on first load
  useEffect(() => {
    let isCancelled = false;

    async function rehydrateOrInit() {
      const stored = getStoredProjectRaw();
      try {
        const fullyHydrated = await rehydrateProjectFromStorage(stored.project);
        if (!isCancelled && fullyHydrated) {
          setProject((prev) => ({
            ...fullyHydrated,
            tensionCurve:
              fullyHydrated.tensionCurve && fullyHydrated.tensionCurve.length > 0
                ? fullyHydrated.tensionCurve
                : prev.tensionCurve,
          }));
          setSaveStatus('saved');
          const allProjects = await listLibraryProjects();
          if (!isCancelled) setLibraryProjects(allProjects);
          return;
        }
      } catch (rehydrateErr) {
        // First time initialization if no stored project exists yet
      }

      try {
        const updatedSfx = await Promise.all(
          project.sfxClips.map(async (sfx) => {
            if (sfx.audioBuffer) return sfx;
            const buffer = await generateProceduralSfx(
              sfx.type === 'custom' ? 'sci_fi_hum' : sfx.type,
              sfx.duration
            );
            return { ...sfx, audioBuffer: buffer };
          })
        );

        let musicBuf = project.musicTrack.audioBuffer;
        if (!musicBuf) {
          musicBuf = await generateAtmosphericTrack('cyberpunk', 30);
        }

        if (!isCancelled) {
          const initialHydrated: DramaProject = {
            ...project,
            sfxClips: updatedSfx,
            musicTrack: {
              ...project.musicTrack,
              audioBuffer: musicBuf,
            },
          };
          setProject(initialHydrated);
          saveProjectToStorage(initialHydrated, transcript);
          const allProjects = await listLibraryProjects();
          if (!isCancelled) setLibraryProjects(allProjects);
        }
      } catch (e) {
        console.warn('Init backing audio exception:', e);
      }
    }

    rehydrateOrInit();
    return () => {
      isCancelled = true;
    };
  }, []);

  // Auto-Save Effect: Persist project and transcript to IndexedDB + LocalStorage with debounce
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    setSaveStatus('saving');
    const timer = setTimeout(() => {
      const result = saveProjectToStorage(project, transcript);
      if (result.success) {
        setSaveStatus(result.strippedAudio ? 'warning' : 'saved');
        setLastSavedTime(new Date().toISOString());
        setLibraryProjects(getLibraryProjectsSync());
      } else {
        setSaveStatus('idle');
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [project, transcript]);

  // Play / Pause transport toggle
  const togglePlayPause = () => {
    if (isPlaying) {
      engine.pause();
      setIsPlaying(false);
    } else {
      engine.play(
        currentTime,
        project.segments,
        project.musicTrack,
        project.sfxClips,
        project.totalDuration,
        project.characters,
        project.tensionCurve
      );
      setIsPlaying(true);
    }
  };

  const handleStop = () => {
    engine.stop();
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleSeek = (time: number) => {
    const wasPlaying = engine.seek(time);
    setCurrentTime(time);
    if (wasPlaying) {
      engine.play(
        time,
        project.segments,
        project.musicTrack,
        project.sfxClips,
        project.totalDuration,
        project.characters,
        project.tensionCurve
      );
      setIsPlaying(true);
    }
  };

  // Helper to append a new AudioTake to a segment and apply Smart Delta Ripple
  const commitTakeToSegment = (
    segId: string,
    newBuffer: AudioBuffer,
    newBase64: string,
    peaks: number[],
    styleUsed: string,
    sourceType: AudioTake['sourceType'] = 'tts',
    updatedSegmentProps?: Partial<AudioSegment>,
    errorNotice?: string
  ) => {
    setProject((prev) => {
      const existingSeg = prev.segments.find((s) => s.id === segId);
      if (!existingSeg) return prev;

      const oldDuration = existingSeg.duration;
      const newDuration = newBuffer.duration;
      const prevTakes = existingSeg.takes || [];
      const takeNumber = prevTakes.length + 1;

      const newTake: AudioTake = {
        id: `take-${Date.now()}-${takeNumber}`,
        createdAt: new Date().toISOString(),
        label:
          sourceType === 'act_reference'
            ? `Take #${takeNumber} (Mic Prosody)`
            : `Take #${takeNumber}`,
        stylePrompt: styleUsed || existingSeg.stylePrompt || 'Dramatic delivery',
        duration: newDuration,
        audioBase64: newBase64,
        audioBuffer: newBuffer,
        waveformPeaks: peaks,
        sourceType,
      };

      const { integratedLufs } = measureAudioBufferLufs(newBuffer);

      const updatedSegments = prev.segments.map((s) =>
        s.id === segId
          ? {
              ...s,
              ...updatedSegmentProps,
              duration: newDuration,
              audioBase64: newBase64,
              audioBuffer: newBuffer,
              waveformPeaks: peaks,
              measuredLufs: integratedLufs,
              takes: [...prevTakes, newTake],
              activeTakeId: newTake.id,
              isGenerating: false,
              isDirtyText: false,
              error: errorNotice,
            }
          : s
      );

      // Phase 1: Use Smart Delta Ripple instead of destructive global rippleAlign!
      const deltaAdjusted = smartDeltaRippleSegments(
        updatedSegments,
        segId,
        oldDuration,
        newDuration
      );
      const totalDuration = calculateTotalProjectDuration(deltaAdjusted, prev.sfxClips);

      return {
        ...prev,
        segments: deltaAdjusted,
        totalDuration,
      };
    });
  };

  // Preview an individual AudioSegment buffer with its Acoustic DSP, Pan, and Distance
  const handlePreviewBuffer = (seg: AudioSegment) => {
    if (seg.audioBuffer) {
      const char = project.characters.find(
        (c) => c.name.toUpperCase() === seg.speaker.toUpperCase()
      );
      engine.previewBuffer(seg.audioBuffer, seg.volume ?? 1, {
        pan: seg.pan ?? char?.pan ?? 0,
        distance: seg.distance ?? char?.distance ?? 0.15,
        acousticPreset: seg.acousticPreset ?? char?.acousticPreset ?? 'studio_dry',
      });
    } else {
      handleGenerateSingleTts(seg);
    }
  };

  // Helper to render an individual queue item with auto-retry and fallback
  const renderSingleQueueItem = async (seg: AudioSegment) => {
    const char = project.characters.find(
      (c) => c.name.toUpperCase() === seg.speaker.toUpperCase()
    );
    const voiceDescription = seg.voiceDescription || char?.voiceDescription || '';

    let success = false;
    let attempts = 0;

    while (!success && attempts < 2 && !queueCancelledRef.current) {
      attempts++;
      try {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: seg.text,
            voiceName: seg.voiceName,
            speaker: seg.speaker,
            style: seg.stylePrompt,
            voiceDescription,
            model: studioSettings.ttsModel,
          }),
        });

        const data = await res.json();

        if (res.status === 429 || data.isRateLimited) {
          const cooldown = data.retryAfter || 58;
          setRateLimitCooldown(cooldown);

          if (studioSettings.autoRetryOnRateLimit) {
            setQueueState((prev) => ({
              ...prev,
              isCoolingDown: true,
              cooldownSeconds: cooldown,
            }));
            for (let c = cooldown; c > 0; c--) {
              if (queueCancelledRef.current) break;
              setQueueState((prev) => ({ ...prev, cooldownSeconds: c }));
              await new Promise((r) => setTimeout(r, 1000));
            }
            setQueueState((prev) => ({ ...prev, isCoolingDown: false }));
            continue;
          }
        }

        if (data.audioBase64) {
          const buffer = await decodeBase64Audio(data.audioBase64);
          const peaks = extractWaveformPeaks(buffer, 48);
          commitTakeToSegment(seg.id, buffer, data.audioBase64, peaks, seg.stylePrompt, 'tts');
          success = true;
          return;
        }
      } catch (e) {
        console.warn('TTS single line error:', e);
      }
    }

    // Fallback if network or quota prevented direct synthesis
    const synth = await synthesizeProceduralSpeech(seg.text, seg.voiceName);
    const peaks = extractWaveformPeaks(synth.buffer, 48);
    commitTakeToSegment(
      seg.id,
      synth.buffer,
      synth.base64,
      peaks,
      seg.stylePrompt,
      'instant',
      undefined,
      'Instant Voice active (cooldown)'
    );
  };

  // Queue Control Handlers
  const handlePauseQueue = () => {
    queuePausedRef.current = true;
    setQueueState((prev) => ({ ...prev, isPaused: true }));
  };

  const handleResumeQueue = () => {
    queuePausedRef.current = false;
    setQueueState((prev) => ({ ...prev, isPaused: false }));
  };

  const handleCancelQueue = () => {
    queueCancelledRef.current = true;
    queuePausedRef.current = false;
    setQueueState((prev) => ({
      ...prev,
      isActive: false,
      isPaused: false,
      isCoolingDown: false,
    }));
    setIsGeneratingAll(false);
  };

  // 1. Synthesize a single line using configured Gemini TTS model (Appends to Take History + Smart Delta Ripple)
  const handleGenerateSingleTts = async (segment: AudioSegment) => {
    setProject((prev) => ({
      ...prev,
      segments: prev.segments.map((s) =>
        s.id === segment.id ? { ...s, ...segment, isGenerating: true } : s
      ),
    }));

    const char = project.characters.find(
      (c) => c.name.toUpperCase() === segment.speaker.toUpperCase()
    );
    const voiceDescription = segment.voiceDescription || char?.voiceDescription || '';

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: segment.text,
          voiceName: segment.voiceName,
          speaker: segment.speaker,
          style: segment.stylePrompt,
          voiceDescription,
          model: studioSettings.ttsModel,
        }),
      });

      const data = await res.json();

      if (res.status === 429 || data.isRateLimited) {
        const retrySec = data.retryAfter || 58;
        setRateLimitCooldown(retrySec);

        const synth = await synthesizeProceduralSpeech(segment.text, segment.voiceName);
        const waveformPeaks = extractWaveformPeaks(synth.buffer, 48);

        commitTakeToSegment(
          segment.id,
          synth.buffer,
          synth.base64,
          waveformPeaks,
          segment.stylePrompt,
          'instant',
          segment,
          `Rate limit (3/min): Instant Voice active. Gemini quota ready in ${retrySec}s.`
        );

        engine.previewBuffer(synth.buffer, segment.volume ?? 1, {
          pan: segment.pan ?? char?.pan ?? 0,
          distance: segment.distance ?? char?.distance ?? 0.15,
          acousticPreset: segment.acousticPreset ?? char?.acousticPreset ?? 'studio_dry',
        });
        speakBrowserSpeech(segment.text, segment.voiceName, segment.volume ?? 1);
        return;
      }

      if (!res.ok || data.error || !data.audioBase64) {
        throw new Error(data.error || 'TTS synthesis failed');
      }

      const audioBuffer = await decodeBase64Audio(data.audioBase64);
      const waveformPeaks = extractWaveformPeaks(audioBuffer, 48);

      commitTakeToSegment(
        segment.id,
        audioBuffer,
        data.audioBase64,
        waveformPeaks,
        segment.stylePrompt,
        'tts',
        segment
      );

      engine.previewBuffer(audioBuffer, segment.volume ?? 1, {
        pan: segment.pan ?? char?.pan ?? 0,
        distance: segment.distance ?? char?.distance ?? 0.15,
        acousticPreset: segment.acousticPreset ?? char?.acousticPreset ?? 'studio_dry',
      });
    } catch (err: any) {
      console.warn('Error generating single TTS, providing instant speech fallback:', err);
      const synth = await synthesizeProceduralSpeech(segment.text, segment.voiceName);
      const waveformPeaks = extractWaveformPeaks(synth.buffer, 48);

      commitTakeToSegment(
        segment.id,
        synth.buffer,
        synth.base64,
        waveformPeaks,
        segment.stylePrompt,
        'instant',
        segment,
        'Instant voice active.'
      );

      engine.previewBuffer(synth.buffer, segment.volume ?? 1);
      speakBrowserSpeech(segment.text, segment.voiceName, segment.volume ?? 1);
    }
  };

  // Phase 3 Moonshot 3: Live Microphone Acting Reference -> Prosody Transfer Handler
  const handleActReferenceTransfer = async (
    segment: AudioSegment,
    refAudioBase64: string,
    mimeType: string
  ) => {
    const char = project.characters.find(
      (c) => c.name.toUpperCase() === segment.speaker.toUpperCase()
    );
    const voiceDescription = segment.voiceDescription || char?.voiceDescription || '';

    const res = await fetch('/api/act-reference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audioBase64: refAudioBase64,
        mimeType,
        targetText: segment.text,
        speaker: segment.speaker,
        voiceName: segment.voiceName,
        voiceDescription,
        model: studioSettings.ttsModel,
      }),
    });

    const data = await res.json();
    const extractedStyle = data.extractedProsodyStyle || segment.stylePrompt;
    const adaptedText = data.adaptedText || segment.text;

    if (data.audioBase64) {
      const audioBuffer = await decodeBase64Audio(data.audioBase64);
      const peaks = extractWaveformPeaks(audioBuffer, 48);
      commitTakeToSegment(
        segment.id,
        audioBuffer,
        data.audioBase64,
        peaks,
        extractedStyle,
        'act_reference',
        {
          ...segment,
          text: adaptedText,
          stylePrompt: extractedStyle,
        }
      );
      engine.previewBuffer(audioBuffer, segment.volume ?? 1, {
        pan: segment.pan ?? char?.pan ?? 0,
        distance: segment.distance ?? char?.distance ?? 0.15,
        acousticPreset: segment.acousticPreset ?? char?.acousticPreset ?? 'studio_dry',
      });
    } else {
      // Fallback: synthesize with the extracted prosody prompt
      await handleGenerateSingleTts({
        ...segment,
        text: adaptedText,
        stylePrompt: extractedStyle,
      });
    }
  };

  // Group dialogue lines into scenes of alternating speakers (for multi-speaker batching)
  const groupSegmentsIntoScenes = (segments: AudioSegment[]): AudioSegment[][] => {
    const scenes: AudioSegment[][] = [];
    let currentScene: AudioSegment[] = [];
    let currentSpeakers = new Set<string>();

    for (const seg of segments) {
      const speaker = seg.speaker.toUpperCase();
      const candidateSpeakers = new Set(currentSpeakers);
      candidateSpeakers.add(speaker);

      if (candidateSpeakers.size <= 2 && currentScene.length < 6) {
        currentScene.push(seg);
        currentSpeakers = candidateSpeakers;
      } else {
        if (currentScene.length > 0) {
          scenes.push(currentScene);
        }
        currentScene = [seg];
        currentSpeakers = new Set([speaker]);
      }
    }

    if (currentScene.length > 0) {
      scenes.push(currentScene);
    }

    return scenes;
  };

  // 2. Synthesize target segments (all lines or only modified/unrendered lines)
  const runBatchTtsForSegments = async (targetSegments: AudioSegment[]) => {
    if (isGeneratingAll || targetSegments.length === 0) return;

    queueCancelledRef.current = false;
    queuePausedRef.current = false;
    setIsGeneratingAll(true);

    const totalLines = targetSegments.length;
    setGenerationProgress({ current: 0, total: totalLines });

    const isBatching =
      studioSettings.enableSceneBatching &&
      studioSettings.ttsModel === 'gemini-3.8-flash-tts' &&
      targetSegments.length === project.segments.length;

    setQueueState({
      isActive: true,
      isPaused: false,
      isCoolingDown: false,
      cooldownSeconds: 0,
      currentStep: 0,
      totalSteps: totalLines,
      currentSpeaker: undefined,
      isBatchScene: isBatching,
      model: studioSettings.ttsModel,
    });

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const checkPaused = async () => {
      while (queuePausedRef.current && !queueCancelledRef.current) {
        await sleep(200);
      }
    };

    if (isBatching) {
      const scenes = groupSegmentsIntoScenes(targetSegments);
      let completedLines = 0;

      for (let sIdx = 0; sIdx < scenes.length; sIdx++) {
        if (queueCancelledRef.current) break;
        await checkPaused();

        const scene = scenes[sIdx];
        const uniqueSpeakers = Array.from(new Set(scene.map((s) => s.speaker.toUpperCase())));

        if (uniqueSpeakers.length === 2 && scene.length >= 2) {
          const charA = project.characters.find(
            (c) => c.name.toUpperCase() === uniqueSpeakers[0]
          );
          const charB = project.characters.find(
            (c) => c.name.toUpperCase() === uniqueSpeakers[1]
          );

          const speakerA = {
            name: uniqueSpeakers[0],
            voiceName: charA?.voiceName || 'Puck',
            styleDescription: charA?.voiceDescription || '',
          };
          const speakerB = {
            name: uniqueSpeakers[1],
            voiceName: charB?.voiceName || 'Kore',
            styleDescription: charB?.voiceDescription || '',
          };

          const turns = scene.map((seg) => ({
            id: seg.id,
            speaker: seg.speaker,
            text: seg.text,
            stylePrompt: seg.stylePrompt,
            voiceDescription: seg.voiceDescription,
          }));

          setQueueState((prev) => ({
            ...prev,
            currentSpeaker: `${speakerA.name} & ${speakerB.name}`,
            currentStep: completedLines,
          }));

          let success = false;
          let attempts = 0;

          while (!success && attempts < 3 && !queueCancelledRef.current) {
            attempts++;
            await checkPaused();

            try {
              const res = await fetch('/api/tts-scene', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ speakerA, speakerB, turns }),
              });

              const data = await res.json();

              if (res.status === 429 || data.isRateLimited) {
                const cooldown = data.retryAfter || 58;
                setRateLimitCooldown(cooldown);

                if (studioSettings.autoRetryOnRateLimit) {
                  setQueueState((prev) => ({
                    ...prev,
                    isCoolingDown: true,
                    cooldownSeconds: cooldown,
                  }));

                  for (let c = cooldown; c > 0; c--) {
                    if (queueCancelledRef.current) break;
                    setQueueState((prev) => ({ ...prev, cooldownSeconds: c }));
                    await sleep(1000);
                  }

                  setQueueState((prev) => ({ ...prev, isCoolingDown: false }));
                  continue;
                }
              }

              if (data.audioBase64) {
                const combinedBuffer = await decodeBase64Audio(data.audioBase64);
                const slices = sliceSceneAudioBuffer(
                  combinedBuffer,
                  scene.map((t) => ({ id: t.id, text: t.text }))
                );

                const updatedSegmentsMap = new Map<
                  string,
                  { buffer: AudioBuffer; base64: string; peaks: number[]; lufs: number }
                >();

                for (const slice of slices) {
                  const b64 = await audioBufferToBase64(slice.buffer);
                  const peaks = extractWaveformPeaks(slice.buffer, 48);
                  const { integratedLufs } = measureAudioBufferLufs(slice.buffer);
                  updatedSegmentsMap.set(slice.id, {
                    buffer: slice.buffer,
                    base64: b64,
                    peaks,
                    lufs: integratedLufs,
                  });
                }

                setProject((prev) => {
                  const newSegs = prev.segments.map((seg) => {
                    const match = updatedSegmentsMap.get(seg.id);
                    if (match) {
                      const prevTakes = seg.takes || [];
                      const newTake: AudioTake = {
                        id: `take-${Date.now()}-${prevTakes.length + 1}`,
                        createdAt: new Date().toISOString(),
                        label: `Take #${prevTakes.length + 1} (Scene Batch)`,
                        stylePrompt: seg.stylePrompt,
                        duration: match.buffer.duration,
                        audioBase64: match.base64,
                        audioBuffer: match.buffer,
                        waveformPeaks: match.peaks,
                        sourceType: 'tts',
                      };
                      return {
                        ...seg,
                        duration: match.buffer.duration,
                        audioBuffer: match.buffer,
                        audioBase64: match.base64,
                        waveformPeaks: match.peaks,
                        measuredLufs: match.lufs,
                        takes: [...prevTakes, newTake],
                        activeTakeId: newTake.id,
                        isGenerating: false,
                        isDirtyText: false,
                        error: undefined,
                      };
                    }
                    return seg;
                  });
                  const rippleAdjusted = rippleAlignSegments(newSegs, 0.45);
                  const totalDuration = calculateTotalProjectDuration(
                    rippleAdjusted,
                    prev.sfxClips
                  );
                  return { ...prev, segments: rippleAdjusted, totalDuration };
                });

                success = true;
                completedLines += scene.length;
                setGenerationProgress({ current: completedLines, total: totalLines });
                setQueueState((prev) => ({ ...prev, currentStep: completedLines }));
              }
            } catch (sceneErr) {
              console.warn('Scene batch synthesis failed, falling back:', sceneErr);
              break;
            }
          }

          if (
            studioSettings.throttlePacingSeconds > 0 &&
            sIdx < scenes.length - 1 &&
            !queueCancelledRef.current
          ) {
            setQueueState((prev) => ({
              ...prev,
              isCoolingDown: true,
              cooldownSeconds: studioSettings.throttlePacingSeconds,
            }));
            for (let p = studioSettings.throttlePacingSeconds; p > 0; p--) {
              if (queueCancelledRef.current) break;
              setQueueState((prev) => ({ ...prev, cooldownSeconds: p }));
              await sleep(1000);
            }
            setQueueState((prev) => ({ ...prev, isCoolingDown: false }));
          }

          continue;
        }

        for (const seg of scene) {
          if (queueCancelledRef.current) break;
          await checkPaused();

          setQueueState((prev) => ({
            ...prev,
            currentSpeaker: seg.speaker,
            currentStep: completedLines,
          }));

          await renderSingleQueueItem(seg);
          completedLines++;
          setGenerationProgress({ current: completedLines, total: totalLines });
          setQueueState((prev) => ({ ...prev, currentStep: completedLines }));

          if (
            studioSettings.throttlePacingSeconds > 0 &&
            completedLines < totalLines &&
            !queueCancelledRef.current
          ) {
            setQueueState((prev) => ({
              ...prev,
              isCoolingDown: true,
              cooldownSeconds: studioSettings.throttlePacingSeconds,
            }));
            for (let p = studioSettings.throttlePacingSeconds; p > 0; p--) {
              if (queueCancelledRef.current) break;
              setQueueState((prev) => ({ ...prev, cooldownSeconds: p }));
              await sleep(1000);
            }
            setQueueState((prev) => ({ ...prev, isCoolingDown: false }));
          }
        }
      }
    } else {
      let completedLines = 0;

      for (let i = 0; i < targetSegments.length; i++) {
        if (queueCancelledRef.current) break;
        await checkPaused();

        const seg = targetSegments[i];
        setQueueState((prev) => ({
          ...prev,
          currentSpeaker: seg.speaker,
          currentStep: completedLines,
        }));

        await renderSingleQueueItem(seg);
        completedLines++;
        setGenerationProgress({ current: completedLines, total: totalLines });
        setQueueState((prev) => ({ ...prev, currentStep: completedLines }));

        if (
          studioSettings.throttlePacingSeconds > 0 &&
          completedLines < totalLines &&
          !queueCancelledRef.current
        ) {
          setQueueState((prev) => ({
            ...prev,
            isCoolingDown: true,
            cooldownSeconds: studioSettings.throttlePacingSeconds,
          }));
          for (let p = studioSettings.throttlePacingSeconds; p > 0; p--) {
            if (queueCancelledRef.current) break;
            setQueueState((prev) => ({ ...prev, cooldownSeconds: p }));
            await sleep(1000);
          }
          setQueueState((prev) => ({ ...prev, isCoolingDown: false }));
        }
      }
    }

    setIsGeneratingAll(false);
    setQueueState((prev) => ({
      ...prev,
      isActive: false,
      isPaused: false,
      isCoolingDown: false,
    }));
  };

  const handleGenerateAllTts = () => {
    runBatchTtsForSegments(project.segments);
  };

  const handleGenerateModifiedTts = () => {
    const modifiedOrNew = project.segments.filter((s) => !s.audioBuffer || s.isDirtyText);
    runBatchTtsForSegments(modifiedOrNew);
  };

  // 3. AI Music Generation using Lyria 3 models
  const handleGenerateMusic = async (
    prompt: string,
    modelType: 'clip' | 'pro',
    durationSeconds: number
  ) => {
    setProject((prev) => ({
      ...prev,
      musicTrack: { ...prev.musicTrack, isGenerating: true },
    }));

    try {
      const res = await fetch('/api/music', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          modelType,
          durationSeconds,
        }),
      });

      const data = await res.json();
      let audioBuffer: AudioBuffer;

      if (data.audioBase64) {
        audioBuffer = await decodeBase64Audio(data.audioBase64);
      } else {
        let themeKey: any = 'cyberpunk';
        const pLower = prompt.toLowerCase();
        if (pLower.includes('noir') || pLower.includes('jazz')) themeKey = 'noir';
        else if (pLower.includes('horror') || pLower.includes('terror')) themeKey = 'horror';
        else if (pLower.includes('space') || pLower.includes('sci-fi')) themeKey = 'scifi';
        else if (pLower.includes('fantasy') || pLower.includes('orchestral')) themeKey = 'fantasy';
        else if (pLower.includes('piano')) themeKey = 'piano';

        audioBuffer = await generateAtmosphericTrack(themeKey, durationSeconds);
      }

      setProject((prev) => ({
        ...prev,
        musicTrack: {
          ...prev.musicTrack,
          prompt,
          modelType,
          durationSeconds,
          audioBuffer,
          audioBase64: data.audioBase64,
          isGenerating: false,
        },
      }));
    } catch (err: any) {
      console.error('Music generation failed, applying procedural ambient score:', err);
      const audioBuffer = await generateAtmosphericTrack('cyberpunk', durationSeconds);
      setProject((prev) => ({
        ...prev,
        musicTrack: {
          ...prev.musicTrack,
          prompt,
          audioBuffer,
          isGenerating: false,
        },
      }));
    }
  };

  const handlePreviewMusic = () => {
    if (project.musicTrack.audioBuffer) {
      if (musicStopFnRef.current) musicStopFnRef.current();
      musicStopFnRef.current = engine.previewBuffer(
        project.musicTrack.audioBuffer,
        project.musicTrack.volume
      );
      setIsPreviewingMusic(true);
    }
  };

  const handleStopMusicPreview = () => {
    if (musicStopFnRef.current) {
      musicStopFnRef.current();
      musicStopFnRef.current = null;
    }
    setIsPreviewingMusic(false);
  };

  const handlePreviewVoice = async (
    voiceName: PrebuiltVoiceName,
    sampleText: string,
    style: string,
    voiceDescription?: string
  ) => {
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: sampleText,
          voiceName,
          speaker: 'Audition',
          style,
          voiceDescription,
        }),
      });
      const data = await res.json();
      if (data.audioBase64) {
        const buf = await decodeBase64Audio(data.audioBase64);
        engine.previewBuffer(buf, 1.0);
      } else {
        const synth = await synthesizeProceduralSpeech(sampleText, voiceName);
        engine.previewBuffer(synth.buffer, 1.0);
        speakBrowserSpeech(sampleText, voiceName, 1.0);
      }
    } catch (err) {
      const synth = await synthesizeProceduralSpeech(sampleText, voiceName);
      engine.previewBuffer(synth.buffer, 1.0);
      speakBrowserSpeech(sampleText, voiceName, 1.0);
    }
  };

  // Phase 1: Non-Destructive Diff-Aware Script Sync
  const handleDiffSyncScript = async (rawScript: string) => {
    if (!rawScript || !rawScript.trim()) return;
    const diffResult = diffSyncTranscriptToProject(
      rawScript,
      project.segments,
      project.characters
    );

    const newSfxClips: SfxClip[] = await Promise.all(
      diffResult.newSfxCues.map(async (cue, idx) => {
        const duration = cue.type === 'rain' ? 8 : 3;
        const buffer = await generateProceduralSfx(
          cue.type === 'custom' ? 'sci_fi_hum' : cue.type,
          duration
        );
        return {
          id: `sfx-sync-${Date.now()}-${idx}`,
          name: cue.type.replace('_', ' '),
          type: cue.type,
          startTime: cue.startTime,
          duration,
          volume: 0.65,
          audioBuffer: buffer,
        };
      })
    );

    const combinedSfx = [...project.sfxClips, ...newSfxClips];
    const totalDuration = calculateTotalProjectDuration(diffResult.segments, combinedSfx);

    setLastDiffStats(diffResult.stats);
    setProject((prev) => ({
      ...prev,
      characters: diffResult.characters,
      segments: diffResult.segments,
      sfxClips: combinedSfx,
      totalDuration,
    }));
  };

  // Phase 2 Moonshot 2: Subtext & Chemistry Rehearsal Room Director
  const handleDirectSubtext = async (subtextNote: string, rewriteTextWithBursts: boolean) => {
    if (project.segments.length === 0 || !subtextNote.trim()) return;
    setIsDirectingSubtext(true);
    setSubtextSummary(null);

    try {
      const res = await fetch('/api/direct-subtext', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          segments: project.segments.map((s) => ({
            id: s.id,
            speaker: s.speaker,
            text: s.text,
            stylePrompt: s.stylePrompt,
          })),
          subtextNote,
          rewriteTextWithBursts,
        }),
      });

      const data = await res.json();
      if (Array.isArray(data.directedSegments)) {
        const directedMap = new Map<string, any>(
          data.directedSegments.map((d: any) => [d.id, d])
        );

        setProject((prev) => {
          const nextSegs = prev.segments.map((seg) => {
            const match = directedMap.get(seg.id);
            if (!match) return seg;
            const textChanged =
              rewriteTextWithBursts &&
              match.updatedText &&
              match.updatedText.trim() !== seg.text.trim();
            return {
              ...seg,
              stylePrompt: match.stylePrompt || seg.stylePrompt,
              subtextNote: match.subtextNote || subtextNote,
              text:
                rewriteTextWithBursts && match.updatedText ? match.updatedText : seg.text,
              pauseAfterSec:
                typeof match.pauseAfterSec === 'number'
                  ? match.pauseAfterSec
                  : seg.pauseAfterSec,
              isDirtyText: textChanged ? true : seg.isDirtyText,
            };
          });

          const aligned = rippleAlignSegments(nextSegs, 0.45);
          const totalDuration = calculateTotalProjectDuration(aligned, prev.sfxClips);
          return {
            ...prev,
            subtextNote,
            segments: aligned,
            totalDuration,
          };
        });

        setSubtextSummary(
          data.directorSummary ||
            `Applied subtext coaching ("${subtextNote}") across ${data.directedSegments.length} lines.`
        );
      }
    } catch (err) {
      console.warn('Subtext direction error:', err);
    } finally {
      setIsDirectingSubtext(false);
    }
  };

  // 4. Full AI Script Parsing & Character Detection
  const handleParseScript = async (rawScript: string) => {
    if (!rawScript || !rawScript.trim()) return;
    setIsParsing(true);
    setLastDiffStats(null);

    try {
      let parsed: any = null;

      try {
        const res = await fetch('/api/parse-script', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scriptText: rawScript }),
        });

        if (res.ok) {
          parsed = await res.json();
        }
      } catch (networkErr) {
        console.warn('Network call to /api/parse-script failed, using client parser:', networkErr);
      }

      if (
        parsed &&
        Array.isArray(parsed.characters) &&
        parsed.characters.length > 0 &&
        Array.isArray(parsed.segments) &&
        parsed.segments.length > 0
      ) {
        const newCharacters: CharacterVoice[] = parsed.characters.map((c: any, idx: number) => ({
          id: `char-${idx + 1}-${Date.now()}`,
          name: (c.name || 'CHARACTER').toUpperCase(),
          voiceName:
            (c.assignedVoice as PrebuiltVoiceName) ||
            AVAILABLE_VOICES[idx % AVAILABLE_VOICES.length].name,
          stylePrompt: c.voiceStyle || 'Dramatic audio delivery',
          color:
            c.color ||
            ['#06b6d4', '#ec4899', '#a855f7', '#f59e0b', '#10b981', '#3b82f6'][idx % 6],
          description: c.description,
          pan: idx % 2 === 0 ? -0.25 : 0.25,
          distance: 0.15,
          acousticPreset: 'studio_dry',
        }));

        let cursorTime = 0.5;
        const newSegments: AudioSegment[] = [];
        const detectedSfx: SfxClip[] = [];

        for (let i = 0; i < parsed.segments.length; i++) {
          const item = parsed.segments[i];
          const speaker = (item.speaker || 'NARRATOR').toUpperCase();
          const char = newCharacters.find((c) => c.name === speaker);
          const voice = char
            ? char.voiceName
            : (item.suggestedVoice as PrebuiltVoiceName) || 'Puck';
          const estDuration = estimateSpokenDuration(item.text || '');

          newSegments.push({
            id: `seg-${i + 1}-${Date.now()}`,
            speaker,
            text: item.text,
            stylePrompt: item.stylePrompt || char?.stylePrompt || 'Dramatic delivery',
            voiceName: voice,
            startTime: Math.round(cursorTime * 100) / 100,
            duration: estDuration,
            volume: 1.0,
            pan: char?.pan ?? 0,
            distance: char?.distance ?? 0.15,
            acousticPreset: char?.acousticPreset ?? 'studio_dry',
            pauseAfterSec: typeof item.pauseAfterSec === 'number' ? item.pauseAfterSec : 0.45,
            soundEffectCue: item.soundEffect,
          });

          if (item.soundEffect) {
            const sfxType = item.soundEffect as SfxType;
            detectedSfx.push({
              id: `sfx-${i + 1}-${Date.now()}`,
              name: item.soundEffect.replace('_', ' '),
              type: sfxType,
              startTime: Math.max(0, cursorTime - 0.2),
              duration: 3,
              volume: 0.6,
              pan: 0,
              distance: 0.2,
            });
          }

          cursorTime += estDuration + 0.45;
        }

        const alignedSegments = rippleAlignSegments(newSegments, 0.45);

        const sfxWithBuffers = await Promise.all(
          detectedSfx.map(async (sfx) => {
            const buffer = await generateProceduralSfx(
              sfx.type === 'custom' ? 'sci_fi_hum' : sfx.type,
              sfx.duration
            );
            return { ...sfx, audioBuffer: buffer };
          })
        );

        const totalDuration = calculateTotalProjectDuration(alignedSegments, sfxWithBuffers);

        setProject((prev) => ({
          ...prev,
          title: parsed.title || prev.title,
          genre: parsed.genre || prev.genre,
          totalDuration,
          characters: newCharacters,
          segments: alignedSegments,
          sfxClips: sfxWithBuffers,
          musicTrack: {
            ...prev.musicTrack,
            prompt: parsed.recommendedMusicPrompt || prev.musicTrack.prompt,
            genre: parsed.genre || prev.musicTrack.genre,
          },
        }));
      } else {
        const result = await parseTranscriptToDrama(rawScript);
        const alignedSegments = rippleAlignSegments(result.segments, 0.45);
        const totalDuration = calculateTotalProjectDuration(alignedSegments, result.sfxClips);

        setProject((prev) => ({
          ...prev,
          characters: result.characters,
          segments: alignedSegments,
          sfxClips: result.sfxClips,
          totalDuration,
        }));
      }
    } catch (err: any) {
      console.warn('AI parsing error, applying client parser:', err);
      const result = await parseTranscriptToDrama(rawScript);
      const alignedSegments = rippleAlignSegments(result.segments, 0.45);
      const totalDuration = calculateTotalProjectDuration(alignedSegments, result.sfxClips);

      setProject((prev) => ({
        ...prev,
        characters: result.characters,
        segments: alignedSegments,
        sfxClips: result.sfxClips,
        totalDuration,
      }));
    } finally {
      setIsParsing(false);
    }
  };

  // Generate drama script premise with AI
  const handleGenerateDramaScript = async (genre: string, premise: string) => {
    setIsParsing(true);
    try {
      const res = await fetch('/api/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ genre, premise }),
      });
      const data = await res.json();
      if (data.script) {
        setTranscript(data.script);
        await handleParseScript(data.script);
      }
    } catch (err) {
      console.error('Failed to generate script:', err);
    } finally {
      setIsParsing(false);
    }
  };

  // Build a fresh DramaProject from a SAMPLE_DRAMAS template key
  const buildTemplateDramaProject = async (key: string): Promise<{
    newProject: DramaProject;
    transcriptText: string;
  }> => {
    const preset = SAMPLE_DRAMAS[key] || SAMPLE_DRAMAS.cyberpunk;
    const now = Date.now();
    const chars: CharacterVoice[] = (preset.characters || []).map((c, idx) => ({
      ...c,
      id: `char-${idx + 1}-${now}`,
      pan: c.pan ?? (idx === 0 ? -0.3 : idx === 1 ? 0.3 : 0),
      distance: c.distance ?? 0.15,
      acousticPreset: c.acousticPreset ?? 'studio_dry',
    }));

    const parsedLocal = await parseTranscriptToDrama(preset.transcript);
    const mergedChars = chars.length > 0 ? chars : parsedLocal.characters;
    const alignedSegments = rippleAlignSegments(
      parsedLocal.segments.map((seg, i) => {
        const matchChar = mergedChars.find(
          (c) => c.name.toUpperCase() === seg.speaker.toUpperCase()
        );
        return {
          ...seg,
          id: `seg-${i + 1}-${now}`,
          voiceName: matchChar?.voiceName || seg.voiceName,
          pan: matchChar?.pan ?? 0,
          distance: matchChar?.distance ?? 0.15,
          acousticPreset: matchChar?.acousticPreset ?? 'studio_dry',
        };
      }),
      0.45
    );

    const totalDuration = Math.max(
      25,
      calculateTotalProjectDuration(alignedSegments, parsedLocal.sfxClips)
    );

    const themeKey: keyof typeof MUSIC_THEMES =
      key === 'noir'
        ? 'noir'
        : key === 'horror'
        ? 'horror'
        : key === 'scifi'
        ? 'scifi'
        : 'cyberpunk';
    const musicBuf = await generateAtmosphericTrack(themeKey, 30);

    const newProject: DramaProject = {
      id: `drama-${key}-${now}`,
      title: preset.title || 'Audio Drama Production',
      genre: preset.genre || 'Dramatic Fiction',
      totalDuration,
      characters: mergedChars,
      customVoices: project.customVoices || PRESET_CUSTOM_VOICES,
      segments: alignedSegments,
      tensionCurve: DEFAULT_TENSION_CURVES.rising_climax.nodes,
      musicTrack: {
        enabled: true,
        prompt:
          MUSIC_THEMES[themeKey]?.defaultPrompt || MUSIC_THEMES.cyberpunk.defaultPrompt,
        genre: preset.genre || 'Cinematic Ambient',
        modelType: 'clip',
        durationSeconds: 30,
        volume: 0.35,
        ducking: true,
        duckingAmount: 0.2,
        audioBuffer: musicBuf,
      },
      sfxClips: parsedLocal.sfxClips,
    };

    return {
      newProject,
      transcriptText: preset.transcript,
    };
  };

  // Load sample pre-made drama presets as a new project in the library
  const handleLoadPresetDrama = async (key: string, openImmediately = true) => {
    const preset = SAMPLE_DRAMAS[key];
    if (!preset) return;

    // Ensure current project is saved in library before switching
    saveProjectToStorage(project, transcript);

    const { newProject, transcriptText } = await buildTemplateDramaProject(key);

    if (openImmediately) {
      handleStop();
      setTranscript(transcriptText);
      setProject(newProject);
      setCurrentTime(0);
      saveProjectToStorage(newProject, transcriptText);
      const updatedList = await listLibraryProjects();
      setLibraryProjects(updatedList);
      if (activeTab === 'library') {
        setActiveTab('timeline');
      }
    } else {
      await saveProjectRecordToLibrary(newProject, transcriptText, false);
      const updatedList = await listLibraryProjects();
      setLibraryProjects(updatedList);
    }
  };

  // Start a fresh blank audio drama canvas (saved as a distinct project in the library)
  const handleStartBlankProject = async (
    title = 'Untitled Audio Drama',
    genre = 'Dramatic Fiction',
    openImmediately = true
  ) => {
    // Save current project state to library before creating the new blank project
    saveProjectToStorage(project, transcript);

    const now = Date.now();
    const cleanChars: CharacterVoice[] = [
      {
        id: `char-1-${now}`,
        name: 'CHARACTER 1',
        voiceName: 'Puck',
        stylePrompt: 'Dramatic expressive performance',
        color: '#06b6d4',
        pan: -0.25,
        distance: 0.15,
        acousticPreset: 'studio_dry',
      },
      {
        id: `char-2-${now}`,
        name: 'CHARACTER 2',
        voiceName: 'Kore',
        stylePrompt: 'Clear articulate performance',
        color: '#ec4899',
        pan: 0.25,
        distance: 0.15,
        acousticPreset: 'studio_dry',
      },
    ];

    const cleanProject: DramaProject = {
      id: `drama-${now}-${Math.random().toString(36).slice(2, 6)}`,
      title: title.trim() || 'Untitled Audio Drama',
      genre: genre.trim() || 'Dramatic Fiction',
      totalDuration: 30,
      characters: cleanChars,
      customVoices: project.customVoices || PRESET_CUSTOM_VOICES,
      segments: [],
      tensionCurve: DEFAULT_TENSION_CURVES.rising_climax.nodes,
      musicTrack: {
        enabled: false,
        prompt: '',
        genre: 'Cinematic Ambient',
        modelType: 'clip',
        durationSeconds: 30,
        volume: 0.35,
        ducking: true,
        duckingAmount: 0.2,
      },
      sfxClips: [],
    };

    if (openImmediately) {
      handleStop();
      setTranscript('');
      setProject(cleanProject);
      setCurrentTime(0);
      setActiveTab('script');
      saveProjectToStorage(cleanProject, '');
    } else {
      await saveProjectRecordToLibrary(cleanProject, '', false);
    }

    const updatedList = await listLibraryProjects();
    setLibraryProjects(updatedList);
  };

  // Library Navigation & Management Handlers
  const handleSelectLibraryProject = async (projectId: string) => {
    if (projectId === project.id) {
      setActiveTab('timeline');
      return;
    }
    setIsLoadingLibraryProject(true);
    try {
      // Save current project state before switching
      saveProjectToStorage(project, transcript);
      handleStop();

      const loaded = await loadProjectFromLibrary(projectId);
      setProject(loaded.project);
      setTranscript(loaded.transcript);
      setLastSavedTime(loaded.lastSaved);
      setCurrentTime(0);
      setLastDiffStats(null);
      setSubtextSummary(null);
      setActiveTab('timeline');

      const refreshed = await listLibraryProjects();
      setLibraryProjects(refreshed);
    } finally {
      setIsLoadingLibraryProject(false);
    }
  };

  const handleDuplicateLibraryProject = async (projectId: string) => {
    await duplicateProjectInLibrary(projectId, project, transcript);
    const refreshed = await listLibraryProjects();
    setLibraryProjects(refreshed);
  };

  const handleDeleteLibraryProject = async (projectId: string) => {
    const remaining = await deleteProjectFromLibrary(projectId);
    setLibraryProjects(remaining);

    if (projectId === project.id) {
      handleStop();
      if (remaining.length > 0) {
        const nextProj = await loadProjectFromLibrary(remaining[0].id);
        setProject(nextProj.project);
        setTranscript(nextProj.transcript);
        setLastSavedTime(nextProj.lastSaved);
        setCurrentTime(0);
      } else {
        clearStoredProject();
        await handleStartBlankProject('Untitled Audio Drama', 'Dramatic Fiction', true);
      }
    }
  };

  const handleImportProjectFileToLibrary = async (file: File, openImmediately = true) => {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (openImmediately) {
      saveProjectToStorage(project, transcript);
      handleStop();
    }
    const imported = await importProjectJsonToLibrary(parsed, openImmediately);
    if (openImmediately) {
      setProject(imported.project);
      setTranscript(imported.transcript);
      setCurrentTime(0);
      setActiveTab('timeline');
    }
    const refreshed = await listLibraryProjects();
    setLibraryProjects(refreshed);
  };

  const handleExportProjectFromLibrary = async (projectId: string) => {
    const { project: rawProj, transcript: rawTranscript } = await getRawProjectFromLibrary(
      projectId,
      project,
      transcript
    );
    const exportPayload = {
      ...rawProj,
      transcript: rawTranscript,
    };
    const jsonStr = JSON.stringify(exportPayload, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const cleanName = `${rawProj.title || 'Audio_Drama'}_Project.json`.replace(
      /[^a-zA-Z0-9_.-]/g,
      '_'
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = cleanName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleRenameLibraryProject = async (
    projectId: string,
    newTitle: string,
    newGenre: string
  ) => {
    if (projectId === project.id) {
      setProject((prev) => ({
        ...prev,
        title: newTitle,
        genre: newGenre,
      }));
    }
    const updated = await updateProjectMetadataInLibrary(projectId, {
      title: newTitle,
      genre: newGenre,
    });
    setLibraryProjects(updated);
  };

  const handleClearAllSegments = () => {
    handleStop();
    setProject((prev) => ({
      ...prev,
      segments: [],
    }));
  };

  // Add a procedural sound effect to the timeline at current scrubber position
  const handleAddSfx = async (type: SfxType, atTime?: number) => {
    const insertTime = atTime !== undefined ? atTime : currentTime;
    const duration = type === 'rain' ? 10 : type === 'space_drone' ? 8 : 3;
    const buffer = await generateProceduralSfx(
      type === 'custom' ? 'sci_fi_hum' : type,
      duration
    );

    const newSfx: SfxClip = {
      id: `sfx-${Date.now()}`,
      name: type.replace('_', ' '),
      type,
      startTime: Math.max(0, insertTime),
      duration,
      volume: 0.7,
      pan: 0,
      distance: 0.15,
      audioBuffer: buffer,
    };

    setProject((prev) => ({
      ...prev,
      sfxClips: [...prev.sfxClips, newSfx],
    }));
  };

  // Phase 1: Upload custom audio file (.wav, .mp3, .ogg) onto Track 3
  const handleUploadCustomSfx = async (file: File, atTime?: number) => {
    try {
      const insertTime = atTime !== undefined ? atTime : currentTime;
      const { buffer, base64, peaks } = await decodeUploadedAudioFile(file);
      const cleanName = file.name.replace(/\.[^/.]+$/, '').slice(0, 24) || 'Custom SFX';

      const newSfx: SfxClip = {
        id: `sfx-upload-${Date.now()}`,
        name: cleanName,
        type: 'custom',
        startTime: Math.max(0, Math.round(insertTime * 100) / 100),
        duration: Math.round(buffer.duration * 100) / 100,
        volume: 0.8,
        pan: 0,
        distance: 0.1,
        audioBuffer: buffer,
        audioBase64: base64,
        waveformPeaks: peaks,
        isCustomUpload: true,
      };

      setProject((prev) => ({
        ...prev,
        sfxClips: [...prev.sfxClips, newSfx],
      }));
    } catch (err) {
      console.error('Failed to decode uploaded SFX audio file:', err);
    }
  };

  const handleUpdateSfx = (updatedClip: SfxClip) => {
    setProject((prev) => ({
      ...prev,
      sfxClips: prev.sfxClips.map((s) => (s.id === updatedClip.id ? updatedClip : s)),
    }));
  };

  const handleDeleteSfx = (id: string) => {
    setProject((prev) => ({
      ...prev,
      sfxClips: prev.sfxClips.filter((s) => s.id !== id),
    }));
  };

  // Ripple Align unlocked clips respecting each segment's pauseAfterSec
  const handleRippleAlignTimeline = () => {
    setProject((prev) => {
      const aligned = rippleAlignSegments(prev.segments, 0.45);
      const totalDuration = calculateTotalProjectDuration(aligned, prev.sfxClips);
      return {
        ...prev,
        segments: aligned,
        totalDuration,
      };
    });
  };

  // Phase 2 Moonshot 1: Apply Tension Curve to Scene Pacing & Acting Prompts
  const handleApplyTensionToScene = (nodes: TensionNode[]) => {
    setProject((prev) => {
      const modulated = applyTensionCurveToSegments(
        prev.segments,
        prev.totalDuration,
        nodes
      );
      const totalDuration = calculateTotalProjectDuration(modulated, prev.sfxClips);
      return {
        ...prev,
        tensionCurve: nodes,
        segments: modulated,
        totalDuration,
      };
    });
  };

  // Global LUFS Loudness Normalization across all rendered dialogue segments
  const handleNormalizeAllLufs = (targetLufs = -16) => {
    const report = normalizeAllSegmentsLufs(project.segments, targetLufs);
    if (report.normalizedCount === 0) {
      setNormalizationSummary('Render dialogue audio first to normalize LUFS.');
      return;
    }

    setProject((prev) => ({
      ...prev,
      segments: report.segments,
    }));

    setNormalizationSummary(
      `Normalized ${report.normalizedCount} clip${report.normalizedCount === 1 ? '' : 's'} to ${targetLufs} LUFS (avg ${report.averageBeforeLufs.toFixed(1)} → ${report.averageAfterLufs.toFixed(1)} LUFS)`
    );
  };

  // Add manual dialogue line
  const handleAddManualSegment = () => {
    const lastSeg = project.segments[project.segments.length - 1];
    const startTime = lastSeg
      ? Math.round((lastSeg.startTime + lastSeg.duration + 0.45) * 100) / 100
      : 0.5;
    const char = project.characters[0];
    const speaker = char?.name || 'NARRATOR';
    const voice = char?.voiceName || 'Puck';

    const newSeg: AudioSegment = {
      id: `seg-${Date.now()}`,
      speaker,
      text: 'New line of dialogue.',
      stylePrompt: char?.stylePrompt || 'Dramatic speech',
      voiceName: voice,
      startTime,
      duration: 2.0,
      volume: 1.0,
      pan: char?.pan ?? 0,
      distance: char?.distance ?? 0.15,
      acousticPreset: char?.acousticPreset ?? 'studio_dry',
      pauseAfterSec: 0.45,
    };

    setProject((prev) => {
      const nextSegs = [...prev.segments, newSeg];
      const totalDuration = calculateTotalProjectDuration(nextSegs, prev.sfxClips);
      return {
        ...prev,
        segments: nextSegs,
        totalDuration,
      };
    });

    setEditingSegmentId(newSeg.id);
  };

  // Phase 3 Moonshot 4: Audition a character or SFX clip directly from the 2D Binaural Soundstage
  const handleAuditionCharacterInSpace = async (char: CharacterVoice) => {
    const existingLine = project.segments.find(
      (s) => s.speaker.toUpperCase() === char.name.toUpperCase() && !!s.audioBuffer
    );
    if (existingLine && existingLine.audioBuffer) {
      engine.previewBuffer(existingLine.audioBuffer, existingLine.volume ?? 1, {
        pan: char.pan ?? 0,
        distance: char.distance ?? 0.15,
        acousticPreset: char.acousticPreset ?? 'studio_dry',
      });
    } else {
      const synth = await synthesizeProceduralSpeech(
        `Testing spatial placement for ${char.name}`,
        char.voiceName
      );
      engine.previewBuffer(synth.buffer, 1.0, {
        pan: char.pan ?? 0,
        distance: char.distance ?? 0.15,
        acousticPreset: char.acousticPreset ?? 'studio_dry',
      });
    }
  };

  const handleAuditionSfxInSpace = (clip: SfxClip) => {
    if (clip.audioBuffer) {
      engine.previewBuffer(clip.audioBuffer, clip.volume ?? 0.8, {
        pan: clip.pan ?? 0,
        distance: clip.distance ?? 0.15,
        acousticPreset: 'studio_dry',
      });
    }
  };

  const handleApplyRoomPresetToAll = (preset: AcousticPreset) => {
    setProject((prev) => ({
      ...prev,
      characters: prev.characters.map((c) => ({ ...c, acousticPreset: preset })),
      segments: prev.segments.map((s) => ({ ...s, acousticPreset: preset })),
    }));
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 font-sans text-slate-100">
      {/* Top Navigation & Transport Bar */}
      <HeaderBar
        title={project.title}
        genre={project.genre}
        isPlaying={isPlaying}
        currentTime={currentTime}
        totalDuration={project.totalDuration}
        masterVolume={masterVolume}
        activeTab={activeTab}
        isGeneratingAll={isGeneratingAll}
        projectCount={libraryProjects.length}
        saveStatus={saveStatus}
        lastSavedTime={lastSavedTime}
        currentModel={studioSettings.ttsModel}
        onPlayPause={togglePlayPause}
        onStop={handleStop}
        onSeek={handleSeek}
        onVolumeChange={handleVolumeChange}
        onTabChange={setActiveTab}
        onOpenExport={() => setShowExportModal(true)}
        onGenerateAllAudio={handleGenerateAllTts}
        onNewProject={() => setShowNewProjectModal(true)}
        onOpenSettings={() => setShowSettingsModal(true)}
        onResetProject={() => {
          clearStoredProject();
          handleLoadPresetDrama('cyberpunk');
        }}
      />

      {/* Rate Limit Notice Banner */}
      {rateLimitCooldown > 0 && (
        <div className="bg-amber-950/90 border-b border-amber-800/80 px-4 py-2 flex items-center justify-between text-xs text-amber-200 z-20 shadow-md">
          <div className="flex items-center gap-2">
            <span>
              <strong>Gemini Free Tier Rate Limit (3 req/min):</strong> Instant Voice synthesis is
              active so your audio drama continues playing and exporting smoothly. Gemini TTS quota
              resets in <strong className="font-mono tabular-nums text-amber-300">{rateLimitCooldown}s</strong>.
            </span>
          </div>
          <button
            onClick={() => setRateLimitCooldown(0)}
            className="text-amber-400 hover:text-amber-200 font-bold ml-2 underline text-[11px] flex-shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Studio Viewport */}
      <main className="flex-1 overflow-hidden flex flex-col relative">
        {activeTab === 'library' && (
          <ProjectLibraryView
            projects={libraryProjects}
            activeProjectId={project.id}
            isLoadingProject={isLoadingLibraryProject}
            onSelectProject={handleSelectLibraryProject}
            onCreateBlankProject={handleStartBlankProject}
            onCreateFromTemplate={handleLoadPresetDrama}
            onDuplicateProject={handleDuplicateLibraryProject}
            onDeleteProject={handleDeleteLibraryProject}
            onImportProjectFile={handleImportProjectFileToLibrary}
            onExportProjectFromLibrary={handleExportProjectFromLibrary}
            onRenameProject={handleRenameLibraryProject}
            onReturnToTimeline={() => setActiveTab('timeline')}
          />
        )}

        {activeTab === 'timeline' && (
          <Timeline
            segments={project.segments}
            characters={project.characters}
            musicTrack={project.musicTrack}
            sfxClips={project.sfxClips}
            tensionCurve={project.tensionCurve}
            currentTime={currentTime}
            totalDuration={project.totalDuration}
            isPlaying={isPlaying}
            onSeek={handleSeek}
            onUpdateSegment={(updated) =>
              setProject((prev) => ({
                ...prev,
                segments: prev.segments.map((s) => (s.id === updated.id ? updated : s)),
              }))
            }
            onDeleteSegment={(id) =>
              setProject((prev) => {
                const remaining = prev.segments.filter((s) => s.id !== id);
                const totalDuration = calculateTotalProjectDuration(remaining, prev.sfxClips);
                return {
                  ...prev,
                  segments: remaining,
                  totalDuration,
                };
              })
            }
            onEditSegment={(seg) => setEditingSegmentId(seg.id)}
            onGenerateSingleTts={handleGenerateSingleTts}
            onPreviewBuffer={handlePreviewBuffer}
            onUpdateMusicTrack={(trackUpdate) =>
              setProject((prev) => ({
                ...prev,
                musicTrack: { ...prev.musicTrack, ...trackUpdate },
              }))
            }
            onUpdateSfx={handleUpdateSfx}
            onDeleteSfx={handleDeleteSfx}
            onAddSfx={(type, time) => handleAddSfx(type, time)}
            onUploadCustomSfx={(file, time) => handleUploadCustomSfx(file, time)}
            onRippleAlign={handleRippleAlignTimeline}
            onUpdateTensionCurve={(nodes) =>
              setProject((prev) => ({ ...prev, tensionCurve: nodes }))
            }
            onApplyTensionToScene={handleApplyTensionToScene}
            onNormalizeAllLufs={handleNormalizeAllLufs}
            normalizationSummary={normalizationSummary}
            onOpenInStage={(segId) => {
              setStageSelectedSegmentId(segId);
              setActiveTab('stage');
            }}
          />
        )}

        {activeTab === 'script' && (
          <ScriptParserView
            transcript={transcript}
            segments={project.segments}
            characters={project.characters}
            isParsing={isParsing}
            isDirectingSubtext={isDirectingSubtext}
            subtextSummary={subtextSummary}
            normalizationSummary={normalizationSummary}
            lastDiffStats={lastDiffStats}
            isGeneratingAll={isGeneratingAll}
            generationProgress={generationProgress}
            onUpdateTranscript={setTranscript}
            onParseScript={handleParseScript}
            onDiffSyncScript={handleDiffSyncScript}
            onDirectSubtext={handleDirectSubtext}
            onGenerateDramaScript={handleGenerateDramaScript}
            onGenerateAllTts={handleGenerateAllTts}
            onGenerateModifiedTts={handleGenerateModifiedTts}
            onGenerateSingleTts={handleGenerateSingleTts}
            onPreviewBuffer={handlePreviewBuffer}
            onUpdateSegment={(updated) =>
              setProject((prev) => ({
                ...prev,
                segments: prev.segments.map((s) => (s.id === updated.id ? updated : s)),
              }))
            }
            onNormalizeAllLufs={handleNormalizeAllLufs}
            onEditSegment={(seg) => setEditingSegmentId(seg.id)}
            onDeleteSegment={(id) =>
              setProject((prev) => {
                const remaining = prev.segments.filter((s) => s.id !== id);
                const totalDuration = calculateTotalProjectDuration(remaining, prev.sfxClips);
                return {
                  ...prev,
                  segments: remaining,
                  totalDuration,
                };
              })
            }
            onAddManualSegment={handleAddManualSegment}
            onLoadPresetDrama={handleLoadPresetDrama}
            onStartBlankProject={() => setShowNewProjectModal(true)}
            onClearAllSegments={handleClearAllSegments}
          />
        )}

        {activeTab === 'stage' && (
          <BinauralStageView
            characters={project.characters}
            sfxClips={project.sfxClips}
            segments={project.segments}
            selectedSegmentId={stageSelectedSegmentId}
            onSelectSegment={setStageSelectedSegmentId}
            currentTime={currentTime}
            isPlaying={isPlaying}
            onSeek={handleSeek}
            onPlayPause={togglePlayPause}
            onUpdateSegment={(updatedSeg) =>
              setProject((prev) => ({
                ...prev,
                segments: prev.segments.map((s) => (s.id === updatedSeg.id ? updatedSeg : s)),
              }))
            }
            onUpdateSegments={(updatedSegs) =>
              setProject((prev) => ({
                ...prev,
                segments: updatedSegs,
              }))
            }
            onUpdateCharacter={(updatedChar) =>
              setProject((prev) => ({
                ...prev,
                characters: prev.characters.map((c) =>
                  c.id === updatedChar.id ? updatedChar : c
                ),
              }))
            }
            onUpdateSfxClip={handleUpdateSfx}
            onApplyRoomPresetToAll={handleApplyRoomPresetToAll}
            onPreviewSegment={handlePreviewBuffer}
            onAuditionCharacterInSpace={handleAuditionCharacterInSpace}
            onAuditionSfxInSpace={handleAuditionSfxInSpace}
          />
        )}

        {activeTab === 'voices' && (
          <VoiceCustomizer
            characters={project.characters}
            customVoices={project.customVoices || PRESET_CUSTOM_VOICES}
            onUpdateCharacter={(updated) =>
              setProject((prev) => ({
                ...prev,
                characters: prev.characters.map((c) => (c.id === updated.id ? updated : c)),
                segments: prev.segments.map((s) =>
                  s.speaker.toUpperCase() === updated.name.toUpperCase()
                    ? {
                        ...s,
                        voiceName: updated.voiceName,
                        voiceDescription: updated.voiceDescription,
                        pan: s.pan ?? updated.pan,
                        distance: s.distance ?? updated.distance,
                        acousticPreset: s.acousticPreset ?? updated.acousticPreset,
                      }
                    : s
                ),
              }))
            }
            onAddCharacter={(newChar) =>
              setProject((prev) => ({
                ...prev,
                characters: [...prev.characters, newChar],
              }))
            }
            onDeleteCharacter={(id) =>
              setProject((prev) => ({
                ...prev,
                characters: prev.characters.filter((c) => c.id !== id),
              }))
            }
            onSaveCustomVoice={(newVoice) =>
              setProject((prev) => {
                const current = prev.customVoices || PRESET_CUSTOM_VOICES;
                const filtered = current.filter((v) => v.id !== newVoice.id);
                return {
                  ...prev,
                  customVoices: [newVoice, ...filtered],
                };
              })
            }
            onDeleteCustomVoice={(id) =>
              setProject((prev) => ({
                ...prev,
                customVoices: (prev.customVoices || PRESET_CUSTOM_VOICES).filter(
                  (v) => v.id !== id
                ),
              }))
            }
            onPreviewVoice={handlePreviewVoice}
          />
        )}

        {activeTab === 'music' && (
          <MusicGeneratorPanel
            musicTrack={project.musicTrack}
            totalDuration={project.totalDuration}
            onUpdateMusicTrack={(trackUpdate) =>
              setProject((prev) => ({
                ...prev,
                musicTrack: { ...prev.musicTrack, ...trackUpdate },
              }))
            }
            onGenerateMusic={handleGenerateMusic}
            onPreviewMusic={handlePreviewMusic}
            onStopMusicPreview={handleStopMusicPreview}
            isPreviewingMusic={isPreviewingMusic}
            onAddSfxToTimeline={(type) => handleAddSfx(type, currentTime)}
          />
        )}
      </main>

      {/* Clip Director Modal */}
      {editingSegment && (
        <ClipEditorModal
          segment={editingSegment}
          characters={project.characters}
          onSave={(updated) =>
            setProject((prev) => ({
              ...prev,
              segments: prev.segments.map((s) => (s.id === updated.id ? updated : s)),
            }))
          }
          onClose={() => setEditingSegmentId(null)}
          onPreview={handlePreviewBuffer}
          onSynthesize={handleGenerateSingleTts}
          onActReferenceTransfer={handleActReferenceTransfer}
        />
      )}

      {/* Export Multi-Track Audio Modal */}
      {showExportModal && (
        <ExportModal
          project={project}
          onClose={() => setShowExportModal(false)}
          onImportProject={async (imported) => {
            saveProjectToStorage(project, transcript);
            handleStop();
            const res = await importProjectJsonToLibrary(imported, true);
            setProject(res.project);
            setTranscript(res.transcript);
            setCurrentTime(0);
            const refreshed = await listLibraryProjects();
            setLibraryProjects(refreshed);
          }}
        />
      )}

      {/* New Project / Clear Canvas Modal */}
      <NewProjectModal
        isOpen={showNewProjectModal}
        onClose={() => setShowNewProjectModal(false)}
        onConfirmBlank={(title, genre) => handleStartBlankProject(title, genre, true)}
        onLoadPreset={(key) => handleLoadPresetDrama(key, true)}
        onOpenLibrary={() => setActiveTab('library')}
      />

      {/* Background Rendering Queue Floating Bar */}
      <QueueProgressBar
        queue={queueState}
        onPause={handlePauseQueue}
        onResume={handleResumeQueue}
        onCancel={handleCancelQueue}
        onOpenSettings={() => setShowSettingsModal(true)}
      />

      {/* Studio Settings & Model Selection Modal */}
      <StudioSettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        settings={studioSettings}
        onUpdateSettings={handleUpdateStudioSettings}
      />
    </div>
  );
}
