import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  const apiKey = process.env.GEMINI_API_KEY || '';
  const ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      hasApiKey: !!apiKey,
      timestamp: Date.now(),
    });
  });

  // In-memory cache to save quota and speed up repeated previews
  const ttsCache = new Map<string, { audioBase64: string; mimeType: string }>();

  // TTS Generation Endpoint supporting gemini-3.8-flash-tts and gemini-3.8-flash-lite-tts
  app.post('/api/tts', async (req, res) => {
    try {
      const {
        text,
        voiceName = 'Puck',
        speaker = 'Narrator',
        style = 'Cinematic audio drama speech',
        voiceDescription = '',
        model = 'gemini-3.8-flash-tts',
      } = req.body;

      if (!text || typeof text !== 'string') {
        return res.status(400).json({ error: 'Text prompt is required.' });
      }

      const selectedModel =
        model === 'gemini-3.8-flash-lite-tts' ? 'gemini-3.8-flash-lite-tts' : 'gemini-3.8-flash-tts';

      // Check cache first
      const cacheKey = `${selectedModel}::${voiceName}::${speaker}::${(voiceDescription || '').trim()}::${(style || '').trim()}::${text.trim()}`;
      if (ttsCache.has(cacheKey)) {
        const cached = ttsCache.get(cacheKey)!;
        return res.json({
          audioBase64: cached.audioBase64,
          mimeType: cached.mimeType,
          speaker,
          voiceName,
          model: selectedModel,
          cached: true,
        });
      }

      if (!apiKey) {
        return res.status(500).json({
          error: 'GEMINI_API_KEY is not configured in environment variables.',
        });
      }

      let response;
      if (selectedModel === 'gemini-3.8-flash-lite-tts') {
        // High-throughput Flash-Lite TTS
        response = await ai.models.generateContent({
          model: 'gemini-3.8-flash-lite-tts',
          contents: text,
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: voiceName || 'Puck',
                },
              },
            },
          },
        });
      } else {
        // Expressive Flash TTS with speechMetadata & style instructions
        const effectiveStyle = voiceDescription
          ? `${voiceDescription.trim()}. Delivery: ${style || 'Dramatic character performance'}`
          : (style || 'Dynamic cinematic character delivery');

        response = await ai.models.generateContent({
          model: 'gemini-3.8-flash-tts',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `${speaker}: ${text}`,
                  speechMetadata: {
                    speaker: speaker,
                    style: effectiveStyle,
                  },
                },
              ],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: voiceName || 'Puck',
                },
              },
            },
          },
        });
      }

      const audioBase64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

      if (!audioBase64) {
        throw new Error(`No audio data received from ${selectedModel}.`);
      }

      // Save to cache
      ttsCache.set(cacheKey, { audioBase64, mimeType: 'audio/wav' });

      return res.json({
        audioBase64,
        mimeType: 'audio/wav',
        speaker,
        voiceName,
        model: selectedModel,
      });
    } catch (err: any) {
      const errMessage = err?.message || String(err);
      console.error('Error generating TTS:', errMessage);

      // Check for 429 quota exhaustion (Gemini Free Tier limit)
      const isRateLimit =
        errMessage.includes('429') ||
        errMessage.includes('RESOURCE_EXHAUSTED') ||
        errMessage.includes('Quota exceeded') ||
        errMessage.includes('rate-limit');

      let retryAfter = 60;
      const matchSeconds =
        errMessage.match(/retry in\s+([0-9.]+)\s*s/i) || errMessage.match(/"retryDelay":\s*"(\d+)s"/);
      if (matchSeconds) {
        retryAfter = Math.ceil(parseFloat(matchSeconds[1])) || 60;
      }

      if (isRateLimit) {
        return res.status(429).json({
          error: 'Gemini TTS rate limit reached. Queue throttler active.',
          isRateLimited: true,
          retryAfter,
          speaker: req.body?.speaker,
          voiceName: req.body?.voiceName,
        });
      }

      return res.status(500).json({
        error: errMessage || 'Failed to generate speech with Gemini TTS',
      });
    }
  });

  // Scene-Level Multi-Speaker Batching Endpoint (gemini-3.8-flash-tts multiSpeakerVoiceConfig)
  // Generates complete multi-line conversations between 2 characters in a single API call!
  app.post('/api/tts-scene', async (req, res) => {
    try {
      const { speakerA, speakerB, turns } = req.body;

      if (!speakerA || !speakerB || !Array.isArray(turns) || turns.length === 0) {
        return res.status(400).json({
          error: 'speakerA, speakerB, and turns array are required for scene batching.',
        });
      }

      if (!apiKey) {
        return res.status(500).json({
          error: 'GEMINI_API_KEY is not configured in environment variables.',
        });
      }

      const speakerConfigs = [
        {
          speaker: speakerA.name,
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: speakerA.voiceName || 'Puck',
            },
          },
        },
        {
          speaker: speakerB.name,
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: speakerB.voiceName || 'Kore',
            },
          },
        },
      ];

      const parts = turns.map((turn: any) => {
        const styleDesc = turn.voiceDescription
          ? `${turn.voiceDescription}. Delivery: ${turn.stylePrompt || turn.style || 'Dramatic delivery'}`
          : (turn.stylePrompt || turn.style || 'Dramatic audio drama performance');

        return {
          text: `${turn.speaker}: ${turn.text}`,
          speechMetadata: {
            speaker: turn.speaker,
            style: styleDesc,
          },
        };
      });

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-tts',
        contents: [
          {
            role: 'user',
            parts,
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            multiSpeakerVoiceConfig: {
              speakerVoiceConfigs: speakerConfigs,
            },
          },
        },
      });

      const audioBase64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!audioBase64) {
        throw new Error('No audio data received from Gemini multi-speaker scene batch.');
      }

      return res.json({
        audioBase64,
        mimeType: 'audio/wav',
        turnCount: turns.length,
        turnIds: turns.map((t: any) => t.id),
        speakers: [speakerA.name, speakerB.name],
      });
    } catch (err: any) {
      const errMessage = err?.message || String(err);
      console.error('Error generating multi-speaker scene batch:', errMessage);

      const isRateLimit =
        errMessage.includes('429') ||
        errMessage.includes('RESOURCE_EXHAUSTED') ||
        errMessage.includes('Quota exceeded') ||
        errMessage.includes('rate-limit');

      let retryAfter = 60;
      const matchSeconds =
        errMessage.match(/retry in\s+([0-9.]+)\s*s/i) || errMessage.match(/"retryDelay":\s*"(\d+)s"/);
      if (matchSeconds) {
        retryAfter = Math.ceil(parseFloat(matchSeconds[1])) || 60;
      }

      if (isRateLimit) {
        return res.status(429).json({
          error: 'Gemini TTS rate limit reached during scene batch. Cooldown in progress.',
          isRateLimited: true,
          retryAfter,
        });
      }

      return res.status(500).json({
        error: errMessage || 'Failed to generate multi-speaker scene batch',
      });
    }
  });

  // Music Generation Endpoint using lyria-3-clip-preview (up to 30s) or lyria-3-pro-preview (full-length)
  app.post('/api/music', async (req, res) => {
    try {
      const { prompt, modelType = 'clip', durationSeconds = 30 } = req.body;
      const model = modelType === 'pro' ? 'lyria-3-pro-preview' : 'lyria-3-clip-preview';

      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'Prompt is required for music generation.' });
      }

      if (!apiKey) {
        return res.status(500).json({
          error: 'GEMINI_API_KEY is not configured in environment variables.',
        });
      }

      try {
        const streamResponse = await ai.models.generateContentStream({
          model: model,
          contents: prompt,
        });

        let audioBase64 = '';
        let mimeType = 'audio/wav';
        let lyricsOrInfo = '';

        for await (const chunk of streamResponse) {
          const parts = chunk.candidates?.[0]?.content?.parts;
          if (!parts) continue;
          for (const part of parts) {
            if (part.inlineData?.data) {
              if (!audioBase64 && part.inlineData.mimeType) {
                mimeType = part.inlineData.mimeType;
              }
              audioBase64 += part.inlineData.data;
            }
            if (part.text && !lyricsOrInfo) {
              lyricsOrInfo = part.text;
            }
          }
        }

        if (audioBase64) {
          return res.json({
            audioBase64,
            mimeType,
            lyrics: lyricsOrInfo,
            modelUsed: model,
          });
        }
        throw new Error('Lyria did not return inline audio stream data.');
      } catch (lyriaErr: any) {
        console.warn('Lyria API call exception (falling back to ambient audio synthesizer):', lyriaErr.message);
        // Provide clear information so frontend can use fallback synthesis or notify user
        return res.json({
          fallback: true,
          error: lyriaErr.message,
          prompt,
          modelAttempted: model,
        });
      }
    } catch (err: any) {
      console.error('Error in music generation:', err);
      return res.status(500).json({
        error: err?.message || 'Music generation failed',
      });
    }
  });

  // Intelligent Script Parser & Character Extractor
  app.post('/api/parse-script', async (req, res) => {
    const { scriptText } = req.body;
    if (!scriptText || typeof scriptText !== 'string') {
      return res.status(400).json({ error: 'Script text is required.' });
    }

    try {
      const prompt = `You are a professional audio drama director and sound designer.
Analyze the following audio drama script transcript.
Break it down into individual dialogue and sound effect segments.
Identify distinct characters and assign each a distinct voice model and emotional acting style.
The available prebuilt Gemini TTS voices are:
- "Puck": Playful, expressive, versatile, mid-range male/androgynous
- "Charon": Deep, authoritative, resonant, dramatic baritone male
- "Kore": Warm, expressive, articulate, clear female
- "Fenrir": Intense, rugged, gritty, gravelly male
- "Zephyr": Bright, airy, youthful, swift, gentle female/neutral
- "Aoede": Melodic, rich, sophisticated female

Audio Drama Script:
"""
${scriptText}
"""

Return a JSON object with this exact structure:
{
  "title": "Title of the audio drama scene",
  "genre": "Genre (e.g. Cyberpunk, Noir Mystery, Gothic Horror, Sci-Fi, Fantasy)",
  "recommendedMusicPrompt": "A detailed music generation prompt describing mood, instruments, tempo, and atmosphere",
  "characters": [
    {
      "name": "CHARACTER NAME (e.g. DETECTIVE VANCE)",
      "assignedVoice": "Puck" | "Charon" | "Kore" | "Fenrir" | "Zephyr" | "Aoede",
      "voiceStyle": "Description of voice delivery (e.g. Weary, cynical 1940s detective)",
      "color": "Tailwind color name or hex code (e.g. #3b82f6, #ec4899, #10b981, #f59e0b, #8b5cf6)",
      "description": "Brief bio/role in scene"
    }
  ],
  "segments": [
    {
      "speaker": "CHARACTER NAME or NARRATOR",
      "text": "The spoken line (including vocal cues like <laugh>, <breath>, <gasp>, |yeah| if fitting)",
      "stylePrompt": "Specific acting direction for this line (e.g. Whispering anxiously while hiding)",
      "suggestedVoice": "Voice name",
      "pauseAfterSec": 0.8,
      "soundEffect": "Optional SFX name like 'rain', 'thunder', 'footsteps', 'door_creak', 'siren', 'gunshot', 'sci_fi_hum', or null"
    }
  ]
}`;

      let parsed: any = null;

      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
          },
        });

        let rawText = (response.text || '').trim();
        // Extract json object if surrounded by text
        const firstBrace = rawText.indexOf('{');
        const lastBrace = rawText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
          rawText = rawText.substring(firstBrace, lastBrace + 1);
        }
        parsed = JSON.parse(rawText);
      } catch (geminiErr: any) {
        console.warn('Gemini AI script parse exception, applying server rule-based parser:', geminiErr?.message);
      }

      // If Gemini returned valid segments and characters, send them back
      if (parsed && Array.isArray(parsed.segments) && parsed.segments.length > 0) {
        return res.json(parsed);
      }

      // Fallback rule-based parsing on server so client NEVER gets an empty result
      const lines = scriptText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
      const charsMap = new Map<string, string>();
      const parsedSegments: any[] = [];
      const voicesList = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr', 'Aoede'];
      const colorsList = ['#06b6d4', '#ec4899', '#a855f7', '#f59e0b', '#10b981', '#3b82f6'];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('[') && line.endsWith(']')) continue;

        const match = line.match(/^([^:(]+)(?:\(([^)]+)\))?\s*:\s*(.+)$/);
        if (match) {
          const speaker = match[1].trim().toUpperCase();
          const style = match[2] ? match[2].trim() : 'Dramatic delivery';
          const text = match[3].trim();
          if (!charsMap.has(speaker)) {
            charsMap.set(speaker, style);
          }
          parsedSegments.push({
            speaker,
            text,
            stylePrompt: style,
            suggestedVoice: 'Puck',
            pauseAfterSec: 0.6,
          });
        } else if (line.includes('-')) {
          const parts = line.split('-');
          const speaker = parts[0].trim().toUpperCase();
          const text = parts.slice(1).join('-').trim();
          if (speaker.length < 25 && text.length > 0) {
            if (!charsMap.has(speaker)) charsMap.set(speaker, 'Conversational delivery');
            parsedSegments.push({
              speaker,
              text,
              stylePrompt: 'Conversational delivery',
              suggestedVoice: 'Puck',
              pauseAfterSec: 0.6,
            });
          }
        }
      }

      // If no colon lines found, treat whole lines as narrator/character speech
      if (parsedSegments.length === 0) {
        charsMap.set('NARRATOR', 'Atmospheric storyteller');
        for (const line of lines) {
          if (!line.startsWith('[')) {
            parsedSegments.push({
              speaker: 'NARRATOR',
              text: line,
              stylePrompt: 'Atmospheric storyteller',
              suggestedVoice: 'Charon',
              pauseAfterSec: 0.8,
            });
          }
        }
      }

      let vIdx = 0;
      const characters: any[] = [];
      for (const [name, style] of charsMap.entries()) {
        const assignedVoice = voicesList[vIdx % voicesList.length];
        characters.push({
          name,
          assignedVoice,
          voiceStyle: style,
          color: colorsList[vIdx % colorsList.length],
          description: `${style} (${assignedVoice})`,
        });
        vIdx++;
      }

      // Assign matched voices to segments
      for (const seg of parsedSegments) {
        const c = characters.find((char) => char.name === seg.speaker);
        if (c) {
          seg.suggestedVoice = c.assignedVoice;
        }
      }

      return res.json({
        title: 'Audio Drama Scene',
        genre: 'Dramatic Audio Scene',
        recommendedMusicPrompt: 'Atmospheric cinematic score with expressive melody and dynamic ambient rhythm',
        characters,
        segments: parsedSegments,
        fallbackUsed: true,
      });
    } catch (err: any) {
      console.error('Fatal parsing error:', err);
      return res.status(500).json({
        error: err?.message || 'Failed to parse script.',
      });
    }
  });

  // AI Voice Designer Endpoint - Expands written voice descriptions into rich TTS prompts
  app.post('/api/design-voice', async (req, res) => {
    try {
      const { prompt: userIdea, gender = 'any', archetype = 'character' } = req.body;
      if (!userIdea || typeof userIdea !== 'string') {
        return res.status(400).json({ error: 'Voice idea prompt is required.' });
      }

      const prompt = `You are a professional voice casting director and sound designer.
The user wants to define a new character voice for Gemini 3.8 Flash TTS using a written description.
User's voice idea: "${userIdea}"
Target Gender: ${gender}
Archetype: ${archetype}

Available prebuilt Gemini TTS base voices:
- "Charon": Deep, resonant, authoritative baritone male
- "Fenrir": Rugged, gritty, gravelly, low-pitch male
- "Puck": Playful, versatile, dynamic mid-range male/neutral
- "Kore": Warm, articulate, emotionally expressive female
- "Zephyr": Bright, airy, youthful, swift female
- "Aoede": Melodic, rich, sophisticated stately female

Create a rich, multi-attribute written voice description for speechMetadata.style to direct Gemini 3.8 Flash TTS.
Include vocal timbre, pitch range, age texture, vocal rasp/breathiness, pacing/cadence, accent or dialect flavor, and unique speech mannerisms.

Return a JSON object:
{
  "name": "Catchy Voice Persona Name (e.g. Cursed Sea Captain, Noir Femme Fatale, Anxious Cyber-Doc)",
  "recommendedBaseVoice": "Charon" | "Fenrir" | "Puck" | "Kore" | "Zephyr" | "Aoede",
  "description": "Rich 2-3 sentence written voice persona description for Gemini TTS",
  "samplePhrase": "A dramatic 1-sentence sample line showcasing this voice with optional vocal burst tags like <gasp> or <laugh> or |yeah|",
  "suggestedColor": "Tailwind hex code like #f59e0b, #ec4899, #06b6d4, #10b981, #8b5cf6"
}`;

      let parsed: any = null;

      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
          },
        });

        let rawText = (response.text || '').trim();
        const firstBrace = rawText.indexOf('{');
        const lastBrace = rawText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
          rawText = rawText.substring(firstBrace, lastBrace + 1);
        }
        parsed = JSON.parse(rawText);
      } catch (geminiErr: any) {
        console.warn('Gemini voice design error, using fallback voice generator:', geminiErr?.message);
      }

      if (parsed && parsed.name && parsed.description) {
        return res.json(parsed);
      }

      // Fallback structured voice definition
      const lower = userIdea.toLowerCase();
      let base: any = 'Puck';
      let color = '#ec4899';
      if (lower.includes('old') || lower.includes('deep') || lower.includes('captain') || lower.includes('detective') || lower.includes('king')) {
        base = 'Charon';
        color = '#f59e0b';
      } else if (lower.includes('monster') || lower.includes('grunt') || lower.includes('gritty') || lower.includes('soldier') || lower.includes('pirate')) {
        base = 'Fenrir';
        color = '#ef4444';
      } else if (lower.includes('female') || lower.includes('queen') || lower.includes('mystic')) {
        base = 'Aoede';
        color = '#8b5cf6';
      } else if (lower.includes('girl') || lower.includes('youth') || lower.includes('whisper') || lower.includes('fairy')) {
        base = 'Zephyr';
        color = '#10b981';
      } else if (lower.includes('doctor') || lower.includes('scientist') || lower.includes('heroine')) {
        base = 'Kore';
        color = '#3b82f6';
      }

      return res.json({
        name: userIdea.slice(0, 24).replace(/[^a-zA-Z0-9 ]/g, '').trim() || 'Custom Persona',
        recommendedBaseVoice: base,
        description: `${userIdea.trim()}. Distinctive vocal texture with expressive dramatic delivery, nuanced pacing, and clear emotional inflection.`,
        samplePhrase: 'Every choice carries a shadow, and in this world, shadows don\'t stay silent for long.',
        suggestedColor: color,
      });
    } catch (err: any) {
      console.error('Error designing voice:', err);
      return res.status(500).json({ error: err?.message || 'Failed to design voice' });
    }
  });

  // AI Script Generator to help users write great drama scripts
  app.post('/api/generate-script', async (req, res) => {
    try {
      const { genre = 'Cyberpunk Mystery', premise = 'Two operatives hack an orbital vault', charactersCount = 2 } = req.body;

      const prompt = `Write a compelling 1-2 minute audio drama script transcript in the genre "${genre}" with premise: "${premise}".
Include ${charactersCount} distinct characters with contrasting personalities, plus optional sound directions in brackets like [heavy thunder], [rapid footsteps].
Format each spoken line strictly with:
CHARACTER NAME: Dialogue text here.

Use rich dialogue with emotional vocal bursts suitable for Gemini TTS like <gasp>, <breath>, <laugh>, |yeah|, |mhm|.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
      });

      return res.json({ script: response.text });
    } catch (err: any) {
      console.error('Error generating script:', err);
      return res.status(500).json({ error: err?.message || 'Failed to generate script' });
    }
  });

  // Phase 2 Moonshot 2: Subtext & Chemistry Rehearsal Room Endpoint
  app.post('/api/direct-subtext', async (req, res) => {
    try {
      const { segments = [], subtextNote = '', rewriteTextWithBursts = true } = req.body;
      if (!Array.isArray(segments) || segments.length === 0 || !subtextNote.trim()) {
        return res.status(400).json({ error: 'Segments and subtextNote are required.' });
      }

      const formattedLines = segments
        .map((s: any, idx: number) => `[ID:${s.id}] #${idx + 1} ${s.speaker}: "${s.text}" (Current style: ${s.stylePrompt || 'Standard'})`)
        .join('\n');

      const prompt = `You are a master audio drama director coaching actors in a rehearsal room.
The creator has provided the following relationship & hidden subtext note for this scene:
SUBTEXT DIRECTION: "${subtextNote.trim()}"

Scene Dialogue Lines:
${formattedLines}

Analyze the psychological tension, unspoken motives, and conversational rhythm between the speakers.
For each line, return:
1. "id": The exact segment ID from [ID:...]
2. "stylePrompt": A vivid, specific vocal acting direction for Gemini 3.8 Flash TTS capturing the hidden subtext, vocal tension, micro-inflections, and pacing.
3. "subtextNote": A concise 1-sentence note explaining what the character is secretly thinking or hiding on this line.
4. "updatedText": ${rewriteTextWithBursts ? 'The spoken line subtly enhanced with Gemini TTS vocal bursts (<breath>, <gasp>, <laugh>) or conversational backchannels (|yeah|, |mhm|) where emotionally authentic, keeping the core dialogue intact.' : 'The original spoken text unchanged.'}
5. "pauseAfterSec": Recommended pause or overlap after this line in seconds (use negative values like -0.25 for tense interruptions/cutting someone off, 0.2 for rapid banter, or 0.9 to 1.4 for heavy pregnant silences).

Return a JSON object with this structure:
{
  "directorSummary": "1-sentence overview of how the subtext reshapes the scene's rhythm",
  "directedSegments": [
    {
      "id": "seg-...",
      "stylePrompt": "...",
      "subtextNote": "...",
      "updatedText": "...",
      "pauseAfterSec": 0.45
    }
  ]
}`;

      let parsed: any = null;
      if (apiKey) {
        try {
          const response = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
            },
          });
          let rawText = (response.text || '').trim();
          const firstBrace = rawText.indexOf('{');
          const lastBrace = rawText.lastIndexOf('}');
          if (firstBrace !== -1 && lastBrace !== -1) {
            rawText = rawText.substring(firstBrace, lastBrace + 1);
          }
          parsed = JSON.parse(rawText);
        } catch (geminiErr: any) {
          console.warn('Gemini subtext director fallback:', geminiErr?.message);
        }
      }

      if (parsed && Array.isArray(parsed.directedSegments) && parsed.directedSegments.length > 0) {
        return res.json(parsed);
      }

      // Deterministic fallback subtext coaching
      const noteLower = subtextNote.toLowerCase();
      const isUrgent = noteLower.includes('lie') || noteLower.includes('betray') || noteLower.includes('argument') || noteLower.includes('panic');
      const fallbackDirected = segments.map((s: any, idx: number) => {
        const hasBurst = /<breath>|<gasp>|<laugh>|\|yeah\||\|mhm\|/.test(s.text);
        const burstPrefix = rewriteTextWithBursts && !hasBurst && idx % 2 === 1 ? '<breath> ' : '';
        return {
          id: s.id,
          stylePrompt: `Subtext (${subtextNote.slice(0, 48)}): guarded, layered emotional delivery with micro-hesitation`,
          subtextNote: `Masking true intent beneath "${subtextNote.slice(0, 40)}"`,
          updatedText: `${burstPrefix}${s.text}`,
          pauseAfterSec: isUrgent ? (idx % 2 === 0 ? -0.15 : 0.25) : (idx % 2 === 0 ? 0.85 : 0.45),
        };
      });

      return res.json({
        directorSummary: `Applied subtext coaching ("${subtextNote}") with contrasting micro-pauses and guarded vocal inflection.`,
        directedSegments: fallbackDirected,
      });
    } catch (err: any) {
      console.error('Error in /api/direct-subtext:', err);
      return res.status(500).json({ error: err?.message || 'Subtext direction failed' });
    }
  });

  // Phase 3 Moonshot 3: Live Microphone Acting Reference (Multimodal Prosody Transfer)
  app.post('/api/act-reference', async (req, res) => {
    try {
      const {
        audioBase64: refAudioBase64,
        mimeType = 'audio/webm',
        targetText = '',
        speaker = 'Character',
        voiceName = 'Puck',
        voiceDescription = '',
        model = 'gemini-3.8-flash-tts',
      } = req.body;

      if (!refAudioBase64) {
        return res.status(400).json({ error: 'Reference microphone audioBase64 is required.' });
      }

      let extractedProsodyStyle = 'Expressive, human-directed cadence with natural micro-pauses and emotional urgency';
      let adaptedText = targetText || 'Spoken line with expressive cadence.';
      let transcriptDetected = '';

      if (apiKey) {
        try {
          // Step 1: Analyze multimodal microphone recording with gemini-3.8-flash to extract prosody & vocal bursts
          const analysisPrompt = `You are a vocal performance and prosody analyst for an audio drama studio.
Listen carefully to the user's recorded reference performance.
Target script line: "${targetText}"

Analyze the human speaker's exact vocal delivery:
1. Emotional tone, energy level, whisper vs. projection, and vocal tension.
2. Pacing, rhythm, word emphasis, and exact pause/hesitation locations.
3. Any audible sighs, gasps, laughs, or breaths that should be represented using Gemini TTS tags (<breath>, <gasp>, <laugh>, |yeah|, |mhm|).

Return a JSON object:
{
  "transcribedWords": "What the user actually spoke",
  "prosodyStylePrompt": "Detailed 2-sentence vocal acting direction capturing the exact cadence, pitch contour, breathiness, emphasis, and emotional energy of the recording",
  "annotatedText": "The target line (or spoken line if targetText was empty) annotated with <breath>, <gasp>, <laugh>, or ellipses (...) at the exact moments the user paused or sighed"
}`;

          const analysisRes = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: refAudioBase64,
                  },
                },
                { text: analysisPrompt },
              ],
            },
            config: {
              responseMimeType: 'application/json',
            },
          });

          let rawJson = (analysisRes.text || '').trim();
          const fBrace = rawJson.indexOf('{');
          const lBrace = rawJson.lastIndexOf('}');
          if (fBrace !== -1 && lBrace !== -1) {
            rawJson = rawJson.substring(fBrace, lBrace + 1);
          }
          const parsedAnalysis = JSON.parse(rawJson);
          if (parsedAnalysis.prosodyStylePrompt) {
            extractedProsodyStyle = parsedAnalysis.prosodyStylePrompt;
          }
          if (parsedAnalysis.annotatedText) {
            adaptedText = parsedAnalysis.annotatedText;
          }
          if (parsedAnalysis.transcribedWords) {
            transcriptDetected = parsedAnalysis.transcribedWords;
          }
        } catch (analysisErr: any) {
          console.warn('Multimodal prosody analysis fallback:', analysisErr?.message);
        }

        // Step 2: Synthesize the transferred performance in the character's voice via gemini-3.8-flash-tts
        try {
          const combinedStyle = voiceDescription
            ? `${voiceDescription.trim()}. Prosody Transfer: ${extractedProsodyStyle}`
            : `Prosody Transfer: ${extractedProsodyStyle}`;

          const ttsRes = await ai.models.generateContent({
            model: model === 'gemini-3.8-flash-lite-tts' ? 'gemini-3.8-flash-lite-tts' : 'gemini-3.8-flash-tts',
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: `${speaker}: ${adaptedText}`,
                    speechMetadata: {
                      speaker,
                      style: combinedStyle,
                    },
                  },
                ],
              },
            ],
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: voiceName || 'Puck',
                  },
                },
              },
            },
          });

          const synthesizedBase64 = ttsRes.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
          if (synthesizedBase64) {
            return res.json({
              audioBase64: synthesizedBase64,
              mimeType: 'audio/wav',
              extractedProsodyStyle,
              adaptedText,
              transcriptDetected,
            });
          }
        } catch (ttsErr: any) {
          console.warn('Prosody transfer TTS synthesis fallback:', ttsErr?.message);
        }
      }

      return res.json({
        audioBase64: null,
        extractedProsodyStyle,
        adaptedText,
        transcriptDetected,
        fallback: true,
      });
    } catch (err: any) {
      console.error('Error in /api/act-reference:', err);
      return res.status(500).json({ error: err?.message || 'Prosody transfer failed' });
    }
  });

  // Setup Vite in Dev or static in Prod
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[EchoStage] Audio Drama Studio running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
