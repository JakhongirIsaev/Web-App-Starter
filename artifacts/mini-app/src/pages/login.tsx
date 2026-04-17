import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertCircle, Loader2 } from "lucide-react";
import { MinervaIcon } from "@/components/minerva-logo";

export default function LoginPage() {
  const { t, i18n } = useTranslation();
  const {
    login,
    isTelegram,
    telegramError,
    detectedTelegramId,
    loading: authLoading,
    manualTelegramLogin,
    resumeTelegramAutoLogin,
  } = useAuth();
  const [telegramId, setTelegramId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (telegramId) {
      return;
    }

    if (detectedTelegramId) {
      setTelegramId(detectedTelegramId);
    }
  }, [detectedTelegramId, telegramId]);

  const useTelegramAccountLabel = t("login.backToTelegram");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(telegramId.trim(), password);
    } catch {
      setError(t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  const toggleLang = () => {
    const next = i18n.language === "ru" ? "uz" : "ru";
    i18n.changeLanguage(next);
    localStorage.setItem("minerva_miniapp_lang", next);
  };

  if (isTelegram && authLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
        <p className="text-sm text-muted-foreground">{t("login.authenticating")}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#f5f5f5]">
      {/* ═══════════════ GRADIENT HERO (~50% screen) ═══════════════ */}
      <div
        className="relative flex flex-col items-center justify-center"
        style={{
          background: "linear-gradient(180deg, #0D3D1A 0%, #155D27 60%, #1A7A32 100%)",
          minHeight: "50vh",
        }}
      >
        {/* SVG vertical stripe overlay at 8% opacity */}
        <svg
          className="absolute inset-0 w-full h-full opacity-[0.08] pointer-events-none"
          preserveAspectRatio="none"
        >
          <defs>
            <pattern id="login-stripes" width="16" height="100" patternUnits="userSpaceOnUse">
              <rect x="0" y="0" width="2" height="100" fill="#fff" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#login-stripes)" />
        </svg>

        {/* Language toggle — top-right corner */}
        <div className="absolute top-4 right-4 z-10">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleLang}
            className="text-xs font-semibold text-white/80 hover:text-white hover:bg-white/10"
          >
            {i18n.language === "ru" ? "UZ" : "RU"}
          </Button>
        </div>

        {/* Centered logo + branding */}
        <div className="relative z-10 flex flex-col items-center gap-3">
          <MinervaIcon size={64} />
          <h1 className="text-[22px] font-bold text-white tracking-tight">
            {t("app.title")}
          </h1>
          <p className="text-[13px] text-white/70 font-medium">
            {t("app.subtitle")}
          </p>
        </div>
      </div>

      {/* ═══════════════ WHITE CARD (slides up over gradient) ═══════════════ */}
      <div
        className="relative bg-white rounded-t-2xl -mt-6 flex-1 px-5 pt-7 pb-8"
        style={{ boxShadow: "0 -4px 20px rgba(0,0,0,0.08)" }}
      >
        {/* Telegram error alert */}
        {isTelegram && telegramError && (
          <div className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200/60">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-700">{t("login.telegramAuthFailed")}</p>
                <p className="text-xs text-red-500/80 mt-1">{t("login.telegramAuthHint")}</p>
              </div>
            </div>
          </div>
        )}

        {/* Resume Telegram auto-login */}
        {isTelegram && manualTelegramLogin && detectedTelegramId && (
          <div className="mb-5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => void resumeTelegramAutoLogin()}
              disabled={loading || authLoading}
            >
              {useTelegramAccountLabel}
            </Button>
          </div>
        )}

        {/* Detected Telegram ID chip */}
        {detectedTelegramId && (
          <div className="flex items-center justify-center mb-5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[hsl(142_65%_42%/0.1)] text-[hsl(142_65%_30%)] text-xs font-semibold">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
              </svg>
              Telegram ID: {detectedTelegramId}
            </span>
          </div>
        )}

        {/* Login form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Telegram ID — only show editable field when NOT auto-detected */}
          {!detectedTelegramId && (
            <div>
              <label className="text-sm font-medium text-[hsl(150_40%_8%)]">
                {t("login.telegramId")}
              </label>
              <Input
                value={telegramId}
                onChange={(e) => setTelegramId(e.target.value)}
                placeholder="399083740"
                className="mt-1.5 h-11 rounded-xl bg-[#f8f9fa] border-[hsl(140_15%_90%)] focus:border-[hsl(142_71%_40%)] focus:ring-[hsl(142_71%_40%/0.2)]"
              />
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-[hsl(150_40%_8%)]">
              {t("login.password")}
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="********"
              className="mt-1.5 h-11 rounded-xl bg-[#f8f9fa] border-[hsl(140_15%_90%)] focus:border-[hsl(142_71%_40%)] focus:ring-[hsl(142_71%_40%/0.2)]"
            />
          </div>

          {error && <p className="text-sm text-red-600 font-medium">{error}</p>}

          <Button
            type="submit"
            className="w-full h-12 rounded-xl text-[15px] font-semibold bg-[hsl(142_71%_40%)] hover:bg-[hsl(142_71%_35%)] text-white shadow-[0_2px_8px_rgba(34,197,94,0.3)]"
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              t("login.signIn")
            )}
          </Button>
        </form>

        {/* Admin contact hint */}
        <p className="text-center text-xs text-[hsl(150_10%_55%)] mt-6 leading-relaxed">
          {t("login.subtitle")}
        </p>
      </div>
    </div>
  );
}
