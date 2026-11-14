import type { QuestionItem } from '../types/exam';
import { normalizeMcqAnswer } from './scoring';

export interface ParsedAnswerEntry {
  questionNumber: number;
  answer: string;
}

export interface MathSegment {
  type: 'text' | 'inline-math' | 'display-math';
  content: string;
}

/**
 * Parses arbitrary answer sheet text / CSV / key-value formats into questionNumber -> answer pairs.
 * Supports patterns like:
 * - "1: A", "1. (B)", "Q1 - 3", "21 -> 42.5"
 * - CSV rows: "1,A" or "1, 14.5"
 * - Inline space-separated tables: "1 A 2 B 3 C 4 12"
 */
export function parseAnswerKeyText(rawText: string): ParsedAnswerEntry[] {
  if (!rawText || !rawText.trim()) return [];

  const entries = new Map<number, string>();
  const normalized = rawText.replace(/\r\n/g, '\n').trim();

  // First try line-by-line structured extraction
  const lines = normalized.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    // Skip obvious CSV header lines
    if (/^(q\.?\s*no|question|s\.?\s*no)/i.test(line) && /answer|ans|key/i.test(line)) {
      continue;
    }

    // Check if a line contains multiple inline pairs like "1. A   2. B   3. C" or "1 A 2 B 3 C"
    const multiPairMatches = Array.from(
      line.matchAll(
        /(?:^|\s|;|,)(?:Q\.?\s*|#)?(\d{1,4})\s*(?:[.):\-=>,|]+|\s+)\s*\(?([A-Da-d]|[-+]?\d+(?:\.\d+)?)\)?(?=\s|$|;|,)/g
      )
    );

    if (multiPairMatches.length > 0) {
      for (const m of multiPairMatches) {
        const qNum = Number(m[1]);
        const ans = m[2].trim();
        if (Number.isInteger(qNum) && qNum > 0 && ans) {
          entries.set(qNum, ans);
        }
      }
      continue;
    }

    // Fallback single-line matcher
    const singleMatch = line.match(
      /^(?:Q\.?\s*|Question\s*|#)?(\d{1,4})\s*[:.)\-=>,\t| ]+\s*\(?([A-Da-d]|[-+]?\d+(?:\.\d+)?)\)?\s*$/i
    );
    if (singleMatch) {
      const qNum = Number(singleMatch[1]);
      const ans = singleMatch[2].trim();
      if (Number.isInteger(qNum) && qNum > 0 && ans) {
        entries.set(qNum, ans);
      }
    }
  }

  return Array.from(entries.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([questionNumber, answer]) => ({ questionNumber, answer }));
}

/**
 * Applies parsed answer entries onto a paper's questions, respecting each question's type.
 * If question is MCQ, converts "1/2/3/4" -> "A/B/C/D".
 * If question is numerical, keeps numeric strings untouched (e.g., "2", "14.5", "-3").
 */
export function applyAnswerKeyToQuestions(
  questions: QuestionItem[],
  entries: ParsedAnswerEntry[]
): { updatedQuestions: QuestionItem[]; matchedCount: number; unmatchedNumbers: number[] } {
  const entryMap = new Map<number, string>();
  for (const e of entries) {
    entryMap.set(e.questionNumber, e.answer);
  }

  const questionNumbers = new Set(questions.map((q) => q.questionNumber));
  let matchedCount = 0;

  const updatedQuestions = questions.map((q) => {
    const rawAns = entryMap.get(q.questionNumber);
    if (rawAns === undefined) return q;

    matchedCount += 1;
    if (q.type === 'mcq') {
      const normalized = normalizeMcqAnswer(rawAns);
      return {
        ...q,
        correctAnswer: normalized ?? rawAns.toUpperCase(),
      };
    }
    return {
      ...q,
      correctAnswer: rawAns.trim(),
    };
  });

  const unmatchedNumbers = entries
    .map((e) => e.questionNumber)
    .filter((num) => !questionNumbers.has(num));

  return { updatedQuestions, matchedCount, unmatchedNumbers };
}

/**
 * Normalizes \(...\) and \[...\] delimiters to $...$ and $$...$$, then tokenizes
 * into plain text, inline-math, and display-math segments for safe KaTeX rendering.
 */
export function splitMathText(input: string): MathSegment[] {
  if (!input) return [];

  // Convert standard LaTeX delimiters \( ... \) and \[ ... \] into $...$ and $$...$$
  const normalized = input
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, inner) => `$$${inner}$$`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, inner) => `$${inner}$`);

  const segments: MathSegment[] = [];
  let i = 0;
  let textBuffer = '';

  const flushText = () => {
    if (textBuffer.length > 0) {
      segments.push({ type: 'text', content: textBuffer });
      textBuffer = '';
    }
  };

  while (i < normalized.length) {
    const char = normalized[i];

    // Respect escaped dollar signs \$
    if (char === '\\' && normalized[i + 1] === '$') {
      textBuffer += '$';
      i += 2;
      continue;
    }

    if (char === '$') {
      const isDisplay = normalized[i + 1] === '$';
      const delim = isDisplay ? '$$' : '$';
      const start = i + delim.length;

      let end = -1;
      let j = start;
      while (j < normalized.length) {
        if (normalized[j] === '\\' && normalized[j + 1] === '$') {
          j += 2;
          continue;
        }
        if (isDisplay) {
          if (normalized[j] === '$' && normalized[j + 1] === '$') {
            end = j;
            break;
          }
        } else {
          if (normalized[j] === '$' && normalized[j + 1] !== '$') {
            end = j;
            break;
          }
        }
        j += 1;
      }

      if (end !== -1) {
        const mathContent = normalized.slice(start, end).trim();
        if (mathContent.length > 0) {
          flushText();
          segments.push({
            type: isDisplay ? 'display-math' : 'inline-math',
            content: mathContent,
          });
          i = end + delim.length;
          continue;
        }
      }
    }

    textBuffer += char;
    i += 1;
  }

  flushText();
  return segments;
}
