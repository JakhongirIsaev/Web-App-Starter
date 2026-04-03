import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { getMe, login as apiLogin, loginWithTelegram, logout as apiLogout, clearToken } from "./api";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        initDataUnsafe?: {
          user?: { id: number; first_name: string; last_name?: string; username?: string };
        };
        ready?: () => void;
        expand?: () => void;
        close?: () => void;
        themeParams?: Record<string, string>;
      };
    };
  }
}

interface User {
  id: number;
  telegramId: string;
  name: string;
  role: string;
  branchId: number | null;
  isActive: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isTelegram: boolean;
  telegramError: string | null;
  detectedTelegramId: string | null;
  login: (telegramId: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isTelegram: false,
  telegramError: null,
  detectedTelegramId: null,
  login: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [telegramError, setTelegramError] = useState<string | null>(null);
  const detectedTelegramId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id?.toString() ?? null;

  const isTelegram = !!(window.Telegram?.WebApp?.initData);

  useEffect(() => {
    if (window.Telegram?.WebApp?.ready) {
      window.Telegram.WebApp.ready();
    }
    if (window.Telegram?.WebApp?.expand) {
      window.Telegram.WebApp.expand();
    }
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem("miniapp_auth_token");
      if (token) {
        try {
          const data = await getMe();
          setUser(data.user || data);
          setLoading(false);
          return;
        } catch {
          clearToken();
        }
      }

      if (isTelegram && window.Telegram?.WebApp?.initData) {
        try {
          const data = await loginWithTelegram(window.Telegram.WebApp.initData);
          setUser(data.user);
        } catch (err: any) {
          setTelegramError(err.message || "Telegram auth failed");
        }
      }

      setLoading(false);
    };

    initAuth();
  }, []);

  const login = useCallback(async (telegramId: string, password: string) => {
    const data = await apiLogin(telegramId.trim(), password);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, isTelegram, telegramError, detectedTelegramId, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
