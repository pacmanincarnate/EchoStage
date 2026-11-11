import { getAudioContext, audioBufferToWavBlob } from './wavHelper';
import { PrebuiltVoiceName } from '../types/drama';

/**
 * Speech Formant Synthesizer
 * Generates speech-like audio buffers with word rhythms and vocal formants
 * when Gemini API quota is rate-limited (3 req/min on free tier).
 */
export async function synthesizeProceduralSpeech(
  text: string,
  voiceName: PrebuiltVoiceName,
  speedMultiplier = 1.0
): Promise<{ buffer: AudioBuffer; base64: string; duration: number }> {
  const ctx = getAudioContext();
  const sampleRate = ctx.sampleRate;

  // Voice fundamental pitch (F0) configuration
  let f0 = 135; // Default mid-range
  let roughness = 0.05;

  switch (voiceName) {
    case 'Charon':
      f0 = 92; // Deep authoritative baritone
      roughness = 0.08;
      break;
    case 'Fenrir':
      f0 = 108; // Gritty rugged male
      roughness = 0.18;
      break;
    case 'Puck':
      f0 = 145; // Energetic dynamic mid
      roughness = 0.06;
      break;
    case 'Kore':
      f0 = 215; // Warm expressive female
      roughness = 0.03;
      break;
    case 'Zephyr':
      f0 = 245; // Bright youthful female
      roughness = 0.02;
      break;
    case 'Aoede':
      f0 = 195; // Sophisticated melodic female
      roughness = 0.04;
      break;
  }

  // Parse words and approximate syllables
  const cleanWords = text.replace(/<[^>]+>/g, '').replace(/\|[^|]+\|/g, '').trim().split(/\s+/);
  const words = cleanWords.length > 0 ? cleanWords : ['speech'];

  // Average syllable length ~0.22s
  let totalDuration = 0;
  const wordTimings: Array<{ duration: number; syllables: number; word: string }> = [];

  for (const w of words) {
    const vowelMatches = w.match(/[aeiouy]+/gi);
    const syllableCount = Math.max(1, vowelMatches ? vowelMatches.length : 1);
    const wordDur = Math.max(0.24, syllableCount * 0.18 + 0.06) / speedMultiplier;
    wordTimings.push({ duration: wordDur, syllables: syllableCount, word: w });
    totalDuration += wordDur + (0.08 / speedMultiplier); // inter-word pause
  }

  totalDuration = Math.max(1.2, totalDuration + 0.3);
  const numFrames = Math.floor(sampleRate * totalDuration);
  const buffer = ctx.createBuffer(2, numFrames, sampleRate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  // Vowel formant frequencies: [F1, F2, F3]
  const vowelFormants = [
    [730, 1090, 2440], // 'ah'
    [270, 2290, 3010], // 'ee'
    [530, 1840, 2480], // 'eh'
    [570, 840, 2410],  // 'oh'
    [300, 870, 2240],  // 'oo'
  ];

  let currentSample = 0;

  for (let wIdx = 0; wIdx < wordTimings.length; wIdx++) {
    const wordInfo = wordTimings[wIdx];
    const wordFrames = Math.floor(wordInfo.duration * sampleRate);
    const sylFrames = Math.floor(wordFrames / wordInfo.syllables);

    for (let s = 0; s < wordInfo.syllables; s++) {
      const formants = vowelFormants[(wIdx + s) % vowelFormants.length];
      const startFrame = currentSample + s * sylFrames;
      const endFrame = Math.min(numFrames, startFrame + sylFrames);

      for (let i = startFrame; i < endFrame; i++) {
        const localT = (i - startFrame) / sylFrames;
        const globalT = i / sampleRate;

        // Syllable amplitude envelope (attack, sustain, decay)
        let env = 0;
        if (localT < 0.15) {
          env = localT / 0.15;
        } else if (localT < 0.75) {
          env = 1.0;
        } else {
          env = Math.max(0, (1.0 - localT) / 0.25);
        }

        // Intonation pitch contour (slight rise-fall across word)
        const pitchDrift = Math.sin(localT * Math.PI) * 12 - (wIdx % 2 === 1 ? 5 : 0);
        const pitch = f0 + pitchDrift;

        // Glottal pulse waveform
        const phase = (globalT * pitch) % 1.0;
        const glottal = (phase < 0.7 ? Math.sin((phase / 0.7) * Math.PI) : 0) - 0.2;

        // Vocal tract resonances (Formants F1, F2, F3)
        const f1Wave = Math.sin(2 * Math.PI * formants[0] * globalT) * 0.45;
        const f2Wave = Math.sin(2 * Math.PI * formants[1] * globalT) * 0.35;
        const f3Wave = Math.sin(2 * Math.PI * formants[2] * globalT) * 0.2;

        // Consonant transient at start of syllable
        const fricative = localT < 0.1 ? (Math.random() * 2 - 1) * 0.15 : 0;
        const voiceRoughness = (Math.random() - 0.5) * roughness;

        const sampleVal = (glottal * (f1Wave + f2Wave + f3Wave) + fricative + voiceRoughness) * env * 0.65;

        left[i] = Math.max(-1, Math.min(1, sampleVal));
        right[i] = Math.max(-1, Math.min(1, sampleVal * 0.95));
      }
    }

    currentSample += wordFrames + Math.floor(0.08 * sampleRate);
  }

  // Convert buffer to base64 WAV
  const wavBlob = audioBufferToWavBlob(buffer);
  const arrayBuffer = await wavBlob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(arrayBuffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  return {
    buffer,
    base64,
    duration: totalDuration,
  };
}

/**
 * Triggers native browser SpeechSynthesis in parallel with playback for crystal-clear vocal words
 */
export function speakBrowserSpeech(text: string, voiceName: PrebuiltVoiceName, volume = 1.0) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;

  try {
    window.speechSynthesis.cancel();
    // Remove tags like <laugh>, <breath>, |yeah| for spoken speech
    const cleanText = text
      .replace(/<[^>]+>/g, '')
      .replace(/\|[^|]+\|/g, '')
      .trim();

    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.volume = Math.min(1, Math.max(0, volume));

    // Pitch matching character persona
    if (voiceName === 'Charon') {
      utterance.pitch = 0.65;
      utterance.rate = 0.9;
    } else if (voiceName === 'Fenrir') {
      utterance.pitch = 0.75;
      utterance.rate = 0.95;
    } else if (voiceName === 'Puck') {
      utterance.pitch = 1.1;
      utterance.rate = 1.05;
    } else if (voiceName === 'Kore') {
      utterance.pitch = 1.2;
      utterance.rate = 1.0;
    } else if (voiceName === 'Zephyr') {
      utterance.pitch = 1.35;
      utterance.rate = 1.1;
    } else if (voiceName === 'Aoede') {
      utterance.pitch = 1.15;
      utterance.rate = 0.95;
    }

    window.speechSynthesis.speak(utterance);
  } catch (e) {
    // Ignore speech synthesis failures
  }
}
