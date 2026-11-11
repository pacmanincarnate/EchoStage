export type PrebuiltVoiceName = 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr' | 'Aoede';

export interface VoiceInfo {
  name: PrebuiltVoiceName;
  gender: 'male' | 'female' | 'neutral';
  tone: string;
  description: string;
}

export const AVAILABLE_VOICES: VoiceInfo[] = [
  {
    name: 'Puck',
    gender: 'neutral',
    tone: 'Playful, dynamic, expressive',
    description: 'Versatile mid-range voice, great for heroes, rogues, and quick dialogue.',
  },
  {
    name: 'Charon',
    gender: 'male',
    tone: 'Deep, resonant, authoritative baritone',
    description: 'Commanding tone ideal for narrators, detectives, villains, and older characters.',
  },
  {
    name: 'Kore',
    gender: 'female',
    tone: 'Warm, articulate, emotionally rich',
    description: 'Clear, resonant female voice perfect for protagonists, scientists, and dramatic leads.',
  },
  {
    name: 'Fenrir',
    gender: 'male',
    tone: 'Rugged, gritty, intense',
    description: 'Low-pitched, gravelly timbre for soldiers, antiheroes, monsters, and tough cynics.',
  },
  {
    name: 'Zephyr',
    gender: 'female',
    tone: 'Bright, airy, youthful, swift',
    description: 'Light, nimble voice for youthful characters, AI assistants, and quick-witted companions.',
  },
  {
    name: 'Aoede',
    gender: 'female',
    tone: 'Melodic, sophisticated, elegant',
    description: 'Rich, stately tone suited for royalty, mystic figures, and poised narrators.',
  },
];

export type AcousticPreset =
  | 'studio_dry'
  | 'walkie_talkie'
  | 'telephone'
  | 'cave_vault'
  | 'muffled_door'
  | 'cyber_modulator';

export interface AcousticPresetInfo {
  id: AcousticPreset;
  label: string;
  shortLabel: string;
  description: string;
}

export const ACOUSTIC_PRESETS: AcousticPresetInfo[] = [
  {
    id: 'studio_dry',
    label: 'Studio Dry (Close Mic)',
    shortLabel: 'Dry',
    description: 'Crisp, intimate broadcast vocal with zero coloration.',
  },
  {
    id: 'walkie_talkie',
    label: 'Tactical Comms / Walkie-Talkie',
    shortLabel: 'Comms',
    description: 'Bandpass radio filter (450Hz–2.8kHz) with subtle harmonic saturation.',
  },
  {
    id: 'telephone',
    label: 'Vintage Telephone Line',
    shortLabel: 'Phone',
    description: 'Narrow mid-focused telephony filter for remote callers.',
  },
  {
    id: 'cave_vault',
    label: 'Cavernous Vault Reverb',
    shortLabel: 'Vault',
    description: 'Spacious stereo convolution reverb for halls, tunnels, and vaults.',
  },
  {
    id: 'muffled_door',
    label: 'Behind Closed Door / Bulkhead',
    shortLabel: 'Occluded',
    description: 'Low-pass acoustic occlusion simulating speech through a heavy wall.',
  },
  {
    id: 'cyber_modulator',
    label: 'Cybernetic AI / Spectral Chorus',
    shortLabel: 'Cyber FX',
    description: 'Metallic comb & ring modulation for mainframes, androids, and apparitions.',
  },
];

export interface AudioTake {
  id: string;
  createdAt: string;
  label: string;
  stylePrompt: string;
  duration: number;
  audioBase64?: string;
  audioBuffer?: AudioBuffer;
  waveformPeaks?: number[];
  isStarred?: boolean;
  sourceType?: 'tts' | 'act_reference' | 'instant';
}

export interface TensionNode {
  id: string;
  timeRatio: number; // 0..1 across totalDuration
  intensity: number; // 0..1 (0 = calm/intimate, 1 = peak climax/panic)
  label?: string;
}

export const DEFAULT_TENSION_CURVES: Record<string, { name: string; description: string; nodes: TensionNode[] }> = {
  rising_climax: {
    name: 'Rising Climax',
    description: 'Starts measured, builds steadily to a high-stakes confrontation, then exhales.',
    nodes: [
      { id: 'tn-1', timeRatio: 0.0, intensity: 0.2, label: 'Setup' },
      { id: 'tn-2', timeRatio: 0.35, intensity: 0.45, label: 'Discovery' },
      { id: 'tn-3', timeRatio: 0.75, intensity: 0.92, label: 'Climax' },
      { id: 'tn-4', timeRatio: 1.0, intensity: 0.35, label: 'Aftermath' },
    ],
  },
  sudden_ambush: {
    name: 'Sudden Ambush',
    description: 'Quiet atmospheric opening interrupted by an immediate spike in panic and overlaps.',
    nodes: [
      { id: 'tn-1', timeRatio: 0.0, intensity: 0.15, label: 'Quiet' },
      { id: 'tn-2', timeRatio: 0.28, intensity: 0.2, label: 'Tension' },
      { id: 'tn-3', timeRatio: 0.42, intensity: 0.96, label: 'Ambush!' },
      { id: 'tn-4', timeRatio: 0.85, intensity: 0.8, label: 'Escape' },
      { id: 'tn-5', timeRatio: 1.0, intensity: 0.5, label: 'Cliffhanger' },
    ],
  },
  slow_burn: {
    name: 'Noir Slow Burn',
    description: 'Simmering subtext with deliberate pauses, peaking subtly near the final reveal.',
    nodes: [
      { id: 'tn-1', timeRatio: 0.0, intensity: 0.25, label: 'Intro' },
      { id: 'tn-2', timeRatio: 0.5, intensity: 0.4, label: 'Interrogation' },
      { id: 'tn-3', timeRatio: 0.85, intensity: 0.72, label: 'Reveal' },
      { id: 'tn-4', timeRatio: 1.0, intensity: 0.3, label: 'Fade' },
    ],
  },
};

export interface CustomVoiceDefinition {
  id: string;
  name: string;
  description: string; // The written voice persona description prompt
  baseVoice: PrebuiltVoiceName;
  avatarColor: string;
  samplePhrase?: string;
  isPreset?: boolean;
}

export const PRESET_CUSTOM_VOICES: CustomVoiceDefinition[] = [
  {
    id: 'voice-noir-detective',
    name: 'Gravelly Noir Gumshoe',
    description: 'A world-weary 1940s private detective with a cigarette-smoked rasp, dry deadpan cadence, and cynical low baritone undertone.',
    baseVoice: 'Fenrir',
    avatarColor: '#f59e0b',
    samplePhrase: 'The rain was coming down hard, and trouble was knocking right on schedule.',
    isPreset: true,
  },
  {
    id: 'voice-cyber-ai',
    name: 'Synthetic Cyber AI',
    description: 'A monotone, cold cybernetic mainframe protocol speaking with robotic precision, calculated pauses, and emotionless digital resonance.',
    baseVoice: 'Charon',
    avatarColor: '#06b6d4',
    samplePhrase: 'Warning: Quantum core integrity at forty percent. Containment failure is imminent.',
    isPreset: true,
  },
  {
    id: 'voice-ethereal-phantom',
    name: 'Ethereal Spectral Whisper',
    description: 'An eerie, haunting apparition with soft breathy vocal tremors, chilling hollow whispers, and floating melancholic pitch drifts.',
    baseVoice: 'Zephyr',
    avatarColor: '#10b981',
    samplePhrase: 'Why have you walked into the shadows... where the living were never meant to tread?',
    isPreset: true,
  },
  {
    id: 'voice-daring-rogue',
    name: 'Witty Cocky Smuggler',
    description: 'A charming, fast-talking rogue with playful swagger, energetic tempo, bright wry chuckle, and cocky comedic timing.',
    baseVoice: 'Puck',
    avatarColor: '#ec4899',
    samplePhrase: 'Never tell me the odds unless you brought extra credits to back up your bet!',
    isPreset: true,
  },
  {
    id: 'voice-ancient-monarch',
    name: 'Regal Imperial Sovereign',
    description: 'A stately aristocratic monarch with majestic resonance, measured classical diction, commanding poise, and deep dignified authority.',
    baseVoice: 'Aoede',
    avatarColor: '#8b5cf6',
    samplePhrase: 'By royal decree, the borders are sealed until the treasonous artifact is recovered.',
    isPreset: true,
  },
  {
    id: 'voice-passionate-scientist',
    name: 'Urgent Astrobiologist',
    description: 'An articulate, breathless researcher speaking with intellectual fervor, rapid analytical curiosity, and nervous excitement.',
    baseVoice: 'Kore',
    avatarColor: '#3b82f6',
    samplePhrase: 'Look at these readings! This is not mineral formation, it is an organic bio-signature!',
    isPreset: true,
  },
];

export interface CharacterVoice {
  id: string;
  name: string;
  voiceName: PrebuiltVoiceName;
  customVoiceId?: string;
  voiceDescription?: string; // Written description defining this persona
  stylePrompt: string;
  color: string;
  description?: string;
  pitch?: number;
  rate?: number;
  pan?: number; // -1 (Left) to +1 (Right), default 0
  distance?: number; // 0 (Close) to 1 (Far), default 0.15
  acousticPreset?: AcousticPreset;
}

export interface AudioSegment {
  id: string;
  speaker: string;
  text: string;
  stylePrompt: string;
  voiceName: PrebuiltVoiceName;
  voiceDescription?: string; // Written persona description for Gemini TTS
  startTime: number; // in seconds on timeline
  duration: number; // in seconds
  audioBase64?: string;
  audioUrl?: string;
  audioBuffer?: AudioBuffer;
  waveformPeaks?: number[]; // normalized 0..1 for rendering
  volume: number; // 0.05..2.5 (1.0 = 0 dB unity gain)
  measuredLufs?: number; // Raw ITU-R BS.1770 integrated loudness of the segment buffer (in LUFS)
  targetLufs?: number; // Target LUFS level when normalized (e.g. -16 LUFS)
  isGenerating?: boolean;
  error?: string;
  soundEffectCue?: string;
  // Phase 1-3 additions
  takes?: AudioTake[];
  activeTakeId?: string;
  pauseAfterSec?: number; // Custom gap after this line (-1.5s overlap to +5.0s pause)
  lockedPosition?: boolean; // If true, ripple align won't move this clip
  isDirtyText?: boolean; // True when transcript text was updated via diff-sync but audio hasn't been re-rendered yet
  subtextNote?: string; // Subtext director annotation
  pan?: number; // Override character pan (-1..1)
  distance?: number; // Override character distance (0..1)
  acousticPreset?: AcousticPreset; // Override character room/comms DSP
}

export interface LufsTargetPreset {
  lufs: number;
  label: string;
  shortLabel: string;
  description: string;
}

export const LUFS_PRESETS: LufsTargetPreset[] = [
  {
    lufs: -14,
    label: '-14 LUFS (Streaming / Loud)',
    shortLabel: '-14 LUFS',
    description: 'High-impact loudness suited for mobile listening and streaming platforms.',
  },
  {
    lufs: -16,
    label: '-16 LUFS (Podcast & Audio Drama Standard)',
    shortLabel: '-16 LUFS',
    description: 'Broadcast & stereo podcast standard with balanced headroom for vocal dynamics.',
  },
  {
    lufs: -18,
    label: '-18 LUFS (Narrative Fiction / Warm)',
    shortLabel: '-18 LUFS',
    description: 'Natural dramatic dialogue standard with extra headroom for loud outbursts.',
  },
  {
    lufs: -23,
    label: '-23 LUFS (EBU R128 Cinema / Broadcast)',
    shortLabel: '-23 LUFS',
    description: 'Wide theatrical dynamic range for cinema and European broadcast specs.',
  },
];

export interface VocalDynamicPreset {
  id: string;
  label: string;
  volume: number; // linear gain multiplier
  dbLabel: string;
  description: string;
}

export const VOCAL_DYNAMICS_PRESETS: VocalDynamicPreset[] = [
  {
    id: 'whisper',
    label: 'Whisper',
    volume: 0.32,
    dbLabel: '-9.9 dB',
    description: 'Hushed, intimate or stealthy whisper level',
  },
  {
    id: 'quiet',
    label: 'Subdued',
    volume: 0.6,
    dbLabel: '-4.4 dB',
    description: 'Soft-spoken aside or guarded murmur',
  },
  {
    id: 'normal',
    label: 'Normal',
    volume: 1.0,
    dbLabel: '0.0 dB',
    description: 'Standard conversational unity gain',
  },
  {
    id: 'projected',
    label: 'Projected',
    volume: 1.35,
    dbLabel: '+2.6 dB',
    description: 'Commanding, urgent or raised voice',
  },
  {
    id: 'yell',
    label: 'Yelling',
    volume: 1.8,
    dbLabel: '+5.1 dB',
    description: 'High-intensity shout, alarm or climax outburst',
  },
];

export interface MusicTrack {
  enabled: boolean;
  prompt: string;
  genre: string;
  modelType: 'clip' | 'pro'; // lyria-3-clip-preview or lyria-3-pro-preview
  durationSeconds: number;
  volume: number; // 0..1
  ducking: boolean; // Auto-lower volume when speech is playing
  duckingAmount: number; // duck down to 20%
  audioBase64?: string;
  audioUrl?: string;
  audioBuffer?: AudioBuffer;
  isGenerating?: boolean;
  error?: string;
}

export type SfxType =
  | 'rain'
  | 'thunder'
  | 'footsteps'
  | 'door_creak'
  | 'siren'
  | 'gunshot'
  | 'space_drone'
  | 'sci_fi_hum'
  | 'heartbeat'
  | 'cafe'
  | 'custom';

export interface SfxClip {
  id: string;
  name: string;
  type: SfxType;
  startTime: number;
  duration: number;
  volume: number;
  audioBuffer?: AudioBuffer;
  audioBase64?: string;
  waveformPeaks?: number[];
  loop?: boolean;
  pan?: number; // -1..1
  distance?: number; // 0..1
  isCustomUpload?: boolean;
}

export interface DramaProject {
  id: string;
  title: string;
  genre: string;
  totalDuration: number;
  characters: CharacterVoice[];
  customVoices?: CustomVoiceDefinition[];
  segments: AudioSegment[];
  musicTrack: MusicTrack;
  sfxClips: SfxClip[];
  bpm?: number;
  tensionCurve?: TensionNode[];
  subtextNote?: string;
}

export const VOCAL_BURSTS = [
  { tag: '<laugh>', label: 'Laugh', description: 'Natural chuckle or laughter burst' },
  { tag: '<gasp>', label: 'Gasp', description: 'Sharp intake of breath from shock' },
  { tag: '<breath>', label: 'Breath', description: 'Audible sigh or tension breath' },
  { tag: '|yeah|', label: 'Backchannel "Yeah"', description: 'Conversational nod' },
  { tag: '|mhm|', label: 'Backchannel "Mhm"', description: 'Agreement backchannel hum' },
];

export type TtsModelType = 'gemini-3.8-flash-tts' | 'gemini-3.8-flash-lite-tts';

export interface StudioSettings {
  ttsModel: TtsModelType;
  enableSceneBatching: boolean;
  throttlePacingSeconds: number; // e.g. 20 for free tier safe (3 req/min), 0 for fast/paid tier
  autoRetryOnRateLimit: boolean;
}

export const DEFAULT_STUDIO_SETTINGS: StudioSettings = {
  ttsModel: 'gemini-3.8-flash-tts',
  enableSceneBatching: true,
  throttlePacingSeconds: 20,
  autoRetryOnRateLimit: true,
};
