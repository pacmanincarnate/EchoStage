import React, { useState, useRef } from 'react';
import {
  AudioSegment,
  CharacterVoice,
  PrebuiltVoiceName,
  AVAILABLE_VOICES,
  VOCAL_BURSTS,
  ACOUSTIC_PRESETS,
  AcousticPreset,
  AudioTake,
  VOCAL_DYNAMICS_PRESETS,
} from '../types/drama';
import {
  X,
  Sparkles,
  Volume2,
  Clock,
  Play,
  Mic,
  Square,
  Star,
  Check,
  Lock,
  Unlock,
  Sliders,
  Layers,
  Gauge,
} from 'lucide-react';
import {
  computeNormalizedSegmentGain,
  formatGainDb,
  linearGainToDb,
  measureAudioBufferLufs,
} from '../utils/wavHelper';

interface ClipEditorModalProps {
  segment: AudioSegment;
  characters: CharacterVoice[];
  onSave: (updated: AudioSegment) => void;
  onClose: () => void;
  onPreview: (segment: AudioSegment) => void;
  onSynthesize: (segment: AudioSegment) => void;
  onActReferenceTransfer?: (
    segment: AudioSegment,
    audioBase64: string,
    mimeType: string
  ) => Promise<void>;
}

export const ClipEditorModal: React.FC<ClipEditorModalProps> = ({
  segment,
  characters,
  onSave,
  onClose,
  onPreview,
  onSynthesize,
  onActReferenceTransfer,
}) => {
  const matchedChar = characters.find(
    (c) => c.name.toUpperCase() === segment.speaker.toUpperCase()
  );

  const [speaker, setSpeaker] = useState(segment.speaker);
  const [text, setText] = useState(segment.text);
  const [voiceName, setVoiceName] = useState<PrebuiltVoiceName>(segment.voiceName);
  const [voiceDescription, setVoiceDescription] = useState(
    segment.voiceDescription || matchedChar?.voiceDescription || ''
  );
  const [stylePrompt, setStylePrompt] = useState(segment.stylePrompt || '');
  const [subtextNote, setSubtextNote] = useState(segment.subtextNote || '');
  const [startTime, setStartTime] = useState(segment.startTime);
  const [volume, setVolume] = useState(segment.volume ?? 1);
  const [pauseAfterSec, setPauseAfterSec] = useState(segment.pauseAfterSec ?? 0.45);
  const [lockedPosition, setLockedPosition] = useState(!!segment.lockedPosition);
  const [pan, setPan] = useState(segment.pan ?? matchedChar?.pan ?? 0);
  const [distance, setDistance] = useState(segment.distance ?? matchedChar?.distance ?? 0.15);
  const [acousticPreset, setAcousticPreset] = useState<AcousticPreset>(
    segment.acousticPreset ?? matchedChar?.acousticPreset ?? 'studio_dry'
  );
  const [takes, setTakes] = useState<AudioTake[]>(segment.takes || []);
  const [activeTakeId, setActiveTakeId] = useState<string | undefined>(segment.activeTakeId);

  // Live Microphone Acting Reference State (Moonshot 3)
  const [isRecordingMic, setIsRecordingMic] = useState(false);
  const [isTransferringProsody, setIsTransferringProsody] = useState(false);
  const [micStatusMessage, setMicStatusMessage] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const insertTag = (tag: string) => {
    setText((prev) => `${prev.trim()} ${tag}`);
  };

  const handleSpeakerChange = (newSpeaker: string) => {
    setSpeaker(newSpeaker);
    const matched = characters.find((c) => c.name.toUpperCase() === newSpeaker.toUpperCase());
    if (matched) {
      setVoiceName(matched.voiceName);
      if (matched.stylePrompt) setStylePrompt(matched.stylePrompt);
      if (matched.voiceDescription) setVoiceDescription(matched.voiceDescription);
      if (typeof matched.pan === 'number') setPan(matched.pan);
      if (typeof matched.distance === 'number') setDistance(matched.distance);
      if (matched.acousticPreset) setAcousticPreset(matched.acousticPreset);
    }
  };

  // Switch active take from Take History
  const handleSelectTake = (take: AudioTake) => {
    setActiveTakeId(take.id);
    if (take.stylePrompt) setStylePrompt(take.stylePrompt);
    const updatedSeg: AudioSegment = {
      ...segment,
      speaker,
      text,
      voiceName,
      voiceDescription,
      stylePrompt: take.stylePrompt || stylePrompt,
      subtextNote,
      startTime,
      volume,
      pauseAfterSec,
      lockedPosition,
      pan,
      distance,
      acousticPreset,
      takes,
      activeTakeId: take.id,
      duration: take.duration,
      audioBase64: take.audioBase64,
      audioBuffer: take.audioBuffer,
      waveformPeaks: take.waveformPeaks,
      isDirtyText: false,
    };
    onSave(updatedSeg);
    if (take.audioBuffer) {
      onPreview(updatedSeg);
    }
  };

  const handleToggleStarTake = (takeId: string) => {
    setTakes((prev) =>
      prev.map((t) => (t.id === takeId ? { ...t, isStarred: !t.isStarred } : t))
    );
  };

  // Start / Stop Live Microphone Recording for Prosody Transfer (Moonshot 3)
  const handleStartMicRecording = async () => {
    try {
      setMicStatusMessage(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const dataUrl = reader.result as string;
          const base64 = dataUrl.split(',')[1] || '';
          if (base64 && onActReferenceTransfer) {
            setIsTransferringProsody(true);
            setMicStatusMessage(
              'Analyzing your vocal cadence, pauses & emotion with Gemini 3.8 Flash...'
            );
            try {
              await onActReferenceTransfer(
                {
                  ...segment,
                  speaker,
                  text,
                  voiceName,
                  voiceDescription,
                  stylePrompt,
                  subtextNote,
                  startTime,
                  volume,
                  pauseAfterSec,
                  lockedPosition,
                  pan,
                  distance,
                  acousticPreset,
                  takes,
                },
                base64,
                blob.type || 'audio/webm'
              );
              setMicStatusMessage('Prosody transferred and new take rendered!');
            } catch (err: any) {
              setMicStatusMessage(`Prosody transfer note: ${err?.message || 'Completed'}`);
            } finally {
              setIsTransferringProsody(false);
            }
          }
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecordingMic(true);
      setMicStatusMessage('Speak the line with your desired cadence, emotion, pauses or sighs...');
    } catch (err: any) {
      setMicStatusMessage(
        'Microphone access unavailable in this browser frame. You can still type acting prompts below.'
      );
    }
  };

  const handleStopMicRecording = () => {
    if (mediaRecorderRef.current && isRecordingMic) {
      mediaRecorderRef.current.stop();
      setIsRecordingMic(false);
    }
  };

  const handleSave = () => {
    const activeTake = takes.find((t) => t.id === activeTakeId);
    onSave({
      ...segment,
      speaker,
      text,
      voiceName,
      voiceDescription,
      stylePrompt,
      subtextNote,
      startTime: Math.max(0, startTime),
      volume,
      pauseAfterSec,
      lockedPosition,
      pan,
      distance,
      acousticPreset,
      takes,
      activeTakeId,
      duration: activeTake?.duration ?? segment.duration,
      audioBase64: activeTake?.audioBase64 ?? segment.audioBase64,
      audioBuffer: activeTake?.audioBuffer ?? segment.audioBuffer,
      waveformPeaks: activeTake?.waveformPeaks ?? segment.waveformPeaks,
      isDirtyText: text.trim() !== segment.text.trim() ? true : segment.isDirtyText,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col text-slate-100">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-violet-400" />
            <h3 className="font-bold text-sm tracking-tight text-white">
              Clip Director — Takes, Prosody Transfer & Spatial Acoustics
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body Form */}
        <div className="p-5 space-y-4 max-h-[78vh] overflow-y-auto text-xs">
          {/* PHASE 1: Multi-Take Audition History Bar */}
          {takes.length > 0 && (
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-amber-300 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" />
                  <span>Recorded Take History ({takes.length} Takes)</span>
                </span>
                <span className="text-[10px] text-slate-400">
                  Click any take to audition & make active
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {takes.map((take, idx) => {
                  const isActive =
                    take.id === activeTakeId || (!activeTakeId && idx === takes.length - 1);
                  return (
                    <div
                      key={take.id}
                      onClick={() => handleSelectTake(take)}
                      className={`p-2 rounded-lg border cursor-pointer transition flex items-center justify-between gap-2 ${
                        isActive
                          ? 'bg-violet-950/60 border-violet-500 text-white'
                          : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="truncate">
                        <div className="flex items-center gap-1.5 font-semibold text-xs">
                          {isActive && <Check className="w-3 h-3 text-cyan-400 shrink-0" />}
                          <span>{take.label || `Take #${idx + 1}`}</span>
                          <span className="text-[10px] font-mono text-slate-400 tabular-nums">
                            · {take.duration.toFixed(1)}s
                          </span>
                          {take.sourceType === 'act_reference' && (
                            <span className="text-[9px] text-amber-300 font-mono">· Mic Ref</span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate mt-0.5">
                          {take.stylePrompt}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleStarTake(take.id);
                          }}
                          className={`p-1 rounded ${
                            take.isStarred ? 'text-amber-400' : 'text-slate-600 hover:text-slate-400'
                          }`}
                          title="Star Favorite Take"
                        >
                          <Star className="w-3 h-3 fill-current" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* PHASE 3 MOONSHOT 3: Live Microphone "Act Reference" (Prosody Transfer) */}
          {onActReferenceTransfer && (
            <div className="p-3.5 rounded-xl bg-slate-950 border border-cyan-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="font-bold text-xs text-cyan-300 flex items-center gap-1.5">
                  <Mic className="w-3.5 h-3.5" />
                  <span>Live Microphone "Act Reference" (Multimodal Prosody Transfer)</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Speak this line into your mic. Gemini 3.8 Flash analyzes your exact pauses,
                  whisper, or urgency and transfers your performance into {speaker}'s voice.
                </p>
                {micStatusMessage && (
                  <p className="text-[11px] text-amber-300 font-medium mt-1">{micStatusMessage}</p>
                )}
              </div>

              <div className="shrink-0">
                {isRecordingMic ? (
                  <button
                    type="button"
                    onClick={handleStopMicRecording}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs animate-pulse"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>Stop & Transfer Prosody</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStartMicRecording}
                    disabled={isTransferringProsody}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold text-xs transition"
                  >
                    <Mic className="w-3.5 h-3.5" />
                    <span>
                      {isTransferringProsody ? 'Transferring...' : 'Record Acting Reference'}
                    </span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Character & Voice */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Speaker / Role</label>
              <select
                value={speaker}
                onChange={(e) => handleSpeakerChange(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-white focus:outline-none focus:border-violet-500"
              >
                {characters.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
                {!characters.some((c) => c.name.toUpperCase() === speaker.toUpperCase()) && (
                  <option value={speaker}>{speaker}</option>
                )}
              </select>
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">Gemini TTS Voice</label>
              <select
                value={voiceName}
                onChange={(e) => setVoiceName(e.target.value as PrebuiltVoiceName)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-white focus:outline-none focus:border-violet-500"
              >
                {AVAILABLE_VOICES.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name} ({v.tone.split(',')[0]})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Dialogue Text */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-slate-400 font-semibold">Spoken Line</label>
              <span className="text-[10px] text-slate-500">Insert Gemini vocal bursts below</span>
            </div>
            <textarea
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter character dialogue..."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-violet-500 font-sans leading-relaxed"
            />

            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="text-[10px] text-slate-400">Add acting burst:</span>
              {VOCAL_BURSTS.map((b) => (
                <button
                  key={b.tag}
                  type="button"
                  onClick={() => insertTag(b.tag)}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-violet-300 text-[10px] font-mono transition"
                  title={b.description}
                >
                  {b.tag}
                </button>
              ))}
            </div>
          </div>

          {/* Acting Style & Subtext */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 font-semibold mb-1">
                Acting Style / Emotional Delivery
              </label>
              <input
                type="text"
                value={stylePrompt}
                onChange={(e) => setStylePrompt(e.target.value)}
                placeholder="e.g. Whispering nervously, cynical detective"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-violet-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">
                Written Voice Persona / Subtext Note
              </label>
              <input
                type="text"
                value={voiceDescription}
                onChange={(e) => setVoiceDescription(e.target.value)}
                placeholder="e.g. Gravelly baritone with guarded tension"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* PHASE 2: Acoustic Environment DSP & Binaural Spatialization */}
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-emerald-400 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5" />
                <span>Acoustic Environment & Spatial Panning (WebAudio DSP)</span>
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                Live Playback + WAV Export
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-400 font-medium mb-1">
                  Room / Comms Filter
                </label>
                <select
                  value={acousticPreset}
                  onChange={(e) => setAcousticPreset(e.target.value as AcousticPreset)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs"
                >
                  {ACOUSTIC_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex justify-between mb-1 font-mono tabular-nums">
                  <span className="text-slate-400">Stereo Pan:</span>
                  <span className="text-cyan-400">
                    {Math.abs(pan) < 0.05
                      ? 'CENTER'
                      : pan < 0
                      ? `LEFT ${Math.round(Math.abs(pan) * 100)}%`
                      : `RIGHT ${Math.round(pan * 100)}%`}
                  </span>
                </div>
                <input
                  type="range"
                  min="-1"
                  max="1"
                  step="0.05"
                  value={pan}
                  onChange={(e) => setPan(parseFloat(e.target.value))}
                  className="w-full mt-1.5 bg-slate-800 rounded appearance-none cursor-pointer accent-cyan-400"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1 font-mono tabular-nums">
                  <span className="text-slate-400">Room Distance:</span>
                  <span className="text-amber-400">{Math.round(distance * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="0.9"
                  step="0.05"
                  value={distance}
                  onChange={(e) => setDistance(parseFloat(e.target.value))}
                  className="w-full mt-1.5 bg-slate-800 rounded appearance-none cursor-pointer accent-amber-400"
                />
              </div>
            </div>
          </div>

          {/* Clip Volume Dynamics (Whisper / Normal / Yell) & LUFS Loudness Normalization */}
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-400">
                <Volume2 className="w-3.5 h-3.5" />
                <span>Clip Volume Gain & Vocal Dynamics (Whisper ↔ Yelling)</span>
              </div>

              <div className="flex items-center gap-2 font-mono tabular-nums text-[11px]">
                {segment.audioBuffer && (
                  <>
                    <span className="text-slate-400">
                      Raw:{' '}
                      {(
                        segment.measuredLufs ??
                        measureAudioBufferLufs(segment.audioBuffer).integratedLufs
                      ).toFixed(1)}{' '}
                      LUFS
                    </span>
                    <span className="text-slate-600">·</span>
                    <span className="text-cyan-300">
                      Out:{' '}
                      {(
                        (segment.measuredLufs ??
                          measureAudioBufferLufs(segment.audioBuffer).integratedLufs) +
                        linearGainToDb(volume)
                      ).toFixed(1)}{' '}
                      LUFS
                    </span>
                    <span className="text-slate-600">·</span>
                  </>
                )}
                <span className="text-emerald-400 font-bold">
                  {Math.round(volume * 100)}% ({formatGainDb(volume)})
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setVolume((prev) => Math.max(0.1, Math.round((prev - 0.1) * 100) / 100))
                }
                className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-mono text-xs"
                title="Decrease clip volume (-10%)"
              >
                -10%
              </button>
              <input
                type="range"
                min="0.1"
                max="2.4"
                step="0.02"
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="flex-1 h-1.5 bg-slate-800 rounded appearance-none cursor-pointer accent-emerald-500"
              />
              <button
                type="button"
                onClick={() =>
                  setVolume((prev) => Math.min(2.4, Math.round((prev + 0.1) * 100) / 100))
                }
                className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-mono text-xs"
                title="Increase clip volume (+10%)"
              >
                +10%
              </button>
            </div>

            {/* Quick Vocal Dynamics Presets (Whisper, Subdued, Normal, Projected, Yelling) + Auto-LUFS */}
            <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
              <div className="flex items-center flex-wrap gap-1.5">
                <span className="text-[10px] text-slate-400 mr-1">Vocal Level:</span>
                {VOCAL_DYNAMICS_PRESETS.map((preset) => {
                  const isSelected = Math.abs(volume - preset.volume) < 0.06;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setVolume(preset.volume)}
                      className={`px-2 py-1 rounded text-[11px] font-medium border transition whitespace-nowrap ${
                        isSelected
                          ? 'bg-emerald-600/30 border-emerald-500 text-emerald-200'
                          : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
                      }`}
                      title={`${preset.description} (${preset.dbLabel})`}
                    >
                      <span>{preset.label}</span>
                      <span className="font-mono text-[10px] text-slate-400 ml-1">
                        {preset.dbLabel}
                      </span>
                    </button>
                  );
                })}
              </div>

              {segment.audioBuffer && (
                <button
                  type="button"
                  onClick={() => {
                    if (!segment.audioBuffer) return;
                    const norm = computeNormalizedSegmentGain(segment.audioBuffer, -16);
                    setVolume(norm.gain);
                  }}
                  className="px-2.5 py-1 rounded bg-cyan-950/70 hover:bg-cyan-900/80 border border-cyan-700/60 text-cyan-300 font-semibold text-[11px] flex items-center gap-1 transition whitespace-nowrap"
                  title="Analyze this clip's audio buffer and set gain to match -16 LUFS broadcast standard"
                >
                  <Gauge className="w-3 h-3" />
                  <span>Match -16 LUFS</span>
                </button>
              )}
            </div>
          </div>

          {/* Timing & Pause/Overlap After Line */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            <div>
              <div className="flex items-center justify-between mb-1 font-mono tabular-nums">
                <label className="text-slate-400 font-semibold flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Start (s)</span>
                </label>
                <button
                  type="button"
                  onClick={() => setLockedPosition(!lockedPosition)}
                  className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${
                    lockedPosition ? 'bg-amber-950 text-amber-300' : 'text-slate-400'
                  }`}
                >
                  {lockedPosition ? <Lock className="w-2.5 h-2.5" /> : <Unlock className="w-2.5 h-2.5" />}
                  <span>{lockedPosition ? 'Locked' : 'Unlocked'}</span>
                </button>
              </div>
              <div className="flex items-center gap-1 font-mono tabular-nums">
                <button
                  type="button"
                  onClick={() => setStartTime((prev) => Math.max(0, prev - 0.25))}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  -0.25
                </button>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={startTime}
                  onChange={(e) => setStartTime(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-center text-white"
                />
                <button
                  type="button"
                  onClick={() => setStartTime((prev) => prev + 0.25)}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  +0.25
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1 font-mono tabular-nums">
                <span className="text-slate-400 font-semibold">Pause / Overlap After</span>
                <span className={pauseAfterSec < 0 ? 'text-rose-400' : 'text-cyan-400'}>
                  {pauseAfterSec < 0 ? `${pauseAfterSec}s (Overlap)` : `+${pauseAfterSec}s`}
                </span>
              </div>
              <input
                type="range"
                min="-1.2"
                max="3.0"
                step="0.05"
                value={pauseAfterSec}
                onChange={(e) => setPauseAfterSec(parseFloat(e.target.value))}
                className="w-full mt-2 bg-slate-800 rounded appearance-none cursor-pointer accent-violet-500"
              />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            {segment.audioBuffer && (
              <button
                type="button"
                onClick={() =>
                  onPreview({
                    ...segment,
                    volume,
                    pan,
                    distance,
                    acousticPreset,
                  })
                }
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs font-semibold"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>Audition with DSP</span>
              </button>
            )}

            <button
              type="button"
              onClick={() =>
                onSynthesize({
                  ...segment,
                  speaker,
                  text,
                  voiceName,
                  voiceDescription,
                  stylePrompt,
                  subtextNote,
                  startTime,
                  volume,
                  pauseAfterSec,
                  lockedPosition,
                  pan,
                  distance,
                  acousticPreset,
                  takes,
                })
              }
              disabled={segment.isGenerating}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-violet-600/30 hover:bg-violet-600/50 text-violet-300 border border-violet-500/40 text-xs font-semibold"
            >
              <Sparkles className="w-3 h-3" />
              <span>{segment.isGenerating ? 'Rendering Take...' : 'Render New Take (TTS)'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold shadow-md shadow-violet-600/20"
            >
              Apply Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
