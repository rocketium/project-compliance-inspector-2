import React, { useMemo, useState } from "react";
import { AlertCircle, ExternalLink, LogIn, ShieldCheck, Sparkles } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { createAppUrl, getCurrentAppPathAndSearch } from "../lib/appUrl";

export const Login: React.FC = () => {
  const { authError, clearAuthError, signInWithGoogle } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const isEmbedded = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.parent !== window;
  }, []);

  const handleGoogleSignIn = async () => {
    clearAuthError();
    setLocalError(null);

    if (isEmbedded) {
      window.open(
        createAppUrl(getCurrentAppPathAndSearch()),
        "_blank",
        "noopener,noreferrer"
      );
      return;
    }

    setIsSigningIn(true);
    const { error } = await signInWithGoogle();
    if (error) {
      setLocalError(error.message || "Unable to start Google sign-in.");
      setIsSigningIn(false);
    }
  };

  const visibleError = localError || authError;

  return (
    <div className="min-h-[100dvh] bg-slate-50 dark:bg-zinc-950 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-[460px]">
        <div className="mb-8">
          <div className="inline-flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-3 shadow-sm">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-950 dark:bg-zinc-100">
              <Sparkles className="h-5 w-5 text-white dark:text-zinc-950" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-zinc-500">
                Protected Workspace
              </p>
              <h1 className="text-xl font-semibold tracking-tight text-slate-950 dark:text-zinc-100">
                Rocketium Review
              </h1>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 shadow-sm">
          <div className="mb-6">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-zinc-900 dark:text-zinc-200">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-zinc-100">
              Sign in with Google
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-zinc-400">
              Access is limited to verified Rocketium Google accounts.
            </p>
          </div>

          {visibleError && (
            <div className="mb-5 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{visibleError}</span>
            </div>
          )}

          {isEmbedded && (
            <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
              Google sign-in opens in the main app tab. After signing in, refresh the side panel.
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isSigningIn}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white dark:disabled:bg-zinc-700 dark:disabled:text-zinc-400"
          >
            {isEmbedded ? (
              <ExternalLink className="h-4 w-4" />
            ) : (
              <LogIn className="h-4 w-4" />
            )}
            {isSigningIn
              ? "Opening Google..."
              : isEmbedded
              ? "Open Sign-In Tab"
              : "Continue With Google"}
          </button>

          <p className="mt-4 text-xs leading-5 text-slate-500 dark:text-zinc-500">
            Non-Rocketium accounts are automatically signed out.
          </p>
        </div>
      </div>
    </div>
  );
};
