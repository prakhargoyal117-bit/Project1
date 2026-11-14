import { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { Lock, ShieldCheck, Loader2, AlertCircle } from 'lucide-react';
import { auth, googleProvider } from '../firebase';
import { MathText } from './MathText';

export function LoginScreen() {
  const [signingIn, setSigningIn] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    setErrorMsg(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const code = (err as { code?: string })?.code ?? '';
      if (code === 'auth/popup-closed-by-user') {
        setErrorMsg('Sign-in popup was closed before completing authentication.');
      } else if (code === 'auth/popup-blocked') {
        setErrorMsg('Browser blocked the Google sign-in popup. Please allow popups for this site and try again.');
      } else if (code === 'auth/unauthorized-domain') {
        setErrorMsg('This domain is not yet authorized in Firebase Auth settings.');
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Unable to sign in with Google.');
      }
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      <header className="h-16 bg-white border-b border-slate-200 px-6 lg:px-10 flex items-center justify-between">
        <span className="font-display font-bold text-lg tracking-tight text-slate-900">
          NTA ExamForge
        </span>
        <span className="text-xs font-medium text-slate-500">
          Windows &amp; Web CBT Workspace
        </span>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-4xl w-full grid grid-cols-1 lg:grid-cols-12 bg-white border border-slate-200 rounded-lg overflow-hidden">
          {/* Left Context Column */}
          <div className="lg:col-span-7 p-8 lg:p-10 bg-slate-900 text-white flex flex-col justify-between gap-8">
            <div className="space-y-4">
              <p className="text-xs font-medium text-blue-300">
                JEE Main CBT &amp; PDF Extraction Studio
              </p>
              <h1 className="text-2xl lg:text-3xl font-bold tracking-tight leading-tight text-balance">
                Convert question PDFs into timed NTA CBT exams
              </h1>
              <p className="text-sm text-slate-300 leading-relaxed">
                Upload multi-page question papers and answer sheets, inspect KaTeX mathematical
                expressions, practice in authentic NTA Computer-Based Test mode, and store your
                datasets securely under your personal profile.
              </p>
            </div>

            <div className="bg-slate-800/80 border border-slate-700 rounded-md p-4 space-y-2">
              <p className="text-xs font-medium text-slate-400">Sample Extracted Notation</p>
              <div className="text-sm text-slate-100 overflow-x-auto">
                <MathText text="$$I = \int_{-\pi/2}^{\pi/2} \frac{\cos^2 x}{1 + 3^x}\,dx \quad \cdot \quad S = \sum_{n=1}^{\infty} \frac{n}{3^n}$$" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-800 text-xs text-slate-300">
              <div className="flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
                <span>Private per-user Firestore isolation for papers and scorecards</span>
              </div>
              <div className="flex items-start gap-2">
                <Lock className="w-4 h-4 text-blue-300 shrink-0 mt-0.5" aria-hidden="true" />
                <span>Verified Google Sign-In with custom candidate profile</span>
              </div>
            </div>
          </div>

          {/* Right Sign-In Action Column */}
          <div className="lg:col-span-5 p-8 lg:p-10 flex flex-col justify-center space-y-6">
            <div className="space-y-1.5">
              <h2 className="text-xl font-bold text-slate-900">Sign in to your workspace</h2>
              <p className="text-sm text-slate-600">
                Sign in with Google to create your personal profile and keep your uploaded PDFs,
                answer keys, and test attempts private.
              </p>
            </div>

            {errorMsg && (
              <div
                role="alert"
                className="p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{errorMsg}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={signingIn}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 text-sm font-semibold text-slate-900 bg-white border border-slate-300 rounded-md hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 disabled:opacity-60 transition-colors"
            >
              {signingIn ? (
                <Loader2 className="w-4 h-4 animate-spin text-blue-700" aria-hidden="true" />
              ) : (
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                  />
                </svg>
              )}
              <span>{signingIn ? 'Signing in...' : 'Continue with Google'}</span>
            </button>

            <p className="text-xs text-slate-500 leading-relaxed">
              Your datasets, answer keys, and scores are scoped exclusively to your verified Google
              UID via Firestore security rules.
            </p>
          </div>
        </div>
      </main>

      <footer className="py-4 px-6 text-center text-xs text-slate-500 border-t border-slate-200 bg-white">
        NTA ExamForge Studio · Secure Per-User CBT Simulation Workspace
      </footer>
    </div>
  );
}
