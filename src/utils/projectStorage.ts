import {
  DramaProject,
  AudioSegment,
  SfxClip,
  AudioTake,
  DEFAULT_TENSION_CURVES,
  PRESET_CUSTOM_VOICES,
} from '../types/drama';
import {
  decodeBase64Audio,
  extractWaveformPeaks,
  measureAudioBufferLufs,
} from './wavHelper';
import { generateProceduralSfx } from './sfxGenerator';
import { generateAtmosphericTrack } from './ambientMusicGenerator';

export const STORAGE_KEYS = {
  PROJECT: 'gemini_drama_studio_project_v1',
  TRANSCRIPT: 'gemini_drama_studio_transcript_v1',
  LAST_SAVED: 'gemini_drama_studio_last_saved_v1',
  LIBRARY_INDEX: 'gemini_drama_studio_library_index_v1',
  PROJECT_LITE_PREFIX: 'gemini_drama_studio_proj_lite_',
};

const IDB_NAME = 'EchoStageStudioDB';
const IDB_VERSION = 1;
const IDB_STORE = 'projects';
const IDB_ACTIVE_KEY = 'active_project_v1';
const IDB_PROJECT_PREFIX = 'project_record_';

export interface StorageSaveResult {
  success: boolean;
  strippedAudio: boolean;
  savedToIndexedDB?: boolean;
  error?: string;
}

export interface SavedProjectSummary {
  id: string;
  title: string;
  genre: string;
  totalDuration: number;
  segmentCount: number;
  renderedSegmentCount: number;
  characterCount: number;
  characterNames: Array<{ name: string; color: string; voiceName: string }>;
  sfxCount: number;
  musicEnabled: boolean;
  musicGenre?: string;
  previewSnippet: string;
  lastSaved: string;
  createdAt: string;
}

/**
 * Opens or initializes the browser IndexedDB database for unlimited WAV & Take persistence
 */
function openStudioIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported'));
    }
    const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Reconstructs a readable script transcript from project segments when raw transcript is not provided
 */
export function reconstructTranscriptFromProject(project: Partial<DramaProject>): string {
  if (!project.segments || !Array.isArray(project.segments) || project.segments.length === 0) {
    return '';
  }
  return project.segments
    .map((seg) => {
      const stylePart =
        seg.stylePrompt && seg.stylePrompt !== 'Dramatic performance' && seg.stylePrompt !== 'Dramatic delivery'
          ? ` (${seg.stylePrompt})`
          : '';
      const sfxLine = seg.soundEffectCue ? `[${seg.soundEffectCue}]\n` : '';
      return `${sfxLine}${seg.speaker}${stylePart}: ${seg.text}`;
    })
    .join('\n');
}

/**
 * Builds a SavedProjectSummary metadata object for the Project Library
 */
export function buildProjectSummary(
  project: DramaProject,
  transcript?: string,
  lastSaved?: string,
  existingCreatedAt?: string
): SavedProjectSummary {
  const segments = Array.isArray(project.segments) ? project.segments : [];
  const characters = Array.isArray(project.characters) ? project.characters : [];
  const sfxClips = Array.isArray(project.sfxClips) ? project.sfxClips : [];

  const renderedSegmentCount = segments.filter(
    (s) => Boolean(s.audioBuffer || s.audioBase64)
  ).length;

  let previewSnippet = '';
  if (segments.length > 0) {
    const firstSeg = segments[0];
    previewSnippet = `${firstSeg.speaker}: "${firstSeg.text}"`;
  } else if (transcript && transcript.trim().length > 0) {
    previewSnippet = transcript.trim().split('\n')[0].slice(0, 120);
  } else {
    previewSnippet = 'Blank audio drama canvas — no dialogue segments yet.';
  }

  const nowIso = lastSaved || new Date().toISOString();

  return {
    id: project.id,
    title: project.title || 'Untitled Audio Drama',
    genre: project.genre || 'Dramatic Fiction',
    totalDuration: project.totalDuration || 0,
    segmentCount: segments.length,
    renderedSegmentCount,
    characterCount: characters.length,
    characterNames: characters.slice(0, 6).map((c) => ({
      name: c.name,
      color: c.color || '#06b6d4',
      voiceName: c.voiceName || 'Puck',
    })),
    sfxCount: sfxClips.length,
    musicEnabled: Boolean(project.musicTrack?.enabled),
    musicGenre: project.musicTrack?.genre,
    previewSnippet,
    lastSaved: nowIso,
    createdAt: existingCreatedAt || nowIso,
  };
}

/**
 * Strips non-serializable fields (like in-memory AudioBuffer objects)
 * while preserving base64 WAV strings, Take history, Tension curve, and spatial metadata.
 */
export function sanitizeProjectForSerialization(
  project: DramaProject,
  includeBase64Audio = true
): any {
  return {
    id: project.id,
    title: project.title,
    genre: project.genre,
    totalDuration: project.totalDuration,
    bpm: project.bpm,
    tensionCurve: project.tensionCurve || [],
    subtextNote: project.subtextNote || '',
    characters: project.characters || [],
    customVoices: project.customVoices || [],
    musicTrack: {
      enabled: Boolean(project.musicTrack?.enabled),
      prompt: project.musicTrack?.prompt || '',
      genre: project.musicTrack?.genre || 'Cyberpunk Synthwave',
      modelType: project.musicTrack?.modelType || 'clip',
      durationSeconds: project.musicTrack?.durationSeconds || 30,
      volume: project.musicTrack?.volume ?? 0.35,
      ducking: project.musicTrack?.ducking ?? true,
      duckingAmount: project.musicTrack?.duckingAmount ?? 0.2,
      audioBase64: includeBase64Audio ? project.musicTrack?.audioBase64 : undefined,
    },
    sfxClips: (project.sfxClips || []).map((clip) => ({
      id: clip.id,
      name: clip.name,
      type: clip.type,
      startTime: clip.startTime,
      duration: clip.duration,
      volume: clip.volume,
      loop: clip.loop,
      pan: clip.pan,
      distance: clip.distance,
      isCustomUpload: clip.isCustomUpload,
      waveformPeaks: clip.waveformPeaks,
      audioBase64: includeBase64Audio ? clip.audioBase64 : undefined,
    })),
    segments: (project.segments || []).map((seg) => ({
      id: seg.id,
      speaker: seg.speaker,
      text: seg.text,
      stylePrompt: seg.stylePrompt,
      voiceName: seg.voiceName,
      voiceDescription: seg.voiceDescription,
      startTime: seg.startTime,
      duration: seg.duration,
      volume: seg.volume,
      measuredLufs: seg.measuredLufs,
      targetLufs: seg.targetLufs,
      soundEffectCue: seg.soundEffectCue,
      waveformPeaks: seg.waveformPeaks,
      pauseAfterSec: seg.pauseAfterSec,
      lockedPosition: seg.lockedPosition,
      isDirtyText: seg.isDirtyText,
      subtextNote: seg.subtextNote,
      pan: seg.pan,
      distance: seg.distance,
      acousticPreset: seg.acousticPreset,
      activeTakeId: seg.activeTakeId,
      audioBase64: includeBase64Audio ? seg.audioBase64 : undefined,
      takes: (seg.takes || []).map((t) => ({
        id: t.id,
        createdAt: t.createdAt,
        label: t.label,
        stylePrompt: t.stylePrompt,
        duration: t.duration,
        waveformPeaks: t.waveformPeaks,
        isStarred: t.isStarred,
        sourceType: t.sourceType,
        audioBase64: includeBase64Audio ? t.audioBase64 : undefined,
      })),
    })),
  };
}

/**
 * Reads the library index synchronously from LocalStorage, migrating any legacy active project if needed
 */
export function getLibraryProjectsSync(): SavedProjectSummary[] {
  try {
    const rawIndex = localStorage.getItem(STORAGE_KEYS.LIBRARY_INDEX);
    let summaries: SavedProjectSummary[] = rawIndex ? JSON.parse(rawIndex) : [];
    if (!Array.isArray(summaries)) summaries = [];

    // Ensure currently stored active project is represented in the library index
    const activeRaw = getStoredProjectRaw();
    if (activeRaw.project && activeRaw.project.id) {
      const exists = summaries.some((s) => s.id === activeRaw.project.id);
      if (!exists) {
        const migratedSummary = buildProjectSummary(
          activeRaw.project,
          activeRaw.transcript || undefined,
          activeRaw.lastSaved || new Date().toISOString()
        );
        summaries = [migratedSummary, ...summaries];
        try {
          localStorage.setItem(STORAGE_KEYS.LIBRARY_INDEX, JSON.stringify(summaries));
          localStorage.setItem(
            `${STORAGE_KEYS.PROJECT_LITE_PREFIX}${activeRaw.project.id}`,
            JSON.stringify({
              project: sanitizeProjectForSerialization(activeRaw.project, false),
              transcript:
                activeRaw.transcript ?? reconstructTranscriptFromProject(activeRaw.project),
              lastSaved: migratedSummary.lastSaved,
              createdAt: migratedSummary.createdAt,
            })
          );
        } catch (e) {}
      }
    }

    return summaries.sort(
      (a, b) => new Date(b.lastSaved).getTime() - new Date(a.lastSaved).getTime()
    );
  } catch (e) {
    return [];
  }
}

function saveLibraryIndexSync(summaries: SavedProjectSummary[]): void {
  try {
    const sorted = [...summaries].sort(
      (a, b) => new Date(b.lastSaved).getTime() - new Date(a.lastSaved).getTime()
    );
    localStorage.setItem(STORAGE_KEYS.LIBRARY_INDEX, JSON.stringify(sorted));
  } catch (e) {
    console.warn('Failed to update library index in LocalStorage:', e);
  }
}

function upsertProjectIntoLibrarySync(
  project: DramaProject,
  transcript?: string,
  lastSavedIso?: string
): SavedProjectSummary {
  const existingList = getLibraryProjectsSync();
  const existingEntry = existingList.find((item) => item.id === project.id);
  const resolvedTranscript =
    typeof transcript === 'string' ? transcript : reconstructTranscriptFromProject(project);
  const nowIso = lastSavedIso || new Date().toISOString();

  const summary = buildProjectSummary(
    project,
    resolvedTranscript,
    nowIso,
    existingEntry?.createdAt
  );

  const nextList = [summary, ...existingList.filter((item) => item.id !== project.id)];
  saveLibraryIndexSync(nextList);

  try {
    localStorage.setItem(
      `${STORAGE_KEYS.PROJECT_LITE_PREFIX}${project.id}`,
      JSON.stringify({
        project: sanitizeProjectForSerialization(project, false),
        transcript: resolvedTranscript,
        lastSaved: nowIso,
        createdAt: summary.createdAt,
      })
    );
  } catch (e) {}

  return summary;
}

/**
 * Phase 2: Asynchronous IndexedDB persistence for full multi-take WAV audio projects
 * Saves both to active_project_v1 (when isActive=true) and to project_record_<id> in the library.
 */
export async function saveProjectToIndexedDB(
  project: DramaProject,
  transcript?: string,
  setAsActive = true
): Promise<boolean> {
  try {
    const db = await openStudioIndexedDB();
    const nowIso = new Date().toISOString();
    const resolvedTranscript =
      typeof transcript === 'string' ? transcript : reconstructTranscriptFromProject(project);
    const sanitized = sanitizeProjectForSerialization(project, true);

    const payload = {
      id: project.id,
      project: sanitized,
      transcript: resolvedTranscript,
      lastSaved: nowIso,
    };

    return await new Promise<boolean>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      if (setAsActive) {
        store.put(payload, IDB_ACTIVE_KEY);
      }
      store.put(payload, `${IDB_PROJECT_PREFIX}${project.id}`);
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
    });
  } catch (e) {
    return false;
  }
}

export async function loadProjectFromIndexedDB(projectKey = IDB_ACTIVE_KEY): Promise<{
  project: any | null;
  transcript: string | null;
  lastSaved: string | null;
} | null> {
  try {
    const db = await openStudioIndexedDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(projectKey);
      req.onsuccess = () => {
        db.close();
        if (req.result && req.result.project) {
          resolve({
            project: req.result.project,
            transcript:
              typeof req.result.transcript === 'string' ? req.result.transcript : null,
            lastSaved: req.result.lastSaved || null,
          });
        } else {
          resolve(null);
        }
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    });
  } catch (e) {
    return null;
  }
}

/**
 * Lists all saved projects across IndexedDB and LocalStorage, reconciling any unindexed records.
 */
export async function listLibraryProjects(): Promise<SavedProjectSummary[]> {
  const syncList = getLibraryProjectsSync();
  const byId = new Map<string, SavedProjectSummary>();
  for (const item of syncList) {
    byId.set(item.id, item);
  }

  try {
    const db = await openStudioIndexedDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.openCursor();
      req.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (cursor) {
          const key = String(cursor.key);
          const val = cursor.value;
          if (val && val.project && val.project.id) {
            const p = val.project as DramaProject;
            const existing = byId.get(p.id);
            const summary = buildProjectSummary(
              p,
              val.transcript,
              val.lastSaved || existing?.lastSaved,
              existing?.createdAt || val.lastSaved
            );
            // Prefer the record with the newer timestamp or higher rendered segment count
            if (
              !existing ||
              new Date(summary.lastSaved).getTime() >= new Date(existing.lastSaved).getTime() ||
              summary.renderedSegmentCount > existing.renderedSegmentCount
            ) {
              byId.set(p.id, summary);
            }
            // If this came from active_project_v1 and wasn't stored under project_record_<id>, back it up
            if (key === IDB_ACTIVE_KEY) {
              saveProjectToIndexedDB(p, val.transcript, false).catch(() => {});
            }
          }
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => resolve();
    });
    db.close();
  } catch (e) {
    // IndexedDB unavailable; fallback to syncList
  }

  const merged = Array.from(byId.values()).sort(
    (a, b) => new Date(b.lastSaved).getTime() - new Date(a.lastSaved).getTime()
  );
  saveLibraryIndexSync(merged);
  return merged;
}

/**
 * Saves project to LocalStorage (for fast synchronous boot) AND asynchronously to IndexedDB
 * (so full multi-take WAV buffers are never lost even when exceeding 5MB LocalStorage limits).
 * Also updates the multi-project Library Index.
 */
export function saveProjectToStorage(
  project: DramaProject,
  transcript?: string
): StorageSaveResult {
  const nowIso = new Date().toISOString();

  // Upsert into synchronous library index + per-project lite cache
  upsertProjectIntoLibrarySync(project, transcript, nowIso);

  // Kick off unlimited IndexedDB save (both active slot and library project_record_<id>)
  saveProjectToIndexedDB(project, transcript, true).catch(() => {});

  try {
    const serializedWithAudio = JSON.stringify(sanitizeProjectForSerialization(project, true));
    try {
      localStorage.setItem(STORAGE_KEYS.PROJECT, serializedWithAudio);
      if (typeof transcript === 'string') {
        localStorage.setItem(STORAGE_KEYS.TRANSCRIPT, transcript);
      }
      localStorage.setItem(STORAGE_KEYS.LAST_SAVED, nowIso);
      return { success: true, strippedAudio: false, savedToIndexedDB: true };
    } catch (quotaErr) {
      // LocalStorage 5MB limit reached: store lightweight metadata in LocalStorage while IndexedDB holds full WAVs!
      const serializedWithoutAudio = JSON.stringify(
        sanitizeProjectForSerialization(project, false)
      );
      localStorage.setItem(STORAGE_KEYS.PROJECT, serializedWithoutAudio);
      if (typeof transcript === 'string') {
        localStorage.setItem(STORAGE_KEYS.TRANSCRIPT, transcript);
      }
      localStorage.setItem(STORAGE_KEYS.LAST_SAVED, nowIso);
      return { success: true, strippedAudio: false, savedToIndexedDB: true };
    }
  } catch (err: any) {
    console.error('Failed to save project to storage:', err);
    return { success: false, strippedAudio: false, error: err?.message };
  }
}

/**
 * Saves a project directly into the Library without overwriting the currently active studio project
 * (Unless setAsActive is true)
 */
export async function saveProjectRecordToLibrary(
  project: DramaProject,
  transcript?: string,
  setAsActive = false
): Promise<SavedProjectSummary> {
  const nowIso = new Date().toISOString();
  const resolvedTranscript =
    typeof transcript === 'string' ? transcript : reconstructTranscriptFromProject(project);
  const summary = upsertProjectIntoLibrarySync(project, resolvedTranscript, nowIso);
  await saveProjectToIndexedDB(project, resolvedTranscript, setAsActive);
  if (setAsActive) {
    saveProjectToStorage(project, resolvedTranscript);
  }
  return summary;
}

/**
 * Loads raw stored project and transcript from LocalStorage synchronously
 */
export function getStoredProjectRaw(): {
  project: any | null;
  transcript: string | null;
  lastSaved: string | null;
} {
  try {
    const rawProject = localStorage.getItem(STORAGE_KEYS.PROJECT);
    const transcript = localStorage.getItem(STORAGE_KEYS.TRANSCRIPT);
    const lastSaved = localStorage.getItem(STORAGE_KEYS.LAST_SAVED);
    if (!rawProject) return { project: null, transcript, lastSaved };
    return { project: JSON.parse(rawProject), transcript, lastSaved };
  } catch (e) {
    console.error('Error loading stored project from LocalStorage:', e);
    return { project: null, transcript: null, lastSaved: null };
  }
}

/**
 * Rehydrates a raw project object, decoding audioBase64 into live AudioBuffers
 * for segments, take history, custom uploaded SFX, and music.
 */
export async function rehydrateRawProjectData(rawProject: any): Promise<DramaProject> {
  if (!rawProject) {
    throw new Error('No project data provided to rehydrate');
  }

  // Rehydrate segments and their Take histories with AudioBuffers
  const segments: AudioSegment[] = await Promise.all(
    (rawProject.segments || []).map(async (seg: any) => {
      let audioBuffer: AudioBuffer | undefined = undefined;
      let waveformPeaks = seg.waveformPeaks;

      if (seg.audioBase64) {
        try {
          audioBuffer = await decodeBase64Audio(seg.audioBase64);
          if (!waveformPeaks || waveformPeaks.length === 0) {
            waveformPeaks = extractWaveformPeaks(audioBuffer, 48);
          }
        } catch (decErr) {
          console.warn(`Failed to decode base64 audio for segment ${seg.id}:`, decErr);
        }
      }

      const takes: AudioTake[] = await Promise.all(
        (seg.takes || []).map(async (take: any) => {
          let takeBuf: AudioBuffer | undefined = undefined;
          if (take.audioBase64) {
            try {
              takeBuf = await decodeBase64Audio(take.audioBase64);
            } catch (e) {}
          }
          return {
            ...take,
            audioBuffer: takeBuf,
          };
        })
      );

      const measuredLufs =
        typeof seg.measuredLufs === 'number'
          ? seg.measuredLufs
          : audioBuffer
          ? measureAudioBufferLufs(audioBuffer).integratedLufs
          : undefined;

      return {
        ...seg,
        audioBuffer,
        waveformPeaks,
        measuredLufs,
        takes,
      };
    })
  );

  // Rehydrate procedural or custom-uploaded SFX clips
  const sfxClips: SfxClip[] = await Promise.all(
    (rawProject.sfxClips || []).map(async (clip: any) => {
      try {
        if (clip.audioBase64) {
          const decoded = await decodeBase64Audio(clip.audioBase64);
          const waveformPeaks = clip.waveformPeaks || extractWaveformPeaks(decoded, 32);
          return {
            ...clip,
            audioBuffer: decoded,
            waveformPeaks,
          };
        }
        const audioBuffer = await generateProceduralSfx(
          clip.type === 'custom' ? 'sci_fi_hum' : clip.type,
          clip.duration || 3
        );
        const waveformPeaks = extractWaveformPeaks(audioBuffer, 32);
        return {
          ...clip,
          audioBuffer,
          waveformPeaks,
        };
      } catch (sfxErr) {
        return clip;
      }
    })
  );

  // Rehydrate music track
  let musicBuffer: AudioBuffer | undefined = undefined;
  if (rawProject.musicTrack?.audioBase64) {
    try {
      musicBuffer = await decodeBase64Audio(rawProject.musicTrack.audioBase64);
    } catch (mErr) {
      console.warn('Failed to decode stored music base64:', mErr);
    }
  }

  if (!musicBuffer && rawProject.musicTrack?.enabled) {
    try {
      const themeBuffer = await generateAtmosphericTrack(
        rawProject.musicTrack.genre || 'Cyberpunk',
        rawProject.musicTrack.durationSeconds || 30
      );
      musicBuffer = themeBuffer;
    } catch (themeErr) {
      // Ignore
    }
  }

  return {
    ...rawProject,
    tensionCurve:
      rawProject.tensionCurve && rawProject.tensionCurve.length > 0
        ? rawProject.tensionCurve
        : DEFAULT_TENSION_CURVES.rising_climax.nodes,
    customVoices:
      rawProject.customVoices && rawProject.customVoices.length > 0
        ? rawProject.customVoices
        : PRESET_CUSTOM_VOICES,
    segments,
    sfxClips,
    musicTrack: {
      enabled: Boolean(rawProject.musicTrack?.enabled),
      prompt: rawProject.musicTrack?.prompt || '',
      genre: rawProject.musicTrack?.genre || 'Cyberpunk Synthwave',
      modelType: rawProject.musicTrack?.modelType || 'clip',
      durationSeconds: rawProject.musicTrack?.durationSeconds || 30,
      volume: rawProject.musicTrack?.volume ?? 0.35,
      ducking: rawProject.musicTrack?.ducking ?? true,
      duckingAmount: rawProject.musicTrack?.duckingAmount ?? 0.2,
      ...rawProject.musicTrack,
      audioBuffer: musicBuffer,
    },
  };
}

/**
 * Rehydrates the active stored project (preferring IndexedDB if available), decoding audioBase64
 * into live AudioBuffers for segments, take history, custom uploaded SFX, and music.
 */
export async function rehydrateProjectFromStorage(
  fallbackRawProject?: any
): Promise<DramaProject> {
  const idbData = await loadProjectFromIndexedDB(IDB_ACTIVE_KEY);
  const rawProject = idbData?.project || fallbackRawProject;

  if (!rawProject) {
    throw new Error('No stored project found to rehydrate');
  }

  // Also ensure the rehydrated active project is registered in the library
  if (rawProject.id) {
    const idbRecord = await loadProjectFromIndexedDB(`${IDB_PROJECT_PREFIX}${rawProject.id}`);
    if (!idbRecord) {
      saveProjectToIndexedDB(rawProject, idbData?.transcript || undefined, false).catch(() => {});
    }
  }

  return rehydrateRawProjectData(rawProject);
}

/**
 * Loads a specific project by ID from the Library (IndexedDB -> LocalStorage fallback),
 * rehydrates all AudioBuffers, and sets it as the active studio project.
 */
export async function loadProjectFromLibrary(projectId: string): Promise<{
  project: DramaProject;
  transcript: string;
  lastSaved: string;
}> {
  // 1. Try loading from IndexedDB project_record_<id>
  let record = await loadProjectFromIndexedDB(`${IDB_PROJECT_PREFIX}${projectId}`);

  // 2. Fallback to IndexedDB active_project_v1 if IDs match
  if (!record || !record.project) {
    const activeIdb = await loadProjectFromIndexedDB(IDB_ACTIVE_KEY);
    if (activeIdb?.project?.id === projectId) {
      record = activeIdb;
    }
  }

  // 3. Fallback to LocalStorage per-project lite cache or active LocalStorage slot
  if (!record || !record.project) {
    try {
      const liteRaw = localStorage.getItem(`${STORAGE_KEYS.PROJECT_LITE_PREFIX}${projectId}`);
      if (liteRaw) {
        const parsed = JSON.parse(liteRaw);
        record = {
          project: parsed.project,
          transcript: parsed.transcript || null,
          lastSaved: parsed.lastSaved || new Date().toISOString(),
        };
      }
    } catch (e) {}
  }

  if (!record || !record.project) {
    const activeSync = getStoredProjectRaw();
    if (activeSync.project?.id === projectId) {
      record = activeSync;
    }
  }

  if (!record || !record.project) {
    throw new Error(`Project "${projectId}" could not be found in storage.`);
  }

  const hydratedProject = await rehydrateRawProjectData(record.project);
  const transcript =
    typeof record.transcript === 'string' && record.transcript.trim().length > 0
      ? record.transcript
      : reconstructTranscriptFromProject(hydratedProject);
  const lastSaved = record.lastSaved || new Date().toISOString();

  // Persist as current active studio project
  saveProjectToStorage(hydratedProject, transcript);

  return {
    project: hydratedProject,
    transcript,
    lastSaved,
  };
}

/**
 * Exports a raw serialized project (including base64 audio) from the library by ID
 */
export async function getRawProjectFromLibrary(
  projectId: string,
  currentActiveProject?: DramaProject,
  currentTranscript?: string
): Promise<{ project: any; transcript: string }> {
  if (currentActiveProject && currentActiveProject.id === projectId) {
    return {
      project: sanitizeProjectForSerialization(currentActiveProject, true),
      transcript:
        typeof currentTranscript === 'string'
          ? currentTranscript
          : reconstructTranscriptFromProject(currentActiveProject),
    };
  }

  const record = await loadProjectFromIndexedDB(`${IDB_PROJECT_PREFIX}${projectId}`);
  if (record && record.project) {
    return {
      project: record.project,
      transcript:
        typeof record.transcript === 'string'
          ? record.transcript
          : reconstructTranscriptFromProject(record.project),
    };
  }

  const liteRaw = localStorage.getItem(`${STORAGE_KEYS.PROJECT_LITE_PREFIX}${projectId}`);
  if (liteRaw) {
    const parsed = JSON.parse(liteRaw);
    return {
      project: parsed.project,
      transcript:
        typeof parsed.transcript === 'string'
          ? parsed.transcript
          : reconstructTranscriptFromProject(parsed.project),
    };
  }

  throw new Error('Project not found in library');
}

/**
 * Duplicates an existing project in the Library, cloning all segments, takes, voice personas,
 * spatial blocking, and SFX with a fresh ID.
 */
export async function duplicateProjectInLibrary(
  sourceProjectId: string,
  currentActiveProject?: DramaProject,
  currentTranscript?: string
): Promise<{
  project: DramaProject;
  transcript: string;
  summary: SavedProjectSummary;
}> {
  const { project: sourceRaw, transcript } = await getRawProjectFromLibrary(
    sourceProjectId,
    currentActiveProject,
    currentTranscript
  );

  const now = Date.now();
  const newId = `drama-${now}-${Math.random().toString(36).slice(2, 6)}`;
  const baseTitle = (sourceRaw.title || 'Untitled Audio Drama').replace(/\s*\(Copy(?:\s+\d+)?\)$/i, '');
  const existingTitles = new Set(getLibraryProjectsSync().map((s) => s.title.toLowerCase()));
  let copyTitle = `${baseTitle} (Copy)`;
  let copyCounter = 2;
  while (existingTitles.has(copyTitle.toLowerCase())) {
    copyTitle = `${baseTitle} (Copy ${copyCounter})`;
    copyCounter++;
  }

  const clonedRaw = {
    ...JSON.parse(JSON.stringify(sourceRaw)),
    id: newId,
    title: copyTitle,
    segments: (sourceRaw.segments || []).map((seg: any, idx: number) => ({
      ...seg,
      id: `seg-${idx + 1}-${now}`,
    })),
    sfxClips: (sourceRaw.sfxClips || []).map((sfx: any, idx: number) => ({
      ...sfx,
      id: `sfx-${idx + 1}-${now}`,
    })),
  };

  const hydratedClone = await rehydrateRawProjectData(clonedRaw);
  const summary = await saveProjectRecordToLibrary(hydratedClone, transcript, false);

  return {
    project: hydratedClone,
    transcript,
    summary,
  };
}

/**
 * Renames or updates genre of a project in the Library
 */
export async function updateProjectMetadataInLibrary(
  projectId: string,
  updates: { title?: string; genre?: string }
): Promise<SavedProjectSummary[]> {
  try {
    const record = await loadProjectFromIndexedDB(`${IDB_PROJECT_PREFIX}${projectId}`);
    if (record && record.project) {
      const updatedProject = {
        ...record.project,
        title: updates.title !== undefined ? updates.title.trim() || record.project.title : record.project.title,
        genre: updates.genre !== undefined ? updates.genre.trim() || record.project.genre : record.project.genre,
      };
      await saveProjectRecordToLibrary(updatedProject, record.transcript || undefined, false);
    }
  } catch (e) {}

  try {
    const liteKey = `${STORAGE_KEYS.PROJECT_LITE_PREFIX}${projectId}`;
    const liteRaw = localStorage.getItem(liteKey);
    if (liteRaw) {
      const parsed = JSON.parse(liteRaw);
      if (parsed.project) {
        if (updates.title !== undefined) parsed.project.title = updates.title.trim() || parsed.project.title;
        if (updates.genre !== undefined) parsed.project.genre = updates.genre.trim() || parsed.project.genre;
        parsed.lastSaved = new Date().toISOString();
        localStorage.setItem(liteKey, JSON.stringify(parsed));
      }
    }
  } catch (e) {}

  const list = getLibraryProjectsSync().map((item) => {
    if (item.id !== projectId) return item;
    return {
      ...item,
      title: updates.title !== undefined ? updates.title.trim() || item.title : item.title,
      genre: updates.genre !== undefined ? updates.genre.trim() || item.genre : item.genre,
      lastSaved: new Date().toISOString(),
    };
  });

  saveLibraryIndexSync(list);
  return list;
}

/**
 * Imports a JSON project object into the Library, ensuring a unique ID and rehydrating all audio buffers.
 */
export async function importProjectJsonToLibrary(
  rawImported: any,
  setAsActive = true
): Promise<{
  project: DramaProject;
  transcript: string;
  summary: SavedProjectSummary;
}> {
  const candidate = rawImported?.project && rawImported.project.segments ? rawImported.project : rawImported;
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('Invalid project JSON format.');
  }

  const existingIds = new Set(getLibraryProjectsSync().map((s) => s.id));
  const now = Date.now();
  let finalId = candidate.id || `drama-import-${now}`;
  let finalTitle = candidate.title || 'Imported Audio Drama';

  if (existingIds.has(finalId)) {
    finalId = `${finalId}-imported-${now.toString().slice(-4)}`;
    if (!finalTitle.toLowerCase().includes('imported')) {
      finalTitle = `${finalTitle} (Imported)`;
    }
  }

  const normalizedRaw = {
    ...candidate,
    id: finalId,
    title: finalTitle,
    genre: candidate.genre || 'Dramatic Fiction',
    totalDuration: candidate.totalDuration || 25,
    characters: Array.isArray(candidate.characters) ? candidate.characters : [],
    segments: Array.isArray(candidate.segments) ? candidate.segments : [],
    sfxClips: Array.isArray(candidate.sfxClips) ? candidate.sfxClips : [],
    musicTrack: candidate.musicTrack || {
      enabled: false,
      prompt: '',
      genre: 'Cinematic Ambient',
      modelType: 'clip',
      durationSeconds: 30,
      volume: 0.35,
      ducking: true,
      duckingAmount: 0.2,
    },
  };

  const hydrated = await rehydrateRawProjectData(normalizedRaw);
  const transcript =
    typeof rawImported?.transcript === 'string' && rawImported.transcript.trim().length > 0
      ? rawImported.transcript
      : reconstructTranscriptFromProject(hydrated);

  const summary = await saveProjectRecordToLibrary(hydrated, transcript, setAsActive);
  return {
    project: hydrated,
    transcript,
    summary,
  };
}

/**
 * Deletes a project from both IndexedDB and LocalStorage Library Index.
 */
export async function deleteProjectFromLibrary(projectId: string): Promise<SavedProjectSummary[]> {
  const remaining = getLibraryProjectsSync().filter((item) => item.id !== projectId);
  saveLibraryIndexSync(remaining);

  try {
    localStorage.removeItem(`${STORAGE_KEYS.PROJECT_LITE_PREFIX}${projectId}`);
  } catch (e) {}

  try {
    const db = await openStudioIndexedDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.delete(`${IDB_PROJECT_PREFIX}${projectId}`);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    });
  } catch (e) {}

  return remaining;
}

/**
 * Clears active project slot in both LocalStorage and IndexedDB
 */
export function clearStoredProject(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.PROJECT);
    localStorage.removeItem(STORAGE_KEYS.TRANSCRIPT);
    localStorage.removeItem(STORAGE_KEYS.LAST_SAVED);
  } catch (e) {
    console.error('Failed to clear stored project from LocalStorage:', e);
  }
  openStudioIndexedDB()
    .then((db) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(IDB_ACTIVE_KEY);
      tx.oncomplete = () => db.close();
    })
    .catch(() => {});
}
