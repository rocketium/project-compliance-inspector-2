import React, { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  // Authentication disabled - using mock user
  const mockUser = {
    id: "mock-user-id",
    email: "demo@local.dev",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
  } as User;

  const [user, setUser] = useState<User | null>(mockUser);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Authentication disabled - no-op
    // Original authentication code commented out for easy re-enabling
    /*
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      // Validate email domain on session load
      if (
        session?.user?.email &&
        !session.user.email.endsWith("@rocketium.com")
      ) {
        // Sign out if email doesn't match domain
        supabase.auth.signOut();
        setSession(null);
        setUser(null);
      } else {
        setSession(session);
        setUser(session?.user ?? null);
      }
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      // Validate email domain on auth state change
      if (
        session?.user?.email &&
        !session.user.email.endsWith("@rocketium.com")
      ) {
        // Sign out if email doesn't match domain
        supabase.auth.signOut();
        setSession(null);
        setUser(null);
      } else {
        setSession(session);
        setUser(session?.user ?? null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
    */
  }, []);

  const signIn = async (email: string, password: string) => {
    // Authentication disabled - no-op
    return { error: null };
  };

  const signUp = async (email: string, password: string) => {
    // Authentication disabled - no-op
    return { error: null };
  };

  const signOut = async () => {
    // Authentication disabled - no-op
    console.log("Sign out called (authentication disabled)");
  };

  const value = {
    user,
    session,
    loading,
    signIn,
    signUp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
