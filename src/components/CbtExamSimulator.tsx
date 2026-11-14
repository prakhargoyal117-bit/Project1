import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Info,
  X,
} from 'lucide-react';
import type {
  ExamPaperDataset,
  PaletteStatus,
  QuestionResponseState,
} from '../types/exam';
import { computePaletteCounts, formatCountdown } from '../utils/scoring';
import { MathText } from './MathText';

interface CbtExamSimulatorProps {
  paper: ExamPaperDataset;
  skipInstructions?: boolean;
  onSubmitAttempt: (
    responses: Record<number, QuestionResponseState>,
    timeTakenSeconds: number
  ) => void;
  onExit: () => void;
}

function getPaletteBadgeStyle(status: PaletteStatus, isActive: boolean): string {
  const ring = isActive ? 'ring-2 ring-slate-900 ring-offset-1' : '';
  switch (status) {
    case 'answered':
      return `bg-emerald-600 text-white border-emerald-700 rounded-t-md ${ring}`;
    case 'not_answered':
      return `bg-red-600 text-white border-red-700 rounded-b-md ${ring}`;
    case 'marked':
      return `bg-violet-700 text-white border-violet-800 rounded-full ${ring}`;
    case 'answered_marked':
      return `bg-violet-700 text-white border-emerald-400 rounded-full relative ${ring}`;
    case 'not_visited':
    default:
      return `bg-slate-100 text-slate-800 border-slate-300 rounded ${ring}`;
  }
}

export function CbtExamSimulator({
  paper,
  skipInstructions = false,
  onSubmitAttempt,
  onExit,
}: CbtExamSimulatorProps) {
  const [stage, setStage] = useState<'instructions' | 'exam'>(
    skipInstructions ? 'exam' : 'instructions'
  );
  const [agreedInstructions, setAgreedInstructions] = useState(true);

  const sortedQuestions = useMemo(
    () => [...paper.questions].sort((a, b) => a.questionNumber - b.questionNumber),
    [paper.questions]
  );

  const subjects = useMemo(
    () => Array.from(new Set(sortedQuestions.map((q) => q.subject || 'General'))),
    [sortedQuestions]
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const currentQuestion = sortedQuestions[currentIndex];

  const [responses, setResponses] = useState<Record<number, QuestionResponseState>>(() => {
    const init: Record<number, QuestionResponseState> = {};
    for (const q of sortedQuestions) {
      init[q.questionNumber] = { status: 'not_visited', timeSpentSeconds: 0 };
    }
    if (sortedQuestions[0]) {
      init[sortedQuestions[0].questionNumber] = {
        status: 'not_answered',
        timeSpentSeconds: 0,
      };
    }
    return init;
  });

  // Draft answer for currently viewed question before clicking Save & Next
  const [draftAnswer, setDraftAnswer] = useState<string>(
    () => responses[sortedQuestions[0]?.questionNumber]?.selectedAnswer ?? ''
  );

  const totalDurationSeconds = Math.max(60, paper.durationMinutes * 60);
  const [remainingSeconds, setRemainingSeconds] = useState(totalDurationSeconds);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showFullPaperModal, setShowFullPaperModal] = useState(false);

  // Sync draftAnswer when navigating between questions
  const navigateToIndex = (nextIdx: number) => {
    if (nextIdx < 0 || nextIdx >= sortedQuestions.length) return;
    const targetQ = sortedQuestions[nextIdx];
    setResponses((prev) => {
      const existing = prev[targetQ.questionNumber];
      if (!existing || existing.status === 'not_visited') {
        return {
          ...prev,
          [targetQ.questionNumber]: {
            status: 'not_answered',
            selectedAnswer: existing?.selectedAnswer,
            timeSpentSeconds: existing?.timeSpentSeconds ?? 0,
          },
        };
      }
      return prev;
    });
    setDraftAnswer(responses[targetQ.questionNumber]?.selectedAnswer ?? '');
    setCurrentIndex(nextIdx);
  };

  // Countdown timer & per-question time tracking
  useEffect(() => {
    if (stage !== 'exam') return;
    const id = window.setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          window.clearInterval(id);
          return 0;
        }
        return prev - 1;
      });
      if (currentQuestion) {
        setResponses((prev) => {
          const cur = prev[currentQuestion.questionNumber] ?? {
            status: 'not_answered' as PaletteStatus,
            timeSpentSeconds: 0,
          };
          return {
            ...prev,
            [currentQuestion.questionNumber]: {
              ...cur,
              timeSpentSeconds: cur.timeSpentSeconds + 1,
            },
          };
        });
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [stage, currentQuestion]);

  // Auto-submit when timer hits 0
  useEffect(() => {
    if (stage === 'exam' && remainingSeconds === 0) {
      onSubmitAttempt(responses, totalDurationSeconds);
    }
  }, [stage, remainingSeconds, responses, totalDurationSeconds, onSubmitAttempt]);

  const counts = useMemo(
    () => computePaletteCounts(sortedQuestions, responses),
    [sortedQuestions, responses]
  );

  if (!currentQuestion) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-slate-700">This dataset has no questions.</p>
        <button
          type="button"
          onClick={onExit}
          className="mt-4 px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-md"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  // NTA Action Handlers
  const commitStateAndAdvance = (mode: 'save_next' | 'save_mark' | 'mark_next') => {
    const trimmed = draftAnswer.trim();
    const qNum = currentQuestion.questionNumber;

    let nextStatus: PaletteStatus = 'not_answered';
    if (mode === 'save_next') {
      nextStatus = trimmed ? 'answered' : 'not_answered';
    } else if (mode === 'save_mark') {
      nextStatus = trimmed ? 'answered_marked' : 'marked';
    } else if (mode === 'mark_next') {
      nextStatus = trimmed ? 'answered_marked' : 'marked';
    }

    const updatedResponses: Record<number, QuestionResponseState> = {
      ...responses,
      [qNum]: {
        status: nextStatus,
        selectedAnswer: trimmed || undefined,
        timeSpentSeconds: responses[qNum]?.timeSpentSeconds ?? 0,
      },
    };

    const nextIdx =
      mode === 'save_mark'
        ? currentIndex
        : currentIndex + 1 < sortedQuestions.length
          ? currentIndex + 1
          : 0;

    const targetQ = sortedQuestions[nextIdx];
    if (
      mode !== 'save_mark' &&
      (!updatedResponses[targetQ.questionNumber] ||
        updatedResponses[targetQ.questionNumber].status === 'not_visited')
    ) {
      updatedResponses[targetQ.questionNumber] = {
        ...updatedResponses[targetQ.questionNumber],
        status: 'not_answered',
        timeSpentSeconds: updatedResponses[targetQ.questionNumber]?.timeSpentSeconds ?? 0,
      };
    }

    setResponses(updatedResponses);
    if (mode !== 'save_mark') {
      setCurrentIndex(nextIdx);
      setDraftAnswer(updatedResponses[targetQ.questionNumber]?.selectedAnswer ?? '');
    }
  };

  const handleClearResponse = () => {
    const qNum = currentQuestion.questionNumber;
    setDraftAnswer('');
    setResponses((prev) => ({
      ...prev,
      [qNum]: {
        status: 'not_answered',
        selectedAnswer: undefined,
        timeSpentSeconds: prev[qNum]?.timeSpentSeconds ?? 0,
      },
    }));
  };

  const handleKeypadPress = (key: string) => {
    if (key === 'CLEAR') {
      setDraftAnswer('');
      return;
    }
    if (key === 'BACK') {
      setDraftAnswer((prev) => prev.slice(0, -1));
      return;
    }
    if (key === '-') {
      setDraftAnswer((prev) => (prev.startsWith('-') ? prev.slice(1) : `-${prev}`));
      return;
    }
    if (key === '.') {
      setDraftAnswer((prev) => (prev.includes('.') ? prev : `${prev || '0'}.`));
      return;
    }
    setDraftAnswer((prev) => (prev.length < 14 ? `${prev}${key}` : prev));
  };

  const handleSubjectTabClick = (subj: string) => {
    const idx = sortedQuestions.findIndex((q) => q.subject === subj);
    if (idx !== -1) navigateToIndex(idx);
  };

  const handleFinalizeSubmit = () => {
    const timeTaken = Math.max(1, totalDurationSeconds - remainingSeconds);
    // Include current draft if user selected an option without clicking Save & Next? No — in NTA CBT, only saved/answered states count, OR let's preserve explicit NTA semantics.
    onSubmitAttempt(responses, timeTaken);
  };

  // Pre-Test NTA Instructions Screen
  if (stage === 'instructions') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <header className="bg-slate-900 text-white px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-display font-bold text-base">NTA JEE Main CBT Mode</span>
            <span className="text-slate-400 text-xs">·</span>
            <span className="text-sm text-slate-200 truncate max-w-md">{paper.title}</span>
          </div>
          <button
            type="button"
            onClick={onExit}
            className="text-xs text-slate-300 hover:text-white px-3 py-1.5 border border-slate-700 rounded"
          >
            Exit to Dashboard
          </button>
        </header>

        <main className="flex-1 max-w-4xl w-full mx-auto p-6 my-4 bg-white border border-slate-200 rounded-lg space-y-6">
          <div className="border-b border-slate-200 pb-4">
            <h1 className="text-xl font-bold text-slate-900">
              General Instructions — Computer Based Test
            </h1>
            <p className="mt-1 text-sm text-slate-600 tabular-nums">
              Total Questions: {sortedQuestions.length} · Total Duration: {paper.durationMinutes}{' '}
              Minutes · Marking: +4 Correct, -1 Incorrect MCQ / -{paper.numericalNegativeMarking}{' '}
              Numerical
            </p>
          </div>

          <div className="space-y-4 text-sm text-slate-700 leading-relaxed">
            <p>
              1. The clock will be set at the server. The countdown timer in the top right corner of
              the screen displays the remaining time available for you to complete the examination.
            </p>
            <p>
              2. The Question Palette displayed on the right side of the screen shows the status of
              each question using the official NTA symbols:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-md text-xs">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 flex items-center justify-center bg-slate-100 border border-slate-300 rounded font-mono font-semibold text-slate-800">
                  1
                </span>
                <span>You have not visited the question yet.</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 flex items-center justify-center bg-red-600 text-white rounded-b-md font-mono font-semibold">
                  2
                </span>
                <span>You have not answered the question.</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 flex items-center justify-center bg-emerald-600 text-white rounded-t-md font-mono font-semibold">
                  3
                </span>
                <span>You have answered the question.</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 flex items-center justify-center bg-violet-700 text-white rounded-full font-mono font-semibold">
                  4
                </span>
                <span>You have NOT answered the question, but marked it for review.</span>
              </div>
              <div className="flex items-center gap-3 sm:col-span-2">
                <span className="w-7 h-7 flex items-center justify-center bg-violet-700 text-white rounded-full font-mono font-semibold relative">
                  5
                  <span className="w-2.5 h-2.5 bg-emerald-400 rounded-full absolute -bottom-0.5 -right-0.5 border border-white" />
                </span>
                <span>
                  Answered and Marked for Review — WILL be considered for final evaluation.
                </span>
              </div>
            </div>

            <p>
              3. For Numerical Value questions, enter the answer using your keyboard or the
              on-screen numeric keypad. Click <strong>Save &amp; Next</strong> to record your
              response before moving to another question.
            </p>
          </div>

          <div className="pt-4 border-t border-slate-200 space-y-4">
            <label className="flex items-start gap-2.5 text-sm text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={agreedInstructions}
                onChange={(e) => setAgreedInstructions(e.target.checked)}
                className="mt-1 w-4 h-4 accent-blue-700"
              />
              <span>
                I have read and understood the instructions. I am ready to begin the timed JEE Main
                CBT simulation.
              </span>
            </label>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onExit}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!agreedInstructions}
                onClick={() => setStage('exam')}
                className="px-6 py-2.5 text-sm font-semibold text-white bg-blue-700 rounded-md hover:bg-blue-800 disabled:opacity-50"
              >
                I am ready to begin
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Active NTA CBT Interface
  const isLowTime = remainingSeconds <= 300;
  const isCriticalTime = remainingSeconds <= 60;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col select-none">
      {/* Top NTA Header */}
      <header className="bg-slate-900 text-white px-4 lg:px-6 py-2.5 flex flex-wrap items-center justify-between gap-4 border-b border-slate-800">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-display font-bold text-sm lg:text-base whitespace-nowrap">
            JEE Main CBT
          </span>
          <span className="text-slate-500 hidden sm:inline">|</span>
          <span className="text-xs lg:text-sm text-slate-300 truncate max-w-md">
            {paper.title}
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setShowFullPaperModal(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 whitespace-nowrap"
          >
            <FileText className="w-3.5 h-3.5" aria-hidden="true" />
            Question Paper
          </button>

          <div
            aria-label="Remaining exam time"
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded font-mono text-sm font-bold tabular-nums border ${
              isCriticalTime
                ? 'bg-red-950 border-red-600 text-red-200'
                : isLowTime
                  ? 'bg-amber-950 border-amber-600 text-amber-200'
                  : 'bg-slate-800 border-slate-700 text-white'
            }`}
          >
            <Clock className="w-4 h-4" aria-hidden="true" />
            <span>Time Left: {formatCountdown(remainingSeconds)}</span>
          </div>

          <button
            type="button"
            onClick={() => setShowSubmitModal(true)}
            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded whitespace-nowrap"
          >
            Submit Test
          </button>
        </div>
      </header>

      {/* Subject Section Bar */}
      <div className="bg-white border-b border-slate-200 px-4 lg:px-6 py-2 flex items-center justify-between gap-4 overflow-x-auto">
        <div className="flex items-center gap-1.5" role="tablist" aria-label="Exam sections">
          {subjects.map((subj) => {
            const isCurrentSubj = currentQuestion.subject === subj;
            return (
              <button
                key={subj}
                type="button"
                role="tab"
                aria-selected={isCurrentSubj}
                onClick={() => handleSubjectTabClick(subj)}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap shrink-0 ${
                  isCurrentSubj
                    ? 'bg-blue-700 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {subj}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onExit}
          className="text-xs text-slate-500 hover:text-slate-800 whitespace-nowrap shrink-0"
        >
          Exit CBT
        </button>
      </div>

      {/* Main Split CBT Viewport */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Left Main Question Stage */}
        <main className="flex-1 flex flex-col bg-white lg:border-r border-slate-200 min-w-0">
          {/* Question Sub-Header */}
          <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-slate-900 font-mono tabular-nums">
                Question No. {currentQuestion.questionNumber}
              </span>
              <span className="text-xs text-slate-500">
                ({currentQuestion.type === 'mcq' ? 'Single Choice MCQ' : 'Numerical Value'})
              </span>
            </div>
            <div className="text-xs font-mono tabular-nums text-slate-600">
              Marks: <span className="text-emerald-700 font-semibold">+{currentQuestion.marksPositive}</span>
              {' | '}
              Negative:{' '}
              <span className="text-red-600 font-semibold">
                -
                {currentQuestion.type === 'numerical'
                  ? paper.numericalNegativeMarking
                  : currentQuestion.marksNegative}
              </span>
            </div>
          </div>

          {/* Question Body & Input Area */}
          <div className="flex-1 p-6 overflow-y-auto space-y-6 select-text">
            <div className="text-base text-slate-900 leading-relaxed max-w-4xl">
              <MathText text={currentQuestion.prompt} />
            </div>

            {currentQuestion.diagramNote && (
              <div className="max-w-3xl p-3 bg-slate-50 border border-slate-200 rounded text-xs text-slate-700 flex items-start gap-2">
                <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" aria-hidden="true" />
                <span>Figure Reference: {currentQuestion.diagramNote}</span>
              </div>
            )}

            {/* MCQ Options */}
            {currentQuestion.type === 'mcq' && currentQuestion.options && (
              <fieldset className="space-y-3 max-w-3xl">
                <legend className="sr-only">
                  Select one option for Question {currentQuestion.questionNumber}
                </legend>
                {currentQuestion.options.map((opt) => {
                  const selected = draftAnswer === opt.label;
                  return (
                    <label
                      key={opt.label}
                      className={`flex items-center gap-3.5 p-3.5 rounded-md border cursor-pointer transition-colors ${
                        selected
                          ? 'border-blue-700 bg-blue-50/70'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`q-${currentQuestion.questionNumber}`}
                        value={opt.label}
                        checked={selected}
                        onChange={() => setDraftAnswer(opt.label)}
                        className="w-4 h-4 accent-blue-700 shrink-0"
                      />
                      <span className="font-mono text-sm font-semibold text-slate-700 shrink-0">
                        ({opt.label})
                      </span>
                      <div className="text-sm text-slate-900 min-w-0 flex-1 overflow-x-auto">
                        <MathText text={opt.text} />
                      </div>
                    </label>
                  );
                })}
              </fieldset>
            )}

            {/* Numerical Input + Authentic NTA Virtual Keypad */}
            {currentQuestion.type === 'numerical' && (
              <div className="max-w-xs space-y-3">
                <div>
                  <label
                    htmlFor="numerical-answer-input"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Enter Numerical Answer
                  </label>
                  <input
                    id="numerical-answer-input"
                    type="text"
                    inputMode="decimal"
                    value={draftAnswer}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (/^-?\d*\.?\d*$/.test(val)) {
                        setDraftAnswer(val);
                      }
                    }}
                    placeholder="Type or use keypad"
                    className="w-full px-3.5 py-2.5 text-base font-mono tabular-nums border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-700 bg-white"
                  />
                </div>

                <div
                  className="bg-slate-100 border border-slate-300 rounded-md p-3 space-y-2"
                  aria-label="On-screen numeric keypad"
                >
                  <div className="grid grid-cols-3 gap-2">
                    {['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '.', '-'].map(
                      (key) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => handleKeypadPress(key)}
                          className="py-2 text-sm font-mono font-semibold bg-white border border-slate-300 rounded hover:bg-slate-50 active:bg-slate-200 text-slate-900"
                        >
                          {key}
                        </button>
                      )
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleKeypadPress('BACK')}
                      className="py-2 text-xs font-medium bg-white border border-slate-300 rounded hover:bg-slate-50 text-slate-800"
                    >
                      Backspace
                    </button>
                    <button
                      type="button"
                      onClick={() => handleKeypadPress('CLEAR')}
                      className="py-2 text-xs font-medium bg-white border border-slate-300 rounded hover:bg-slate-50 text-slate-800"
                    >
                      Clear All
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* NTA Bottom Action Bar */}
          <div className="px-4 lg:px-5 py-3 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => commitStateAndAdvance('save_next')}
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded whitespace-nowrap"
              >
                Save &amp; Next
              </button>
              <button
                type="button"
                onClick={handleClearResponse}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded whitespace-nowrap"
              >
                Clear Response
              </button>
              <button
                type="button"
                onClick={() => commitStateAndAdvance('save_mark')}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded whitespace-nowrap"
              >
                Save &amp; Mark for Review
              </button>
              <button
                type="button"
                onClick={() => commitStateAndAdvance('mark_next')}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-violet-700 hover:bg-violet-800 rounded whitespace-nowrap"
              >
                Mark for Review &amp; Next
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentIndex === 0}
                onClick={() => navigateToIndex(currentIndex - 1)}
                className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-100 disabled:opacity-40"
              >
                <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                Back
              </button>
              <button
                type="button"
                disabled={currentIndex === sortedQuestions.length - 1}
                onClick={() => navigateToIndex(currentIndex + 1)}
                className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-100 disabled:opacity-40"
              >
                Next
                <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </main>

        {/* Right Sidebar: NTA Question Palette */}
        <aside className="w-full lg:w-80 bg-slate-50 border-t lg:border-t-0 border-slate-200 flex flex-col shrink-0">
          {/* 5-State Legend */}
          <div className="p-4 border-b border-slate-200 bg-white space-y-2.5">
            <h2 className="text-xs font-semibold text-slate-700">
              Question Status Legend
            </h2>
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-700 tabular-nums">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 flex items-center justify-center bg-slate-100 border border-slate-300 rounded font-mono font-semibold text-slate-800 shrink-0">
                  {counts.not_visited}
                </span>
                <span>Not Visited</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 flex items-center justify-center bg-red-600 text-white rounded-b-md font-mono font-semibold shrink-0">
                  {counts.not_answered}
                </span>
                <span>Not Answered</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 flex items-center justify-center bg-emerald-600 text-white rounded-t-md font-mono font-semibold shrink-0">
                  {counts.answered}
                </span>
                <span>Answered</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 flex items-center justify-center bg-violet-700 text-white rounded-full font-mono font-semibold shrink-0">
                  {counts.marked}
                </span>
                <span>Marked Review</span>
              </div>
              <div className="flex items-center gap-2 col-span-2">
                <span className="w-6 h-6 flex items-center justify-center bg-violet-700 text-white rounded-full font-mono font-semibold relative shrink-0">
                  {counts.answered_marked}
                  <span className="w-3 h-3 bg-emerald-500 rounded-full absolute -bottom-0.5 -right-0.5 border border-white flex items-center justify-center">
                    <Check className="w-2 h-2 text-white" aria-hidden="true" />
                  </span>
                </span>
                <span>Answered &amp; Marked (Evaluated)</span>
              </div>
            </div>
          </div>

          {/* Palette Grid */}
          <div className="p-4 flex-1 overflow-y-auto">
            <h3 className="text-xs font-semibold text-slate-700 mb-3">
              Choose a Question ({sortedQuestions.length})
            </h3>
            <div className="grid grid-cols-5 gap-2">
              {sortedQuestions.map((q, idx) => {
                const status = responses[q.questionNumber]?.status ?? 'not_visited';
                const isActive = idx === currentIndex;
                return (
                  <button
                    key={q.id}
                    type="button"
                    aria-label={`Jump to Question ${q.questionNumber}, status ${status.replace('_', ' ')}`}
                    onClick={() => navigateToIndex(idx)}
                    className={`h-9 flex items-center justify-center text-xs font-mono font-semibold border transition-transform ${getPaletteBadgeStyle(
                      status,
                      isActive
                    )}`}
                  >
                    {q.questionNumber}
                    {status === 'answered_marked' && (
                      <span className="w-3.5 h-3.5 bg-emerald-500 rounded-full absolute -bottom-1 -right-1 border border-white flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 text-white" aria-hidden="true" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </aside>
      </div>

      {/* Submit Confirmation Modal */}
      {showSubmitModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="submit-modal-title"
          className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"
        >
          <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <h2 id="submit-modal-title" className="text-base font-bold text-slate-900">
                  Submit Examination?
                </h2>
                <p className="mt-1 text-xs text-slate-600">
                  Are you sure you want to submit your test for evaluation? You cannot change
                  answers after submission.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded p-3 text-xs space-y-1.5 tabular-nums">
              <div className="flex justify-between">
                <span className="text-slate-600">Total Questions</span>
                <span className="font-mono font-semibold">{sortedQuestions.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Answered (Evaluated)</span>
                <span className="font-mono font-semibold text-emerald-700">
                  {counts.answered + counts.answered_marked}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Marked Only (Not Evaluated)</span>
                <span className="font-mono font-semibold text-violet-700">{counts.marked}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Not Answered / Not Visited</span>
                <span className="font-mono font-semibold text-slate-700">
                  {counts.not_answered + counts.not_visited}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50"
              >
                Resume Test
              </button>
              <button
                type="button"
                onClick={handleFinalizeSubmit}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded hover:bg-blue-800"
              >
                Confirm &amp; Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Question Paper Modal */}
      {showFullPaperModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="full-paper-title"
          className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"
        >
          <div className="bg-white border border-slate-200 rounded-lg max-w-4xl w-full max-h-[85vh] flex flex-col">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h2 id="full-paper-title" className="text-sm font-bold text-slate-900">
                Complete Question Paper View
              </h2>
              <button
                type="button"
                onClick={() => setShowFullPaperModal(false)}
                aria-label="Close question paper modal"
                className="p-1 text-slate-500 hover:text-slate-900"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto divide-y divide-slate-200 space-y-4">
              {sortedQuestions.map((q, idx) => (
                <div key={q.id} className="pt-4 first:pt-0 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-mono font-bold text-slate-900">
                      Q{q.questionNumber} · {q.subject}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigateToIndex(idx);
                        setShowFullPaperModal(false);
                      }}
                      className="text-blue-700 font-medium hover:underline"
                    >
                      Jump to Question
                    </button>
                  </div>
                  <div className="text-sm text-slate-900">
                    <MathText text={q.prompt} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bookmark icon referenced so lucide stays clean */}
      <span className="sr-only">
        <Bookmark aria-hidden="true" />
      </span>
    </div>
  );
}
