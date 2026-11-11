import { getAudioContext } from './wavHelper';

export type MusicTheme =
  | 'cyberpunk'
  | 'noir'
  | 'horror'
  | 'scifi'
  | 'fantasy'
  | 'piano';

export interface ThemeConfig {
  name: string;
  bpm: number;
  scale: number[]; // Frequencies or semitones
  description: string;
  defaultPrompt: string;
}

export const MUSIC_THEMES: Record<MusicTheme, ThemeConfig> = {
  cyberpunk: {
    name: 'Cyberpunk Synthwave',
    bpm: 105,
    scale: [55, 65.41, 73.42, 82.41, 98], // A1, C2, D2, E2, G2
    description: 'Dark arpeggiated bass, neon synth pads, and driving tempo',
    defaultPrompt: 'Dark cyberpunk synthwave with pulsating arpeggiated bassline, retro neon synthesizer chords, and gritty dystopian cinematic atmosphere',
  },
  noir: {
    name: 'Dark Noir Jazz & Rain',
    bpm: 72,
    scale: [65.41, 77.78, 87.31, 98, 116.54], // Minor blues
    description: 'Melancholic slow chords, moody double bass, and smoky late-night ambience',
    defaultPrompt: 'Smoky slow film-noir jazz ballad with melancholic saxophone melodies, muted trumpet, warm upright acoustic bass, and gentle late-night raindrops',
  },
  horror: {
    name: 'Gothic Horror Suspense',
    bpm: 60,
    scale: [49, 51.91, 58.27, 61.74, 69.3], // Diminished / dissonant
    description: 'Chilling string swells, sub-bass drones, and eerie dissonant clusters',
    defaultPrompt: 'Terrifying atmospheric horror film soundtrack with bowed dissonant cello, screeching high violin clusters, hollow wind drone, and creeping dread',
  },
  scifi: {
    name: 'Deep Space Odyssey',
    bpm: 80,
    scale: [65.41, 73.42, 82.41, 98, 110], // Pentatonic space
    description: 'Ethereal cosmic pads, celestial shimmer, and floating tranquility',
    defaultPrompt: 'Expansive cosmic sci-fi ambient music with shimmering modular synth arpeggios, majestic celestial choir pads, and deep interstellar sub-bass',
  },
  fantasy: {
    name: 'Epic Orchestral Legend',
    bpm: 90,
    scale: [73.42, 82.41, 98, 110, 130.81], // D minor epic
    description: 'Rising French horn motifs, marching timpani, and heroic strings',
    defaultPrompt: 'Cinematic orchestral soundtrack with heroic brass horn melodies, swelling string section, thunderous cinematic percussion, and fantasy grandeur',
  },
  piano: {
    name: 'Melancholic Solo Piano',
    bpm: 68,
    scale: [130.81, 146.83, 164.81, 196, 220, 261.63], // Minor reflective
    description: 'Gentle reflective piano chords with soft emotional pedal reverb',
    defaultPrompt: 'Emotional solo acoustic piano soundtrack with expressive Rubato timing, warm felt hammers, gentle reflective melody, and cinematic sadness',
  },
};

/**
 * Generates rich, atmospheric music track matching the exact length and mood of the drama
 */
export async function generateAtmosphericTrack(
  themeKey: MusicTheme = 'cyberpunk',
  durationSeconds = 30
): Promise<AudioBuffer> {
  const ctx = getAudioContext();
  const sampleRate = ctx.sampleRate;
  const numFrames = Math.max(1, Math.floor(sampleRate * durationSeconds));
  const buffer = ctx.createBuffer(2, numFrames, sampleRate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  const theme = MUSIC_THEMES[themeKey] || MUSIC_THEMES.cyberpunk;
  const roots = theme.scale;

  for (let i = 0; i < numFrames; i++) {
    const t = i / sampleRate;
    // Fade in and fade out
    const fadeIn = Math.min(1, t / 2.5);
    const fadeOut = Math.min(1, (durationSeconds - t) / 3.0);
    const masterEnv = fadeIn * fadeOut;

    // Chord progression cycle every 6-8 seconds
    const chordIndex = Math.floor(t / 4) % roots.length;
    const baseFreq = roots[chordIndex];

    let lSignal = 0;
    let rSignal = 0;

    // Sub bass foundation
    const sub = Math.sin(2 * Math.PI * (baseFreq * 0.5) * t) * 0.28;
    lSignal += sub;
    rSignal += sub;

    // Pad / String layer with chorus detune
    const pad1 = Math.sin(2 * Math.PI * baseFreq * t);
    const pad2 = Math.sin(2 * Math.PI * (baseFreq * 1.004) * t);
    const fifth = Math.sin(2 * Math.PI * (baseFreq * 1.5) * t) * 0.6;
    const octave = Math.sin(2 * Math.PI * (baseFreq * 2.0) * t) * 0.4;
    const pad = (pad1 + pad2 + fifth + octave) * 0.12;

    // Spatial panning
    lSignal += pad * 0.85;
    rSignal += pad * 1.15;

    // Theme specific textures
    if (themeKey === 'cyberpunk') {
      // 16th note synth arpeggio
      const step = Math.floor(t * 7) % roots.length;
      const arpFreq = roots[step] * 2;
      const arpTime = (t * 7) % 1.0;
      const arpEnv = Math.exp(-arpTime * 3.5);
      const arp = Math.sin(2 * Math.PI * arpFreq * t) * arpEnv * 0.15;
      lSignal += arp * 0.7;
      rSignal += arp * 0.9;
    } else if (themeKey === 'noir') {
      // Gentle rainfall texture + slow jazz bass pulse
      const rainNoise = (Math.random() * 2 - 1) * 0.035;
      const bassPulse = Math.sin(2 * Math.PI * (baseFreq * 0.5) * t) * Math.exp(-((t % 1.2) * 2)) * 0.2;
      lSignal += rainNoise + bassPulse;
      rSignal += rainNoise + bassPulse;
    } else if (themeKey === 'horror') {
      // Dissonant microtonal cluster
      const screech = Math.sin(2 * Math.PI * (baseFreq * 3.14) * t + Math.sin(t * 3)) * 0.08;
      lSignal += screech;
      rSignal -= screech;
    } else {
      // Celestial harmonic overtone
      const chime = Math.sin(2 * Math.PI * (baseFreq * 4) * t) * 0.06 * (Math.sin(t * 0.5) > 0.5 ? 1 : 0.2);
      lSignal += chime;
      rSignal += chime;
    }

    left[i] = Math.max(-1, Math.min(1, lSignal * masterEnv * 0.85));
    right[i] = Math.max(-1, Math.min(1, rSignal * masterEnv * 0.85));
  }

  return buffer;
}
