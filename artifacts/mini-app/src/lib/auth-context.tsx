import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { getMe, login as apiLogin, loginWithTelegram, logout as apiLogout, clearToken } from "./api";
import { getDetectedTelegramId, getTelegramInitData, isTelegramWebApp } from "./telegram";

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
  manualTelegramLogin: boolean;
  login: (telegramId: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  resumeTelegramAutoLogin: () => Promise<void>;
}

const MANUAL_TELEGRAM_LOGIN_KEY = "minerva_manual_telegram_login";

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isTelegram: false,
  telegramError: null,
  detectedTelegramId: null,
  manualTelegramLogin: false,
  login: async () => {},
  logout: async () => {},
  resumeTelegramAutoLogin: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [telegramError, setTelegramError] = useState<string | null>(null);
  const [manualTelegramLogin, setManualTelegramLogin] = useState(
    () => localStorage.getItem(MANUAL_TELEGRAM_LOGIN_KEY) === "1",
  );
  const detectedTelegramId = getDetectedTelegramId();
  const isTelegram = isTelegramWebApp();

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

      if (isTelegram && !manualTelegramLogin && getTelegramInitData()) {
        try {
          const data = await loginWithTelegram(getTelegramInitData()!);
          setUser(data.user);
        } catch (err: any) {
          setTelegramError(err.message || "Telegram auth failed");
        }
      }

      setLoading(false);
    };

    initAuth();
  }, [isTelegram, manualTelegramLogin]);

  const login = useCallback(async (telegramId: string, password: string) => {
    if (isTelegram) {
      localStorage.setItem(MANUAL_TELEGRAM_LOGIN_KEY, "1");
      setManualTelegramLogin(true);
    }
    setTelegramError(null);
    const data = await apiLogin(telegramId.trim(), password);
    setUser(data.user);
  }, [isTelegram]);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
    setTelegramError(null);
    if (isTelegram) {
      localStorage.setItem(MANUAL_TELEGRAM_LOGIN_KEY, "1");
      setManualTelegramLogin(true);
    }
  }, [isTelegram]);

  const resumeTelegramAutoLogin = useCallback(async () => {
    localStorage.removeItem(MANUAL_TELEGRAM_LOGIN_KEY);
    setManualTelegramLogin(false);
    setTelegramError(null);
    setLoading(true);
    clearToken();
    setUser(null);

    const initData = getTelegramInitData();
    if (!isTelegram || !initData) {
      setLoading(false);
      return;
    }

    try {
      const data = await loginWithTelegram(initData);
      setUser(data.user);
    } catch (err: any) {
      setTelegramError(err.message || "Telegram auth failed");
    } finally {
      setLoading(false);
    }
  }, [isTelegram]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isTelegram,
        telegramError,
        detectedTelegramId,
        manualTelegramLogin,
        login,
        logout,
        resumeTelegramAutoLogin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
