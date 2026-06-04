import React, { useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  LogIn,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { createAppUrl, getCurrentAppPathAndSearch } from "../lib/appUrl";

const trustSignals = [
  "Rocketium Google account required",
  "Project reviews stay with your account",
  "Brand rules ready after sign-in",
];

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
    <div className="min-h-[100dvh] bg-[#f8f8f6] text-zinc-950 dark:bg-[#111113] dark:text-zinc-100">
      <main className="mx-auto grid min-h-[100dvh] w-full max-w-7xl grid-cols-1 gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.72fr)] lg:px-8 lg:py-8">
        <section className="flex min-h-[420px] flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-6 shadow-[0_24px_80px_rgba(24,24,27,0.08)] dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-black/30 sm:p-8 lg:min-h-[calc(100dvh-4rem)]">
          <div className="flex items-center gap-3">
            <span className="rr-logo-tile flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl">
              <img
                src="/rocketium-review-logo.png"
                alt="Rocketium Review"
                className="h-full w-full object-cover"
              />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                Rocketium Review
              </h1>
            </div>
          </div>

          <div className="mt-14 max-w-3xl lg:mt-0">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#e9c575]/50 bg-[#fbf4e6] px-3 py-1 text-xs font-medium text-[#946713] dark:border-[#6f4c0e]/80 dark:bg-[#2a2215] dark:text-[#e9c575]">
              <ShieldCheck className="h-3.5 w-3.5" />
              Rocketium access only
            </div>
            <h2 className="max-w-2xl text-[clamp(2.6rem,6vw,5.6rem)] font-semibold leading-[0.95] tracking-tight text-zinc-950 dark:text-zinc-50">
              Review creative compliance with calmer control.
            </h2>
            <p className="mt-6 max-w-xl text-base leading-7 text-zinc-600 dark:text-zinc-400">
              Sign in to inspect projects, validate brand rules, and keep every
              compliance check tied to a verified Rocketium account.
            </p>
          </div>

          <div className="mt-12 grid gap-3 sm:grid-cols-3 lg:mt-0">
            {trustSignals.map((signal) => (
              <div
                key={signal}
                className="flex items-start gap-2 border-t border-zinc-200 pt-3 text-sm leading-5 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#b98219]" />
                <span>{signal}</span>
              </div>
            ))}
          </div>
        </section>

        <aside className="flex items-center lg:min-h-[calc(100dvh-4rem)]">
          <div className="rr-panel w-full rounded-2xl p-5 dark:bg-zinc-950 sm:p-6">
            <div className="mb-6">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950">
                <LogIn className="h-5 w-5" />
              </div>
              <h3 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                Continue with Google
              </h3>
              <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                Use your @rocketium.com account. Other domains are signed out
                automatically.
              </p>
            </div>

            {visibleError && (
              <div className="mb-5 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{visibleError}</span>
              </div>
            )}

            {isEmbedded && (
              <div className="mb-5 rounded-xl border border-[#e9c575]/60 bg-[#fbf4e6] px-4 py-3 text-sm leading-6 text-[#6f4c0e] dark:border-[#6f4c0e]/70 dark:bg-[#2a2215] dark:text-[#e9c575]">
                Google sign-in opens in the main app tab. After signing in,
                refresh the side panel.
              </div>
            )}

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isSigningIn}
              aria-busy={isSigningIn}
              className="rr-button-primary rr-focus-ring flex w-full items-center justify-center gap-2 px-4 py-3 text-sm font-semibold"
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
                : "Sign in with Google"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </aside>
      </main>
    </div>
  );
};
