import { AudioSegment, CharacterVoice, MusicTrack, SfxClip, TensionNode } from '../types/drama';
import { getAudioContext, connectWithAcousticDsp, DspChainOptions } from './wavHelper';
import { evaluateTensionAtTime } from './timelineUtils';

interface ActiveNode {
  source: AudioBufferSourceNode;
  gain: GainNode;
  stopAtTime: number;
}

export class DramaAudioEngine {
  private ctx: AudioContext | null = null;
  private isPlaying = false;
  private startTime = 0; // AudioContext time when current playback run began
  private startOffset = 0; // Timeline position in seconds where playback started
  private activeNodes: ActiveNode[] = [];
  private musicNode: ActiveNode | null = null;
  private animFrameId: number | null = null;
  private onTimeUpdateCallback: ((time: number) => void) | null = null;
  private onEndedCallback: (() => void) | null = null;
  private totalDuration = 0;

  // Track gain nodes for master volume mixing
  private masterGain: GainNode | null = null;
  private speechGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  constructor() {
    // Initialized lazily on user gesture
  }

  private initContext() {
    if (!this.ctx) {
      this.ctx = getAudioContext();
      this.masterGain = this.ctx.createGain();
      this.speechGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();

      this.speechGain.connect(this.masterGain);
      this.musicGain.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setMasterVolume(val: number) {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(Math.max(0, Math.min(1.5, val)), this.ctx.currentTime);
    }
  }

  public setSpeechVolume(val: number) {
    if (this.speechGain && this.ctx) {
      this.speechGain.gain.setValueAtTime(Math.max(0, Math.min(1.5, val)), this.ctx.currentTime);
    }
  }

  public setMusicVolume(val: number) {
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setValueAtTime(Math.max(0, Math.min(1.5, val)), this.ctx.currentTime);
    }
  }

  public setSfxVolume(val: number) {
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setValueAtTime(Math.max(0, Math.min(1.5, val)), this.ctx.currentTime);
    }
  }

  public onTimeUpdate(cb: (time: number) => void) {
    this.onTimeUpdateCallback = cb;
  }

  public onEnded(cb: () => void) {
    this.onEndedCallback = cb;
  }

  public getCurrentTime(): number {
    if (!this.isPlaying || !this.ctx) {
      return this.startOffset;
    }
    const elapsed = this.ctx.currentTime - this.startTime;
    return Math.min(this.totalDuration, this.startOffset + elapsed);
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Starts multi-track synchronized playback from a given offset in seconds,
   * routing dialogue and SFX through real-time WebAudio Acoustic DSP, Stereo Panning, and Distance Filters.
   */
  public play(
    offsetSeconds: number,
    segments: AudioSegment[],
    musicTrack: MusicTrack,
    sfxClips: SfxClip[],
    totalDuration: number,
    characters: CharacterVoice[] = [],
    tensionCurve?: TensionNode[]
  ) {
    this.initContext();
    if (!this.ctx || !this.speechGain || !this.musicGain || !this.sfxGain) return;

    this.stopNodesOnly();
    this.startOffset = Math.max(0, offsetSeconds);
    this.totalDuration = Math.max(totalDuration, 1);
    this.startTime = this.ctx.currentTime;
    this.isPlaying = true;

    const now = this.ctx.currentTime;
    const charMap = new Map(characters.map((c) => [c.name.toUpperCase(), c]));

    // Collect speech intervals for real-time music ducking
    const speechIntervals: Array<{ start: number; end: number }> = [];

    // 1. Schedule Dialogue Segments with Acoustic Preset DSP + Stereo Pan + Distance
    for (const seg of segments) {
      if (!seg.audioBuffer) continue;
      const segStart = seg.startTime;
      const segEnd = seg.startTime + seg.duration;

      speechIntervals.push({ start: segStart, end: segEnd });

      if (segEnd > this.startOffset) {
        const offsetInClip = Math.max(0, this.startOffset - segStart);
        const whenToStart = segStart >= this.startOffset ? now + (segStart - this.startOffset) : now;
        const playDuration = seg.duration - offsetInClip;

        if (playDuration > 0.05) {
          const source = this.ctx.createBufferSource();
          source.buffer = seg.audioBuffer;

          const char = charMap.get(seg.speaker.toUpperCase());
          const pan = seg.pan ?? char?.pan ?? 0;
          const distance = seg.distance ?? char?.distance ?? 0.15;
          const acousticPreset = seg.acousticPreset ?? char?.acousticPreset ?? 'studio_dry';

          const { outputGain } = connectWithAcousticDsp(this.ctx, source, this.speechGain, {
            volume: seg.volume ?? 1,
            pan,
            distance,
            acousticPreset,
            nowTime: now,
          });

          source.start(whenToStart, offsetInClip, playDuration);
          this.activeNodes.push({ source, gain: outputGain, stopAtTime: whenToStart + playDuration });
        }
      }
    }

    // 2. Schedule Background Music Track with Auto-Ducking & Optional Tension Swells
    if (musicTrack.enabled && musicTrack.audioBuffer) {
      const musicBuf = musicTrack.audioBuffer;
      const musicDuration = Math.max(this.totalDuration, musicTrack.durationSeconds || musicBuf.duration);

      if (musicDuration > this.startOffset) {
        const offsetInMusic = this.startOffset % musicBuf.duration;
        const source = this.ctx.createBufferSource();
        source.buffer = musicBuf;
        source.loop = true;

        const gain = this.ctx.createGain();
        const baseVol = musicTrack.volume ?? 0.4;
        gain.gain.setValueAtTime(baseVol, now);

        // Apply dynamic ducking during dialogue lines
        if (musicTrack.ducking && speechIntervals.length > 0) {
          const duckAmount = baseVol * (musicTrack.duckingAmount || 0.25);
          for (const interval of speechIntervals) {
            if (interval.end > this.startOffset) {
              const duckStartAt = now + Math.max(0, interval.start - 0.2 - this.startOffset);
              const duckEndAt = now + Math.max(0, interval.end + 0.3 - this.startOffset);

              // Modulate swell between lines using tension curve if present
              let postLineSwell = baseVol;
              if (tensionCurve && tensionCurve.length > 0) {
                const tVal = evaluateTensionAtTime(tensionCurve, Math.min(1, interval.end / this.totalDuration));
                postLineSwell = Math.min(1.0, baseVol * (0.85 + tVal * 0.45));
              }

              gain.gain.setValueAtTime(baseVol, duckStartAt);
              gain.gain.linearRampToValueAtTime(duckAmount, duckStartAt + 0.25);
              gain.gain.setValueAtTime(duckAmount, Math.max(duckStartAt + 0.26, duckEndAt - 0.25));
              gain.gain.linearRampToValueAtTime(postLineSwell, duckEndAt);
            }
          }
        }

        source.connect(gain);
        gain.connect(this.musicGain);

        source.start(now, offsetInMusic);
        this.musicNode = { source, gain, stopAtTime: now + (this.totalDuration - this.startOffset) };
        this.activeNodes.push(this.musicNode);
      }
    }

    // 3. Schedule Sound Effects with Spatial Panning & Distance
    for (const sfx of sfxClips) {
      if (!sfx.audioBuffer) continue;
      const sfxStart = sfx.startTime;
      const sfxEnd = sfx.startTime + sfx.duration;

      if (sfxEnd > this.startOffset) {
        const offsetInClip = Math.max(0, this.startOffset - sfxStart);
        const whenToStart = sfxStart >= this.startOffset ? now + (sfxStart - this.startOffset) : now;
        const playDuration = sfx.duration - offsetInClip;

        if (playDuration > 0.05) {
          const source = this.ctx.createBufferSource();
          source.buffer = sfx.audioBuffer;
          source.loop = !!sfx.loop || sfx.duration > sfx.audioBuffer.duration;

          const { outputGain } = connectWithAcousticDsp(this.ctx, source, this.sfxGain, {
            volume: sfx.volume ?? 1,
            pan: sfx.pan ?? 0,
            distance: sfx.distance ?? 0.1,
            acousticPreset: 'studio_dry',
            nowTime: now,
          });

          source.start(whenToStart, offsetInClip % sfx.audioBuffer.duration, playDuration);
          this.activeNodes.push({ source, gain: outputGain, stopAtTime: whenToStart + playDuration });
        }
      }
    }

    this.startTracking();
  }

  private startTracking() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
    }

    const tick = () => {
      if (!this.isPlaying) return;

      const current = this.getCurrentTime();
      if (this.onTimeUpdateCallback) {
        this.onTimeUpdateCallback(current);
      }

      if (current >= this.totalDuration) {
        this.pause();
        if (this.onEndedCallback) {
          this.onEndedCallback();
        }
        return;
      }

      this.animFrameId = requestAnimationFrame(tick);
    };

    this.animFrameId = requestAnimationFrame(tick);
  }

  public pause() {
    this.startOffset = this.getCurrentTime();
    this.stopNodesOnly();
    this.isPlaying = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  public stop() {
    this.stopNodesOnly();
    this.isPlaying = false;
    this.startOffset = 0;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.onTimeUpdateCallback) {
      this.onTimeUpdateCallback(0);
    }
  }

  public seek(seconds: number) {
    const wasPlaying = this.isPlaying;
    this.pause();
    this.startOffset = Math.max(0, Math.min(this.totalDuration, seconds));
    if (this.onTimeUpdateCallback) {
      this.onTimeUpdateCallback(this.startOffset);
    }
    return wasPlaying;
  }

  /**
   * Preview a single audio buffer immediately with optional Acoustic DSP, Pan, and Distance
   */
  public previewBuffer(
    buffer: AudioBuffer,
    volume = 1.0,
    dspOptions?: Omit<DspChainOptions, 'volume'>
  ): () => void {
    this.initContext();
    if (!this.ctx) return () => {};

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    connectWithAcousticDsp(this.ctx, source, this.ctx.destination, {
      volume,
      pan: dspOptions?.pan ?? 0,
      distance: dspOptions?.distance ?? 0.1,
      acousticPreset: dspOptions?.acousticPreset ?? 'studio_dry',
      nowTime: this.ctx.currentTime,
    });

    source.start(0);

    return () => {
      try {
        source.stop();
      } catch (e) {
        // Ignored
      }
    };
  }

  private stopNodesOnly() {
    for (const node of this.activeNodes) {
      try {
        node.source.stop();
        node.source.disconnect();
        node.gain.disconnect();
      } catch (e) {
        // Node already finished
      }
    }
    this.activeNodes = [];
    this.musicNode = null;
  }
}
