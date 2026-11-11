import React, { useState } from 'react';
import { X, Sparkles, Plus, Trash2, FileText, Film, Radio, Music } from 'lucide-react';
import { SAMPLE_DRAMAS } from '../utils/sampleDramas';

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmBlank: (title: string, genre: string) => void;
  onLoadPreset: (presetKey: string) => void;
  onOpenLibrary?: () => void;
}

export const NewProjectModal: React.FC<NewProjectModalProps> = ({
  isOpen,
  onClose,
  onConfirmBlank,
  onLoadPreset,
  onOpenLibrary,
}) => {
  const [blankTitle, setBlankTitle] = useState('My Original Audio Drama');
  const [blankGenre, setBlankGenre] = useState('Dramatic Fiction');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col text-slate-100 animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-violet-600/20 border border-violet-500/40 flex items-center justify-center">
              <Plus className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-white">Create New Audio Drama</h2>
              <p className="text-[11px] text-slate-400">
                Creates a new project in your library without overwriting saved work
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-5 overflow-y-auto max-h-[75vh]">
          {/* Option 1: Blank Project */}
          <div className="bg-slate-950 border border-slate-800 hover:border-violet-500/50 rounded-xl p-4 space-y-3 transition">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-lg bg-violet-950/80 border border-violet-700/50 text-violet-300">
                  <FileText className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="font-bold text-xs text-white">Blank Canvas (New Production)</h3>
                  <p className="text-[11px] text-slate-400">
                    Starts a clean timeline and empty script editor saved as a new project in your
                    library.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Drama Title</label>
                <input
                  type="text"
                  value={blankTitle}
                  onChange={(e) => setBlankTitle(e.target.value)}
                  placeholder="e.g. Whispers of the Deep"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-violet-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Genre / Mood</label>
                <input
                  type="text"
                  value={blankGenre}
                  onChange={(e) => setBlankGenre(e.target.value)}
                  placeholder="e.g. Mystery, Sci-Fi, Thriller"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-violet-500"
                />
              </div>
            </div>

            <button
              onClick={() => {
                onConfirmBlank(blankTitle, blankGenre);
                onClose();
              }}
              className="w-full py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs shadow-md shadow-violet-600/20 transition flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Blank Audio Drama</span>
            </button>
          </div>

          {/* Option 2: Pre-made Sample Presets */}
          <div className="space-y-2.5">
            <span className="font-bold text-xs text-slate-300 block">
              Or Create from a Starter Template:
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                onClick={() => {
                  onLoadPreset('cyberpunk');
                  onClose();
                }}
                className="p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-cyan-500/50 text-left transition space-y-1 group"
              >
                <div className="flex items-center gap-1.5 text-cyan-400 font-bold text-xs">
                  <Film className="w-3.5 h-3.5" />
                  <span>Neon Vault 7 (Cyberpunk)</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-tight">
                  Netrunner heist with fast pacing, AI overlord, and synthwave score.
                </p>
              </button>

              <button
                onClick={() => {
                  onLoadPreset('noir');
                  onClose();
                }}
                className="p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-amber-500/50 text-left transition space-y-1 group"
              >
                <div className="flex items-center gap-1.5 text-amber-400 font-bold text-xs">
                  <Radio className="w-3.5 h-3.5" />
                  <span>5th & Hollow (Film Noir)</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-tight">
                  1940s detective mystery with rain, thunder, and smoky jazz mood.
                </p>
              </button>

              <button
                onClick={() => {
                  onLoadPreset('horror');
                  onClose();
                }}
                className="p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-emerald-500/50 text-left transition space-y-1 group"
              >
                <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Blackwood Manor (Gothic)</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-tight">
                  Haunted estate encounter with creaking doors and spectral whispers.
                </p>
              </button>

              <button
                onClick={() => {
                  onLoadPreset('scifi');
                  onClose();
                }}
                className="p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-blue-500/50 text-left transition space-y-1 group"
              >
                <div className="flex items-center gap-1.5 text-blue-400 font-bold text-xs">
                  <Music className="w-3.5 h-3.5" />
                  <span>Europan Ocean (Hard Sci-Fi)</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-tight">
                  Deep-sea submersible mission discovering an alien structure.
                </p>
              </button>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          {onOpenLibrary ? (
            <button
              onClick={() => {
                onClose();
                onOpenLibrary();
              }}
              className="text-xs text-violet-400 hover:text-violet-300 font-medium transition"
            >
              Browse All Projects in Library →
            </button>
          ) : (
            <span />
          )}
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 text-xs font-medium transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
