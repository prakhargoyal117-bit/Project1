import { useMemo, useRef, useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  FileUp,
  FolderOpen,
  Play,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import type { ExamAttemptRecord, ExamPaperDataset } from '../types/exam';
import { exportPaperToCsv } from '../utils/scoring';
import { MathText } from './MathText';

interface DatasetLibraryProps {
  papers: ExamPaperDataset[];
  attempts: ExamAttemptRecord[];
  onStartCbt: (paperId: string) => void;
  onInspectPaper: (paperId: string) => void;
  onDeletePaper: (paperId: string) => void;
  onImportDataset: (paper: ExamPaperDataset) => void;
  onGoToUpload: () => void;
  onViewAttempt: (attemptId: string) => void;
}

type KeyFilter = 'all' | 'attached' | 'missing';

export function DatasetLibrary({
  papers,
  attempts,
  onStartCbt,
  onInspectPaper,
  onDeletePaper,
  onImportDataset,
  onGoToUpload,
  onViewAttempt,
}: DatasetLibraryProps) {
  const [query, setQuery] = useState('');
  const [keyFilter, setKeyFilter] = useState<KeyFilter>('all');
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredPapers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return papers.filter((paper) => {
      const hasAnyKey = paper.questions.some((item) => Boolean(item.correctAnswer?.trim()));
      if (keyFilter === 'attached' && !hasAnyKey) return false;
      if (keyFilter === 'missing' && hasAnyKey) return false;
      if (!q) return true;
      const subjects = paper.questions.map((item) => item.subject.toLowerCase()).join(' ');
      return (
        paper.title.toLowerCase().includes(q) ||
        (paper.sourceFileName ?? '').toLowerCase().includes(q) ||
        subjects.includes(q)
      );
    });
  }, [papers, query, keyFilter]);

  const totalQuestions = useMemo(
    () => papers.reduce((acc, p) => acc + p.questions.length, 0),
    [papers]
  );

  const handleDownloadJson = (paper: ExamPaperDataset) => {
    const blob = new Blob([JSON.stringify(paper, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${paper.title.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadCsv = (paper: ExamPaperDataset) => {
    const csv = exportPaperToCsv(paper);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${paper.title.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleJsonFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as ExamPaperDataset;
      if (!parsed || !Array.isArray(parsed.questions) || !parsed.title) {
        setImportError('Invalid dataset JSON structure. Expected title and questions array.');
        return;
      }
      onImportDataset({
        ...parsed,
        id: `imported-${Date.now()}`,
        updatedAt: new Date().toISOString(),
      });
    } catch {
      setImportError('Failed to parse JSON dataset file.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-8">
      {/* Overview KPI Strip */}
      <section aria-label="Workspace overview" className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <p className="text-xs font-medium text-slate-500">Processed Exam Datasets</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{papers.length}</p>
          <p className="mt-1 text-xs text-slate-500">Ready for NTA CBT simulation & export</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <p className="text-xs font-medium text-slate-500">Extracted Questions</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{totalQuestions}</p>
          <p className="mt-1 text-xs text-slate-500">KaTeX LaTeX notation & numerical items</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <p className="text-xs font-medium text-slate-500">Completed CBT Attempts</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{attempts.length}</p>
          <p className="mt-1 text-xs text-slate-500">Auto-graded against uploaded answer sheets</p>
        </div>
      </section>

      {/* Toolbar: Search, Filter, Import */}
      <section className="bg-white border border-slate-200 rounded-lg">
        <div className="p-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search
                className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <label htmlFor="dataset-search" className="sr-only">
                Search processed datasets
              </label>
              <input
                id="dataset-search"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search papers by title, filename, or subject..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
              />
            </div>

            <div
              role="group"
              aria-label="Filter datasets by answer key status"
              className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-md self-start"
            >
              {(
                [
                  { id: 'all', label: 'All Papers' },
                  { id: 'attached', label: 'Key Attached' },
                  { id: 'missing', label: 'Needs Key' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setKeyFilter(tab.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    keyFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleJsonFileChange}
              className="hidden"
              aria-label="Import dataset JSON file"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              <FileUp className="w-3.5 h-3.5" aria-hidden="true" />
              Import JSON
            </button>
            <button
              type="button"
              onClick={onGoToUpload}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-700 rounded-md hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              New PDF Extraction
            </button>
          </div>
        </div>

        {importError && (
          <div className="px-4 py-2.5 bg-red-50 border-b border-red-200 text-xs text-red-700">
            {importError}
          </div>
        )}

        {/* Dataset Rows */}
        {filteredPapers.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-slate-800">
              {papers.length === 0
                ? 'No processed exam papers yet'
                : 'No datasets match your search or filter'}
            </p>
            <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
              Upload a JEE Main question paper PDF to extract MCQs, numerical questions, and
              mathematical equations into an interactive CBT paper.
            </p>
            <button
              type="button"
              onClick={onGoToUpload}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-md hover:bg-blue-800"
            >
              Upload Question PDF
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {filteredPapers.map((paper) => {
              const mcqCount = paper.questions.filter((q) => q.type === 'mcq').length;
              const numCount = paper.questions.filter((q) => q.type === 'numerical').length;
              const keyedCount = paper.questions.filter((q) =>
                Boolean(q.correctAnswer?.trim())
              ).length;
              const subjects = Array.from(new Set(paper.questions.map((q) => q.subject)));
              const previewQuestion = paper.questions[0];

              return (
                <article
                  key={paper.id}
                  className="p-5 hover:bg-slate-50/70 transition-colors flex flex-col gap-4"
                >
                  <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="text-base font-semibold text-slate-900 truncate">
                          {paper.title}
                        </h3>
                        <span
                          className={`text-xs font-medium ${
                            keyedCount === paper.questions.length && paper.questions.length > 0
                              ? 'text-emerald-700'
                              : keyedCount > 0
                                ? 'text-amber-700'
                                : 'text-slate-500'
                          }`}
                        >
                          {keyedCount === paper.questions.length && paper.questions.length > 0
                            ? 'Answer Key Complete'
                            : keyedCount > 0
                              ? `Partial Key (${keyedCount}/${paper.questions.length})`
                              : 'No Answer Key Attached'}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 tabular-nums">
                        <span>{subjects.join(', ') || 'General'}</span>
                        <span aria-hidden="true">·</span>
                        <span>{paper.questions.length} Questions</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {mcqCount} MCQ / {numCount} Numerical
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{paper.durationMinutes} min CBT</span>
                        {paper.sourceFileName && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono text-slate-600">{paper.sourceFileName}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onStartCbt(paper.id)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-700 rounded-md hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
                      >
                        <Play className="w-3.5 h-3.5" aria-hidden="true" />
                        Launch CBT
                      </button>
                      <button
                        type="button"
                        onClick={() => onInspectPaper(paper.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
                      >
                        <FolderOpen className="w-3.5 h-3.5" aria-hidden="true" />
                        Inspect & Answer Key
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadJson(paper)}
                        aria-label={`Export JSON for ${paper.title}`}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
                      >
                        <Download className="w-3.5 h-3.5" aria-hidden="true" />
                        JSON
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadCsv(paper)}
                        aria-label={`Export CSV for ${paper.title}`}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
                        CSV
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeletePaper(paper.id)}
                        aria-label={`Delete ${paper.title}`}
                        className="inline-flex items-center justify-center p-2 text-slate-500 hover:text-red-600 bg-white border border-slate-200 rounded-md hover:border-red-200 transition-colors shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  {previewQuestion && (
                    <div className="bg-slate-50 border border-slate-200/80 rounded-md px-3.5 py-2.5 text-xs text-slate-700 overflow-x-auto">
                      <span className="font-mono font-semibold text-slate-500 mr-2">
                        Sample Q{previewQuestion.questionNumber}:
                      </span>
                      <MathText text={previewQuestion.prompt} />
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Recent Test Attempts Table */}
      {attempts.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-lg">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Recent CBT Attempts</h2>
            <span className="text-xs text-slate-500 tabular-nums">
              {attempts.length} recorded
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50">
                  <th className="py-2.5 px-4">Paper Title</th>
                  <th className="py-2.5 px-4 text-right">Score</th>
                  <th className="py-2.5 px-4 text-right">Correct</th>
                  <th className="py-2.5 px-4 text-right">Incorrect</th>
                  <th className="py-2.5 px-4 text-right">Accuracy</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {attempts.map((att) => (
                  <tr key={att.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-medium text-slate-900">{att.paperTitle}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {att.evaluation.totalScore} / {att.evaluation.maxScore}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-emerald-700">
                      {att.evaluation.correct}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-red-600">
                      {att.evaluation.incorrect}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                      {att.evaluation.accuracyPercent}%
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => onViewAttempt(att.id)}
                        className="text-blue-700 hover:underline font-medium"
                      >
                        Review Report
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
