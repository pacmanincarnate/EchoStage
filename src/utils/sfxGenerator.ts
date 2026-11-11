import { getAudioContext } from './wavHelper';
import { SfxType } from '../types/drama';

/**
 * Procedural Foley & Sound Effect Synthesizer
 * Generates rich, authentic audio effects using Web Audio API synthesis
 */
export async function generateProceduralSfx(
  type: SfxType,
  durationSec = 3
): Promise<AudioBuffer> {
  const ctx = getAudioContext();
  const sampleRate = ctx.sampleRate;
  const numFrames = Math.max(1, Math.floor(sampleRate * durationSec));
  const buffer = ctx.createBuffer(2, numFrames, sampleRate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  switch (type) {
    case 'rain': {
      // Pink/Brown noise filtered for steady rain with random droplets
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < numFrames; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99 * b0 + white * 0.05;
        b1 = 0.95 * b1 + white * 0.1;
        b2 = 0.85 * b2 + white * 0.2;
        let rain = (b0 + b1 + b2) * 0.4;

        // Occasional droplet splash
        if (Math.random() < 0.001) {
          rain += (Math.random() - 0.5) * 0.6;
        }

        const pan = 0.4 + Math.sin(i / 10000) * 0.2;
        left[i] = rain * (1 - pan);
        right[i] = rain * pan;
      }
      break;
    }

    case 'thunder': {
      // Low sub rumble with initial explosive transient
      let rumble = 0;
      for (let i = 0; i < numFrames; i++) {
        const t = i / sampleRate;
        const env = Math.exp(-t * 0.8) * (1 - Math.exp(-t * 30));
        const sub = Math.sin(2 * Math.PI * 45 * t + Math.sin(2 * Math.PI * 8 * t) * 2);
        const noise = (Math.random() * 2 - 1) * 0.4;
        rumble = 0.96 * rumble + noise * 0.08;

        const val = (sub * 0.6 + rumble * 0.7) * env;
        left[i] = Math.max(-1, Math.min(1, val * 1.3));
        right[i] = Math.max(-1, Math.min(1, val * 1.2));
      }
      break;
    }

    case 'footsteps': {
      // Rhythmic gravel/wood footsteps with floor resonance
      const stepInterval = 0.65;
      for (let i = 0; i < numFrames; i++) {
        const t = i / sampleRate;
        const stepTime = t % stepInterval;
        let step = 0;
        if (stepTime < 0.15) {
          const impactEnv = Math.exp(-stepTime * 35);
          const freq = 90 + Math.sin(t * 10) * 20;
          const body = Math.sin(2 * Math.PI * freq * stepTime) * impactEnv;
          const scuff = (Math.random() * 2 - 1) * Math.exp(-stepTime * 25) * 0.5;
          step = (body + scuff) * 0.8;
        }
        left[i] = step * 0.9;
        right[i] = step * 1.1;
      }
      break;
    }

    case 'door_creak': {
      // Slowly modulating resonant friction screech
      for (let i = 0; i < numFrames; i++) {
        const t = i / sampleRate;
        const progress = t / durationSec;
        const env = Math.sin(progress * Math.PI);
        const freq = 320 + Math.sin(t * 45) * 140 + Math.sin(t * 12) * 80;
        const friction = Math.sin(2 * Math.PI * freq * t);
        const harmonic = Math.sin(2 * Math.PI * freq * 1.5 * t) * 0.4;
        const grit = (Math.random() - 0.5) * 0.15;
        const creak = (friction + harmonic + grit) * env * 0.4;

        left[i] = creak;
        right[i] = creak * 0.9;
      }
      break;
    }

    case 'siren': {
      // Classic police/emergency warble
      for (let i = 0; i < numFrames; i++) {
        const t = i / sampleRate;
        const lfo = (Math.sin(2 * Math.PI * 0.5 * t) + 1) / 2; // 0 to 1
        const freq = 650 + lfo * 450;
        const wave = Math.sin(2 * Math.PI * freq * t) + 0.3 * Math.sin(2 * Math.PI * freq * 2 * t);
        const pan = 0.5 + Math.sin(2 * Math.PI * 0.2 * t) * 0.3;

        left[i] = wave * 0.25 * (1 - pan);
        right[i] = wave * 0.25 * pan;
      }
      break;
    }

    case 'gunshot': {
      // Sharp crack followed by resonant acoustic reverb tail
      let tail = 0;
      for (let i = 0; i < numFrames; i++) {
        const t = i / sampleRate;
        const crackEnv = Math.exp(-t * 90);
        const tailEnv = Math.exp(-t * 2.2);
        const crack = (Math.random() * 2 - 1) * crackEnv * 1.4;
        const subKick = Math.sin(2 * Math.PI * 75 * t) * Math.exp(-t * 15) * 0.8;

        tail = 0.92 * tail + (Math.random() * 2 - 1) * 0.15;
        const val = crack + subKick + tail * tailEnv * 0.4;

        left[i] = Math.max(-1, Math.min(1, val));
        right[i] = Math.max(-1, Math.min(1, val * 0.95));
      }
      break;
    }

    case 'space_drone': {
      // Eerie atmospheric sci-fi drone with detuned oscillators
      for (let i = 0; i < numFrames; i++) {
        const t = i / sampleRate;
        const osc1 = Math.sin(2 * Math.PI * 55 * t);
        const osc2 = Math.sin(2 * Math.PI * 55.4 * t);
        const osc3 = Math.sin(2 * Math.PI * 110.2 * t) * 0.3;
        const osc4 = Math.sin(2 * Math.PI * 164.8 * t + Math.sin(t * 0.5)) * 0.2;
        const pulse = 0.8 + 0.2 * Math.sin(t * 0.8);

        const val = (osc1 + osc2 + osc3 + osc4) * pulse * 0.25;
        left[i] = val;
        right[i] = (osc1 * 0.9 + osc2 * 1.1 + osc3) * pulse * 0.25;
      }
      break;
    }

    case 'heartbeat': {
      // Lub-dub rhythmic heartbeat pulse
      const beatRate = 1.0; // 60 bpm
      for (let i = 0; i < numFrames; i++) {
        const t = i / sampleRate;
        const phase = t % beatRate;
        let pulse = 0;
        // First thump (lub)
        if (phase < 0.18) {
          const env = Math.sin((phase / 0.18) * Math.PI);
          pulse += Math.sin(2 * Math.PI * 52 * phase) * env * 0.9;
        }
        // Second thump (dub)
        if (phase > 0.25 && phase < 0.42) {
          const p2 = phase - 0.25;
          const env2 = Math.sin((p2 / 0.17) * Math.PI);
          pulse += Math.sin(2 * Math.PI * 68 * p2) * env2 * 0.7;
        }

        left[i] = pulse;
        right[i] = pulse;
      }
      break;
    }

    default: {
      // Subtle background hum
      for (let i = 0; i < numFrames; i++) {
        const t = i / sampleRate;
        const hum = Math.sin(2 * Math.PI * 60 * t) * 0.15;
        left[i] = hum;
        right[i] = hum;
      }
    }
  }

  return buffer;
}
