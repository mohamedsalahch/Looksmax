"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import {
  clearAuthToken,
  getStoredAuthToken,
  getTokenExpiryMs,
  refreshStoreAuthToken,
  storeAuthToken,
  withAuthRequest,
} from "@/lib/authClient";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  googleId?: string | null;
  address?: {
    street: string;
    city: string;
    state: string;
    zip: string;
      phone: string;
  };
  bodyProfile?: {
    heightCm: string;
    weightKg: string;
    topSize: string;
    bottomSize: string;
    shoeSize: string;
    profileImage: string;
    profileImageEnhanced: string;
    profileImageUploadCount: number;
    outfitGenerationCount: number;
    gender: string;
    imageEnhancing: boolean;
    profileImageRequiresGeneration: boolean;
  };
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  loginWithGoogle: (credential: string) => Promise<{ error?: string }>;
  signup: (
    name: string,
    email: string,
    password: string
  ) => Promise<{ error?: string; verificationRequired?: boolean; message?: string }>;
  forgotPassword: (
    email: string
  ) => Promise<{ error?: string; message?: string; retryAfterSeconds?: number }>;
  resendVerification: (
    email: string
  ) => Promise<{ error?: string; message?: string; retryAfterSeconds?: number }>;
  resetPassword: (
    email: string,
    token: string,
    password: string
  ) => Promise<{ error?: string; message?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshTimerRef = useRef<number | null>(null);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current === null) return;
    window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = null;
  }, []);

  const scheduleTokenRefresh = useCallback((token?: string | null) => {
    clearRefreshTimer();
    const currentToken = token || getStoredAuthToken();
    if (!currentToken) return;

    const expiryMs = getTokenExpiryMs(currentToken);
    if (!expiryMs) return;

    const refreshLeadMs = 2 * 60 * 1000;
    const delayMs = Math.max(expiryMs - Date.now() - refreshLeadMs, 60 * 1000);

    const nextTimerId = window.setTimeout(async () => {
      try {
        const nextToken = await refreshStoreAuthToken();
        if (!nextToken) {
          clearAuthToken();
          setUser(null);
          return;
        }
        scheduleTokenRefresh(nextToken);
      } catch {
        clearAuthToken();
        setUser(null);
      }
    }, delayMs);

    refreshTimerRef.current = nextTimerId;
  }, [clearRefreshTimer]);

  const refreshUser = useCallback(async () => {
    try {
      const res = await fetch(`/api/auth/me?ts=${Date.now()}`, withAuthRequest({ cache: "no-store" }));
      if (!res.ok) {
        setUser(null);
        return;
      }
      const data = await res.json();
      setUser(data.user || null);
      scheduleTokenRefresh();
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [scheduleTokenRefresh]);

  useEffect(() => {
    refreshUser();
    return () => clearRefreshTimer();
  }, [clearRefreshTimer, refreshUser]);

  const login = async (email: string, password: string) => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error };
      if (data.token) {
        storeAuthToken(data.token);
        scheduleTokenRefresh(data.token);
      }
      setUser(data.user);
      return {};
    } catch {
      return { error: "Network error" };
    }
  };

  const loginWithGoogle = async (credential: string) => {
    try {
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ credential }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error || "Unable to sign in with Google" };
      if (data.token) {
        storeAuthToken(data.token);
        scheduleTokenRefresh(data.token);
      }
      setUser(data.user);
      return {};
    } catch {
      return { error: "Network error" };
    }
  };

  const signup = async (name: string, email: string, password: string) => {
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error };
      return {
        verificationRequired: Boolean(data.verificationRequired),
        message: data.message,
      };
    } catch {
      return { error: "Network error" };
    }
  };

  const forgotPassword = async (email: string) => {
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error, retryAfterSeconds: data.retryAfterSeconds };
      return { message: data.message };
    } catch {
      return { error: "Network error" };
    }
  };

  const resendVerification = async (email: string) => {
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error, retryAfterSeconds: data.retryAfterSeconds };
      return { message: data.message };
    } catch {
      return { error: "Network error" };
    }
  };

  const resetPassword = async (email: string, token: string, password: string) => {
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, token, password }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error };
      return { message: data.message };
    } catch {
      return { error: "Network error" };
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    clearAuthToken();
    clearRefreshTimer();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        loginWithGoogle,
        signup,
        forgotPassword,
        resendVerification,
        resetPassword,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
