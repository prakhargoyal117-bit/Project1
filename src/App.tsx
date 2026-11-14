import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import {
  BarChart3,
  BookOpen,
  FileUp,
  Layers,
  Loader2,
  LogOut,
  Menu,
  UserCircle2,
  X,
} from 'lucide-react';
import { auth } from './firebase';
import { CbtExamSimulator } from './components/CbtExamSimulator';
import { DatasetLibrary } from './components/DatasetLibrary';
import { LoginScreen } from './components/LoginScreen';
import { PdfUploadStudio } from './components/PdfUploadStudio';
import { ProfileSetupView } from './components/ProfileSetupView';
import { QuestionInspector } from './components/QuestionInspector';
import { ResultsView } from './components/ResultsView';
import { INITIAL_SAMPLE_PAPERS } from './data/samplePapers';
import {
  deleteUserPaper,
  saveUserAttempt,
  saveUserPaper,
  saveUserProfile,
  subscribeUserAttempts,
  subscribeUserPapers,
  subscribeUserProfile,
} from './services/firestoreStore';
import type {
  AppViewMode,
  ExamAttemptRecord,
  ExamPaperDataset,
  QuestionResponseState,
  UserProfile,
} from './types/exam';
import { evaluateExamPaper } from './utils/scoring';

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);

  const [papers, setPapers] = useState<ExamPaperDataset[]>([]);
  const [attempts, setAttempts] = useState<ExamAttemptRecord[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<AppViewMode>('library');
  const [activePaperId, setActivePaperId] = useState<string | null>(null);
  const [activeAttemptId, setActiveAttemptId] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  const seededRef = useRef<string | null>(null);

  const skipInstructions =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('autostart') === '1';

  // 1. Track Firebase Authentication state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);
      setAvatarError(false);
      if (!firebaseUser) {
        setProfile(null);
        setProfileLoaded(false);
        setPapers([]);
        setAttempts([]);
        setDataLoaded(false);
        setActivePaperId(null);
        setActiveAttemptId(null);
        setViewMode('library');
        seededRef.current = null;
      }
    });
    return unsubscribe;
  }, []);

  // 2. Subscribe to user's private profile, papers, and attempts ONLY after authentication
  useEffect(() => {
    if (!authReady || !user) return;

    setSyncError(null);
    const unsubProfile = subscribeUserProfile(
      user.uid,
      (prof) => {
        setProfile(prof);
        setProfileLoaded(true);
      },
      (err) => {
        setSyncError(err.message);
        setProfileLoaded(true);
      }
    );

    const unsubPapers = subscribeUserPapers(
      user.uid,
      (list) => {
        setPapers(list);
        setDataLoaded(true);
        setActivePaperId((prev) => prev ?? list[0]?.id ?? null);
      },
      (err) => {
        setSyncError(err.message);
        setDataLoaded(true);
      }
    );

    const unsubAttempts = subscribeUserAttempts(
      user.uid,
      (list) => {
        setAttempts(list);
      },
      (err) => {
        setSyncError(err.message);
      }
    );

    return () => {
      unsubProfile();
      unsubPapers();
      unsubAttempts();
    };
  }, [authReady, user]);

  // Show loading screen while Firebase Auth or profile resolves
  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="flex items-center gap-2.5 text-sm font-medium text-slate-600">
          <Loader2 className="w-4 h-4 animate-spin text-blue-700" aria-hidden="true" />
          <span>Initializing workspace...</span>
        </div>
      </div>
    );
  }

  // Unauthenticated -> Google Sign-In screen
  if (!user) {
    return <LoginScreen />;
  }

  // Wait for user profile lookup
  if (!profileLoaded) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="flex items-center gap-2.5 text-sm font-medium text-slate-600">
          <Loader2 className="w-4 h-4 animate-spin text-blue-700" aria-hidden="true" />
          <span>Loading your profile...</span>
        </div>
      </div>
    );
  }

  const handleSignOut = async () => {
    await signOut(auth);
  };

  const handleSaveProfile = async (
    data: Omit<UserProfile, 'uid' | 'createdAt' | 'updatedAt'>
  ) => {
    const isNew = !profile;
    await saveUserProfile(user.uid, data, isNew);

    // Seed sample paper once for newly onboarded user if they have no papers yet
    if (isNew && papers.length === 0 && seededRef.current !== user.uid) {
      seededRef.current = user.uid;
      try {
        await saveUserPaper(user.uid, INITIAL_SAMPLE_PAPERS[0], true);
      } catch {
        // Non-fatal if sample seed fails
      }
    }
  };

  // First-time user must create their profile before entering workspace
  if (!profile) {
    return (
      <ProfileSetupView
        user={user}
        existingProfile={null}
        isOnboarding={true}
        onSaveProfile={handleSaveProfile}
        onSignOut={handleSignOut}
      />
    );
  }

  const activePaper = papers.find((p) => p.id === activePaperId);
  const activeAttempt = attempts.find((a) => a.id === activeAttemptId);

  const handleUpsertPaper = async (paper: ExamPaperDataset) => {
    const exists = papers.some((p) => p.id === paper.id);
    const saved = await saveUserPaper(user.uid, paper, !exists);
    setActivePaperId(saved.id);

    // Re-evaluate any stored attempts for this paper automatically when its answer key updates
    const relatedAttempts = attempts.filter((att) => att.paperId === saved.id);
    for (const att of relatedAttempts) {
      const updatedAttempt: ExamAttemptRecord = {
        ...att,
        paperTitle: saved.title,
        evaluation: evaluateExamPaper(saved, att.responses),
      };
      await saveUserAttempt(user.uid, updatedAttempt, false);
    }
  };

  const handleDeletePaper = async (paperId: string) => {
    await deleteUserPaper(user.uid, paperId);
    if (activePaperId === paperId) {
      setActivePaperId(null);
      if (viewMode === 'inspector' || viewMode === 'cbt') {
        setViewMode('library');
      }
    }
  };

  const handleStartCbt = (paperId: string) => {
    setActivePaperId(paperId);
    setViewMode('cbt');
    setMobileNavOpen(false);
  };

  const handleInspectPaper = (paperId: string) => {
    setActivePaperId(paperId);
    setViewMode('inspector');
    setMobileNavOpen(false);
  };

  const handleSubmitCbtAttempt = async (
    responses: Record<number, QuestionResponseState>,
    timeTakenSeconds: number
  ) => {
    if (!activePaper) return;
    const evaluation = evaluateExamPaper(activePaper, responses);
    const attempt: ExamAttemptRecord = {
      id: `attempt-${Date.now()}`,
      paperId: activePaper.id,
      paperTitle: activePaper.title,
      submittedAt: new Date().toISOString(),
      timeTakenSeconds,
      responses,
      evaluation,
    };
    await saveUserAttempt(user.uid, attempt, true);
    setActiveAttemptId(attempt.id);
    setViewMode('results');
  };

  // Full-screen NTA CBT Mode bypasses dashboard chrome
  if (viewMode === 'cbt' && activePaper) {
    return (
      <CbtExamSimulator
        paper={activePaper}
        skipInstructions={skipInstructions}
        onSubmitAttempt={handleSubmitCbtAttempt}
        onExit={() => setViewMode('library')}
      />
    );
  }

  const breadcrumbLabel =
    viewMode === 'library'
      ? 'Workspace / Dataset Library'
      : viewMode === 'upload'
        ? 'Workspace / PDF Extraction Studio'
        : viewMode === 'inspector'
          ? `Workspace / Inspector / ${activePaper?.title ?? 'Paper'}`
          : viewMode === 'profile'
            ? 'Workspace / Candidate Profile'
            : 'Workspace / Evaluation Scorecard';

  const initials = (profile.displayName || user.email || 'U')
    .trim()
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:flex w-64 bg-white border-r border-slate-200 flex-col shrink-0">
        <div className="h-16 px-5 border-b border-slate-200 flex items-center">
          <span className="font-display font-bold text-lg tracking-tight text-slate-900 whitespace-nowrap">
            NTA ExamForge
          </span>
        </div>

        <nav aria-label="Primary navigation" className="flex-1 p-3 space-y-1">
          <button
            type="button"
            onClick={() => setViewMode('library')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
              viewMode === 'library'
                ? 'bg-blue-50 text-blue-700'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Layers className="w-4 h-4 shrink-0" aria-hidden="true" />
            Dataset Library
          </button>

          <button
            type="button"
            onClick={() => setViewMode('upload')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
              viewMode === 'upload'
                ? 'bg-blue-50 text-blue-700'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <FileUp className="w-4 h-4 shrink-0" aria-hidden="true" />
            PDF Extraction Studio
          </button>

          {activePaper && (
            <button
              type="button"
              onClick={() => setViewMode('inspector')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                viewMode === 'inspector'
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <BookOpen className="w-4 h-4 shrink-0" aria-hidden="true" />
              Paper Inspector
            </button>
          )}

          {attempts.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (!activeAttemptId && attempts[0]) {
                  setActiveAttemptId(attempts[0].id);
                }
                setViewMode('results');
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                viewMode === 'results'
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <BarChart3 className="w-4 h-4 shrink-0" aria-hidden="true" />
              Latest Scorecard
            </button>
          )}

          <button
            type="button"
            onClick={() => setViewMode('profile')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
              viewMode === 'profile'
                ? 'bg-blue-50 text-blue-700'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <UserCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            Candidate Profile
          </button>
        </nav>

        {/* Signed-In User Account Footer */}
        <div className="p-4 border-t border-slate-200 space-y-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {profile.photoURL && !avatarError ? (
              <img
                src={profile.photoURL}
                alt={profile.displayName}
                referrerPolicy="no-referrer"
                onError={() => setAvatarError(true)}
                className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-200 text-blue-700 font-semibold text-xs flex items-center justify-center shrink-0">
                {initials}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-900 truncate">
                {profile.displayName}
              </p>
              <p className="text-xs text-slate-500 truncate">{profile.targetExam}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile Drawer Nav */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/50"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative w-64 bg-white h-full flex flex-col border-r border-slate-200 z-10">
            <div className="h-16 px-5 border-b border-slate-200 flex items-center justify-between">
              <span className="font-display font-bold text-lg text-slate-900">
                NTA ExamForge
              </span>
              <button
                type="button"
                aria-label="Close navigation menu"
                onClick={() => setMobileNavOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              <button
                type="button"
                onClick={() => {
                  setViewMode('library');
                  setMobileNavOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm font-medium rounded-md text-slate-700 hover:bg-slate-100"
              >
                Dataset Library
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewMode('upload');
                  setMobileNavOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm font-medium rounded-md text-slate-700 hover:bg-slate-100"
              >
                PDF Extraction Studio
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewMode('profile');
                  setMobileNavOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm font-medium rounded-md text-slate-700 hover:bg-slate-100"
              >
                Candidate Profile
              </button>
            </nav>
            <div className="p-4 border-t border-slate-200">
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full px-3 py-2 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-md"
              >
                Sign Out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract: Breadcrumb Left, 1 Primary Action Right */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 lg:px-8 flex items-center justify-between gap-6 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Open navigation menu"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-2 text-slate-600 hover:text-slate-900 rounded-md border border-slate-200"
            >
              <Menu className="w-4 h-4" aria-hidden="true" />
            </button>
            <p className="text-xs sm:text-sm font-medium text-slate-600 truncate">
              {breadcrumbLabel}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setViewMode('upload')}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-md hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
          >
            <FileUp className="w-3.5 h-3.5" aria-hidden="true" />
            Upload Paper PDF
          </button>
        </header>

        <main className="flex-1 p-4 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
          {syncError && (
            <div
              role="alert"
              className="p-3.5 rounded-md bg-red-50 border border-red-200 text-xs text-red-700"
            >
              Cloud sync notice: {syncError}
            </div>
          )}

          {!dataLoaded ? (
            <div className="py-16 flex items-center justify-center gap-2.5 text-sm text-slate-600">
              <Loader2 className="w-4 h-4 animate-spin text-blue-700" aria-hidden="true" />
              <span>Loading your private datasets...</span>
            </div>
          ) : (
            <>
              {viewMode === 'library' && (
                <DatasetLibrary
                  papers={papers}
                  attempts={attempts}
                  onStartCbt={handleStartCbt}
                  onInspectPaper={handleInspectPaper}
                  onDeletePaper={handleDeletePaper}
                  onImportDataset={handleUpsertPaper}
                  onGoToUpload={() => setViewMode('upload')}
                  onViewAttempt={(attemptId) => {
                    setActiveAttemptId(attemptId);
                    setViewMode('results');
                  }}
                />
              )}

              {viewMode === 'upload' && (
                <PdfUploadStudio
                  onPaperCreated={handleUpsertPaper}
                  onStartCbt={handleStartCbt}
                  onInspectPaper={handleInspectPaper}
                />
              )}

              {viewMode === 'inspector' && activePaper && (
                <QuestionInspector
                  paper={activePaper}
                  onUpdatePaper={handleUpsertPaper}
                  onStartCbt={handleStartCbt}
                  onBack={() => setViewMode('library')}
                />
              )}

              {viewMode === 'results' && activeAttempt && (
                <ResultsView
                  attempt={activeAttempt}
                  paper={papers.find((p) => p.id === activeAttempt.paperId)}
                  onAttachAnswerKeyToPaper={handleUpsertPaper}
                  onRetakeCbt={handleStartCbt}
                  onBackToDashboard={() => setViewMode('library')}
                />
              )}

              {viewMode === 'profile' && (
                <ProfileSetupView
                  user={user}
                  existingProfile={profile}
                  isOnboarding={false}
                  onSaveProfile={handleSaveProfile}
                  onSignOut={handleSignOut}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
