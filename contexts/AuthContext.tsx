import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Session, User } from "@supabase/supabase-js";
import { createAppUrl, getCurrentAppPathAndSearch } from "../lib/appUrl";
import { isSupabaseConfigured, supabase, supabaseConfigError } from "../lib/supabase";

const ROCKETIUM_EMAIL_SUFFIX = "@rocketium.com";

export const isRocketiumEmail = (email?: string | null) =>
  Boolean(email?.trim().toLowerCase().endsWith(ROCKETIUM_EMAIL_SUFFIX));

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  authError: string | null;
  isRocketiumUser: boolean;
  signInWithGoogle: (redirectTo?: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

const getCurrentRedirectUrl = () => {
  return createAppUrl(getCurrentAppPathAndSearch());
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    if (!isSupabaseConfigured) {
      setAuthError(supabaseConfigError);
      setSession(null);
      setUser(null);
      setLoading(false);
      return () => {
        isMounted = false;
      };
    }

    const applySession = async (nextSession: Session | null) => {
      if (!isMounted) return;

      if (!nextSession) {
        setSession(null);
        setUser(null);
        setLoading(false);
        return;
      }

      const email = nextSession.user.email;
      if (!isRocketiumEmail(email)) {
        setSession(null);
        setUser(null);
        setAuthError("Only @rocketium.com Google accounts can access Rocketium Review.");
        setLoading(false);
        await supabase.auth.signOut();
        return;
      }

      setAuthError(null);
      setSession(nextSession);
      setUser(nextSession.user);
      setLoading(false);
    };

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) {
          setAuthError(error.message);
          setLoading(false);
          return;
        }
        void applySession(data.session);
      })
      .catch((error) => {
        if (!isMounted) return;
        setAuthError(error.message || "Failed to load authentication session.");
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void applySession(nextSession);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async (redirectTo?: string) => {
    setAuthError(null);
    if (!isSupabaseConfigured) {
      const error = { message: supabaseConfigError || "Supabase is not configured." };
      setAuthError(error.message);
      return { error };
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectTo || getCurrentRedirectUrl(),
        queryParams: {
          hd: "rocketium.com",
          prompt: "select_account",
        },
      },
    });

    if (error) {
      setAuthError(error.message);
    }

    return { error };
  }, []);

  const signOut = useCallback(async () => {
    setAuthError(null);
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
  }, []);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  const value = useMemo(
    () => ({
      user,
      session,
      loading,
      authError,
      isRocketiumUser: isRocketiumEmail(user?.email),
      signInWithGoogle,
      signOut,
      clearAuthError,
    }),
    [authError, clearAuthError, loading, session, signInWithGoogle, signOut, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
