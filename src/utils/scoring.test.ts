import test from 'node:test';
import assert from 'node:assert/strict';
import {
  areAnswersEqual,
  computePaletteCounts,
  evaluateExamPaper,
  formatCountdown,
  normalizeMcqAnswer,
} from './scoring';
import type { ExamPaperDataset, QuestionResponseState } from '../types/exam';

test('normalizeMcqAnswer maps 1-4 and A-D consistently', () => {
  assert.equal(normalizeMcqAnswer('1'), 'A');
  assert.equal(normalizeMcqAnswer('(2)'), 'B');
  assert.equal(normalizeMcqAnswer('c.'), 'C');
  assert.equal(normalizeMcqAnswer(' 4 '), 'D');
  assert.equal(normalizeMcqAnswer('5'), undefined);
});

test('areAnswersEqual checks MCQ labels and numerical tolerances', () => {
  assert.equal(areAnswersEqual({ type: 'mcq' }, 'B', '2'), true);
  assert.equal(areAnswersEqual({ type: 'mcq' }, 'A', '3'), false);
  assert.equal(areAnswersEqual({ type: 'numerical' }, '12.50', '12.5'), true);
  assert.equal(areAnswersEqual({ type: 'numerical' }, '-4', '-4.00'), true);
  assert.equal(areAnswersEqual({ type: 'numerical' }, '12', '13'), false);
});

test('evaluateExamPaper applies +4 / -1 JEE Main scoring and NTA review states', () => {
  const paper: ExamPaperDataset = {
    id: 'test-paper',
    title: 'Test Paper',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    durationMinutes: 60,
    numericalNegativeMarking: 1,
    answerKeyAttached: true,
    questions: [
      {
        id: '1',
        questionNumber: 1,
        subject: 'Physics',
        type: 'mcq',
        prompt: 'Q1',
        options: [
          { label: 'A', text: '1' },
          { label: 'B', text: '2' },
          { label: 'C', text: '3' },
          { label: 'D', text: '4' },
        ],
        correctAnswer: 'A',
        marksPositive: 4,
        marksNegative: 1,
      },
      {
        id: '2',
        questionNumber: 2,
        subject: 'Physics',
        type: 'mcq',
        prompt: 'Q2',
        options: [
          { label: 'A', text: '1' },
          { label: 'B', text: '2' },
          { label: 'C', text: '3' },
          { label: 'D', text: '4' },
        ],
        correctAnswer: 'B',
        marksPositive: 4,
        marksNegative: 1,
      },
      {
        id: '3',
        questionNumber: 3,
        subject: 'Mathematics',
        type: 'numerical',
        prompt: 'Q3',
        correctAnswer: '25',
        marksPositive: 4,
        marksNegative: 1,
      },
      {
        id: '4',
        questionNumber: 4,
        subject: 'Mathematics',
        type: 'mcq',
        prompt: 'Q4',
        correctAnswer: 'D',
        marksPositive: 4,
        marksNegative: 1,
      },
    ],
  };

  const responses: Record<number, QuestionResponseState> = {
    1: { status: 'answered', selectedAnswer: 'A', timeSpentSeconds: 20 }, // +4
    2: { status: 'answered', selectedAnswer: 'C', timeSpentSeconds: 15 }, // -1
    3: { status: 'answered_marked', selectedAnswer: '25.0', timeSpentSeconds: 30 }, // +4 (NTA evaluates answered_marked)
    4: { status: 'marked', selectedAnswer: undefined, timeSpentSeconds: 5 }, // 0 (unattempted)
  };

  const summary = evaluateExamPaper(paper, responses);
  assert.equal(summary.totalScore, 7);
  assert.equal(summary.maxScore, 16);
  assert.equal(summary.correct, 2);
  assert.equal(summary.incorrect, 1);
  assert.equal(summary.unattempted, 1);
  assert.equal(summary.accuracyPercent, 66.7);

  const counts = computePaletteCounts(paper.questions, responses);
  assert.deepEqual(counts, {
    not_visited: 0,
    not_answered: 0,
    answered: 2,
    marked: 1,
    answered_marked: 1,
  });
});

test('formatCountdown formats HH:MM:SS cleanly', () => {
  assert.equal(formatCountdown(3665), '01:01:05');
  assert.equal(formatCountdown(0), '00:00:00');
});
