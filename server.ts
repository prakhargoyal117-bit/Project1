import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { PDFDocument } from 'pdf-lib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB max PDF/image upload
  },
});

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please add your Gemini API key in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient = /429|503|RESOURCE_EXHAUSTED|UNAVAILABLE|timeout/i.test(msg);
      if (!isTransient || attempt === maxRetries) {
        throw err;
      }
      const delayMs = 800 * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

interface ExtractedRawQuestion {
  questionNumber: number;
  subject: string;
  type: 'mcq' | 'numerical';
  prompt: string;
  optionA?: string;
  optionB?: string;
  optionC?: string;
  optionD?: string;
  diagramNote?: string;
}

const QUESTION_EXTRACTION_SYSTEM_INSTRUCTION = `You are a precision STEM exam digitization engine specialized in JEE Main / NTA question papers.
Extract EVERY question present in the provided PDF pages accurately and completely.

CRITICAL MATHEMATICAL NOTATION RULES:
1. Convert ALL mathematical expressions, equations, symbols, Greek letters, chemical formulas, integrals, summations, limits, vectors, and matrices into valid KaTeX/LaTeX.
2. Wrap inline math in single dollar signs $...$ and standalone equations in double dollar signs $$...$$.
3. Preserve EVERY subscript, superscript, and boundary limit with 100% precision:
   - Definite & indefinite integrals: \\int_{a}^{b} f(x)\\,dx, \\oint, \\iint
   - Summations & products: \\sum_{k=1}^{n}, \\sum_{n=1}^{\\infty}, \\prod_{i=1}^{m}
   - Limits: \\lim_{x \\to 0}, \\lim_{n \\to \\infty}
   - Fractions, roots, binomials: \\frac{a}{b}, \\sqrt[n]{x}, \\binom{n}{r}
   - Matrices & determinants: \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}, \\begin{vmatrix} ... \\end{vmatrix}
   - Chemical equations & states: \\text{N}_2(g) + 3\\text{H}_2(g) \\rightleftharpoons 2\\text{NH}_3(g)
4. Preserve the exact printed questionNumber from the PDF (e.g., 1, 2, 21, 25, etc.).
5. Classify "type" as:
   - "mcq" when 4 options (A/B/C/D or 1/2/3/4) are present. Populate optionA, optionB, optionC, optionD cleanly WITHOUT leading "(A)" or "(1)" prefixes.
   - "numerical" when no 4 options are given (integer/decimal/numerical value type question). Leave optionA..optionD empty.
6. Infer "subject" ("Physics", "Chemistry", "Mathematics", or "General") from section headers or question content.
7. If a question references a diagram, circuit, or graph, summarize the key labeled values/geometry concisely in "diagramNote" so the student has full context.
8. Do NOT invent answers. Only extract the question text and options.`;

const QUESTION_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          questionNumber: {
            type: Type.INTEGER,
            description: 'The exact question number printed in the PDF.',
          },
          subject: {
            type: Type.STRING,
            description: 'Subject section: Physics, Chemistry, Mathematics, or General.',
          },
          type: {
            type: Type.STRING,
            description: 'Either "mcq" (4 options) or "numerical" (integer/decimal input).',
          },
          prompt: {
            type: Type.STRING,
            description: 'Full question text with LaTeX wrapped in $...$ or $$...$$.',
          },
          optionA: {
            type: Type.STRING,
            description: 'Option A / (1) text with LaTeX if MCQ; omit or empty if numerical.',
          },
          optionB: {
            type: Type.STRING,
            description: 'Option B / (2) text with LaTeX if MCQ; omit or empty if numerical.',
          },
          optionC: {
            type: Type.STRING,
            description: 'Option C / (3) text with LaTeX if MCQ; omit or empty if numerical.',
          },
          optionD: {
            type: Type.STRING,
            description: 'Option D / (4) text with LaTeX if MCQ; omit or empty if numerical.',
          },
          diagramNote: {
            type: Type.STRING,
            description: 'Concise description of any figure, graph, or circuit diagram in the question.',
          },
        },
        required: ['questionNumber', 'subject', 'type', 'prompt'],
      },
    },
  },
  required: ['questions'],
};

async function extractQuestionsFromPdfChunk(
  ai: GoogleGenAI,
  pdfBytes: Uint8Array,
  pageRangeLabel: string
): Promise<ExtractedRawQuestion[]> {
  const base64Data = Buffer.from(pdfBytes).toString('base64');

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: base64Data,
            },
          },
          {
            text: `Extract all questions from pages ${pageRangeLabel} of this exam PDF. Preserve exact question numbers and complex math notation (integrals with limits, summations with bounds, fractions, matrices).`,
          },
        ],
      },
      config: {
        systemInstruction: QUESTION_EXTRACTION_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: QUESTION_RESPONSE_SCHEMA,
        thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
      },
    })
  );

  const rawText = (response.text ?? '{}').trim();
  const parsed = JSON.parse(rawText) as { questions?: ExtractedRawQuestion[] };
  return Array.isArray(parsed.questions) ? parsed.questions : [];
}

function formatNormalizedQuestions(rawList: ExtractedRawQuestion[]) {
  const deduped = new Map<number, ExtractedRawQuestion>();

  for (const item of rawList) {
    if (!item || typeof item.questionNumber !== 'number' || !item.prompt?.trim()) continue;
    const existing = deduped.get(item.questionNumber);
    if (!existing) {
      deduped.set(item.questionNumber, item);
    } else {
      // Keep the entry with richer text/options if a question spanned a chunk boundary
      const existingScore =
        (existing.prompt?.length || 0) +
        (existing.optionA?.length || 0) +
        (existing.optionD?.length || 0);
      const nextScore =
        (item.prompt?.length || 0) +
        (item.optionA?.length || 0) +
        (item.optionD?.length || 0);
      if (nextScore > existingScore) {
        deduped.set(item.questionNumber, item);
      }
    }
  }

  return Array.from(deduped.values())
    .sort((a, b) => a.questionNumber - b.questionNumber)
    .map((q, index) => {
      const hasOptions = Boolean(q.optionA || q.optionB || q.optionC || q.optionD);
      const type: 'mcq' | 'numerical' =
        q.type === 'numerical' && !hasOptions ? 'numerical' : hasOptions ? 'mcq' : 'numerical';

      const base = {
        id: `q-${q.questionNumber}-${index}`,
        questionNumber: q.questionNumber,
        subject: q.subject?.trim() || 'General',
        type,
        prompt: q.prompt.trim(),
        marksPositive: 4,
        marksNegative: 1,
        diagramNote: q.diagramNote?.trim() || undefined,
      };

      if (type === 'mcq') {
        return {
          ...base,
          options: [
            { label: 'A' as const, text: (q.optionA ?? '').trim() || 'Option A' },
            { label: 'B' as const, text: (q.optionB ?? '').trim() || 'Option B' },
            { label: 'C' as const, text: (q.optionC ?? '').trim() || 'Option C' },
            { label: 'D' as const, text: (q.optionD ?? '').trim() || 'Option D' },
          ],
        };
      }

      return base;
    });
}

async function createApp() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Fast chunked parallel PDF extraction endpoint streaming NDJSON progress updates
  app.post('/api/extract-pdf', upload.single('pdf'), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'No PDF file provided.' });
      return;
    }

    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');

    const writeEvent = (payload: Record<string, unknown>) => {
      res.write(`${JSON.stringify(payload)}\n`);
    };

    try {
      const ai = getGeminiClient();
      const srcDoc = await PDFDocument.load(req.file.buffer, { ignoreEncryption: true });
      const totalPages = srcDoc.getPageCount();

      if (totalPages === 0) {
        writeEvent({ type: 'error', error: 'Uploaded PDF has 0 pages.' });
        res.end();
        return;
      }

      const PAGES_PER_CHUNK = totalPages <= 6 ? totalPages : 4;
      const chunks: { startPage: number; endPage: number; bytes: Uint8Array }[] = [];

      for (let start = 0; start < totalPages; start += PAGES_PER_CHUNK) {
        const end = Math.min(start + PAGES_PER_CHUNK, totalPages);
        if (totalPages <= PAGES_PER_CHUNK) {
          chunks.push({
            startPage: 1,
            endPage: totalPages,
            bytes: req.file.buffer,
          });
        } else {
          const subDoc = await PDFDocument.create();
          const indices = Array.from({ length: end - start }, (_, idx) => start + idx);
          const copiedPages = await subDoc.copyPages(srcDoc, indices);
          for (const page of copiedPages) {
            subDoc.addPage(page);
          }
          const subBytes = await subDoc.save();
          chunks.push({
            startPage: start + 1,
            endPage: end,
            bytes: subBytes,
          });
        }
      }

      writeEvent({
        type: 'started',
        totalPages,
        totalChunks: chunks.length,
        fileName: req.file.originalname,
      });

      const allRawQuestions: ExtractedRawQuestion[] = [];
      let completedChunks = 0;
      const CONCURRENCY = 4;

      for (let i = 0; i < chunks.length; i += CONCURRENCY) {
        const batch = chunks.slice(i, i + CONCURRENCY);
        const batchResults = await Promise.all(
          batch.map(async (chunk) => {
            const label = `${chunk.startPage}-${chunk.endPage}`;
            const extracted = await extractQuestionsFromPdfChunk(ai, chunk.bytes, label);
            completedChunks += 1;
            writeEvent({
              type: 'progress',
              completedChunks,
              totalChunks: chunks.length,
              pageRange: label,
              questionsInChunk: extracted.length,
            });
            return extracted;
          })
        );
        for (const list of batchResults) {
          allRawQuestions.push(...list);
        }
      }

      const formatted = formatNormalizedQuestions(allRawQuestions);
      if (formatted.length === 0) {
        writeEvent({
          type: 'error',
          error:
            'No questions could be detected in this PDF. Please verify the file contains readable question text or math.',
        });
        res.end();
        return;
      }

      writeEvent({
        type: 'complete',
        totalPages,
        questions: formatted,
      });
      res.end();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'PDF extraction failed.';
      writeEvent({ type: 'error', error: message });
      res.end();
    }
  });

  // Multimodal Answer Sheet Extractor (supports PDF, PNG, JPG, WEBP)
  app.post('/api/extract-answer-key', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No answer sheet file uploaded.' });
        return;
      }

      const mime = req.file.mimetype;
      if (mime === 'text/plain' || mime === 'text/csv' || req.file.originalname.endsWith('.csv') || req.file.originalname.endsWith('.txt')) {
        res.json({
          mode: 'text',
          rawText: req.file.buffer.toString('utf-8'),
        });
        return;
      }

      const supportedBinary = [
        'application/pdf',
        'image/png',
        'image/jpeg',
        'image/webp',
      ];
      if (!supportedBinary.includes(mime)) {
        res.status(400).json({
          error: `Unsupported answer sheet format (${mime}). Upload PDF, PNG, JPG, CSV, or TXT.`,
        });
        return;
      }

      const ai = getGeminiClient();
      const base64Data = req.file.buffer.toString('base64');

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: mime,
                  data: base64Data,
                },
              },
              {
                text: 'Extract every questionNumber and its official answer from this answer key document. For MCQs output A/B/C/D or 1/2/3/4 exactly as printed. For numerical questions output the exact number.',
              },
            ],
          },
          config: {
            systemInstruction:
              'You extract official exam answer keys into structured JSON mapping questionNumber to answer string. Be 100% accurate to row and column alignment.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                entries: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      questionNumber: { type: Type.INTEGER },
                      answer: { type: Type.STRING },
                    },
                    required: ['questionNumber', 'answer'],
                  },
                },
              },
              required: ['entries'],
            },
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        })
      );

      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        entries?: { questionNumber: number; answer: string }[];
      };
      res.json({
        mode: 'structured',
        entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Answer sheet extraction failed.';
      res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NTA ExamForge Studio running at http://localhost:${PORT}`);
  });
}

createApp().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
