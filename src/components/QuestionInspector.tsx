import { useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Download,
  FileSpreadsheet,
  Loader2,
  Play,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import type { ExamPaperDataset, OptionLabel, QuestionItem } from '../types/exam';
import { applyAnswerKeyToQuestions, parseAnswerKeyText } from '../utils/answerKeyParser';
import { exportPaperToCsv } from '../utils/scoring';
import { MathText } from './MathText';

interface QuestionInspectorProps {
  paper: ExamPaperDataset;
  onUpdatePaper: (updated: ExamPaperDataset) => void;
  onStartCbt: (paperId: string) => void;
  onBack: () => void;
}

export function QuestionInspector({
  paper,
  onUpdatePaper,
  onStartCbt,
  onBack,
}: QuestionInspectorProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState(
    paper.questions
      .filter((q) => q.correctAnswer)
      .map((q) => `${q.questionNumber}: ${q.correctAnswer}`)
      .join('\n')
  );
  const [keyStatus, setKeyStatus] = useState<string | null>(null);
  const [uploadingKey, setUploadingKey] = useState(false);
  const [subjectFilter, setSubjectFilter] = useState<string>('ALL');
  const keyFileRef = useRef<HTMLInputElement>(null);

  const subjects = Array.from(new Set(paper.questions.map((q) => q.subject)));
  const visibleQuestions =
    subjectFilter === 'ALL'
      ? paper.questions
      : paper.questions.filter((q) => q.subject === subjectFilter);

  const keyedCount = paper.questions.filter((q) => Boolean(q.correctAnswer?.trim())).length;

  const updateQuestionField = (id: string, patch: Partial<QuestionItem>) => {
    const updatedQuestions = paper.questions.map((q) =>
      q.id === id ? { ...q, ...patch } : q
    );
    onUpdatePaper({
      ...paper,
      questions: updatedQuestions,
      answerKeyAttached: updatedQuestions.some((q) => Boolean(q.correctAnswer?.trim())),
      updatedAt: new Date().toISOString(),
    });
  };

  const updateOptionText = (qId: string, label: OptionLabel, text: string) => {
    const updatedQuestions = paper.questions.map((q) => {
      if (q.id !== qId) return q;
      const existing = q.options ?? [
        { label: 'A', text: '' },
        { label: 'B', text: '' },
        { label: 'C', text: '' },
        { label: 'D', text: '' },
      ];
      return {
        ...q,
        options: existing.map((o) => (o.label === label ? { ...o, text } : o)),
      };
    });
    onUpdatePaper({
      ...paper,
      questions: updatedQuestions,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleApplyPastedKey = () => {
    const entries = parseAnswerKeyText(answerText);
    if (entries.length === 0) {
      setKeyStatus('No valid question-answer pairs detected. Use format like "1: B" or "4: 12.5".');
      return;
    }
    const { updatedQuestions, matchedCount, unmatchedNumbers } = applyAnswerKeyToQuestions(
      paper.questions,
      entries
    );
    onUpdatePaper({
      ...paper,
      questions: updatedQuestions,
      answerKeyAttached: matchedCount > 0,
      answerKeySource: 'Manual Answer Sheet',
      updatedAt: new Date().toISOString(),
    });
    setKeyStatus(
      `Applied ${matchedCount} answers to ${paper.questions.length} questions.${
        unmatchedNumbers.length > 0
          ? ` Ignored unmatched numbers: ${unmatchedNumbers.slice(0, 6).join(', ')}`
          : ''
      }`
    );
  };

  const handleUploadAnswerSheet = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingKey(true);
    setKeyStatus(null);
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
        throw new Error(data.error || 'Answer sheet extraction failed.');
      }

      const entries =
        data.mode === 'text' && data.rawText
          ? parseAnswerKeyText(data.rawText)
          : data.entries ?? [];

      setAnswerText(entries.map((item) => `${item.questionNumber}: ${item.answer}`).join('\n'));
      const { updatedQuestions, matchedCount } = applyAnswerKeyToQuestions(
        paper.questions,
        entries
      );
      onUpdatePaper({
        ...paper,
        questions: updatedQuestions,
        answerKeyAttached: matchedCount > 0,
        answerKeySource: file.name,
        updatedAt: new Date().toISOString(),
      });
      setKeyStatus(`Extracted "${file.name}" and matched ${matchedCount} questions.`);
    } catch (err) {
      setKeyStatus(err instanceof Error ? err.message : 'Answer sheet upload failed.');
    } finally {
      setUploadingKey(false);
      if (keyFileRef.current) keyFileRef.current.value = '';
    }
  };

  const handleAddQuestion = () => {
    const maxNum = paper.questions.reduce((m, q) => Math.max(m, q.questionNumber), 0);
    const nextNum = maxNum + 1;
    const newQ: QuestionItem = {
      id: `q-custom-${Date.now()}`,
      questionNumber: nextNum,
      subject: subjects[0] || 'Mathematics',
      type: 'mcq',
      prompt: 'Evaluate $\\int_{0}^{1} x^2\\,dx$.',
      options: [
        { label: 'A', text: '$\\frac{1}{2}$' },
        { label: 'B', text: '$\\frac{1}{3}$' },
        { label: 'C', text: '$\\frac{1}{4}$' },
        { label: 'D', text: '$1$' },
      ],
      correctAnswer: 'B',
      marksPositive: 4,
      marksNegative: 1,
    };
    onUpdatePaper({
      ...paper,
      questions: [...paper.questions, newQ],
      updatedAt: new Date().toISOString(),
    });
    setEditingId(newQ.id);
  };

  const handleDeleteQuestion = (id: string) => {
    const filtered = paper.questions.filter((q) => q.id !== id);
    onUpdatePaper({
      ...paper,
      questions: filtered,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(paper, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${paper.title.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    const csv = exportPaperToCsv(paper);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${paper.title.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Top Dataset Controls */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1 flex-1 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            Back to Dataset Library
          </button>
          <input
            type="text"
            aria-label="Paper title"
            value={paper.title}
            onChange={(e) =>
              onUpdatePaper({
                ...paper,
                title: e.target.value,
                updatedAt: new Date().toISOString(),
              })
            }
            className="block w-full text-lg font-semibold text-slate-900 bg-transparent border-b border-transparent focus:border-blue-600 focus:outline-none py-0.5"
          />
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
            <span>{paper.questions.length} Questions</span>
            <span aria-hidden="true">·</span>
            <span>
              {keyedCount}/{paper.questions.length} Keys Mapped
            </span>
            <span aria-hidden="true">·</span>
            <label className="inline-flex items-center gap-1.5">
              <span>Duration (min):</span>
              <input
                type="number"
                min={5}
                max={360}
                value={paper.durationMinutes}
                onChange={(e) =>
                  onUpdatePaper({
                    ...paper,
                    durationMinutes: Math.max(5, Number(e.target.value) || 60),
                    updatedAt: new Date().toISOString(),
                  })
                }
                className="w-16 px-1.5 py-0.5 border border-slate-200 rounded font-mono text-slate-800"
              />
            </label>
            <span aria-hidden="true">·</span>
            <label className="inline-flex items-center gap-1.5">
              <span>Numerical Negative:</span>
              <select
                value={paper.numericalNegativeMarking}
                onChange={(e) =>
                  onUpdatePaper({
                    ...paper,
                    numericalNegativeMarking: Number(e.target.value),
                    updatedAt: new Date().toISOString(),
                  })
                }
                className="px-1.5 py-0.5 border border-slate-200 rounded bg-white text-slate-800"
              >
                <option value={1}>-1</option>
                <option value={0}>0</option>
              </select>
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExportJson}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            Export JSON
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => onStartCbt(paper.id)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-md hover:bg-blue-800"
          >
            <Play className="w-3.5 h-3.5" aria-hidden="true" />
            Start CBT Exam
          </button>
        </div>
      </div>

      {/* Answer Sheet Upload & Bulk Mapping */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Answer Sheet Upload & Question Number Mapping
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Upload an official answer key PDF/image/CSV or paste entries keyed by PDF question
              number (e.g., <span className="font-mono">1: B, 4: 12.5</span>).
            </p>
          </div>

          <div className="shrink-0">
            <input
              ref={keyFileRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.txt"
              onChange={handleUploadAnswerSheet}
              className="hidden"
            />
            <button
              type="button"
              disabled={uploadingKey}
              onClick={() => keyFileRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-300 rounded-md hover:bg-slate-100"
            >
              {uploadingKey ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              Upload Answer Key File (PDF / Image / CSV)
            </button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-3">
          <textarea
            rows={3}
            aria-label="Bulk answer sheet text"
            value={answerText}
            onChange={(e) => setAnswerText(e.target.value)}
            placeholder={'1: B\n2: C\n3: A\n4: 4'}
            className="flex-1 p-2.5 text-xs font-mono border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <div className="flex flex-col justify-between gap-2 shrink-0">
            <button
              type="button"
              onClick={handleApplyPastedKey}
              className="px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 whitespace-nowrap"
            >
              Apply Answer Key
            </button>
            <span className="text-xs text-slate-500 tabular-nums">
              {keyedCount}/{paper.questions.length} mapped
            </span>
          </div>
        </div>

        {keyStatus && (
          <p className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
            {keyStatus}
          </p>
        )}
      </section>

      {/* Question Filter & Add Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label="Filter questions by subject"
          className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-md"
        >
          <button
            type="button"
            onClick={() => setSubjectFilter('ALL')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              subjectFilter === 'ALL'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All ({paper.questions.length})
          </button>
          {subjects.map((subj) => (
            <button
              key={subj}
              type="button"
              onClick={() => setSubjectFilter(subj)}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                subjectFilter === subj
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {subj}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={handleAddQuestion}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          Add Question
        </button>
      </div>

      {/* Question Cards with KaTeX Preview & Editor */}
      <div className="space-y-3">
        {visibleQuestions.map((q) => {
          const isEditing = editingId === q.id;
          return (
            <div
              key={q.id}
              className="bg-white border border-slate-200 rounded-lg p-5 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span className="font-mono font-semibold text-slate-900 text-sm">
                    Q{q.questionNumber}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{q.subject}</span>
                  <span aria-hidden="true">·</span>
                  <span>{q.type === 'mcq' ? 'Single Choice MCQ' : 'Numerical Input'}</span>
                  {q.correctAnswer && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono font-semibold text-emerald-700">
                        Key: {q.correctAnswer}
                      </span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                    <span>Answer:</span>
                    {q.type === 'mcq' ? (
                      <select
                        aria-label={`Correct answer for Question ${q.questionNumber}`}
                        value={q.correctAnswer ?? ''}
                        onChange={(e) =>
                          updateQuestionField(q.id, {
                            correctAnswer: e.target.value || undefined,
                          })
                        }
                        className="px-2 py-1 border border-slate-200 rounded bg-white font-mono text-xs"
                      >
                        <option value="">Unset</option>
                        <option value="A">A</option>
                        <option value="B">B</option>
                        <option value="C">C</option>
                        <option value="D">D</option>
                      </select>
                    ) : (
                      <input
                        type="text"
                        aria-label={`Correct numerical answer for Question ${q.questionNumber}`}
                        value={q.correctAnswer ?? ''}
                        placeholder="e.g. 25"
                        onChange={(e) =>
                          updateQuestionField(q.id, {
                            correctAnswer: e.target.value || undefined,
                          })
                        }
                        className="w-20 px-2 py-1 border border-slate-200 rounded font-mono text-xs"
                      />
                    )}
                  </label>

                  <button
                    type="button"
                    onClick={() => setEditingId(isEditing ? null : q.id)}
                    className="px-3 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded hover:bg-blue-100"
                  >
                    {isEditing ? 'Done Editing' : 'Edit LaTeX'}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteQuestion(q.id)}
                    aria-label={`Delete Question ${q.questionNumber}`}
                    className="p-1.5 text-slate-400 hover:text-red-600 rounded"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>

              {/* Rendered KaTeX Question Preview */}
              <div className="text-sm text-slate-900 leading-relaxed">
                <MathText text={q.prompt} />
              </div>

              {q.diagramNote && (
                <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded px-3 py-2">
                  Figure Context: {q.diagramNote}
                </p>
              )}

              {q.type === 'mcq' && q.options && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {q.options.map((opt) => {
                    const isCorrect = q.correctAnswer === opt.label;
                    return (
                      <div
                        key={opt.label}
                        className={`px-3 py-2 rounded border text-xs flex items-center gap-2 ${
                          isCorrect
                            ? 'border-emerald-300 bg-emerald-50/70 text-slate-900'
                            : 'border-slate-200 bg-slate-50/50 text-slate-800'
                        }`}
                      >
                        <span className="font-mono font-semibold text-slate-600 shrink-0">
                          ({opt.label})
                        </span>
                        <div className="min-w-0 flex-1 overflow-x-auto">
                          <MathText text={opt.text} />
                        </div>
                        {isCorrect && (
                          <Check
                            className="w-3.5 h-3.5 text-emerald-700 shrink-0"
                            aria-hidden="true"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Inline LaTeX & Structure Editor */}
              {isEditing && (
                <div className="pt-4 border-t border-slate-200 space-y-3 bg-slate-50/80 p-4 rounded-md">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Question No.
                      </label>
                      <input
                        type="number"
                        value={q.questionNumber}
                        onChange={(e) =>
                          updateQuestionField(q.id, {
                            questionNumber: Number(e.target.value) || 1,
                          })
                        }
                        className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Subject
                      </label>
                      <input
                        type="text"
                        value={q.subject}
                        onChange={(e) =>
                          updateQuestionField(q.id, { subject: e.target.value })
                        }
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Format
                      </label>
                      <select
                        value={q.type}
                        onChange={(e) => {
                          const nextType = e.target.value as 'mcq' | 'numerical';
                          updateQuestionField(q.id, {
                            type: nextType,
                            options:
                              nextType === 'mcq'
                                ? q.options ?? [
                                    { label: 'A', text: 'Option A' },
                                    { label: 'B', text: 'Option B' },
                                    { label: 'C', text: 'Option C' },
                                    { label: 'D', text: 'Option D' },
                                  ]
                                : undefined,
                          });
                        }}
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded bg-white"
                      >
                        <option value="mcq">Single Choice MCQ</option>
                        <option value="numerical">Numerical / Integer</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Question Prompt (LaTeX in $...$ or $$...$$)
                    </label>
                    <textarea
                      rows={3}
                      value={q.prompt}
                      onChange={(e) =>
                        updateQuestionField(q.id, { prompt: e.target.value })
                      }
                      className="w-full p-2.5 text-xs font-mono border border-slate-200 rounded bg-white"
                    />
                  </div>

                  {q.type === 'mcq' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {(['A', 'B', 'C', 'D'] as const).map((label) => {
                        const opt = q.options?.find((o) => o.label === label);
                        return (
                          <div key={label}>
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                              Option {label}
                            </label>
                            <input
                              type="text"
                              value={opt?.text ?? ''}
                              onChange={(e) =>
                                updateOptionText(q.id, label, e.target.value)
                              }
                              className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded bg-white"
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
