import { useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Loader2,
  Play,
  Upload,
} from 'lucide-react';
import type { ExamPaperDataset, QuestionItem } from '../types/exam';
import { applyAnswerKeyToQuestions, parseAnswerKeyText } from '../utils/answerKeyParser';
import { MathText } from './MathText';

interface PdfUploadStudioProps {
  onPaperCreated: (paper: ExamPaperDataset) => void;
  onStartCbt: (paperId: string) => void;
  onInspectPaper: (paperId: string) => void;
}

interface ExtractionProgress {
  phase: 'idle' | 'uploading' | 'extracting' | 'complete' | 'error';
  totalPages: number;
  completedChunks: number;
  totalChunks: number;
  questionsFound: number;
  statusMessage: string;
  elapsedSeconds: number;
}

export function PdfUploadStudio({
  onPaperCreated,
  onStartCbt,
  onInspectPaper,
}: PdfUploadStudioProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [paperTitle, setPaperTitle] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(180);
  const [numericalNegative, setNumericalNegative] = useState<number>(1);
  const [isDragging, setIsDragging] = useState(false);

  const [progress, setProgress] = useState<ExtractionProgress>({
    phase: 'idle',
    totalPages: 0,
    completedChunks: 0,
    totalChunks: 0,
    questionsFound: 0,
    statusMessage: '',
    elapsedSeconds: 0,
  });

  const [createdPaper, setCreatedPaper] = useState<ExamPaperDataset | null>(null);
  const [answerKeyText, setAnswerKeyText] = useState('');
  const [answerKeyStatus, setAnswerKeyStatus] = useState<string | null>(null);
  const [answerKeyLoading, setAnswerKeyLoading] = useState(false);

  const pdfInputRef = useRef<HTMLInputElement>(null);
  const keyFileInputRef = useRef<HTMLInputElement>(null);

  const handleSelectPdf = (file: File | undefined) => {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setProgress({
        phase: 'error',
        totalPages: 0,
        completedChunks: 0,
        totalChunks: 0,
        questionsFound: 0,
        statusMessage: 'Please select a valid .pdf question paper file.',
        elapsedSeconds: 0,
      });
      return;
    }
    setSelectedFile(file);
    if (!paperTitle.trim()) {
      setPaperTitle(file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' '));
    }
    setProgress({
      phase: 'idle',
      totalPages: 0,
      completedChunks: 0,
      totalChunks: 0,
      questionsFound: 0,
      statusMessage: '',
      elapsedSeconds: 0,
    });
  };

  const handleStartExtraction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setProgress((prev) => ({
        ...prev,
        phase: 'error',
        statusMessage: 'Please choose a PDF question paper first.',
      }));
      return;
    }

    const startTime = Date.now();
    const timer = window.setInterval(() => {
      setProgress((prev) => ({
        ...prev,
        elapsedSeconds: Math.floor((Date.now() - startTime) / 1000),
      }));
    }, 500);

    setCreatedPaper(null);
    setProgress({
      phase: 'uploading',
      totalPages: 0,
      completedChunks: 0,
      totalChunks: 0,
      questionsFound: 0,
      statusMessage: 'Uploading PDF and splitting pages for parallel extraction...',
      elapsedSeconds: 0,
    });

    try {
      const formData = new FormData();
      formData.append('pdf', selectedFile);

      const res = await fetch('/api/extract-pdf', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok && !res.body) {
        throw new Error(`Server returned status ${res.status}`);
      }

      if (!res.body) {
        throw new Error('Streaming response unavailable.');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let extractedQuestions: QuestionItem[] | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const evt = JSON.parse(trimmed) as {
            type: string;
            totalPages?: number;
            totalChunks?: number;
            completedChunks?: number;
            pageRange?: string;
            questionsInChunk?: number;
            questions?: QuestionItem[];
            error?: string;
          };

          if (evt.type === 'started') {
            setProgress((prev) => ({
              ...prev,
              phase: 'extracting',
              totalPages: evt.totalPages ?? 0,
              totalChunks: evt.totalChunks ?? 1,
              statusMessage: `Processing ${evt.totalPages} pages across ${evt.totalChunks} parallel batches...`,
            }));
          } else if (evt.type === 'progress') {
            setProgress((prev) => ({
              ...prev,
              phase: 'extracting',
              completedChunks: evt.completedChunks ?? prev.completedChunks,
              totalChunks: evt.totalChunks ?? prev.totalChunks,
              questionsFound: prev.questionsFound + (evt.questionsInChunk ?? 0),
              statusMessage: `Extracted pages ${evt.pageRange} (${evt.completedChunks}/${evt.totalChunks} batches)...`,
            }));
          } else if (evt.type === 'complete') {
            extractedQuestions = evt.questions ?? [];
          } else if (evt.type === 'error') {
            throw new Error(evt.error || 'PDF extraction failed.');
          }
        }
      }

      if (!extractedQuestions || extractedQuestions.length === 0) {
        throw new Error('No questions were extracted from the PDF.');
      }

      const now = new Date().toISOString();
      const finalDuration =
        durationMinutes > 0
          ? durationMinutes
          : Math.max(15, extractedQuestions.length * 2);

      const newPaper: ExamPaperDataset = {
        id: `paper-${Date.now()}`,
        title: paperTitle.trim() || selectedFile.name.replace(/\.pdf$/i, ''),
        sourceFileName: selectedFile.name,
        createdAt: now,
        updatedAt: now,
        durationMinutes: finalDuration,
        numericalNegativeMarking: numericalNegative,
        questions: extractedQuestions.map((q) => ({
          ...q,
          marksNegative: q.type === 'numerical' ? numericalNegative : 1,
        })),
        answerKeyAttached: false,
      };

      onPaperCreated(newPaper);
      setCreatedPaper(newPaper);
      setProgress((prev) => ({
        ...prev,
        phase: 'complete',
        questionsFound: newPaper.questions.length,
        statusMessage: `Successfully extracted ${newPaper.questions.length} questions with LaTeX math.`,
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'PDF extraction failed.';
      setProgress((prev) => ({
        ...prev,
        phase: 'error',
        statusMessage: msg,
      }));
    } finally {
      window.clearInterval(timer);
    }
  };

  const applyParsedEntriesToCreated = (
    entries: { questionNumber: number; answer: string }[],
    sourceLabel: string
  ) => {
    if (!createdPaper) return;
    const { updatedQuestions, matchedCount, unmatchedNumbers } = applyAnswerKeyToQuestions(
      createdPaper.questions,
      entries
    );
    const updatedPaper: ExamPaperDataset = {
      ...createdPaper,
      questions: updatedQuestions,
      answerKeyAttached: matchedCount > 0,
      answerKeySource: sourceLabel,
      updatedAt: new Date().toISOString(),
    };
    setCreatedPaper(updatedPaper);
    onPaperCreated(updatedPaper);
    setAnswerKeyStatus(
      `Matched ${matchedCount} of ${createdPaper.questions.length} questions.${
        unmatchedNumbers.length > 0
          ? ` Unmatched key numbers: ${unmatchedNumbers.slice(0, 8).join(', ')}`
          : ''
      }`
    );
  };

  const handleApplyPastedAnswerKey = () => {
    if (!answerKeyText.trim()) {
      setAnswerKeyStatus('Paste answer pairs first (e.g., 1: B, 2: C, 21: 14.5).');
      return;
    }
    const entries = parseAnswerKeyText(answerKeyText);
    if (entries.length === 0) {
      setAnswerKeyStatus(
        'Could not detect question-answer pairs. Use format like "1: B" or "21: 14.5".'
      );
      return;
    }
    applyParsedEntriesToCreated(entries, 'Pasted Answer Sheet');
  };

  const handleUploadAnswerKeyFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !createdPaper) return;
    setAnswerKeyLoading(true);
    setAnswerKeyStatus(null);
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
      if (data.mode === 'text' && data.rawText) {
        setAnswerKeyText(data.rawText);
        const entries = parseAnswerKeyText(data.rawText);
        applyParsedEntriesToCreated(entries, file.name);
      } else if (data.entries) {
        setAnswerKeyText(
          data.entries.map((item) => `${item.questionNumber}: ${item.answer}`).join('\n')
        );
        applyParsedEntriesToCreated(data.entries, file.name);
      }
    } catch (err) {
      setAnswerKeyStatus(
        err instanceof Error ? err.message : 'Answer sheet upload failed.'
      );
    } finally {
      setAnswerKeyLoading(false);
      if (keyFileInputRef.current) keyFileInputRef.current.value = '';
    }
  };

  const pct =
    progress.totalChunks > 0
      ? Math.round((progress.completedChunks / progress.totalChunks) * 100)
      : 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-slate-900">
          01. Upload Question Paper PDF
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Upload a JEE Main or mock test PDF. Pages are split into parallel batches to extract
          MCQs, numerical questions, definite integrals, and summations into KaTeX notation.
        </p>

        <form onSubmit={handleStartExtraction} className="mt-5 space-y-5">
          {/* Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              handleSelectPdf(e.dataTransfer.files?.[0]);
            }}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragging
                ? 'border-blue-600 bg-blue-50/50'
                : 'border-slate-300 bg-slate-50/60 hover:bg-slate-50'
            }`}
          >
            <input
              ref={pdfInputRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={(e) => handleSelectPdf(e.target.files?.[0])}
              className="hidden"
              id="question-pdf-input"
            />
            <Upload className="w-8 h-8 text-slate-400 mx-auto" aria-hidden="true" />
            {selectedFile ? (
              <div className="mt-3 space-y-1">
                <p className="text-sm font-semibold text-slate-900">{selectedFile.name}</p>
                <p className="text-xs text-slate-500 tabular-nums">
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB · Ready for extraction
                </p>
                <button
                  type="button"
                  onClick={() => pdfInputRef.current?.click()}
                  className="mt-2 text-xs font-medium text-blue-700 hover:underline"
                >
                  Choose another PDF
                </button>
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                <p className="text-sm font-medium text-slate-800">
                  Drag and drop your question paper PDF here
                </p>
                <p className="text-xs text-slate-500">
                  Supports multi-page JEE Main PDFs up to 50 MB (MCQs + Numerical questions)
                </p>
                <button
                  type="button"
                  onClick={() => pdfInputRef.current?.click()}
                  className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-100"
                >
                  <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                  Browse PDF File
                </button>
              </div>
            )}
          </div>

          {/* Paper Configuration */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1">
              <label
                htmlFor="paper-title-input"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Paper Dataset Name
              </label>
              <input
                id="paper-title-input"
                type="text"
                value={paperTitle}
                onChange={(e) => setPaperTitle(e.target.value)}
                placeholder="e.g., JEE Main Jan Shift 1"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label
                htmlFor="paper-duration-input"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                CBT Duration (Minutes)
              </label>
              <input
                id="paper-duration-input"
                type="number"
                min={5}
                max={360}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value) || 60)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label
                htmlFor="numerical-neg-select"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Numerical Negative Marking
              </label>
              <select
                id="numerical-neg-select"
                value={numericalNegative}
                onChange={(e) => setNumericalNegative(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value={1}>-1 Mark (NTA 2022–2026 Pattern)</option>
                <option value={0}>0 Marks (No Negative on Numerical)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-slate-500">
              Extracts MCQs, integer questions, integrals, and summations in parallel.
            </span>
            <button
              type="submit"
              disabled={
                progress.phase === 'uploading' || progress.phase === 'extracting'
              }
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-700 rounded-md hover:bg-blue-800 disabled:opacity-60 transition-colors"
            >
              {(progress.phase === 'uploading' || progress.phase === 'extracting') && (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              )}
              {progress.phase === 'extracting'
                ? 'Extracting Questions...'
                : 'Extract Questions from PDF'}
            </button>
          </div>
        </form>

        {/* Live Progress */}
        {progress.phase !== 'idle' && (
          <div
            className={`mt-5 p-4 rounded-md border text-sm ${
              progress.phase === 'error'
                ? 'bg-red-50 border-red-200 text-red-800'
                : progress.phase === 'complete'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                {progress.phase === 'error' ? (
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" aria-hidden="true" />
                ) : progress.phase === 'complete' ? (
                  <CheckCircle2
                    className="w-4 h-4 text-emerald-600 shrink-0"
                    aria-hidden="true"
                  />
                ) : (
                  <Loader2
                    className="w-4 h-4 text-blue-700 animate-spin shrink-0"
                    aria-hidden="true"
                  />
                )}
                <span className="font-medium">{progress.statusMessage}</span>
              </div>
              <span className="text-xs font-mono tabular-nums text-slate-500 shrink-0">
                {progress.elapsedSeconds}s
              </span>
            </div>

            {(progress.phase === 'extracting' || progress.phase === 'complete') &&
              progress.totalChunks > 0 && (
                <div className="mt-3">
                  <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-700 transition-all duration-300"
                      style={{
                        width: `${progress.phase === 'complete' ? 100 : pct}%`,
                      }}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500 tabular-nums">
                    <span>
                      {progress.completedChunks}/{progress.totalChunks} page batches complete
                    </span>
                    <span>{progress.questionsFound} questions parsed</span>
                  </div>
                </div>
              )}
          </div>
        )}
      </div>

      {/* Step 2: Upload Answer Sheet right after extraction */}
      {createdPaper && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                02. Upload Answer Sheet (Optional Now, or Later)
              </h2>
              <p className="mt-0.5 text-sm text-slate-600">
                Attach the official answer key mapped to question numbers{' '}
                <span className="font-mono">
                  1–{createdPaper.questions[createdPaper.questions.length - 1]?.questionNumber}
                </span>
                .
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onInspectPaper(createdPaper.id)}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
              >
                Inspect All Questions
              </button>
              <button
                type="button"
                onClick={() => onStartCbt(createdPaper.id)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-emerald-700 rounded-md hover:bg-emerald-800"
              >
                <Play className="w-3.5 h-3.5" aria-hidden="true" />
                Launch NTA CBT Exam
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <label
                htmlFor="paste-answer-key"
                className="block text-xs font-medium text-slate-700"
              >
                Paste Answer Sheet (e.g., 1: B, 2: C, 21: 14.5)
              </label>
              <textarea
                id="paste-answer-key"
                rows={5}
                value={answerKeyText}
                onChange={(e) => setAnswerKeyText(e.target.value)}
                placeholder={'1: B\n2: C\n3: A\n4: 4\n5: 12.5'}
                className="w-full p-3 text-xs font-mono border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                type="button"
                onClick={handleApplyPastedAnswerKey}
                className="px-3.5 py-2 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800"
              >
                Apply Pasted Answers
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-medium text-slate-700">
                Or Upload Answer Key File (PDF, PNG/JPG Screenshot, CSV, TXT)
              </p>
              <input
                ref={keyFileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.txt"
                onChange={handleUploadAnswerKeyFile}
                className="hidden"
              />
              <button
                type="button"
                disabled={answerKeyLoading}
                onClick={() => keyFileInputRef.current?.click()}
                className="w-full py-8 px-4 border-2 border-dashed border-slate-300 rounded-md bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-700 flex flex-col items-center gap-2 transition-colors"
              >
                {answerKeyLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-blue-700" aria-hidden="true" />
                ) : (
                  <Upload className="w-5 h-5 text-slate-400" aria-hidden="true" />
                )}
                <span>
                  {answerKeyLoading
                    ? 'Extracting answer key entries...'
                    : 'Choose Answer Sheet PDF / Image / CSV'}
                </span>
              </button>

              {answerKeyStatus && (
                <p className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
                  {answerKeyStatus}
                </p>
              )}
            </div>
          </div>

          {/* Preview first 3 extracted questions */}
          <div className="pt-2 border-t border-slate-200">
            <h3 className="text-xs font-semibold text-slate-700 mb-3">
              Preview of Extracted Questions (First 3)
            </h3>
            <div className="space-y-3">
              {createdPaper.questions.slice(0, 3).map((q) => (
                <div
                  key={q.id}
                  className="p-3.5 bg-slate-50 border border-slate-200 rounded-md text-sm space-y-2"
                >
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-mono font-semibold text-slate-800">
                      Q{q.questionNumber} · {q.subject} · {q.type.toUpperCase()}
                    </span>
                    {q.correctAnswer && (
                      <span className="font-mono font-semibold text-emerald-700">
                        Key: {q.correctAnswer}
                      </span>
                    )}
                  </div>
                  <div className="text-slate-900">
                    <MathText text={q.prompt} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
