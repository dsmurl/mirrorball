import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from "react";
import { useFetchAppConfig } from "../hooks/useFetchAppConfig.ts";
import { HttpError } from "@mirror-ball/shared-schemas/HttpError.ts";
import { AppConfig, defaultAppConfig } from "@mirror-ball/shared-schemas/config.ts";

export type Claims = { email: string; "cognito:groups"?: string[]; [k: string]: any };
export type AuthState = "VALID_USER" | "RESTRICTED_USER" | "VALIDATING" | "NOT_LOGGED_IN";

interface AuthContextType {
  token: string;
  user: Claims | null;
  setToken: (token: string) => void;
  setUser: (user: Claims | null) => void;
  logout: (logoutUrl: string) => void;
  isAdmin: boolean;
  isDeveloper: boolean;
  authState: AuthState;
  appConfig: AppConfig | undefined;
  appConfigError: HttpError | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setToken] = useState("");
  const [user, setUser] = useState<Claims | null>(null);
  const { data: appConfig, error: appConfigError } = useFetchAppConfig(token);

  const authState = useMemo<AuthState>(() => {
    if (!user) return "NOT_LOGGED_IN";

    if (appConfigError && (appConfigError as HttpError).status === 403) {
      return "RESTRICTED_USER";
    }

    if (!appConfig) return "VALIDATING";

    if (!user.email.toLowerCase().includes(appConfig.userRestriction.toLowerCase())) {
      return "RESTRICTED_USER";
    }

    return "VALID_USER";
  }, [appConfig, user, appConfigError]);

  useEffect(() => {
    // 1. Check for token in URL hash (just after a login redirect)
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const idTokenFromUrl = params.get("id_token");

    if (idTokenFromUrl) {
      setToken(idTokenFromUrl);
      localStorage.setItem("id_token", idTokenFromUrl);
      try {
        const payload = JSON.parse(atob(idTokenFromUrl.split(".")[1]));
        setUser(payload);
        // Clean up URL hash
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch (e) {
        console.error("Failed to parse token from URL", e);
      }
      return;
    }

    // 2. Fallback to localStorage (on page refresh)
    const savedToken = localStorage.getItem("id_token");
    if (savedToken) {
      try {
        const payload = JSON.parse(atob(savedToken.split(".")[1]));

        // Check if token is expired (JWT exp is in seconds)
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp && payload.exp < now) {
          console.log("Session expired, clearing token");
          localStorage.removeItem("id_token");
          setToken("");
          setUser(null);
        } else {
          setToken(savedToken);
          setUser(payload);
        }
      } catch (e) {
        console.error("Failed to parse saved token", e);
        localStorage.removeItem("id_token");
      }
    }
  }, []);

  const logout = (logoutUrl: string) => {
    setToken("");
    setUser(null);
    localStorage.removeItem("id_token");
    window.location.href = logoutUrl;
  };

  const isAdmin = user?.["cognito:groups"]?.includes("admin") || false;
  const isDeveloper = user?.["cognito:groups"]?.includes("dev") || false;

  const value = {
    token,
    user,
    setToken,
    setUser,
    logout,
    isAdmin,
    isDeveloper,
    authState,
    appConfig: appConfig,
    appConfigError: appConfigError as HttpError | null,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
