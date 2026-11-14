import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  ExamAttemptRecord,
  ExamPaperDataset,
  QuestionItem,
  UserProfile,
} from '../types/exam';

function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned || `id_${Date.now()}`;
}

function sanitizeQuestionsForFirestore(questions: QuestionItem[]) {
  return questions.slice(0, 200).map((q) => {
    const base: Record<string, unknown> = {
      id: sanitizeId(q.id),
      questionNumber: Math.max(1, Math.floor(q.questionNumber)),
      subject: (q.subject || 'General').slice(0, 80),
      type: q.type === 'numerical' ? 'numerical' : 'mcq',
      prompt: (q.prompt || '').slice(0, 8000),
      marksPositive: Number.isFinite(q.marksPositive) ? q.marksPositive : 4,
      marksNegative: Number.isFinite(q.marksNegative) ? q.marksNegative : 1,
    };
    if (q.type === 'mcq' && Array.isArray(q.options)) {
      base.options = q.options.slice(0, 4).map((o) => ({
        label: o.label,
        text: (o.text ?? '').slice(0, 2000),
      }));
    }
    if (q.correctAnswer !== undefined && q.correctAnswer.trim() !== '') {
      base.correctAnswer = q.correctAnswer.trim().slice(0, 128);
    }
    if (q.diagramNote !== undefined && q.diagramNote.trim() !== '') {
      base.diagramNote = q.diagramNote.trim().slice(0, 1000);
    }
    return base;
  });
}

function stripUndefinedDeep<T>(input: T): T {
  if (Array.isArray(input)) {
    return input.map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (input && typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    }
    return out as T;
  }
  return input;
}

export function subscribeUserProfile(
  uid: string,
  onData: (profile: UserProfile | null) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = `users/${uid}/profile/info`;
  const ref = doc(db, 'users', uid, 'profile', 'info');
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData(snap.data() as UserProfile);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (e) {
        onError(e instanceof Error ? e : new Error(String(e)));
      }
    }
  );
}

export async function saveUserProfile(
  uid: string,
  profileInput: Omit<UserProfile, 'uid' | 'createdAt' | 'updatedAt'>,
  isNew: boolean
): Promise<void> {
  const path = `users/${uid}/profile/info`;
  const ref = doc(db, 'users', uid, 'profile', 'info');

  const safeDisplayName = profileInput.displayName.trim().slice(0, 100) || 'Candidate';
  const safeTargetExam = profileInput.targetExam.trim().slice(0, 80) || 'JEE Main 2026';
  const safeCategory = profileInput.candidateCategory.trim().slice(0, 60) || 'Student';
  const safeDuration = Math.min(360, Math.max(5, Math.round(profileInput.defaultDurationMinutes || 180)));
  const safePhoto = profileInput.photoURL?.trim().slice(0, 500);

  try {
    if (isNew) {
      const payload: Record<string, unknown> = {
        uid: sanitizeId(uid),
        email: profileInput.email.trim().slice(0, 254),
        displayName: safeDisplayName,
        targetExam: safeTargetExam,
        candidateCategory: safeCategory,
        defaultDurationMinutes: safeDuration,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (safePhoto) {
        payload.photoURL = safePhoto;
      }
      await setDoc(ref, payload);
    } else {
      const updatePayload: Record<string, unknown> = {
        displayName: safeDisplayName,
        targetExam: safeTargetExam,
        candidateCategory: safeCategory,
        defaultDurationMinutes: safeDuration,
        updatedAt: serverTimestamp(),
      };
      if (safePhoto) {
        updatePayload.photoURL = safePhoto;
      }
      await updateDoc(ref, updatePayload);
    }
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export function subscribeUserPapers(
  uid: string,
  onData: (papers: ExamPaperDataset[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = `users/${uid}/papers`;
  const q = query(collection(db, 'users', uid, 'papers'), where('ownerId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const items: ExamPaperDataset[] = snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          id: String(data.id ?? d.id),
          title: String(data.title ?? 'Untitled Paper'),
          sourceFileName: data.sourceFileName ? String(data.sourceFileName) : undefined,
          createdAt:
            data.createdAt && typeof (data.createdAt as { toDate?: () => Date }).toDate === 'function'
              ? (data.createdAt as { toDate: () => Date }).toDate().toISOString()
              : new Date().toISOString(),
          updatedAt:
            data.updatedAt && typeof (data.updatedAt as { toDate?: () => Date }).toDate === 'function'
              ? (data.updatedAt as { toDate: () => Date }).toDate().toISOString()
              : new Date().toISOString(),
          durationMinutes: Number(data.durationMinutes ?? 180),
          numericalNegativeMarking: Number(data.numericalNegativeMarking ?? 1),
          answerKeyAttached: Boolean(data.answerKeyAttached),
          answerKeySource: data.answerKeySource ? String(data.answerKeySource) : undefined,
          questions: Array.isArray(data.questions) ? (data.questions as QuestionItem[]) : [],
        };
      });
      items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (e) {
        onError(e instanceof Error ? e : new Error(String(e)));
      }
    }
  );
}

export async function saveUserPaper(
  uid: string,
  paper: ExamPaperDataset,
  isNew: boolean
): Promise<ExamPaperDataset> {
  const safeId = sanitizeId(paper.id);
  const path = `users/${uid}/papers/${safeId}`;
  const ref = doc(db, 'users', uid, 'papers', safeId);

  const safeQuestions = sanitizeQuestionsForFirestore(paper.questions);
  const safeTitle = (paper.title || 'Untitled Exam Paper').trim().slice(0, 200);
  const safeDuration = Math.min(360, Math.max(5, Math.round(paper.durationMinutes || 180)));
  const safeNeg = paper.numericalNegativeMarking === 0 ? 0 : 1;

  try {
    if (isNew) {
      const payload: Record<string, unknown> = {
        id: safeId,
        ownerId: sanitizeId(uid),
        title: safeTitle,
        durationMinutes: safeDuration,
        numericalNegativeMarking: safeNeg,
        answerKeyAttached: Boolean(paper.answerKeyAttached),
        questions: safeQuestions,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (paper.sourceFileName?.trim()) {
        payload.sourceFileName = paper.sourceFileName.trim().slice(0, 260);
      }
      if (paper.answerKeySource?.trim()) {
        payload.answerKeySource = paper.answerKeySource.trim().slice(0, 260);
      }
      await setDoc(ref, payload);
    } else {
      const updatePayload: Record<string, unknown> = {
        title: safeTitle,
        durationMinutes: safeDuration,
        numericalNegativeMarking: safeNeg,
        answerKeyAttached: Boolean(paper.answerKeyAttached),
        questions: safeQuestions,
        updatedAt: serverTimestamp(),
      };
      if (paper.sourceFileName?.trim()) {
        updatePayload.sourceFileName = paper.sourceFileName.trim().slice(0, 260);
      }
      if (paper.answerKeySource?.trim()) {
        updatePayload.answerKeySource = paper.answerKeySource.trim().slice(0, 260);
      }
      await updateDoc(ref, updatePayload);
    }
    return { ...paper, id: safeId };
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function deleteUserPaper(uid: string, paperId: string): Promise<void> {
  const safeId = sanitizeId(paperId);
  const path = `users/${uid}/papers/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'papers', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeUserAttempts(
  uid: string,
  onData: (attempts: ExamAttemptRecord[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = `users/${uid}/attempts`;
  const q = query(collection(db, 'users', uid, 'attempts'), where('ownerId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const items: ExamAttemptRecord[] = snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          id: String(data.id ?? d.id),
          paperId: String(data.paperId ?? ''),
          paperTitle: String(data.paperTitle ?? ''),
          submittedAt: String(data.submittedAt ?? new Date().toISOString()),
          timeTakenSeconds: Number(data.timeTakenSeconds ?? 0),
          responses: (data.responses as ExamAttemptRecord['responses']) ?? {},
          evaluation: data.evaluation as ExamAttemptRecord['evaluation'],
        };
      });
      items.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (e) {
        onError(e instanceof Error ? e : new Error(String(e)));
      }
    }
  );
}

export async function saveUserAttempt(
  uid: string,
  attempt: ExamAttemptRecord,
  isNew: boolean
): Promise<void> {
  const safeId = sanitizeId(attempt.id);
  const safePaperId = sanitizeId(attempt.paperId);
  const path = `users/${uid}/attempts/${safeId}`;
  const ref = doc(db, 'users', uid, 'attempts', safeId);

  const sanitizedResponses: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(attempt.responses)) {
    sanitizedResponses[String(k)] = stripUndefinedDeep(v);
  }
  const sanitizedEval = stripUndefinedDeep(attempt.evaluation);

  try {
    if (isNew) {
      await setDoc(ref, {
        id: safeId,
        ownerId: sanitizeId(uid),
        paperId: safePaperId,
        paperTitle: attempt.paperTitle.trim().slice(0, 200),
        submittedAt: attempt.submittedAt.slice(0, 64),
        timeTakenSeconds: Math.min(86400, Math.max(0, Math.round(attempt.timeTakenSeconds))),
        responses: sanitizedResponses,
        evaluation: sanitizedEval,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        paperTitle: attempt.paperTitle.trim().slice(0, 200),
        evaluation: sanitizedEval,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}
