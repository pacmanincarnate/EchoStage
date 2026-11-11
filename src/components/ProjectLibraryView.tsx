import React, { useState, useMemo, useRef } from 'react';
import {
  FolderOpen,
  Plus,
  Copy,
  Trash2,
  Upload,
  Download,
  Search,
  LayoutGrid,
  List,
  Clock,
  Users,
  FileAudio,
  Music,
  Check,
  Edit3,
  X,
  ArrowUpRight,
  Sparkles,
  FileText,
  Film,
  Radio,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { SavedProjectSummary } from '../utils/projectStorage';
import { SAMPLE_DRAMAS } from '../utils/sampleDramas';
import { formatTimecode } from './HeaderBar';

interface ProjectLibraryViewProps {
  projects: SavedProjectSummary[];
  activeProjectId: string;
  isLoadingProject: boolean;
  onSelectProject: (projectId: string) => Promise<void>;
  onCreateBlankProject: (title: string, genre: string, openImmediately: boolean) => Promise<void>;
  onCreateFromTemplate: (presetKey: string, openImmediately: boolean) => Promise<void>;
  onDuplicateProject: (projectId: string) => Promise<void>;
  onDeleteProject: (projectId: string) => Promise<void>;
  onImportProjectFile: (file: File, openImmediately: boolean) => Promise<void>;
  onExportProjectFromLibrary: (projectId: string) => Promise<void>;
  onRenameProject: (projectId: string, title: string, genre: string) => Promise<void>;
  onReturnToTimeline: () => void;
}

type SortByOption = 'lastSaved' | 'title' | 'duration' | 'segments';
type FilterOption = 'all' | 'active' | 'rendered' | 'unrendered';

export const ProjectLibraryView: React.FC<ProjectLibraryViewProps> = ({
  projects,
  activeProjectId,
  isLoadingProject,
  onSelectProject,
  onCreateBlankProject,
  onCreateFromTemplate,
  onDuplicateProject,
  onDeleteProject,
  onImportProjectFile,
  onExportProjectFromLibrary,
  onRenameProject,
  onReturnToTimeline,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortByOption>('lastSaved');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Create New Project Drawer State
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [newTitle, setNewTitle] = useState('Untitled Audio Drama');
  const [newGenre, setNewGenre] = useState('Dramatic Fiction');
  const [openUponCreate, setOpenUponCreate] = useState(true);

  // Inline Rename State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState('');
  const [editGenreValue, setEditGenreValue] = useState('');

  // Inline Delete Confirmation State
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Busy & Feedback Banner State
  const [busyProjectId, setBusyProjectId] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showTemporaryNotice = (message: string, type: 'success' | 'error' = 'success') => {
    setStatusNotice({ type, message });
    setTimeout(() => {
      setStatusNotice((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  };

  const formatRelativeTime = (isoDate: string): string => {
    try {
      const date = new Date(isoDate);
      const diffMs = Date.now() - date.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      if (diffSec < 45) return 'Just now';
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr}h ago`;
      const diffDays = Math.floor(diffHr / 24);
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return 'Recently';
    }
  };

  // Filtered and sorted projects
  const filteredProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return projects
      .filter((proj) => {
        if (filterBy === 'active' && proj.id !== activeProjectId) return false;
        if (filterBy === 'rendered' && proj.renderedSegmentCount === 0) return false;
        if (filterBy === 'unrendered' && proj.renderedSegmentCount > 0) return false;

        if (!q) return true;
        const matchesTitle = proj.title.toLowerCase().includes(q);
        const matchesGenre = proj.genre.toLowerCase().includes(q);
        const matchesSnippet = proj.previewSnippet.toLowerCase().includes(q);
        const matchesChar = proj.characterNames.some((c) => c.name.toLowerCase().includes(q));
        return matchesTitle || matchesGenre || matchesSnippet || matchesChar;
      })
      .sort((a, b) => {
        if (sortBy === 'title') {
          return a.title.localeCompare(b.title);
        }
        if (sortBy === 'duration') {
          return b.totalDuration - a.totalDuration;
        }
        if (sortBy === 'segments') {
          return b.segmentCount - a.segmentCount;
        }
        return new Date(b.lastSaved).getTime() - new Date(a.lastSaved).getTime();
      });
  }, [projects, searchQuery, sortBy, filterBy, activeProjectId]);

  // Library aggregate stats
  const libraryStats = useMemo(() => {
    const totalProjects = projects.length;
    const totalLines = projects.reduce((acc, p) => acc + p.segmentCount, 0);
    const totalRendered = projects.reduce((acc, p) => acc + p.renderedSegmentCount, 0);
    const totalRuntime = projects.reduce((acc, p) => acc + p.totalDuration, 0);
    return { totalProjects, totalLines, totalRendered, totalRuntime };
  }, [projects]);

  const handleStartRename = (proj: SavedProjectSummary) => {
    setEditingId(proj.id);
    setEditTitleValue(proj.title);
    setEditGenreValue(proj.genre);
    setConfirmDeleteId(null);
  };

  const handleCommitRename = async (projectId: string) => {
    if (!editTitleValue.trim()) return;
    setBusyProjectId(projectId);
    try {
      await onRenameProject(projectId, editTitleValue.trim(), editGenreValue.trim() || 'Drama');
      setEditingId(null);
      showTemporaryNotice(`Updated project title to "${editTitleValue.trim()}".`);
    } catch (err: any) {
      showTemporaryNotice(err?.message || 'Failed to rename project.', 'error');
    } finally {
      setBusyProjectId(null);
    }
  };

  const handleDuplicate = async (proj: SavedProjectSummary) => {
    setBusyProjectId(proj.id);
    try {
      await onDuplicateProject(proj.id);
      showTemporaryNotice(`Duplicated "${proj.title}" into your library.`);
    } catch (err: any) {
      showTemporaryNotice(err?.message || 'Failed to duplicate project.', 'error');
    } finally {
      setBusyProjectId(null);
    }
  };

  const handleDelete = async (proj: SavedProjectSummary) => {
    setBusyProjectId(proj.id);
    try {
      await onDeleteProject(proj.id);
      setConfirmDeleteId(null);
      showTemporaryNotice(`Deleted "${proj.title}" from your library.`);
    } catch (err: any) {
      showTemporaryNotice(err?.message || 'Failed to delete project.', 'error');
    } finally {
      setBusyProjectId(null);
    }
  };

  const handleOpenProject = async (proj: SavedProjectSummary) => {
    if (proj.id === activeProjectId) {
      onReturnToTimeline();
      return;
    }
    setBusyProjectId(proj.id);
    try {
      await onSelectProject(proj.id);
    } catch (err: any) {
      showTemporaryNotice(err?.message || 'Could not load project.', 'error');
    } finally {
      setBusyProjectId(null);
    }
  };

  const handleCreateBlank = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = newTitle.trim() || 'Untitled Audio Drama';
    const cleanGenre = newGenre.trim() || 'Dramatic Fiction';
    await onCreateBlankProject(cleanTitle, cleanGenre, openUponCreate);
    setShowCreatePanel(false);
    setNewTitle('Untitled Audio Drama');
    setNewGenre('Dramatic Fiction');
    if (!openUponCreate) {
      showTemporaryNotice(`Created "${cleanTitle}" in your library.`);
    }
  };

  const handleCreateTemplate = async (key: string, label: string) => {
    await onCreateFromTemplate(key, openUponCreate);
    setShowCreatePanel(false);
    if (!openUponCreate) {
      showTemporaryNotice(`Added "${label}" template project to your library.`);
    }
  };

  const handleFileImportInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      try {
        await onImportProjectFile(files[i], files.length === 1 && openUponCreate);
        showTemporaryNotice(`Imported "${files[i].name}" into your project library.`);
      } catch (err: any) {
        showTemporaryNotice(
          err?.message || `Failed to import "${files[i].name}". Ensure it is a valid project JSON.`,
          'error'
        );
      }
    }
    e.target.value = '';
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.name.toLowerCase().endsWith('.json')
    );
    if (files.length === 0) {
      showTemporaryNotice('Please drop a valid EchoStage .json project file.', 'error');
      return;
    }
    for (const file of files) {
      try {
        await onImportProjectFile(file, false);
        showTemporaryNotice(`Imported "${file.name}" into your project library.`);
      } catch (err: any) {
        showTemporaryNotice(err?.message || `Failed to import "${file.name}".`, 'error');
      }
    }
  };

  return (
    <div
      className="flex-1 overflow-y-auto bg-slate-950 text-slate-100 p-6 md:p-8"
      onDragOver={(e) => {
        e.preventDefault();
        if (!isDraggingFile) setIsDraggingFile(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setIsDraggingFile(false);
      }}
      onDrop={handleDrop}
    >
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Library Header & Primary Actions */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-slate-800">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
              <span>Project Library</span>
              <span aria-hidden="true">·</span>
              <span>{libraryStats.totalProjects} saved productions</span>
              <span aria-hidden="true">·</span>
              <span>
                {libraryStats.totalRendered}/{libraryStats.totalLines} lines synthesized
              </span>
              <span aria-hidden="true">·</span>
              <span>{formatTimecode(libraryStats.totalRuntime)} total runtime</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
              Audio Drama Productions
            </h2>
            <p className="text-sm text-slate-400 max-w-2xl">
              Navigate between saved multi-track audio dramas, duplicate versions for alternate cuts,
              import or back up JSON project files, or start a new production.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              multiple
              onChange={handleFileImportInput}
              className="hidden"
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-semibold transition flex items-center gap-2 whitespace-nowrap shrink-0"
              title="Import an EchoStage .json project file from disk"
            >
              <Upload className="w-3.5 h-3.5 text-cyan-400" />
              <span>Import Project (.json)</span>
            </button>

            <button
              onClick={() => setShowCreatePanel((prev) => !prev)}
              className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition flex items-center gap-2 whitespace-nowrap shrink-0 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>New Audio Drama</span>
            </button>
          </div>
        </div>

        {/* Status Notification Banner */}
        {statusNotice && (
          <div
            className={`px-4 py-3 rounded-xl border flex items-center justify-between gap-3 text-xs ${
              statusNotice.type === 'error'
                ? 'bg-red-950/60 border-red-800/80 text-red-200'
                : 'bg-emerald-950/60 border-emerald-800/80 text-emerald-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {statusNotice.type === 'error' ? (
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              ) : (
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              )}
              <span>{statusNotice.message}</span>
            </div>
            <button
              onClick={() => setStatusNotice(null)}
              className="text-slate-400 hover:text-white p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Drag-and-Drop Overlay Prompt */}
        {isDraggingFile && (
          <div className="border-2 border-dashed border-cyan-500/70 bg-cyan-950/20 rounded-xl p-8 text-center space-y-2">
            <Upload className="w-8 h-8 text-cyan-400 mx-auto" />
            <p className="text-sm font-semibold text-white">
              Drop EchoStage Project (.json) files to import into your Library
            </p>
            <p className="text-xs text-slate-400">
              All dialogue segments, voice personas, take histories, and spatial placements will be
              restored.
            </p>
          </div>
        )}

        {/* Collapsible Create New Project & Starter Templates Panel */}
        {showCreatePanel && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-bold text-white">Create New Audio Drama Project</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Your existing projects remain safely stored in your library.
                </p>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={openUponCreate}
                    onChange={(e) => setOpenUponCreate(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-950 text-violet-600 focus:ring-violet-500"
                  />
                  <span>Open in Studio immediately after creating</span>
                </label>
                <button
                  onClick={() => setShowCreatePanel(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              {/* Left Column: Blank Canvas Form */}
              <form
                onSubmit={handleCreateBlank}
                className="lg:col-span-5 bg-slate-950 border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-violet-400 font-semibold text-xs">
                    <FileText className="w-4 h-4" />
                    <span>Blank Audio Drama Production</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Start with a clean timeline and empty script editor ready for your own dialogue or
                    AI script generation.
                  </p>

                  <div className="space-y-3 pt-1">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Project Title
                      </label>
                      <input
                        type="text"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        placeholder="e.g. Echoes of Station Nine"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Genre / Atmosphere
                      </label>
                      <input
                        type="text"
                        value={newGenre}
                        onChange={(e) => setNewGenre(e.target.value)}
                        placeholder="e.g. Sci-Fi Thriller, Noir Mystery, Audio Fiction"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 px-4 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs transition flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Blank Production</span>
                </button>
              </form>

              {/* Right Column: 4 Curated Genre Starter Scripts */}
              <div className="lg:col-span-7 bg-slate-950 border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-cyan-400 font-semibold text-xs">
                    <Sparkles className="w-4 h-4" />
                    <span>Create from Studio Starter Script</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Pre-configured multi-character scripts with spatial panning, vocal bursts, and
                    sound effect cues.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Object.entries(SAMPLE_DRAMAS).map(([key, preset]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleCreateTemplate(key, preset.title || key)}
                      className="p-3.5 rounded-lg bg-slate-900 hover:bg-slate-800/90 border border-slate-800 hover:border-slate-600 text-left transition flex flex-col justify-between gap-2 group"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-xs text-white group-hover:text-cyan-300 transition truncate">
                            {preset.title}
                          </span>
                          <ArrowUpRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 shrink-0" />
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                          <span>{preset.genre}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {preset.characters?.length || 2} roles
                          </span>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                        {preset.transcript.split('\n')[0]}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filter, Search, Sort & View Controls Bar */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 rounded-xl p-3">
          {/* Left: Search + Filter Segmented Buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by title, genre, character, or dialogue..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-8 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Interactive Filter Tabs */}
            <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg text-xs">
              {(
                [
                  { id: 'all', label: 'All Projects' },
                  { id: 'active', label: 'Active' },
                  { id: 'rendered', label: 'With Audio' },
                  { id: 'unrendered', label: 'Drafts' },
                ] as Array<{ id: FilterOption; label: string }>
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFilterBy(tab.id)}
                  className={`px-2.5 py-1 rounded-md font-medium transition whitespace-nowrap shrink-0 ${
                    filterBy === tab.id
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Right: Sort Dropdown & Grid/Table View Switcher */}
          <div className="flex items-center justify-between sm:justify-end gap-2.5">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400 whitespace-nowrap">Sort by:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortByOption)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-violet-500"
              >
                <option value="lastSaved">Last Saved</option>
                <option value="title">Title (A–Z)</option>
                <option value="duration">Duration</option>
                <option value="segments">Dialogue Line Count</option>
              </select>
            </div>

            <div className="flex items-center p-1 bg-slate-950 border border-slate-800 rounded-lg">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-md transition ${
                  viewMode === 'grid'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Grid Card View"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-md transition ${
                  viewMode === 'table'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Studio Table View"
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Empty State */}
        {filteredProjects.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center max-w-lg mx-auto my-8 space-y-4">
            <div className="w-12 h-12 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center mx-auto text-slate-400">
              <FolderOpen className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-white">
                {searchQuery || filterBy !== 'all'
                  ? 'No matching audio drama projects'
                  : 'Your Project Library is empty'}
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                {searchQuery || filterBy !== 'all'
                  ? 'Try clearing your search query or switching the filter tab above.'
                  : 'Create a new blank audio drama, start from a genre script template, or import a saved .json project file.'}
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              {searchQuery || filterBy !== 'all' ? (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setFilterBy('all');
                  }}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition"
                >
                  Reset Filters
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setShowCreatePanel(true)}
                    className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create New Drama</span>
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition flex items-center gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Import JSON</span>
                  </button>
                </>
              )}
            </div>
          </div>
        ) : viewMode === 'grid' ? (
          /* GRID VIEW */
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filteredProjects.map((proj) => {
              const isActive = proj.id === activeProjectId;
              const isEditing = editingId === proj.id;
              const isConfirmingDelete = confirmDeleteId === proj.id;
              const isBusy = busyProjectId === proj.id || (isLoadingProject && isActive);

              return (
                <div
                  key={proj.id}
                  className={`rounded-xl border transition flex flex-col justify-between p-5 ${
                    isActive
                      ? 'bg-slate-900 border-violet-500/70'
                      : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {/* Top Section: Kicker, Title, Genre & Edit */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                      <div className="flex items-center gap-1.5 truncate">
                        <span>{proj.genre || 'Dramatic Fiction'}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {formatTimecode(proj.totalDuration)}
                        </span>
                        {isActive && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-violet-400 font-semibold">Active in Studio</span>
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleStartRename(proj)}
                          className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
                          title="Rename Project or Genre"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {isEditing ? (
                      <div className="space-y-2 bg-slate-950 p-3 rounded-lg border border-slate-800">
                        <div>
                          <label className="block text-[10px] text-slate-400 mb-0.5">Title</label>
                          <input
                            type="text"
                            value={editTitleValue}
                            onChange={(e) => setEditTitleValue(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-violet-500"
                            autoFocus
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-400 mb-0.5">Genre</label>
                          <input
                            type="text"
                            value={editGenreValue}
                            onChange={(e) => setEditGenreValue(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-violet-500"
                          />
                        </div>
                        <div className="flex items-center justify-end gap-1.5 pt-1">
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-2.5 py-1 rounded text-xs text-slate-400 hover:text-white"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleCommitRename(proj.id)}
                            className="px-3 py-1 rounded bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <h3
                          onClick={() => handleOpenProject(proj)}
                          className="text-base font-bold text-white hover:text-violet-300 cursor-pointer transition leading-snug line-clamp-1"
                        >
                          {proj.title}
                        </h3>
                        <p className="text-xs text-slate-400 line-clamp-2 mt-1 leading-relaxed italic">
                          {proj.previewSnippet}
                        </p>
                      </div>
                    )}

                    {/* Cast & Technical Breakdown (Zero-Pill Clean Metadata) */}
                    <div className="pt-2 border-t border-slate-800/80 space-y-2 text-xs">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-slate-300 font-mono tabular-nums text-[11px]">
                        <span>{proj.segmentCount} lines</span>
                        <span aria-hidden="true" className="text-slate-600">
                          ·
                        </span>
                        <span
                          className={
                            proj.renderedSegmentCount > 0 ? 'text-emerald-400' : 'text-slate-400'
                          }
                        >
                          {proj.renderedSegmentCount}/{proj.segmentCount} synthesized
                        </span>
                        <span aria-hidden="true" className="text-slate-600">
                          ·
                        </span>
                        <span>{proj.characterCount} cast</span>
                        <span aria-hidden="true" className="text-slate-600">
                          ·
                        </span>
                        <span>{proj.sfxCount} SFX</span>
                      </div>

                      {/* Character Roster Inline Text */}
                      {proj.characterNames.length > 0 && (
                        <div className="text-[11px] text-slate-400 truncate">
                          <span className="text-slate-500">Cast: </span>
                          {proj.characterNames.map((c, idx) => (
                            <React.Fragment key={`${proj.id}-char-${idx}`}>
                              {idx > 0 && <span className="text-slate-600"> · </span>}
                              <span className="text-slate-300 font-medium">{c.name}</span>
                              <span className="text-slate-500"> ({c.voiceName})</span>
                            </React.Fragment>
                          ))}
                        </div>
                      )}

                      <div className="text-[11px] text-slate-500 font-mono tabular-nums flex items-center justify-between">
                        <span>Saved {formatRelativeTime(proj.lastSaved)}</span>
                        <span>{proj.musicEnabled ? 'Score active' : 'No score'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Actions Bar */}
                  <div className="pt-4 mt-4 border-t border-slate-800 flex items-center justify-between gap-2">
                    {isConfirmingDelete ? (
                      <div className="flex items-center justify-between w-full gap-2">
                        <span className="text-xs text-red-300 font-medium truncate">
                          Delete permanently?
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleDelete(proj)}
                            disabled={isBusy}
                            className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition"
                          >
                            Confirm Delete
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => handleOpenProject(proj)}
                          disabled={isBusy}
                          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                            isActive
                              ? 'bg-violet-600/20 text-violet-300 border border-violet-500/40 hover:bg-violet-600/30'
                              : 'bg-violet-600 hover:bg-violet-500 text-white'
                          }`}
                        >
                          {isBusy ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <FolderOpen className="w-3.5 h-3.5" />
                          )}
                          <span>{isActive ? 'Return to Studio' : 'Open Project'}</span>
                        </button>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleDuplicate(proj)}
                            disabled={isBusy}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs font-medium transition flex items-center gap-1 whitespace-nowrap"
                            title="Duplicate this project"
                          >
                            <Copy className="w-3.5 h-3.5 text-slate-400" />
                            <span>Duplicate</span>
                          </button>

                          <button
                            onClick={() => onExportProjectFromLibrary(proj.id)}
                            disabled={isBusy}
                            className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 transition"
                            title="Download Project JSON backup"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => setConfirmDeleteId(proj.id)}
                            disabled={isBusy}
                            className="p-1.5 rounded-lg bg-slate-950 hover:bg-red-950/60 text-slate-400 hover:text-red-300 border border-slate-800 hover:border-red-800/60 transition"
                            title="Delete project from library"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* HIGH-DENSITY STUDIO TABLE VIEW */
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/70 text-[11px] font-semibold text-slate-400">
                    <th className="py-3 px-4">Project Title</th>
                    <th className="py-3 px-4">Genre</th>
                    <th className="py-3 px-4">Cast</th>
                    <th className="py-3 px-4 text-right">Lines / Audio</th>
                    <th className="py-3 px-4 text-right">Duration</th>
                    <th className="py-3 px-4 text-right">Last Saved</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-xs">
                  {filteredProjects.map((proj) => {
                    const isActive = proj.id === activeProjectId;
                    const isConfirmingDelete = confirmDeleteId === proj.id;
                    const isBusy = busyProjectId === proj.id;

                    return (
                      <tr
                        key={proj.id}
                        className={`transition ${
                          isActive ? 'bg-violet-950/20' : 'hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleOpenProject(proj)}
                              className="font-bold text-white hover:text-violet-300 text-left transition truncate max-w-xs"
                            >
                              {proj.title}
                            </button>
                            {isActive && (
                              <span className="text-[11px] text-violet-400 font-medium whitespace-nowrap">
                                · Active
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 truncate max-w-md mt-0.5">
                            {proj.previewSnippet}
                          </p>
                        </td>

                        <td className="py-3 px-4 text-slate-300 whitespace-nowrap">
                          {proj.genre}
                        </td>

                        <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                          <span className="font-mono tabular-nums text-slate-300">
                            {proj.characterCount}
                          </span>{' '}
                          roles
                        </td>

                        <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                          <span className="text-slate-200">{proj.segmentCount}</span>
                          <span className="text-slate-500"> (</span>
                          <span
                            className={
                              proj.renderedSegmentCount > 0 ? 'text-emerald-400' : 'text-slate-500'
                            }
                          >
                            {proj.renderedSegmentCount} TTS
                          </span>
                          <span className="text-slate-500">)</span>
                        </td>

                        <td className="py-3 px-4 text-right font-mono tabular-nums text-cyan-400 whitespace-nowrap">
                          {formatTimecode(proj.totalDuration)}
                        </td>

                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-400 whitespace-nowrap">
                          {formatRelativeTime(proj.lastSaved)}
                        </td>

                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {isConfirmingDelete ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2 py-1 rounded bg-slate-800 text-slate-300 text-[11px]"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleDelete(proj)}
                                className="px-2.5 py-1 rounded bg-red-600 text-white text-[11px] font-semibold"
                              >
                                Confirm
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                onClick={() => handleOpenProject(proj)}
                                disabled={isBusy}
                                className="px-2.5 py-1 rounded bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-semibold transition"
                              >
                                {isActive ? 'Studio' : 'Open'}
                              </button>
                              <button
                                onClick={() => handleDuplicate(proj)}
                                disabled={isBusy}
                                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] transition"
                                title="Duplicate"
                              >
                                Duplicate
                              </button>
                              <button
                                onClick={() => onExportProjectFromLibrary(proj.id)}
                                disabled={isBusy}
                                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                                title="Export JSON"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(proj.id)}
                                disabled={isBusy}
                                className="p-1 rounded bg-slate-800 hover:bg-red-950/70 text-slate-400 hover:text-red-300 transition"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
