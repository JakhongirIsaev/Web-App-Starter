declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        initDataUnsafe?: {
          user?: {
            id: number;
            first_name: string;
            last_name?: string;
            username?: string;
          };
        };
        ready?: () => void;
        expand?: () => void;
        close?: () => void;
        themeParams?: Record<string, string>;
      };
    };
  }
}

export function getTelegramInitData(): string | null {
  return window.Telegram?.WebApp?.initData?.trim() || null;
}

export function getDetectedTelegramId(): string | null {
  return window.Telegram?.WebApp?.initDataUnsafe?.user?.id?.toString() ?? null;
}

export function isTelegramWebApp(): boolean {
  return Boolean(getTelegramInitData());
}
