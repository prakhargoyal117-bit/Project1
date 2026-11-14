export type QuestionType = 'mcq' | 'numerical';

export type OptionLabel = 'A' | 'B' | 'C' | 'D';

export interface QuestionOption {
  label: OptionLabel;
  text: string;
}

export interface QuestionItem {
  id: string;
  questionNumber: number;
  subject: string;
  type: QuestionType;
  prompt: string;
  options?: QuestionOption[];
  correctAnswer?: string;
  marksPositive: number;
  marksNegative: number;
  diagramNote?: string;
}

export interface ExamPaperDataset {
  id: string;
  title: string;
  sourceFileName?: string;
  createdAt: string;
  updatedAt: string;
  durationMinutes: number;
  numericalNegativeMarking: number;
  questions: QuestionItem[];
  answerKeyAttached: boolean;
  answerKeySource?: string;
}

export type PaletteStatus =
  | 'not_visited'
  | 'not_answered'
  | 'answered'
  | 'marked'
  | 'answered_marked';

export interface QuestionResponseState {
  status: PaletteStatus;
  selectedAnswer?: string;
  timeSpentSeconds: number;
}

export interface QuestionEvaluation {
  questionNumber: number;
  subject: string;
  type: QuestionType;
  userAnswer?: string;
  officialAnswer?: string;
  outcome: 'correct' | 'incorrect' | 'unattempted' | 'no_key';
  marksAwarded: number;
  maxMarks: number;
  countedInEvaluation: boolean;
}

export interface SubjectBreakdown {
  subject: string;
  totalQuestions: number;
  attempted: number;
  correct: number;
  incorrect: number;
  unattempted: number;
  score: number;
  maxScore: number;
}

export interface EvaluationSummary {
  totalQuestions: number;
  attempted: number;
  correct: number;
  incorrect: number;
  unattempted: number;
  ungraded: number;
  totalScore: number;
  maxScore: number;
  accuracyPercent: number;
  subjectBreakdown: SubjectBreakdown[];
  questionResults: QuestionEvaluation[];
}

export interface ExamAttemptRecord {
  id: string;
  paperId: string;
  paperTitle: string;
  submittedAt: string;
  timeTakenSeconds: number;
  responses: Record<number, QuestionResponseState>;
  evaluation: EvaluationSummary;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  targetExam: string;
  candidateCategory: string;
  defaultDurationMinutes: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type AppViewMode =
  | 'library'
  | 'upload'
  | 'inspector'
  | 'cbt'
  | 'results'
  | 'profile';
