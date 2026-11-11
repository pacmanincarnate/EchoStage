import React, { useState } from 'react';
import { DramaProject } from '../types/drama';
import {
  audioBufferToWavBlob,
  mixTracksOffline,
  MixdownTrackSource,
} from '../utils/wavHelper';
import {
  Download,
  X,
  FileAudio,
  Layers,
  FileCode,
  CheckCircle,
  Loader2,
  Upload,
  Users,
  FileSpreadsheet,
} from 'lucide-react';
import { formatTimecode } from './HeaderBar';

interface ExportModalProps {
  project: DramaProject;
  onClose: () => void;
  onImportProject: (imported: DramaProject) => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  project,
  onClose,
  onImportProject,
}) => {
  const [isExportingMaster, setIsExportingMaster] = useState(false);
  const [isExportingStems, setIsExportingStems] = useState(false);
  const [isExportingCharStems, setIsExportingCharStems] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const charMap = new Map(project.characters.map((c) => [c.name.toUpperCase(), c]));

  const downloadBlob = (blob: Blob, filename: string) => {
    const cleanName = filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = cleanName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 1. Export Master Mixdown (Stereo 16-bit PCM WAV with Acoustic DSP & Stereo Panning)
  const handleExportMasterWav = async () => {
    try {
      setIsExportingMaster(true);
      setExportStatus('Gathering tracks, spatial panning, and room acoustic DSP chains...');

      const sources: MixdownTrackSource[] = [];
      const speechIntervals: Array<{ start: number; end: number }> = [];

      for (const seg of project.segments) {
        if (seg.audioBuffer) {
          const char = charMap.get(seg.speaker.toUpperCase());
          sources.push({
            buffer: seg.audioBuffer,
            startTime: seg.startTime,
            volume: seg.volume ?? 1,
            pan: seg.pan ?? char?.pan ?? 0,
            distance: seg.distance ?? char?.distance ?? 0.15,
            acousticPreset: seg.acousticPreset ?? char?.acousticPreset ?? 'studio_dry',
          });
          speechIntervals.push({
            start: seg.startTime,
            end: seg.startTime + seg.duration,
          });
        }
      }

      for (const sfx of project.sfxClips) {
        if (sfx.audioBuffer) {
          sources.push({
            buffer: sfx.audioBuffer,
            startTime: sfx.startTime,
            volume: sfx.volume ?? 1,
            pan: sfx.pan ?? 0,
            distance: sfx.distance ?? 0.1,
            loop: sfx.loop,
            duration: sfx.duration,
          });
        }
      }

      if (project.musicTrack.enabled && project.musicTrack.audioBuffer) {
        sources.push({
          buffer: project.musicTrack.audioBuffer,
          startTime: 0,
          volume: project.musicTrack.volume ?? 0.4,
          duckWithSpeech: project.musicTrack.ducking,
          loop: true,
          duration: project.totalDuration,
        });
      }

      setExportStatus('Rendering spatial multi-track mixdown with OfflineAudioContext...');
      const mixedBuffer = await mixTracksOffline(
        sources,
        project.totalDuration,
        speechIntervals,
        project.musicTrack.duckingAmount || 0.25
      );

      setExportStatus('Encoding 16-bit Stereo PCM RIFF WAV...');
      const wavBlob = audioBufferToWavBlob(mixedBuffer);
      downloadBlob(wavBlob, `${project.title}_Master_Mix.wav`);

      setExportStatus('Master mix exported with full spatial acoustics!');
      setTimeout(() => setExportStatus(null), 3500);
    } catch (err: any) {
      console.error('Mixdown export failed:', err);
      setExportStatus(`Export failed: ${err.message}`);
    } finally {
      setIsExportingMaster(false);
    }
  };

  // 2. Export Bus Stems (Dialogue Bus, Music Bus, SFX Bus)
  const handleExportStems = async () => {
    try {
      setIsExportingStems(true);
      setExportStatus('Rendering Dialogue, Music, and Foley SFX bus stems...');

      const speechSources: MixdownTrackSource[] = project.segments
        .filter((s) => !!s.audioBuffer)
        .map((s) => {
          const char = charMap.get(s.speaker.toUpperCase());
          return {
            buffer: s.audioBuffer!,
            startTime: s.startTime,
            volume: s.volume ?? 1,
            pan: s.pan ?? char?.pan ?? 0,
            distance: s.distance ?? char?.distance ?? 0.15,
            acousticPreset: s.acousticPreset ?? char?.acousticPreset ?? 'studio_dry',
          };
        });

      if (speechSources.length > 0) {
        const speechBuffer = await mixTracksOffline(speechSources, project.totalDuration);
        downloadBlob(audioBufferToWavBlob(speechBuffer), `${project.title}_Stem_Dialogue.wav`);
      }

      if (project.musicTrack.enabled && project.musicTrack.audioBuffer) {
        downloadBlob(
          audioBufferToWavBlob(project.musicTrack.audioBuffer),
          `${project.title}_Stem_Music.wav`
        );
      }

      const sfxSources: MixdownTrackSource[] = project.sfxClips
        .filter((s) => !!s.audioBuffer)
        .map((s) => ({
          buffer: s.audioBuffer!,
          startTime: s.startTime,
          volume: s.volume ?? 1,
          pan: s.pan ?? 0,
          distance: s.distance ?? 0.1,
          loop: s.loop,
          duration: s.duration,
        }));

      if (sfxSources.length > 0) {
        const sfxBuffer = await mixTracksOffline(sfxSources, project.totalDuration);
        downloadBlob(audioBufferToWavBlob(sfxBuffer), `${project.title}_Stem_SFX.wav`);
      }

      setExportStatus('All bus stems downloaded!');
      setTimeout(() => setExportStatus(null), 3500);
    } catch (err: any) {
      console.error('Stems export failed:', err);
      setExportStatus(`Stems export failed: ${err.message}`);
    } finally {
      setIsExportingStems(false);
    }
  };

  // 3. Phase 3: Export Isolated Per-Character Stems (For Game Engines / Animatics / Reaper)
  const handleExportPerCharacterStems = async () => {
    try {
      setIsExportingCharStems(true);
      setExportStatus('Rendering isolated per-character dialogue WAV stems...');

      const speakers = Array.from(
        new Set(project.segments.filter((s) => !!s.audioBuffer).map((s) => s.speaker.toUpperCase()))
      );

      if (speakers.length === 0) {
        setExportStatus('No synthesized dialogue segments yet. Render speech first.');
        setIsExportingCharStems(false);
        return;
      }

      for (const spk of speakers) {
        const char = charMap.get(spk);
        const charSources: MixdownTrackSource[] = project.segments
          .filter((s) => s.speaker.toUpperCase() === spk && !!s.audioBuffer)
          .map((s) => ({
            buffer: s.audioBuffer!,
            startTime: s.startTime,
            volume: s.volume ?? 1,
            pan: s.pan ?? char?.pan ?? 0,
            distance: s.distance ?? char?.distance ?? 0.15,
            acousticPreset: s.acousticPreset ?? char?.acousticPreset ?? 'studio_dry',
          }));

        if (charSources.length > 0) {
          const charBuffer = await mixTracksOffline(charSources, project.totalDuration);
          downloadBlob(
            audioBufferToWavBlob(charBuffer),
            `${project.title}_Character_${spk}.wav`
          );
        }
      }

      setExportStatus(`Exported ${speakers.length} isolated character stems!`);
      setTimeout(() => setExportStatus(null), 3500);
    } catch (err: any) {
      setExportStatus(`Character stem export failed: ${err.message}`);
    } finally {
      setIsExportingCharStems(false);
    }
  };

  // 4. Phase 3: Export Production Timecode Cue Sheet (.csv)
  const handleExportCueSheetCsv = () => {
    const headers = [
      'Line #',
      'Timecode In',
      'Timecode Out',
      'Start (s)',
      'Duration (s)',
      'Speaker',
      'Voice',
      'Acoustic DSP',
      'Stereo Pan',
      'Acting Style',
      'Subtext Note',
      'Spoken Dialogue',
    ];

    const escapeCsv = (val: any) => `"${String(val ?? '').replace(/"/g, '""')}"`;

    const rows = project.segments.map((seg, idx) => {
      const char = charMap.get(seg.speaker.toUpperCase());
      const endSec = seg.startTime + seg.duration;
      const pan = seg.pan ?? char?.pan ?? 0;
      const preset = seg.acousticPreset ?? char?.acousticPreset ?? 'studio_dry';
      return [
        idx + 1,
        formatTimecode(seg.startTime),
        formatTimecode(endSec),
        seg.startTime.toFixed(2),
        seg.duration.toFixed(2),
        seg.speaker,
        seg.voiceName,
        preset,
        pan.toFixed(2),
        seg.stylePrompt || '',
        seg.subtextNote || '',
        seg.text,
      ]
        .map(escapeCsv)
        .join(',');
    });

    const csvContent = [headers.map(escapeCsv).join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, `${project.title}_Timecode_Cue_Sheet.csv`);
    setExportStatus('Production Timecode Cue Sheet (.csv) downloaded!');
  };

  // 5. Export Project JSON
  const handleExportProjectJson = () => {
    const cleanProject = {
      ...project,
      segments: project.segments.map((s) => ({
        ...s,
        audioBuffer: undefined,
        takes: (s.takes || []).map((t) => ({ ...t, audioBuffer: undefined })),
      })),
      musicTrack: {
        ...project.musicTrack,
        audioBuffer: undefined,
      },
      sfxClips: project.sfxClips.map((s) => ({
        ...s,
        audioBuffer: undefined,
      })),
    };

    const jsonStr = JSON.stringify(cleanProject, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    downloadBlob(blob, `${project.title}_Project.json`);
  };

  const handleImportJsonFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        onImportProject(parsed);
        onClose();
      } catch (err) {
        setExportStatus('Invalid project JSON file format.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col text-slate-100">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center gap-2">
            <Download className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-sm tracking-tight text-white">
              Export Audio Drama Mix, Stems & Cue Sheets
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Export Options */}
        <div className="p-5 space-y-3.5 text-xs max-h-[78vh] overflow-y-auto">
          {exportStatus && (
            <div className="p-3 bg-emerald-950/60 border border-emerald-800/80 rounded-xl text-emerald-300 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              <span>{exportStatus}</span>
            </div>
          )}

          {/* Master WAV */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-950 border border-emerald-800/60 flex items-center justify-center text-emerald-400 shrink-0">
                <FileAudio className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-white">Master Binaural Mixdown (.wav)</h4>
                <p className="text-[11px] text-slate-400">
                  Full stereo production with Acoustic Room DSP, 2D stereo panning, Lyria score
                  auto-ducking, and Foley SFX.
                </p>
              </div>
            </div>

            <button
              onClick={handleExportMasterWav}
              disabled={isExportingMaster}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs shrink-0 transition"
            >
              {isExportingMaster ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>{isExportingMaster ? 'Rendering...' : 'Download WAV'}</span>
            </button>
          </div>

          {/* Per-Character Isolated Stems */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-cyan-950 border border-cyan-800/60 flex items-center justify-center text-cyan-400 shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-white">
                  Per-Character Isolated Stems (.wav)
                </h4>
                <p className="text-[11px] text-slate-400">
                  Exports a separate time-aligned WAV file for each character role (ideal for Unreal,
                  Unity, Reaper, or animatics).
                </p>
              </div>
            </div>

            <button
              onClick={handleExportPerCharacterStems}
              disabled={isExportingCharStems}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-slate-950 font-bold text-xs shrink-0 transition"
            >
              {isExportingCharStems ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Users className="w-3.5 h-3.5" />
              )}
              <span>{isExportingCharStems ? 'Rendering...' : 'Character Stems'}</span>
            </button>
          </div>

          {/* Bus Stems */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-violet-950 border border-violet-800/60 flex items-center justify-center text-violet-400 shrink-0">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-white">Bus Stems (Dialogue / Music / SFX)</h4>
                <p className="text-[11px] text-slate-400">
                  Downloads separate Dialogue.wav, Music.wav, and SFX.wav bus tracks for DAW
                  post-processing.
                </p>
              </div>
            </div>

            <button
              onClick={handleExportStems}
              disabled={isExportingStems}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold text-xs shrink-0 transition"
            >
              {isExportingStems ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Layers className="w-3.5 h-3.5" />
              )}
              <span>{isExportingStems ? 'Rendering...' : 'Bus Stems'}</span>
            </button>
          </div>

          {/* Production Timecode Cue Sheet (.csv) */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-950 border border-amber-800/60 flex items-center justify-center text-amber-400 shrink-0">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-white">
                  Production Timecode Cue Sheet (.csv)
                </h4>
                <p className="text-[11px] text-slate-400">
                  Spreadsheet of In/Out timecodes, speakers, acoustic presets, stereo pan, subtext
                  notes, and script lines.
                </p>
              </div>
            </div>

            <button
              onClick={handleExportCueSheetCsv}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs border border-slate-700 shrink-0 transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>

          {/* Project JSON Backup & Restore */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center text-slate-400 shrink-0">
                <FileCode className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-white">Project File (.json)</h4>
                <p className="text-[11px] text-slate-400">
                  Save or load your full project state, take histories, spatial blocking, and
                  tension curve.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <label className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold cursor-pointer border border-slate-700">
                <Upload className="w-3.5 h-3.5" />
                <span>Import</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportJsonFile}
                  className="hidden"
                />
              </label>

              <button
                onClick={handleExportProjectJson}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold border border-slate-700"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Save JSON</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
