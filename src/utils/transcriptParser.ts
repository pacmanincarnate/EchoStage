import {
  AudioSegment,
  CharacterVoice,
  PrebuiltVoiceName,
  AVAILABLE_VOICES,
  SfxClip,
  SfxType,
} from '../types/drama';
import { generateProceduralSfx } from './sfxGenerator';
import { estimateSpokenDuration } from './timelineUtils';

const PRESET_COLORS = [
  '#06b6d4', // Cyan
  '#ec4899', // Pink
  '#a855f7', // Purple
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#ef4444', // Red
  '#3b82f6', // Blue
  '#8b5cf6', // Violet
];

// Heuristics for auto-assigning contrasting voice models
function guessVoiceForCharacter(
  name: string,
  style: string,
  usedVoices: Set<PrebuiltVoiceName>
): PrebuiltVoiceName {
  const lowerName = name.toLowerCase();
  const lowerStyle = style.toLowerCase();

  // Male / Deep / Authoritative cues
  if (
    lowerName.includes('detective') ||
    lowerName.includes('lord') ||
    lowerName.includes('commander') ||
    lowerName.includes('narrator') ||
    lowerName.includes('father') ||
    lowerName.includes('king') ||
    lowerStyle.includes('deep') ||
    lowerStyle.includes('authoritative') ||
    lowerStyle.includes('baritone')
  ) {
    if (!usedVoices.has('Charon')) return 'Charon';
    if (!usedVoices.has('Fenrir')) return 'Fenrir';
  }

  // Gritty / Tough / Villain / Grunt cues
  if (
    lowerName.includes('vance') ||
    lowerName.includes('specter') ||
    lowerName.includes('overlord') ||
    lowerName.includes('guard') ||
    lowerName.includes('soldier') ||
    lowerStyle.includes('gritty') ||
    lowerStyle.includes('growl') ||
    lowerStyle.includes('sinister')
  ) {
    if (!usedVoices.has('Fenrir')) return 'Fenrir';
    if (!usedVoices.has('Charon')) return 'Charon';
  }

  // Female / Emotional / Warm cues
  if (
    lowerName.includes('alice') ||
    lowerName.includes('evelyn') ||
    lowerName.includes('sarah') ||
    lowerName.includes('lola') ||
    lowerName.includes('mary') ||
    lowerName.includes('dr.') ||
    lowerStyle.includes('warm') ||
    lowerStyle.includes('whisper') ||
    lowerStyle.includes('emotional')
  ) {
    if (!usedVoices.has('Kore')) return 'Kore';
    if (!usedVoices.has('Aoede')) return 'Aoede';
    if (!usedVoices.has('Zephyr')) return 'Zephyr';
  }

  // Youthful / AI / Light cues
  if (
    lowerName.includes('nyx') ||
    lowerName.includes('kid') ||
    lowerName.includes('bot') ||
    lowerName.includes('assistant') ||
    lowerStyle.includes('bright') ||
    lowerStyle.includes('young')
  ) {
    if (!usedVoices.has('Zephyr')) return 'Zephyr';
    if (!usedVoices.has('Puck')) return 'Puck';
  }

  // Pick first unused voice or cycle
  for (const v of AVAILABLE_VOICES) {
    if (!usedVoices.has(v.name)) return v.name;
  }
  return 'Puck';
}

function detectSfxCue(text: string): SfxType | null {
  const lower = text.toLowerCase();
  if (lower.includes('rain') || lower.includes('storm')) return 'rain';
  if (lower.includes('thunder') || lower.includes('lightning')) return 'thunder';
  if (lower.includes('footstep') || lower.includes('walk') || lower.includes('step')) return 'footsteps';
  if (lower.includes('door') || lower.includes('creak') || lower.includes('hinge')) return 'door_creak';
  if (lower.includes('siren') || lower.includes('police') || lower.includes('alarm')) return 'siren';
  if (lower.includes('gun') || lower.includes('shot') || lower.includes('blast')) return 'gunshot';
  if (lower.includes('space') || lower.includes('drone') || lower.includes('engine')) return 'space_drone';
  if (lower.includes('sci_fi') || lower.includes('hum') || lower.includes('server')) return 'sci_fi_hum';
  if (lower.includes('heart') || lower.includes('pulse') || lower.includes('thump')) return 'heartbeat';
  return null;
}

export interface ParseResult {
  characters: CharacterVoice[];
  segments: AudioSegment[];
  sfxClips: SfxClip[];
  totalDuration: number;
}

/**
 * Robust Multi-Format Script & Dialogue Parser
 * Supports:
 * - "SPEAKER: Dialogue text"
 * - "SPEAKER (emotion): Dialogue text"
 * - "SPEAKER - Dialogue text"
 * - Multi-line speaker blocks
 * - Bracketed stage directions and sound cues [thunder], [rain]
 */
export async function parseTranscriptToDrama(rawTranscript: string): Promise<ParseResult> {
  const lines = rawTranscript.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

  const characterMap = new Map<string, { name: string; styles: string[] }>();
  const rawSegments: Array<{ speaker: string; text: string; style: string; sfx?: SfxType }> = [];
  const detectedSfx: Array<{ type: SfxType; atIndex: number }> = [];

  let currentSpeaker = '';
  let currentStyle = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for standalone stage direction or sound effect: [sound] or (direction)
    const bracketMatch = line.match(/^\[(.*?)\]$/) || line.match(/^\((.*?)\)$/);
    if (bracketMatch) {
      const sfxType = detectSfxCue(bracketMatch[1]);
      if (sfxType) {
        detectedSfx.push({ type: sfxType, atIndex: rawSegments.length });
      }
      continue;
    }

    // Pattern A: "CHARACTER: Dialogue" or "CHARACTER (style): Dialogue"
    const colonMatch = line.match(/^([A-Za-z0-9 _.'-]+?)(?:\s*\(([^)]+)\))?\s*:\s*(.+)$/);
    if (colonMatch) {
      const speakerName = colonMatch[1].trim().toUpperCase();
      const style = colonMatch[2] ? colonMatch[2].trim() : '';
      const text = colonMatch[3].trim();

      if (!characterMap.has(speakerName)) {
        characterMap.set(speakerName, { name: speakerName, styles: [] });
      }
      if (style) {
        characterMap.get(speakerName)!.styles.push(style);
      }

      const sfx = detectSfxCue(text);
      rawSegments.push({ speaker: speakerName, text, style, sfx: sfx || undefined });
      currentSpeaker = speakerName;
      currentStyle = style;
      continue;
    }

    // Pattern B: "CHARACTER - Dialogue"
    const dashMatch = line.match(/^([A-Za-z0-9 _.'-]+?)\s*-\s*(.+)$/);
    if (dashMatch && dashMatch[1].length < 25) {
      const speakerName = dashMatch[1].trim().toUpperCase();
      const text = dashMatch[2].trim();

      if (!characterMap.has(speakerName)) {
        characterMap.set(speakerName, { name: speakerName, styles: [] });
      }

      rawSegments.push({ speaker: speakerName, text, style: '' });
      currentSpeaker = speakerName;
      continue;
    }

    // Pattern C: Uppercase name alone on its own line followed by dialogue on next line
    if (/^[A-Z0-9 _.'-]{2,25}$/.test(line) && i + 1 < lines.length && !lines[i + 1].includes(':')) {
      currentSpeaker = line.trim().toUpperCase();
      if (!characterMap.has(currentSpeaker)) {
        characterMap.set(currentSpeaker, { name: currentSpeaker, styles: [] });
      }
      continue;
    }

    // Pattern D: Spoken line under current speaker
    if (currentSpeaker) {
      // Check if line has embedded inline sound cue like "[thunder] Run!"
      const inlineSfx = line.match(/\[(.*?)\]/);
      let cleanText = line;
      let sfx: SfxType | undefined;
      if (inlineSfx) {
        sfx = detectSfxCue(inlineSfx[1]) || undefined;
        cleanText = line.replace(/\[(.*?)\]/g, '').trim();
      }

      if (cleanText) {
        rawSegments.push({
          speaker: currentSpeaker,
          text: cleanText,
          style: currentStyle,
          sfx,
        });
      }
    } else {
      // Fallback: Default to Narrator
      const speakerName = 'NARRATOR';
      if (!characterMap.has(speakerName)) {
        characterMap.set(speakerName, { name: speakerName, styles: ['Atmospheric storyteller'] });
      }
      rawSegments.push({ speaker: speakerName, text: line, style: '' });
      currentSpeaker = speakerName;
    }
  }

  // If no segments were parsed (e.g. plain paragraphs), divide into sentences under Narrator
  if (rawSegments.length === 0 && lines.length > 0) {
    const speakerName = 'NARRATOR';
    characterMap.set(speakerName, { name: speakerName, styles: ['Clear engaging storyteller'] });
    for (const line of lines) {
      rawSegments.push({ speaker: speakerName, text: line, style: '' });
    }
  }

  // Construct CharacterVoice list with distinct assigned voices
  const usedVoices = new Set<PrebuiltVoiceName>();
  const characters: CharacterVoice[] = [];
  let colorIdx = 0;

  for (const [name, info] of characterMap.entries()) {
    const dominantStyle = info.styles.length > 0 ? info.styles[0] : 'Dramatic audio drama delivery';
    const assignedVoice = guessVoiceForCharacter(name, dominantStyle, usedVoices);
    usedVoices.add(assignedVoice);

    characters.push({
      id: `char-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`,
      name,
      voiceName: assignedVoice,
      stylePrompt: dominantStyle,
      color: PRESET_COLORS[colorIdx % PRESET_COLORS.length],
      description: `${dominantStyle} (${assignedVoice})`,
    });
    colorIdx++;
  }

  // Construct AudioSegments with exact timeline pacing
  let timelineCursor = 0.5;
  const segments: AudioSegment[] = [];
  const sfxClips: SfxClip[] = [];

  for (let i = 0; i < rawSegments.length; i++) {
    const raw = rawSegments[i];
    const char = characters.find((c) => c.name === raw.speaker);
    const voice = char ? char.voiceName : 'Puck';

    // Calculate realistic spoken duration estimate
    const estDuration = estimateSpokenDuration(raw.text);

    const segId = `seg-${i + 1}-${Date.now()}`;
    segments.push({
      id: segId,
      speaker: raw.speaker,
      text: raw.text,
      stylePrompt: raw.style || char?.stylePrompt || 'Dramatic delivery',
      voiceName: voice,
      startTime: Math.round(timelineCursor * 100) / 100,
      duration: Math.round(estDuration * 100) / 100,
      volume: 1.0,
      soundEffectCue: raw.sfx,
    });

    // Check if an SFX cue was tagged at or near this segment
    if (raw.sfx) {
      sfxClips.push({
        id: `sfx-${i}-${Date.now()}`,
        name: raw.sfx.replace('_', ' '),
        type: raw.sfx,
        startTime: Math.max(0, timelineCursor - 0.2),
        duration: raw.sfx === 'rain' ? 8 : 3,
        volume: 0.6,
      });
    }

    timelineCursor += estDuration + 0.6; // 0.6s natural dramatic pause between lines
  }

  // Add any standalone detected SFX
  for (let s = 0; s < detectedSfx.length; s++) {
    const sfxItem = detectedSfx[s];
    const targetSeg = segments[sfxItem.atIndex];
    const sfxTime = targetSeg ? targetSeg.startTime : timelineCursor;

    sfxClips.push({
      id: `sfx-cue-${s}-${Date.now()}`,
      name: sfxItem.type.replace('_', ' '),
      type: sfxItem.type,
      startTime: Math.max(0, sfxTime - 0.3),
      duration: sfxItem.type === 'rain' ? 10 : 3,
      volume: 0.65,
    });
  }

  // Generate audio buffers for procedural sound effects
  const sfxWithBuffers = await Promise.all(
    sfxClips.map(async (clip) => {
      try {
        const buffer = await generateProceduralSfx(clip.type, clip.duration);
        return { ...clip, audioBuffer: buffer };
      } catch (e) {
        return clip;
      }
    })
  );

  return {
    characters,
    segments,
    sfxClips: sfxWithBuffers,
    totalDuration: Math.max(20, Math.ceil(timelineCursor + 2)),
  };
}
