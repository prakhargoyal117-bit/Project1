import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAnswerKeyToQuestions,
  parseAnswerKeyText,
  splitMathText,
} from './answerKeyParser';
import type { QuestionItem } from '../types/exam';

test('parseAnswerKeyText handles multi-format answer keys', () => {
  const raw = `
    Q.No, Answer
    1: B
    2. (3)
    Q3 - 42.5
    4 -> A
    5 12
    6: C   7: D
  `;
  const parsed = parseAnswerKeyText(raw);
  assert.deepEqual(parsed, [
    { questionNumber: 1, answer: 'B' },
    { questionNumber: 2, answer: '3' },
    { questionNumber: 3, answer: '42.5' },
    { questionNumber: 4, answer: 'A' },
    { questionNumber: 5, answer: '12' },
    { questionNumber: 6, answer: 'C' },
    { questionNumber: 7, answer: 'D' },
  ]);
});

test('applyAnswerKeyToQuestions preserves numeric values for numerical questions and maps 1-4 to A-D for MCQs', () => {
  const questions: QuestionItem[] = [
    {
      id: 'q1',
      questionNumber: 1,
      subject: 'Physics',
      type: 'mcq',
      prompt: 'MCQ',
      marksPositive: 4,
      marksNegative: 1,
    },
    {
      id: 'q2',
      questionNumber: 2,
      subject: 'Physics',
      type: 'numerical',
      prompt: 'Numerical',
      marksPositive: 4,
      marksNegative: 1,
    },
  ];

  const { updatedQuestions, matchedCount, unmatchedNumbers } = applyAnswerKeyToQuestions(
    questions,
    [
      { questionNumber: 1, answer: '2' },
      { questionNumber: 2, answer: '2' },
      { questionNumber: 99, answer: 'A' },
    ]
  );

  assert.equal(matchedCount, 2);
  assert.deepEqual(unmatchedNumbers, [99]);
  assert.equal(updatedQuestions[0].correctAnswer, 'B');
  assert.equal(updatedQuestions[1].correctAnswer, '2');
});

test('splitMathText preserves integrals, summations, and mixed delimiters', () => {
  const input =
    'Compute $\\int_{0}^{\\pi/2} \\sin x\\,dx$ and \\[\\sum_{n=1}^{\\infty} \\frac{1}{n^2}\\] for \\$50.';
  const segments = splitMathText(input);
  assert.equal(segments.length, 5);
  assert.deepEqual(segments[0], { type: 'text', content: 'Compute ' });
  assert.deepEqual(segments[1], {
    type: 'inline-math',
    content: '\\int_{0}^{\\pi/2} \\sin x\\,dx',
  });
  assert.deepEqual(segments[2], { type: 'text', content: ' and ' });
  assert.deepEqual(segments[3], {
    type: 'display-math',
    content: '\\sum_{n=1}^{\\infty} \\frac{1}{n^2}',
  });
  assert.deepEqual(segments[4], { type: 'text', content: ' for $50.' });
});
