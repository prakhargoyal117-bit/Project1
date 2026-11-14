import { useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Loader2,
  MinusCircle,
  Play,
  Upload,
  XCircle,
} from 'lucide-react';
import type { ExamAttemptRecord, ExamPaperDataset } from '../types/exam';
import { applyAnswerKeyToQuestions, parseAnswerKeyText } from '../utils/answerKeyParser';
import { formatCountdown } from '../utils/scoring';
import { MathText } from './MathText';

interface ResultsViewProps {
  attempt: ExamAttemptRecord;
  paper: ExamPaperDataset | undefined;
  onAttachAnswerKeyToPaper: (updatedPaper: ExamPaperDataset) => void;
  onRetakeCbt: (paperId: string) => void;
  onBackToDashboard: () => void;
}

type ReviewFilter = 'all' | 'correct' | 'incorrect' | 'unattempted';

export function ResultsView({
  attempt,
  paper,
  onAttachAnswerKeyToPaper,
  onRetakeCbt,
  onBackToDashboard,
}: ResultsViewProps) {
  const [filter, setFilter] = useState<ReviewFilter>('all');
  const [pasteKeyText, setPasteKeyText] = useState('');
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const keyFileRef = useRef<HTMLInputElement>(null);

  const { evaluation } = attempt;
  const hasMissingKeys = evaluation.ungraded > 0;

  const filteredQuestions = evaluation.questionResults.filter((item) => {
    if (filter === 'all') return true;
    return item.outcome === filter;
  });

  const handleApplyPastedKey = () => {
    if (!paper) return;
    const entries = parseAnswerKeyText(pasteKeyText);
    if (entries.length === 0) {
      setUploadStatus('Could not detect answer entries. Format example: "1: B, 4: 12.5".');
      return;
    }
    const { updatedQuestions, matchedCount } = applyAnswerKeyToQuestions(
      paper.questions,
      entries
    );
    onAttachAnswerKeyToPaper({
      ...paper,
      questions: updatedQuestions,
      answerKeyAttached: matchedCount > 0,
      answerKeySource: 'Post-Test Answer Sheet',
      updatedAt: new Date().toISOString(),
    });
    setUploadStatus(`Evaluated against ${matchedCount} official answers.`);
  };

  const handleUploadAnswerSheet = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !paper) return;
    setUploading(true);
    setUploadStatus(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/extract-answer-key', {
        method: 'POST',
        body: formData,
      });
      const data = (await res.json()) as {
        mode?: 'text' | 'structured';
        rawText?: string;
        entries?: { questionNumber: number; answer: string }[];
        error?: string;
      };
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to parse answer sheet.');
      }
      const entries =
        data.mode === 'text' && data.rawText
          ? parseAnswerKeyText(data.rawText)
          : data.entries ?? [];
      const { updatedQuestions, matchedCount } = applyAnswerKeyToQuestions(
        paper.questions,
        entries
      );
      onAttachAnswerKeyToPaper({
        ...paper,
        questions: updatedQuestions,
        answerKeyAttached: matchedCount > 0,
        answerKeySource: file.name,
        updatedAt: new Date().toISOString(),
      });
      setUploadStatus(`Uploaded "${file.name}" and graded ${matchedCount} questions.`);
    } catch (err) {
      setUploadStatus(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
      if (keyFileRef.current) keyFileRef.current.value = '';
    }
  };

  const handleExportReportJson = () => {
    const blob = new Blob([JSON.stringify(attempt, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scorecard_${attempt.paperTitle.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <button
            type="button"
            onClick={onBackToDashboard}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            Back to Dataset Library
          </button>
          <h1 className="text-xl font-bold text-slate-900">
            CBT Evaluation Report — {attempt.paperTitle}
          </h1>
          <p className="text-xs text-slate-500 tabular-nums">
            Time Taken: {formatCountdown(attempt.timeTakenSeconds)} · Submitted{' '}
            {new Date(attempt.submittedAt).toLocaleString()}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExportReportJson}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            Export Report JSON
          </button>
          {paper && (
            <button
              type="button"
              onClick={() => onRetakeCbt(paper.id)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-md hover:bg-blue-800"
            >
              <Play className="w-3.5 h-3.5" aria-hidden="true" />
              Retake CBT
            </button>
          )}
        </div>
      </div>

      {/* Upload Answer Sheet Prompt if ungraded */}
      {hasMissingKeys && paper && (
        <section className="bg-amber-50 border border-amber-200 rounded-lg p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-amber-950">
                Upload Official Answer Sheet to Grade ({evaluation.ungraded} questions missing key)
              </h2>
              <p className="text-xs text-amber-800 mt-0.5">
                Upload the answer key PDF/Image/CSV or paste key pairs mapped to PDF question
                numbers to evaluate this attempt instantly.
              </p>
            </div>
            <div>
              <input
                ref={keyFileRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.txt"
                onChange={handleUploadAnswerSheet}
                className="hidden"
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => keyFileRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-amber-950 bg-white border border-amber-300 rounded-md hover:bg-amber-100/50"
              >
                {uploading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                Upload Answer Sheet File
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <textarea
              rows={2}
              value={pasteKeyText}
              onChange={(e) => setPasteKeyText(e.target.value)}
              placeholder="Or paste keys: 1: B, 2: C, 4: 12.5..."
              className="flex-1 p-2 text-xs font-mono bg-white border border-amber-300 rounded"
            />
            <button
              type="button"
              onClick={handleApplyPastedKey}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded hover:bg-slate-800 self-start"
            >
              Grade Attempt
            </button>
          </div>
          {uploadStatus && <p className="text-xs font-medium text-amber-950">{uploadStatus}</p>}
        </section>
      )}

      {/* KPI Scorecard Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-medium text-slate-500">Total Score</p>
          <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {evaluation.totalScore} <span className="text-sm font-normal text-slate-500">/ {evaluation.maxScore}</span>
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-medium text-slate-500">Accuracy</p>
          <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-blue-700">
            {evaluation.accuracyPercent}%
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-medium text-slate-500">Correct</p>
          <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-emerald-700">
            {evaluation.correct}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-medium text-slate-500">Incorrect</p>
          <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-red-600">
            {evaluation.incorrect}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-medium text-slate-500">Unattempted</p>
          <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-700">
            {evaluation.unattempted}
          </p>
        </div>
      </section>

      {/* Subject-Wise Breakdown Table */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">Subject-Wise Performance</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-medium">
                <th className="py-2.5 px-4">Subject</th>
                <th className="py-2.5 px-4 text-right">Questions</th>
                <th className="py-2.5 px-4 text-right">Attempted</th>
                <th className="py-2.5 px-4 text-right">Correct</th>
                <th className="py-2.5 px-4 text-right">Incorrect</th>
                <th className="py-2.5 px-4 text-right">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {evaluation.subjectBreakdown.map((row) => (
                <tr key={row.subject}>
                  <td className="py-2.5 px-4 font-semibold text-slate-900">{row.subject}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                    {row.totalQuestions}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                    {row.attempted}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-emerald-700">
                    {row.correct}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-red-600">
                    {row.incorrect}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                    {row.score} / {row.maxScore}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Question-by-Question Review */}
      <section className="bg-white border border-slate-200 rounded-lg">
        <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Question-by-Question Answer Comparison
          </h2>
          <div
            role="group"
            aria-label="Filter question review"
            className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-md"
          >
            {(
              [
                { id: 'all', label: `All (${evaluation.questionResults.length})` },
                { id: 'correct', label: `Correct (${evaluation.correct})` },
                { id: 'incorrect', label: `Incorrect (${evaluation.incorrect})` },
                { id: 'unattempted', label: `Unattempted (${evaluation.unattempted})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  filter === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-slate-200">
          {filteredQuestions.map((res) => {
            const qObj = paper?.questions.find(
              (item) => item.questionNumber === res.questionNumber
            );
            return (
              <div key={res.questionNumber} className="p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 text-xs">
                    <span className="font-mono font-bold text-slate-900">
                      Q{res.questionNumber}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-600">{res.subject}</span>
                    <span className="text-slate-400">·</span>
                    {res.outcome === 'correct' && (
                      <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                        Correct
                      </span>
                    )}
                    {res.outcome === 'incorrect' && (
                      <span className="inline-flex items-center gap-1 font-medium text-red-600">
                        <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                        Incorrect
                      </span>
                    )}
                    {res.outcome === 'unattempted' && (
                      <span className="inline-flex items-center gap-1 font-medium text-slate-500">
                        <MinusCircle className="w-3.5 h-3.5" aria-hidden="true" />
                        Unattempted
                      </span>
                    )}
                    {res.outcome === 'no_key' && (
                      <span className="font-medium text-amber-700">No Official Key</span>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-xs font-mono tabular-nums">
                    <span>
                      Your Answer:{' '}
                      <strong className="text-slate-900">{res.userAnswer ?? '—'}</strong>
                    </span>
                    <span>
                      Official Key:{' '}
                      <strong className="text-emerald-700">{res.officialAnswer ?? '—'}</strong>
                    </span>
                    <span
                      className={`font-bold ${
                        res.marksAwarded > 0
                          ? 'text-emerald-700'
                          : res.marksAwarded < 0
                            ? 'text-red-600'
                            : 'text-slate-500'
                      }`}
                    >
                      {res.marksAwarded > 0 ? `+${res.marksAwarded}` : res.marksAwarded} Marks
                    </span>
                  </div>
                </div>

                {qObj && (
                  <div className="text-sm text-slate-800">
                    <MathText text={qObj.prompt} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
