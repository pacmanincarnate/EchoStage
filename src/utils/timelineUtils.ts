import {
  AudioSegment,
  CharacterVoice,
  SfxClip,
  TensionNode,
  AVAILABLE_VOICES,
  SfxType,
} from '../types/drama';

/**
 * Calculates a realistic estimated spoken duration based on text, punctuation, and vocal tags.
 * Spoken English in dramatic acting averages 150-180 words per minute (~2.8 - 3.2 words/sec).
 */
export function estimateSpokenDuration(text: string): number {
  if (!text || !text.trim()) return 1.5;

  const cleanText = text.replace(/<[^>]+>/g, '').replace(/\|[^|]+\|/g, '').trim();
  const words = cleanText.split(/\s+/).filter((w) => w.length > 0);
  const wordCount = words.length;

  // Base spoken rate: ~2.8 words per second
  let duration = wordCount / 2.8;

  // Extra time for commas, dashes, colons, ellipses
  const pausePunctuation = (text.match(/[,:;\-–—]|\.\.\./g) || []).length;
  duration += pausePunctuation * 0.25;

  // Extra time for sentence stops (. ! ?)
  const sentenceStops = (text.match(/[.!?](?:\s|$)/g) || []).length;
  duration += Math.max(0, sentenceStops - 1) * 0.35;

  // Extra time for vocal bursts (<laugh>, <gasp>, <breath>)
  const vocalTags = (text.match(/<[^>]+>/g) || []).length;
  duration += vocalTags * 0.6;

  // Backchannels (|yeah|, |mhm|)
  const backchannels = (text.match(/\|[^|]+\|/g) || []).length;
  duration += backchannels * 0.4;

  // Enforce sensible bounds (minimum 1.2s, round to 2 decimals)
  return Math.max(1.2, Math.round((duration + 0.3) * 100) / 100);
}

/**
 * Ripple aligns consecutive audio segments on the timeline, respecting each segment's
 * custom `pauseAfterSec` (including negative values for overlapping interruptions) and
 * `lockedPosition` flags.
 */
export function rippleAlignSegments(
  segments: AudioSegment[],
  defaultGapSeconds = 0.45,
  initialStartTime = 0.5
): AudioSegment[] {
  if (segments.length === 0) return [];

  let cursor = initialStartTime;
  const aligned: AudioSegment[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const duration = Math.max(0.4, seg.duration);
    const startTime = seg.lockedPosition
      ? seg.startTime
      : Math.max(0, Math.round(cursor * 100) / 100);

    aligned.push({
      ...seg,
      startTime,
      duration: Math.round(duration * 100) / 100,
    });

    const gap =
      typeof seg.pauseAfterSec === 'number'
        ? Math.max(-1.5, Math.min(8.0, seg.pauseAfterSec))
        : defaultGapSeconds;

    cursor = Math.max(0.1, startTime + duration + gap);
  }

  return aligned;
}

/**
 * Phase 1: Smart Delta Ripple
 * When a single segment's duration changes (e.g. after TTS synthesis or switching takes),
 * shifts downstream unlocked segments by only `delta = newDuration - oldDuration`,
 * preserving all manual drags, dramatic pauses, and negative overlaps!
 */
export function smartDeltaRippleSegments(
  segments: AudioSegment[],
  changedSegmentId: string,
  oldDuration: number,
  newDuration: number
): AudioSegment[] {
  const targetIndex = segments.findIndex((s) => s.id === changedSegmentId);
  if (targetIndex === -1) return segments;

  const delta = newDuration - oldDuration;
  if (Math.abs(delta) < 0.01) {
    return segments.map((s, idx) =>
      idx === targetIndex ? { ...s, duration: Math.round(newDuration * 100) / 100 } : s
    );
  }

  return segments.map((s, idx) => {
    if (idx < targetIndex) return s;
    if (idx === targetIndex) {
      return {
        ...s,
        duration: Math.round(newDuration * 100) / 100,
      };
    }
    if (s.lockedPosition) return s;
    const shiftedStart = Math.max(0, Math.round((s.startTime + delta) * 100) / 100);
    return {
      ...s,
      startTime: shiftedStart,
    };
  });
}

/**
 * Calculates the required total duration of the project so that all segments,
 * sound effects, and trailing audio tails fit comfortably inside the timeline.
 */
export function calculateTotalProjectDuration(
  segments: AudioSegment[],
  sfxClips: SfxClip[] = [],
  padding = 3.0
): number {
  let maxEnd = 15;

  for (const seg of segments) {
    const end = (seg.startTime || 0) + (seg.duration || 0);
    if (end > maxEnd) maxEnd = end;
  }

  for (const sfx of sfxClips) {
    const end = (sfx.startTime || 0) + (sfx.duration || 0);
    if (end > maxEnd) maxEnd = end;
  }

  return Math.max(20, Math.ceil(maxEnd + padding));
}

export interface DiffSyncResult {
  segments: AudioSegment[];
  characters: CharacterVoice[];
  newSfxCues: Array<{ type: SfxType; startTime: number }>;
  stats: {
    unchanged: number;
    modified: number;
    added: number;
    removed: number;
  };
}

/**
 * Phase 1: Non-Destructive Diff-Aware Script Sync
 * Parses the raw transcript and matches lines against existing segments so that
 * untouched lines keep their synthesized AudioBuffers, Takes, Pan, and Acoustic settings,
 * while modified lines are flagged with `isDirtyText: true` and retain their prior Takes.
 */
export function diffSyncTranscriptToProject(
  rawTranscript: string,
  existingSegments: AudioSegment[],
  existingCharacters: CharacterVoice[]
): DiffSyncResult {
  const lines = rawTranscript
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const characters = [...existingCharacters];
  const colors = ['#06b6d4', '#ec4899', '#a855f7', '#f59e0b', '#10b981', '#3b82f6'];
  const parsedLines: Array<{
    speaker: string;
    stylePrompt?: string;
    text: string;
    sfxCue?: SfxType;
  }> = [];

  let pendingSfx: SfxType | undefined = undefined;

  for (const line of lines) {
    // Check bracketed SFX direction like [thunder] or [heavy footsteps]
    if (line.startsWith('[') && line.endsWith(']')) {
      const cueLower = line.slice(1, -1).toLowerCase();
      if (cueLower.includes('rain')) pendingSfx = 'rain';
      else if (cueLower.includes('thunder') || cueLower.includes('lightning')) pendingSfx = 'thunder';
      else if (cueLower.includes('footstep') || cueLower.includes('walk') || cueLower.includes('run')) pendingSfx = 'footsteps';
      else if (cueLower.includes('door') || cueLower.includes('creak')) pendingSfx = 'door_creak';
      else if (cueLower.includes('siren') || cueLower.includes('alarm')) pendingSfx = 'siren';
      else if (cueLower.includes('gun') || cueLower.includes('shot') || cueLower.includes('blast')) pendingSfx = 'gunshot';
      else if (cueLower.includes('heart')) pendingSfx = 'heartbeat';
      else if (cueLower.includes('drone') || cueLower.includes('space')) pendingSfx = 'space_drone';
      else if (cueLower.includes('hum') || cueLower.includes('computer') || cueLower.includes('console')) pendingSfx = 'sci_fi_hum';
      continue;
    }

    const match = line.match(/^([^:(]+)(?:\(([^)]+)\))?\s*:\s*(.+)$/);
    if (match) {
      const speaker = match[1].trim().toUpperCase();
      const stylePrompt = match[2] ? match[2].trim() : undefined;
      const text = match[3].trim();

      if (!characters.some((c) => c.name.toUpperCase() === speaker)) {
        const idx = characters.length;
        const voice = AVAILABLE_VOICES[idx % AVAILABLE_VOICES.length].name;
        characters.push({
          id: `char-${Date.now()}-${idx}`,
          name: speaker,
          voiceName: voice,
          stylePrompt: stylePrompt || 'Dramatic audio delivery',
          color: colors[idx % colors.length],
          pan: idx % 2 === 0 ? -0.2 : 0.2,
          distance: 0.15,
          acousticPreset: 'studio_dry',
        });
      }

      parsedLines.push({
        speaker,
        stylePrompt,
        text,
        sfxCue: pendingSfx,
      });
      pendingSfx = undefined;
    }
  }

  const usedExistingIds = new Set<string>();
  const syncedSegments: AudioSegment[] = [];
  const newSfxCues: Array<{ type: SfxType; startTime: number }> = [];

  let unchanged = 0;
  let modified = 0;
  let added = 0;

  let runningCursor = 0.5;

  for (let i = 0; i < parsedLines.length; i++) {
    const item = parsedLines[i];
    const char = characters.find((c) => c.name.toUpperCase() === item.speaker);

    // 1. Try exact match (same speaker + identical text) not yet used
    let matchedSeg = existingSegments.find(
      (s) =>
        !usedExistingIds.has(s.id) &&
        s.speaker.toUpperCase() === item.speaker &&
        s.text.trim() === item.text.trim()
    );

    if (matchedSeg) {
      usedExistingIds.add(matchedSeg.id);
      unchanged++;
      const updatedStyle = item.stylePrompt || matchedSeg.stylePrompt;
      const startTime = Math.max(0, Math.round(runningCursor * 100) / 100);
      syncedSegments.push({
        ...matchedSeg,
        stylePrompt: updatedStyle,
        startTime: matchedSeg.lockedPosition ? matchedSeg.startTime : startTime,
      });
      const gap = typeof matchedSeg.pauseAfterSec === 'number' ? matchedSeg.pauseAfterSec : 0.45;
      runningCursor = startTime + matchedSeg.duration + gap;
      continue;
    }

    // 2. Try positional / same-speaker match (line was edited in place)
    const candidateAtPos =
      existingSegments[i] &&
      !usedExistingIds.has(existingSegments[i].id) &&
      existingSegments[i].speaker.toUpperCase() === item.speaker
        ? existingSegments[i]
        : existingSegments.find(
            (s, idx) =>
              !usedExistingIds.has(s.id) &&
              Math.abs(idx - i) <= 2 &&
              s.speaker.toUpperCase() === item.speaker
          );

    if (candidateAtPos) {
      usedExistingIds.add(candidateAtPos.id);
      modified++;
      const estDuration = estimateSpokenDuration(item.text);
      const startTime = Math.max(0, Math.round(runningCursor * 100) / 100);

      syncedSegments.push({
        ...candidateAtPos,
        text: item.text,
        stylePrompt: item.stylePrompt || candidateAtPos.stylePrompt,
        startTime: candidateAtPos.lockedPosition ? candidateAtPos.startTime : startTime,
        duration: candidateAtPos.audioBuffer ? candidateAtPos.duration : estDuration,
        isDirtyText: true, // Flags that text was modified since last audio render
      });
      const gap = typeof candidateAtPos.pauseAfterSec === 'number' ? candidateAtPos.pauseAfterSec : 0.45;
      runningCursor = startTime + (candidateAtPos.audioBuffer ? candidateAtPos.duration : estDuration) + gap;
      continue;
    }

    // 3. Brand new dialogue line added
    added++;
    const estDuration = estimateSpokenDuration(item.text);
    const startTime = Math.max(0, Math.round(runningCursor * 100) / 100);

    if (item.sfxCue) {
      newSfxCues.push({ type: item.sfxCue, startTime: Math.max(0, startTime - 0.15) });
    }

    syncedSegments.push({
      id: `seg-${Date.now()}-${i}`,
      speaker: item.speaker,
      text: item.text,
      stylePrompt: item.stylePrompt || char?.stylePrompt || 'Dramatic delivery',
      voiceName: char?.voiceName || 'Puck',
      voiceDescription: char?.voiceDescription,
      startTime,
      duration: estDuration,
      volume: 1.0,
      pan: char?.pan ?? 0,
      distance: char?.distance ?? 0.15,
      acousticPreset: char?.acousticPreset ?? 'studio_dry',
      soundEffectCue: item.sfxCue,
    });

    runningCursor = startTime + estDuration + 0.45;
  }

  const removed = Math.max(0, existingSegments.length - usedExistingIds.size);

  return {
    segments: syncedSegments,
    characters,
    newSfxCues,
    stats: { unchanged, modified, added, removed },
  };
}

/**
 * Phase 2 Moonshot 1: Evaluates the piecewise-linear Tension Curve [0..1] at a given timeRatio [0..1]
 */
export function evaluateTensionAtTime(nodes: TensionNode[], timeRatio: number): number {
  if (!nodes || nodes.length === 0) return 0.35;
  const sorted = [...nodes].sort((a, b) => a.timeRatio - b.timeRatio);
  const clampedRatio = Math.max(0, Math.min(1, timeRatio));

  if (clampedRatio <= sorted[0].timeRatio) return sorted[0].intensity;
  if (clampedRatio >= sorted[sorted.length - 1].timeRatio) return sorted[sorted.length - 1].intensity;

  for (let i = 0; i < sorted.length - 1; i++) {
    const left = sorted[i];
    const right = sorted[i + 1];
    if (clampedRatio >= left.timeRatio && clampedRatio <= right.timeRatio) {
      const span = Math.max(0.0001, right.timeRatio - left.timeRatio);
      const t = (clampedRatio - left.timeRatio) / span;
      return left.intensity + t * (right.intensity - left.intensity);
    }
  }

  return 0.5;
}

/**
 * Phase 2 Moonshot 1: Applies the Tension Conductor Curve across all dialogue segments,
 * modulating acting style prompts, vocal bursts, and inter-line pacing/overlaps.
 */
export function applyTensionCurveToSegments(
  segments: AudioSegment[],
  totalDuration: number,
  nodes: TensionNode[]
): AudioSegment[] {
  if (segments.length === 0 || !nodes || nodes.length === 0) return segments;
  const maxDur = Math.max(10, totalDuration);

  const updated = segments.map((seg) => {
    const midTime = seg.startTime + seg.duration * 0.5;
    const ratio = Math.max(0, Math.min(1, midTime / maxDur));
    const tension = evaluateTensionAtTime(nodes, ratio);

    // Strip previous auto-tension prefix if present
    const baseStyle = (seg.stylePrompt || 'Dramatic performance')
      .replace(/^\[Tension \d+%:[^\]]+\]\s*/i, '')
      .trim();

    let tensionDirective = '';
    let pauseAfterSec = 0.45;
    let updatedText = seg.text;

    if (tension >= 0.8) {
      tensionDirective = `[Tension ${Math.round(tension * 100)}%: High-stakes urgent climax, breathless rapid intensity]`;
      pauseAfterSec = -0.15; // Tight overlapping urgency!
      if (!updatedText.includes('<breath>') && !updatedText.includes('<gasp>')) {
        updatedText = `<breath> ${updatedText}`;
      }
    } else if (tension >= 0.55) {
      tensionDirective = `[Tension ${Math.round(tension * 100)}%: Rising suspense, taut alert edge]`;
      pauseAfterSec = 0.2;
    } else if (tension <= 0.25) {
      tensionDirective = `[Tension ${Math.round(tension * 100)}%: Quiet intimate hush, slow deliberate cadence]`;
      pauseAfterSec = 0.75; // Deliberate dramatic silence
    } else {
      tensionDirective = `[Tension ${Math.round(tension * 100)}%: Measured dramatic focus]`;
      pauseAfterSec = 0.45;
    }

    return {
      ...seg,
      text: updatedText,
      stylePrompt: `${tensionDirective} ${baseStyle}`,
      pauseAfterSec,
    };
  });

  return rippleAlignSegments(updated, 0.45);
}
