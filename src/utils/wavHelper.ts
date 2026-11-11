import { AcousticPreset, AudioSegment } from '../types/drama';

/**
 * Audio decoding, waveform extraction, ITU-R BS.1770 LUFS loudness normalization,
 * WebAudio Acoustic DSP chains, and multi-track WAV mixdown helpers.
 */

let sharedAudioCtx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    sharedAudioCtx = new AudioContextClass();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume();
  }
  return sharedAudioCtx;
}

/**
 * Decodes base64 WAV data into an AudioBuffer
 */
export async function decodeBase64Audio(base64: string): Promise<AudioBuffer> {
  const ctx = getAudioContext();
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const arrayBuffer = bytes.buffer.slice(0);
  return await ctx.decodeAudioData(arrayBuffer);
}

/**
 * Decodes an uploaded File (.wav, .mp3, .ogg) into an AudioBuffer and base64 WAV string
 */
export async function decodeUploadedAudioFile(file: File): Promise<{
  buffer: AudioBuffer;
  base64: string;
  peaks: number[];
}> {
  const ctx = getAudioContext();
  const arrayBuf = await file.arrayBuffer();
  const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
  const peaks = extractWaveformPeaks(decoded, 48);
  const base64 = await audioBufferToBase64(decoded);
  return { buffer: decoded, base64, peaks };
}

/**
 * Extracts waveform peak bars for DAW timeline rendering
 */
export function extractWaveformPeaks(buffer: AudioBuffer, numPeaks = 64): number[] {
  const channelData = buffer.getChannelData(0);
  const step = Math.max(1, Math.floor(channelData.length / numPeaks));
  const peaks: number[] = [];

  for (let i = 0; i < numPeaks; i++) {
    let max = 0;
    const start = i * step;
    const end = Math.min(start + step, channelData.length);
    for (let j = start; j < end; j++) {
      const val = Math.abs(channelData[j]);
      if (val > max) max = val;
    }
    peaks.push(Math.min(1, Math.max(0.08, max)));
  }

  return peaks;
}

/**
 * Synthesizes an algorithmic stereo impulse response buffer for room/vault convolution reverb
 */
function createImpulseResponseBuffer(
  ctx: BaseAudioContext,
  durationSeconds = 1.8,
  decayRate = 2.8
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.floor(sampleRate * durationSeconds);
  const impulse = ctx.createBuffer(2, length, sampleRate);

  for (let channel = 0; channel < 2; channel++) {
    const channelData = impulse.getChannelData(channel);
    // Deterministic pseudo-random seed per channel for consistent offline & live rendering
    let seed = channel === 0 ? 1337 : 7331;
    for (let i = 0; i < length; i++) {
      seed = (seed * 16807) % 2147483647;
      const white = (seed / 1073741823.5) - 1.0;
      const envelope = Math.pow(1 - i / length, decayRate);
      channelData[i] = white * envelope * 0.45;
    }
  }
  return impulse;
}

/**
 * Creates a soft saturation distortion curve for Walkie-Talkie / Comms overdrive
 */
function makeCommsDistortionCurve(amount = 35): Float32Array {
  const nSamples = 4096;
  const curve = new Float32Array(nSamples);
  const deg = Math.PI / 180;
  for (let i = 0; i < nSamples; ++i) {
    const x = (i * 2) / nSamples - 1;
    curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

export interface DspChainOptions {
  volume?: number;
  pan?: number; // -1 (Left) to +1 (Right)
  distance?: number; // 0 (Close) to 1 (Far)
  acousticPreset?: AcousticPreset;
  nowTime?: number;
}

/**
 * Phase 2 & 3: Connects a WebAudio source node through a complete Acoustic Environment DSP
 * and Binaural Spatialization chain (Filter/Reverb -> Distance Air Absorption -> Stereo Panner -> Gain).
 * Works identically in real-time AudioContext and OfflineAudioContext!
 */
export function connectWithAcousticDsp(
  ctx: BaseAudioContext,
  source: AudioNode,
  destination: AudioNode,
  options: DspChainOptions
): { outputGain: GainNode } {
  const now = options.nowTime ?? ctx.currentTime;
  const preset = options.acousticPreset || 'studio_dry';
  const panVal = Math.max(-1, Math.min(1, options.pan ?? 0));
  const distVal = Math.max(0, Math.min(1, options.distance ?? 0.15));
  const baseVol = Math.max(0, Math.min(3.0, options.volume ?? 1.0));

  // Distance attenuation: 0 distance = 100% gain, 1.0 distance = 38% gain
  const distanceAttenuation = 1.0 - distVal * 0.62;

  // Distance high-frequency air absorption low-pass filter
  const distanceFilter = ctx.createBiquadFilter();
  distanceFilter.type = 'lowpass';
  const airCutoffHz = Math.round(20000 * Math.pow(0.12, distVal)); // 20kHz close -> ~2.4kHz far
  distanceFilter.frequency.setValueAtTime(Math.max(1200, airCutoffHz), now);

  // Stereo Panner Node (-1 Left .. +1 Right)
  let pannerNode: AudioNode;
  if (typeof (ctx as any).createStereoPanner === 'function') {
    const sp = (ctx as AudioContext).createStereoPanner();
    sp.pan.setValueAtTime(panVal, now);
    pannerNode = sp;
  } else {
    pannerNode = ctx.createGain();
  }

  // Final Clip Gain Node
  const outputGain = ctx.createGain();
  outputGain.gain.setValueAtTime(baseVol * distanceAttenuation, now);

  // Build Acoustic Preset Processing Sub-Graph
  let presetTail: AudioNode = source;

  if (preset === 'walkie_talkie') {
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(520, now);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2700, now);

    const midPeak = ctx.createBiquadFilter();
    midPeak.type = 'peaking';
    midPeak.frequency.setValueAtTime(1450, now);
    midPeak.Q.setValueAtTime(2.2, now);
    midPeak.gain.setValueAtTime(7, now);

    const shaper = ctx.createWaveShaper();
    shaper.curve = makeCommsDistortionCurve(28) as Float32Array<ArrayBuffer>;
    shaper.oversample = '2x';

    source.connect(hp);
    hp.connect(midPeak);
    midPeak.connect(shaper);
    shaper.connect(lp);
    presetTail = lp;
  } else if (preset === 'telephone') {
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(380, now);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3200, now);

    const mid = ctx.createBiquadFilter();
    mid.type = 'peaking';
    mid.frequency.setValueAtTime(1200, now);
    mid.Q.setValueAtTime(1.5, now);
    mid.gain.setValueAtTime(5, now);

    source.connect(hp);
    hp.connect(mid);
    mid.connect(lp);
    presetTail = lp;
  } else if (preset === 'muffled_door') {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(480, now);
    lp.Q.setValueAtTime(0.7, now);

    const lowShelf = ctx.createBiquadFilter();
    lowShelf.type = 'lowshelf';
    lowShelf.frequency.setValueAtTime(180, now);
    lowShelf.gain.setValueAtTime(3, now);

    source.connect(lowShelf);
    lowShelf.connect(lp);
    presetTail = lp;
  } else if (preset === 'cave_vault') {
    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();
    const sumNode = ctx.createGain();

    const wetRatio = Math.min(0.75, 0.42 + distVal * 0.3);
    dryGain.gain.setValueAtTime(1.0 - wetRatio * 0.4, now);
    wetGain.gain.setValueAtTime(wetRatio, now);

    const convolver = ctx.createConvolver();
    convolver.buffer = createImpulseResponseBuffer(ctx, 2.1, 2.5);

    source.connect(dryGain);
    dryGain.connect(sumNode);

    source.connect(convolver);
    convolver.connect(wetGain);
    wetGain.connect(sumNode);

    presetTail = sumNode;
  } else if (preset === 'cyber_modulator') {
    // Short metallic slapback delay + resonant high-tech sheen
    const dryGain = ctx.createGain();
    const delayNode = ctx.createDelay(0.1);
    delayNode.delayTime.setValueAtTime(0.018, now); // 18ms metallic comb doubling
    const feedbackGain = ctx.createGain();
    feedbackGain.gain.setValueAtTime(0.38, now);
    const sumNode = ctx.createGain();

    source.connect(dryGain);
    dryGain.connect(sumNode);

    source.connect(delayNode);
    delayNode.connect(feedbackGain);
    feedbackGain.connect(delayNode);
    delayNode.connect(sumNode);

    presetTail = sumNode;
  } else if (distVal > 0.35) {
    // Even on studio_dry, if placed far back on the 2D Soundstage, blend natural room reflection
    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();
    const sumNode = ctx.createGain();

    const roomWet = (distVal - 0.35) * 0.55;
    dryGain.gain.setValueAtTime(1.0, now);
    wetGain.gain.setValueAtTime(roomWet, now);

    const convolver = ctx.createConvolver();
    convolver.buffer = createImpulseResponseBuffer(ctx, 1.1, 3.5);

    source.connect(dryGain);
    dryGain.connect(sumNode);
    source.connect(convolver);
    convolver.connect(wetGain);
    wetGain.connect(sumNode);

    presetTail = sumNode;
  }

  presetTail.connect(distanceFilter);
  distanceFilter.connect(pannerNode);
  pannerNode.connect(outputGain);
  outputGain.connect(destination);

  return { outputGain };
}

/**
 * Encodes an AudioBuffer into standard 16-bit Stereo or Mono WAV Blob
 */
export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  const dataLength = buffer.length * blockAlign;
  const bufferLength = 44 + dataLength;
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  function writeString(offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

export interface MixdownTrackSource {
  buffer: AudioBuffer;
  startTime: number;
  volume: number;
  pan?: number;
  distance?: number;
  acousticPreset?: AcousticPreset;
  duckWithSpeech?: boolean;
  loop?: boolean;
  duration?: number;
}

/**
 * Mixes multiple audio sources at specific timeline positions into a stereo master AudioBuffer,
 * baking in full Acoustic DSP presets, Stereo Panning, Distance Air Absorption, and Speech Ducking.
 */
export async function mixTracksOffline(
  sources: MixdownTrackSource[],
  totalDurationSeconds: number,
  speechIntervals: Array<{ start: number; end: number }> = [],
  duckFactor = 0.25
): Promise<AudioBuffer> {
  const sampleRate = 44100;
  const duration = Math.max(1, Math.ceil(totalDurationSeconds) + 1);
  const numChannels = 2; // Stereo master

  const OfflineAudioCtxClass = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  const offlineCtx = new OfflineAudioCtxClass(numChannels, sampleRate * duration, sampleRate);

  for (const source of sources) {
    const bufferSource = offlineCtx.createBufferSource();
    bufferSource.buffer = source.buffer;
    if (source.loop) {
      bufferSource.loop = true;
    }

    const { outputGain } = connectWithAcousticDsp(
      offlineCtx,
      bufferSource,
      offlineCtx.destination,
      {
        volume: source.volume ?? 1,
        pan: source.pan ?? 0,
        distance: source.distance ?? 0.1,
        acousticPreset: source.acousticPreset ?? 'studio_dry',
        nowTime: 0,
      }
    );

    const baseVolume = outputGain.gain.value;

    if (source.duckWithSpeech && speechIntervals.length > 0) {
      outputGain.gain.setValueAtTime(baseVolume, 0);
      for (const interval of speechIntervals) {
        const duckStart = Math.max(0, interval.start - 0.2);
        const duckEnd = Math.min(duration, interval.end + 0.3);
        const duckedVol = baseVolume * duckFactor;

        outputGain.gain.setValueAtTime(baseVolume, duckStart);
        outputGain.gain.linearRampToValueAtTime(duckedVol, duckStart + 0.2);
        outputGain.gain.setValueAtTime(duckedVol, interval.end);
        outputGain.gain.linearRampToValueAtTime(baseVolume, duckEnd);
      }
    }

    const startAt = Math.max(0, source.startTime);
    if (source.duration && source.duration > 0) {
      bufferSource.start(startAt, 0, source.duration);
    } else {
      bufferSource.start(startAt);
    }
  }

  return await offlineCtx.startRendering();
}

/**
 * Converts an AudioBuffer into base64 WAV string
 */
export async function audioBufferToBase64(buffer: AudioBuffer): Promise<string> {
  const blob = audioBufferToWavBlob(buffer);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Phase 1 Improved Multi-Speaker Slicer:
 * Slices a continuous multi-speaker AudioBuffer into individual segments using
 * multi-window RMS silence-valley detection + 15ms zero-crossing micro-fades to prevent clicks.
 */
export function sliceSceneAudioBuffer(
  combinedBuffer: AudioBuffer,
  turns: Array<{ id: string; text: string }>
): Array<{ id: string; buffer: AudioBuffer }> {
  const audioCtx = getAudioContext();
  const sampleRate = combinedBuffer.sampleRate;
  const channelData = combinedBuffer.getChannelData(0);
  const totalSamples = channelData.length;

  if (turns.length <= 1) {
    return [{ id: turns[0]?.id || 'turn-0', buffer: combinedBuffer }];
  }

  // Weight each turn by spoken duration estimate rather than raw character count
  const weights = turns.map((t) => {
    const words = t.text.trim().split(/\s+/).length;
    const bursts = (t.text.match(/<[^>]+>/g) || []).length;
    return Math.max(1.0, words * 0.35 + bursts * 0.6 + 0.35);
  });
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  const slices: Array<{ id: string; buffer: AudioBuffer }> = [];
  const fadeSamples = Math.min(512, Math.floor(sampleRate * 0.015)); // 15ms micro-fade

  let currentSampleOffset = 0;
  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    if (i === turns.length - 1) {
      const sliceLength = Math.max(100, totalSamples - currentSampleOffset);
      const subBuffer = audioCtx.createBuffer(1, sliceLength, sampleRate);
      const copy = new Float32Array(sliceLength);
      copy.set(channelData.subarray(currentSampleOffset, currentSampleOffset + sliceLength));
      // Apply gentle 15ms fade-in & fade-out
      for (let f = 0; f < fadeSamples && f < copy.length; f++) {
        copy[f] *= f / fadeSamples;
        copy[copy.length - 1 - f] *= f / fadeSamples;
      }
      subBuffer.copyToChannel(copy, 0);
      slices.push({ id: turn.id, buffer: subBuffer });
      break;
    }

    const turnRatio = weights[i] / totalWeight;
    const targetLength = Math.floor(totalSamples * turnRatio);
    const splitPoint = currentSampleOffset + targetLength;

    // Search window +/- 1.1s around target split point for lowest RMS energy valley
    const windowSamples = Math.floor(sampleRate * 1.1);
    const searchStart = Math.max(currentSampleOffset + Math.floor(sampleRate * 0.4), splitPoint - windowSamples);
    const searchEnd = Math.min(totalSamples - Math.floor(sampleRate * 0.4), splitPoint + windowSamples);

    let minScore = Infinity;
    let bestSplit = splitPoint;
    const frameSize = Math.floor(sampleRate * 0.03); // 30ms RMS window

    for (let s = searchStart; s < searchEnd; s += Math.floor(frameSize / 2)) {
      let sumSq = 0;
      for (let k = 0; k < frameSize && s + k < totalSamples; k++) {
        const val = channelData[s + k];
        sumSq += val * val;
      }
      const rms = Math.sqrt(sumSq / frameSize);
      // Slight distance penalty from expected target so we pick the closest genuine silence pause
      const distPenalty = Math.abs(s - splitPoint) / (windowSamples * 4);
      const score = rms + distPenalty * 0.015;

      if (score < minScore) {
        minScore = score;
        bestSplit = s + Math.floor(frameSize / 2);
      }
    }

    const sliceLength = Math.max(100, bestSplit - currentSampleOffset);
    const subBuffer = audioCtx.createBuffer(1, sliceLength, sampleRate);
    const copy = new Float32Array(sliceLength);
    copy.set(channelData.subarray(currentSampleOffset, currentSampleOffset + sliceLength));
    for (let f = 0; f < fadeSamples && f < copy.length; f++) {
      copy[f] *= f / fadeSamples;
      copy[copy.length - 1 - f] *= f / fadeSamples;
    }
    subBuffer.copyToChannel(copy, 0);
    slices.push({ id: turn.id, buffer: subBuffer });

    currentSampleOffset = bestSplit;
  }

  return slices;
}

/**
 * Converts linear gain (e.g. 1.0) to decibels (dB)
 */
export function linearGainToDb(gain: number): number {
  if (gain <= 0.0001) return -60;
  return 20 * Math.log10(gain);
}

/**
 * Converts decibels (dB) to linear gain multiplier
 */
export function dbToLinearGain(db: number): number {
  return Math.pow(10, db / 20);
}

/**
 * Formats a linear gain multiplier as a signed dB string (e.g. "+2.5 dB", "-6.0 dB", "0.0 dB")
 */
export function formatGainDb(gain: number): string {
  const db = linearGainToDb(gain);
  if (Math.abs(db) < 0.05) return '0.0 dB';
  return `${db > 0 ? '+' : ''}${db.toFixed(1)} dB`;
}

/**
 * Applies a 2nd-order IIR biquad filter in-place on a mono sample buffer
 */
function applyBiquadInPlace(
  samples: Float32Array,
  b0: number,
  b1: number,
  b2: number,
  a1: number,
  a2: number
): void {
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const x0 = samples[i];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
    samples[i] = y0;
  }
}

/**
 * Computes ITU-R BS.1770-4 K-weighted Integrated Loudness (LUFS) and Sample Peak for an AudioBuffer.
 * Uses a 2-stage K-weighting filter cascade (High-Shelf head diffraction + RLB High-Pass)
 * followed by 400ms gated loudness blocks (-70 LUFS absolute gate and -10 LU relative gate).
 */
export function measureAudioBufferLufs(buffer: AudioBuffer): {
  integratedLufs: number;
  peakLinear: number;
  peakDb: number;
} {
  const numChannels = buffer.numberOfChannels;
  const length = buffer.length;
  const sampleRate = buffer.sampleRate || 24000;

  if (length === 0) {
    return { integratedLufs: -24.0, peakLinear: 0.1, peakDb: -20.0 };
  }

  // Mix down channels to mono energy & measure sample peak
  const mono = new Float32Array(length);
  let peakLinear = 0;

  for (let ch = 0; ch < numChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const s = data[i];
      const abs = Math.abs(s);
      if (abs > peakLinear) peakLinear = abs;
      mono[i] += s / numChannels;
    }
  }

  // Stage 1: ITU-R BS.1770 High-Shelf Pre-Filter (+4 dB at ~1681.97 Hz)
  {
    const f0 = 1681.974450955533;
    const G = 3.999843853973347;
    const Q = 0.7071752369554196;
    const K = Math.tan((Math.PI * f0) / sampleRate);
    const Vh = Math.pow(10, G / 20);
    const Vb = Math.pow(Vh, 0.4996667741545416);
    const a0 = 1 + K / Q + K * K;
    const b0 = (Vh + (Vb * K) / Q + K * K) / a0;
    const b1 = (2 * (K * K - Vh)) / a0;
    const b2 = (Vh - (Vb * K) / Q + K * K) / a0;
    const a1 = (2 * (K * K - 1)) / a0;
    const a2 = (1 - K / Q + K * K) / a0;
    applyBiquadInPlace(mono, b0, b1, b2, a1, a2);
  }

  // Stage 2: ITU-R BS.1770 RLB High-Pass Filter (~38.135 Hz)
  {
    const f0 = 38.13547087602444;
    const Q = 0.5003270373238773;
    const K = Math.tan((Math.PI * f0) / sampleRate);
    const a0 = 1 + K / Q + K * K;
    const b0 = 1 / a0;
    const b1 = -2 / a0;
    const b2 = 1 / a0;
    const a1 = (2 * (K * K - 1)) / a0;
    const a2 = (1 - K / Q + K * K) / a0;
    applyBiquadInPlace(mono, b0, b1, b2, a1, a2);
  }

  // Compute 400ms gating blocks with 100ms step (75% overlap)
  const blockSamples = Math.max(256, Math.floor(sampleRate * 0.4));
  const stepSamples = Math.max(64, Math.floor(sampleRate * 0.1));
  const blockEnergies: number[] = [];

  if (length <= blockSamples) {
    let sumSq = 0;
    for (let i = 0; i < length; i++) {
      sumSq += mono[i] * mono[i];
    }
    blockEnergies.push(sumSq / length);
  } else {
    for (let start = 0; start + blockSamples <= length; start += stepSamples) {
      let sumSq = 0;
      const end = start + blockSamples;
      for (let i = start; i < end; i++) {
        sumSq += mono[i] * mono[i];
      }
      blockEnergies.push(sumSq / blockSamples);
    }
  }

  // Absolute threshold gate: -70 LUFS -> z = 10^((-70 + 0.691) / 10)
  const absGateEnergy = Math.pow(10, (-70 + 0.691) / 10);
  const absGated = blockEnergies.filter((z) => z > absGateEnergy);

  let meanEnergy = 0;
  if (absGated.length === 0) {
    meanEnergy = absGateEnergy;
  } else {
    const ungatedAvg = absGated.reduce((a, b) => a + b, 0) / absGated.length;
    // Relative threshold gate: -10 LU below ungated average
    const relGateEnergy = ungatedAvg * Math.pow(10, -10 / 10);
    const relGated = absGated.filter((z) => z >= relGateEnergy);
    meanEnergy =
      relGated.length > 0
        ? relGated.reduce((a, b) => a + b, 0) / relGated.length
        : ungatedAvg;
  }

  const rawLufs = -0.691 + 10 * Math.log10(Math.max(1e-10, meanEnergy));
  const integratedLufs = Math.max(-60, Math.min(0, Math.round(rawLufs * 10) / 10));
  const peakDb =
    peakLinear > 0.00001 ? Math.round(20 * Math.log10(peakLinear) * 10) / 10 : -60.0;

  return {
    integratedLufs,
    peakLinear: Math.max(0.001, peakLinear),
    peakDb,
  };
}

/**
 * Computes the normalized volume gain for a single AudioBuffer to reach targetLufs
 * while protecting against true-peak clipping (peakCeilingDb default -0.8 dBFS).
 */
export function computeNormalizedSegmentGain(
  buffer: AudioBuffer,
  targetLufs = -16,
  peakCeilingDb = -0.8
): {
  gain: number;
  measuredLufs: number;
  effectiveLufs: number;
  gainDb: number;
} {
  const { integratedLufs, peakLinear } = measureAudioBufferLufs(buffer);
  const desiredDeltaDb = targetLufs - integratedLufs;
  const desiredLinearGain = dbToLinearGain(desiredDeltaDb);

  // Protect peak ceiling so normalized speech doesn't clip aggressively
  const maxLinearBeforeClip = dbToLinearGain(peakCeilingDb) / Math.max(0.05, peakLinear);
  const clampedGain = Math.max(
    0.15,
    Math.min(2.5, Math.min(desiredLinearGain, Math.max(1.0, maxLinearBeforeClip * 1.15)))
  );

  const roundedGain = Math.round(clampedGain * 100) / 100;
  const actualGainDb = linearGainToDb(roundedGain);
  const effectiveLufs = Math.round((integratedLufs + actualGainDb) * 10) / 10;

  return {
    gain: roundedGain,
    measuredLufs: integratedLufs,
    effectiveLufs,
    gainDb: Math.round(actualGainDb * 10) / 10,
  };
}

export interface GlobalNormalizationReport {
  segments: AudioSegment[];
  normalizedCount: number;
  targetLufs: number;
  averageBeforeLufs: number;
  averageAfterLufs: number;
  minGainDb: number;
  maxGainDb: number;
}

/**
 * Analyzes all rendered AudioSegment buffers in the project and automatically adjusts
 * their volume gain to achieve a consistent target LUFS loudness level across the project.
 */
export function normalizeAllSegmentsLufs(
  segments: AudioSegment[],
  targetLufs = -16
): GlobalNormalizationReport {
  let normalizedCount = 0;
  let sumBefore = 0;
  let sumAfter = 0;
  let minGainDb = Infinity;
  let maxGainDb = -Infinity;

  const updatedSegments = segments.map((seg) => {
    if (!seg.audioBuffer) {
      return {
        ...seg,
        targetLufs,
      };
    }

    const { gain, measuredLufs, effectiveLufs, gainDb } = computeNormalizedSegmentGain(
      seg.audioBuffer,
      targetLufs
    );

    const beforeEffective =
      Math.round((measuredLufs + linearGainToDb(seg.volume ?? 1.0)) * 10) / 10;

    normalizedCount++;
    sumBefore += beforeEffective;
    sumAfter += effectiveLufs;
    if (gainDb < minGainDb) minGainDb = gainDb;
    if (gainDb > maxGainDb) maxGainDb = gainDb;

    return {
      ...seg,
      volume: gain,
      measuredLufs,
      targetLufs,
    };
  });

  return {
    segments: updatedSegments,
    normalizedCount,
    targetLufs,
    averageBeforeLufs:
      normalizedCount > 0 ? Math.round((sumBefore / normalizedCount) * 10) / 10 : targetLufs,
    averageAfterLufs:
      normalizedCount > 0 ? Math.round((sumAfter / normalizedCount) * 10) / 10 : targetLufs,
    minGainDb: minGainDb === Infinity ? 0 : minGainDb,
    maxGainDb: maxGainDb === -Infinity ? 0 : maxGainDb,
  };
}

