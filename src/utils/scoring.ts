import type {
  EvaluationSummary,
  ExamPaperDataset,
  OptionLabel,
  PaletteStatus,
  QuestionEvaluation,
  QuestionItem,
  QuestionResponseState,
  SubjectBreakdown,
} from '../types/exam';

export function normalizeMcqAnswer(raw: string | undefined): OptionLabel | undefined {
  if (!raw) return undefined;
  const cleaned = raw.trim().replace(/[().]/g, '').toUpperCase();
  if (cleaned === 'A' || cleaned === '1') return 'A';
  if (cleaned === 'B' || cleaned === '2') return 'B';
  if (cleaned === 'C' || cleaned === '3') return 'C';
  if (cleaned === 'D' || cleaned === '4') return 'D';
  return undefined;
}

export function normalizeNumericalAnswer(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  const trimmed = raw.trim().replace(/,/g, '');
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

export function areAnswersEqual(
  question: Pick<QuestionItem, 'type'>,
  userAnswer: string | undefined,
  officialAnswer: string | undefined
): boolean {
  if (!userAnswer || !officialAnswer) return false;
  if (question.type === 'mcq') {
    const u = normalizeMcqAnswer(userAnswer);
    const o = normalizeMcqAnswer(officialAnswer);
    return Boolean(u && o && u === o);
  }
  const uNum = normalizeNumericalAnswer(userAnswer);
  const oNum = normalizeNumericalAnswer(officialAnswer);
  if (uNum !== undefined && oNum !== undefined) {
    return Math.abs(uNum - oNum) <= 0.01;
  }
  return userAnswer.trim().toLowerCase() === officialAnswer.trim().toLowerCase();
}

export function isResponseEvaluated(state: QuestionResponseState | undefined): boolean {
  if (!state || !state.selectedAnswer || !state.selectedAnswer.trim()) {
    return false;
  }
  // Per NTA JEE Main rules: both "Answered" (green) and "Answered & Marked for Review" (purple+tick) are evaluated.
  return state.status === 'answered' || state.status === 'answered_marked';
}

export function evaluateExamPaper(
  paper: ExamPaperDataset,
  responses: Record<number, QuestionResponseState>
): EvaluationSummary {
  let attempted = 0;
  let correct = 0;
  let incorrect = 0;
  let unattempted = 0;
  let ungraded = 0;
  let totalScore = 0;
  let maxScore = 0;

  const subjectMap = new Map<string, SubjectBreakdown>();
  const questionResults: QuestionEvaluation[] = [];

  for (const q of paper.questions) {
    maxScore += q.marksPositive;
    const subj = q.subject || 'General';
    if (!subjectMap.has(subj)) {
      subjectMap.set(subj, {
        subject: subj,
        totalQuestions: 0,
        attempted: 0,
        correct: 0,
        incorrect: 0,
        unattempted: 0,
        score: 0,
        maxScore: 0,
      });
    }
    const subjBucket = subjectMap.get(subj)!;
    subjBucket.totalQuestions += 1;
    subjBucket.maxScore += q.marksPositive;

    const resp = responses[q.questionNumber];
    const hasCountedAnswer = isResponseEvaluated(resp);
    const userAns = hasCountedAnswer ? resp?.selectedAnswer?.trim() : undefined;
    const officialAns = q.correctAnswer?.trim();

    if (!officialAns) {
      ungraded += 1;
      if (hasCountedAnswer) {
        attempted += 1;
        subjBucket.attempted += 1;
      } else {
        unattempted += 1;
        subjBucket.unattempted += 1;
      }
      questionResults.push({
        questionNumber: q.questionNumber,
        subject: subj,
        type: q.type,
        userAnswer: userAns,
        officialAnswer: undefined,
        outcome: 'no_key',
        marksAwarded: 0,
        maxMarks: q.marksPositive,
        countedInEvaluation: hasCountedAnswer,
      });
      continue;
    }

    if (!hasCountedAnswer || !userAns) {
      unattempted += 1;
      subjBucket.unattempted += 1;
      questionResults.push({
        questionNumber: q.questionNumber,
        subject: subj,
        type: q.type,
        userAnswer: undefined,
        officialAnswer: officialAns,
        outcome: 'unattempted',
        marksAwarded: 0,
        maxMarks: q.marksPositive,
        countedInEvaluation: false,
      });
      continue;
    }

    attempted += 1;
    subjBucket.attempted += 1;

    if (areAnswersEqual(q, userAns, officialAns)) {
      correct += 1;
      subjBucket.correct += 1;
      totalScore += q.marksPositive;
      subjBucket.score += q.marksPositive;
      questionResults.push({
        questionNumber: q.questionNumber,
        subject: subj,
        type: q.type,
        userAnswer: userAns,
        officialAnswer: officialAns,
        outcome: 'correct',
        marksAwarded: q.marksPositive,
        maxMarks: q.marksPositive,
        countedInEvaluation: true,
      });
    } else {
      const neg = q.type === 'numerical' ? paper.numericalNegativeMarking : q.marksNegative;
      incorrect += 1;
      subjBucket.incorrect += 1;
      totalScore -= neg;
      subjBucket.score -= neg;
      questionResults.push({
        questionNumber: q.questionNumber,
        subject: subj,
        type: q.type,
        userAnswer: userAns,
        officialAnswer: officialAns,
        outcome: 'incorrect',
        marksAwarded: -neg,
        maxMarks: q.marksPositive,
        countedInEvaluation: true,
      });
    }
  }

  const evaluatedAttempts = correct + incorrect;
  const accuracyPercent =
    evaluatedAttempts > 0 ? Math.round((correct / evaluatedAttempts) * 1000) / 10 : 0;

  return {
    totalQuestions: paper.questions.length,
    attempted,
    correct,
    incorrect,
    unattempted,
    ungraded,
    totalScore,
    maxScore,
    accuracyPercent,
    subjectBreakdown: Array.from(subjectMap.values()),
    questionResults,
  };
}

export interface PaletteCounts {
  not_visited: number;
  not_answered: number;
  answered: number;
  marked: number;
  answered_marked: number;
}

export function computePaletteCounts(
  questions: QuestionItem[],
  responses: Record<number, QuestionResponseState>
): PaletteCounts {
  const counts: PaletteCounts = {
    not_visited: 0,
    not_answered: 0,
    answered: 0,
    marked: 0,
    answered_marked: 0,
  };

  for (const q of questions) {
    const status: PaletteStatus = responses[q.questionNumber]?.status ?? 'not_visited';
    counts[status] += 1;
  }

  return counts;
}

export function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return [hrs, mins, secs].map((v) => String(v).padStart(2, '0')).join(':');
}

export function exportPaperToCsv(paper: ExamPaperDataset): string {
  const escapeCell = (value: string | number | undefined): string => {
    const str = value === undefined ? '' : String(value);
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headers = [
    'QuestionNumber',
    'Subject',
    'Type',
    'Prompt',
    'OptionA',
    'OptionB',
    'OptionC',
    'OptionD',
    'CorrectAnswer',
    'MarksPositive',
    'MarksNegative',
  ];

  const rows = paper.questions.map((q) => {
    const optMap = new Map((q.options ?? []).map((o) => [o.label, o.text]));
    return [
      q.questionNumber,
      q.subject,
      q.type,
      q.prompt,
      optMap.get('A') ?? '',
      optMap.get('B') ?? '',
      optMap.get('C') ?? '',
      optMap.get('D') ?? '',
      q.correctAnswer ?? '',
      q.marksPositive,
      q.type === 'numerical' ? paper.numericalNegativeMarking : q.marksNegative,
    ]
      .map(escapeCell)
      .join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}
