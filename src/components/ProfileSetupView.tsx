import { useState } from 'react';
import type { User } from 'firebase/auth';
import { CheckCircle2, Loader2, LogOut, ShieldCheck } from 'lucide-react';
import type { UserProfile } from '../types/exam';

interface ProfileSetupViewProps {
  user: User;
  existingProfile: UserProfile | null;
  isOnboarding: boolean;
  onSaveProfile: (
    data: Omit<UserProfile, 'uid' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>;
  onSignOut: () => Promise<void>;
}

const TARGET_EXAM_OPTIONS = [
  'JEE Main 2026',
  'JEE Main 2027',
  'JEE Advanced Practice',
  'Engineering Entrance Mock',
  'Educator / Test Series Author',
];

const CATEGORY_OPTIONS = [
  'Class 12 Aspirant',
  'Dropper / Repeater',
  'Class 11 Foundation',
  'Educator / Coaching Faculty',
];

export function ProfileSetupView({
  user,
  existingProfile,
  isOnboarding,
  onSaveProfile,
  onSignOut,
}: ProfileSetupViewProps) {
  const [displayName, setDisplayName] = useState(
    existingProfile?.displayName ?? user.displayName ?? ''
  );
  const [targetExam, setTargetExam] = useState(
    existingProfile?.targetExam ?? TARGET_EXAM_OPTIONS[0]
  );
  const [candidateCategory, setCandidateCategory] = useState(
    existingProfile?.candidateCategory ?? CATEGORY_OPTIONS[0]
  );
  const [defaultDurationMinutes, setDefaultDurationMinutes] = useState(
    existingProfile?.defaultDurationMinutes ?? 180
  );

  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSavedNotice(null);

    if (!displayName.trim()) {
      setErrorMsg('Please enter your display name.');
      return;
    }

    setSaving(true);
    try {
      await onSaveProfile({
        email: user.email ?? '',
        displayName: displayName.trim().slice(0, 100),
        photoURL: user.photoURL ?? undefined,
        targetExam,
        candidateCategory,
        defaultDurationMinutes: Math.min(
          360,
          Math.max(5, Number(defaultDurationMinutes) || 180)
        ),
      });
      if (!isOnboarding) {
        setSavedNotice('Profile settings saved securely.');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  };

  const initials = (displayName || user.email || 'U')
    .trim()
    .slice(0, 2)
    .toUpperCase();

  const formCard = (
    <div className="bg-white border border-slate-200 rounded-lg p-6 lg:p-8 max-w-2xl w-full space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="flex items-center gap-3.5">
          {user.photoURL && !imgFailed ? (
            <img
              src={user.photoURL}
              alt={displayName || 'User avatar'}
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              className="w-12 h-12 rounded-full object-cover border border-slate-200 shrink-0"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-blue-50 border border-blue-200 text-blue-700 font-display font-bold text-sm flex items-center justify-center shrink-0">
              {initials}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-slate-900">
              {isOnboarding ? 'Create Your Exam Profile' : 'Candidate Profile & Security'}
            </h1>
            <p className="text-xs text-slate-500 truncate">{user.email}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onSignOut}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 self-start sm:self-auto"
        >
          <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
          Sign Out
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label
            htmlFor="profile-display-name"
            className="block text-xs font-medium text-slate-700 mb-1"
          >
            Candidate / Profile Name
          </label>
          <input
            id="profile-display-name"
            type="text"
            maxLength={100}
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Enter your name as shown on CBT header"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="profile-target-exam"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Target Examination
            </label>
            <select
              id="profile-target-exam"
              value={targetExam}
              onChange={(e) => setTargetExam(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {TARGET_EXAM_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="profile-category"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Profile Role / Batch
            </label>
            <select
              id="profile-category"
              value={candidateCategory}
              onChange={(e) => setCandidateCategory(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label
            htmlFor="profile-default-duration"
            className="block text-xs font-medium text-slate-700 mb-1"
          >
            Default CBT Exam Duration (Minutes)
          </label>
          <input
            id="profile-default-duration"
            type="number"
            min={5}
            max={360}
            value={defaultDurationMinutes}
            onChange={(e) => setDefaultDurationMinutes(Number(e.target.value) || 180)}
            className="w-40 px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div className="p-3.5 rounded-md bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            Your papers, answer sheets, and CBT attempts are encrypted in transit and stored under
            your private account ID (<span className="font-mono">{user.uid.slice(0, 10)}…</span>).
            No other user can view or edit your data.
          </span>
        </div>

        {errorMsg && (
          <p role="alert" className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {errorMsg}
          </p>
        )}

        {savedNotice && (
          <p className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2 inline-flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
            {savedNotice}
          </p>
        )}

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 rounded-md hover:bg-blue-800 disabled:opacity-60 transition-colors"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            {isOnboarding ? 'Create Profile & Enter Studio' : 'Save Profile Changes'}
          </button>
        </div>
      </form>
    </div>
  );

  if (isOnboarding) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between">
          <span className="font-display font-bold text-lg text-slate-900">NTA ExamForge</span>
          <span className="text-xs text-slate-500">Step 1 of 1 · Profile Setup</span>
        </header>
        <main className="flex-1 flex items-center justify-center p-6">{formCard}</main>
      </div>
    );
  }

  return <div className="flex justify-center">{formCard}</div>;
}
