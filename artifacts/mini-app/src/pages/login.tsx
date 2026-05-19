import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { AlertCircle, Loader2, Shield, Zap, BarChart3, Users } from "lucide-react";

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
    if (telegramId) return;
    if (detectedTelegramId) setTelegramId(detectedTelegramId);
  }, [detectedTelegramId, telegramId]);

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

  const handleDemoLogin = async () => {
    setLoading(true);
    setError("");
    try {
      await login("demo", "demo");
    } catch {
      setError(t("login.invalidCredentials", { defaultValue: t("common.error") }));
    } finally {
      setLoading(false);
    }
  };

  const toggleLang = () => {
    const next = i18n.language === "ru" ? "uz" : "ru";
    i18n.changeLanguage(next);
    localStorage.setItem("minerva_miniapp_lang", next);
  };

  /* ── Auto-login spinner ── */
  if (isTelegram && authLoading) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-4"
        style={{ background: "linear-gradient(180deg, #272424 0%, #3A3636 45%, #4A4444 100%)" }}
      >
        <Loader2 className="w-8 h-8 animate-spin text-white/80 mb-3" />
        <p className="text-[14px] text-white/60">{t("login.authenticating")}</p>
      </div>
    );
  }

  /* ── Equalizer bar heights (sine curve) ── */
  const barCount = 9;
  const bars = Array.from({ length: barCount }, (_, i) => {
    const factor = 0.5 + Math.sin((i / (barCount - 1)) * Math.PI) * 0.5;
    return {
      height: 24 + factor * 48,
      color: i < barCount / 2 ? "#FFD531" : "#FFE066",
      opacity: 0.6 + (i / barCount) * 0.4,
    };
  });

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#F4F4F5" }}>
      {/* ═══════════════ FULL-BLEED GRADIENT HERO ═══════════════ */}
      <div
        className="relative flex flex-col items-center justify-center shrink-0"
        style={{
          background: "linear-gradient(180deg, #272424 0%, #3A3636 45%, #4A4444 100%)",
          minHeight: "46vh",
          paddingTop: 48,
          paddingBottom: 56,
        }}
      >
        {/* Language toggle */}
        <div className="absolute top-4 right-4 z-10">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleLang}
            className="text-xs font-semibold text-white/70 hover:text-white hover:bg-white/10 rounded-full px-3"
          >
            {i18n.language === "ru" ? "UZ" : "RU"}
          </Button>
        </div>

        {/* Decorative equalizer bars */}
        <div className="flex items-end gap-[3px] mb-6" style={{ height: 72 }}>
          {bars.map((bar, i) => (
            <div
              key={i}
              className="rounded-full"
              style={{
                width: 6,
                height: bar.height,
                background: bar.color,
                opacity: bar.opacity,
              }}
            />
          ))}
        </div>

        {/* Wordmark */}
        <div className="relative z-10 flex flex-col items-center text-center">
          <h1
            className="text-[34px] font-extrabold leading-none"
            style={{ color: "#fff" }}
          >
            Minerva
          </h1>
          <p
            className="text-[13px] font-medium mt-2"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            Credit Hunter &middot; {t("app.subtitle")}
          </p>
        </div>
      </div>

      {/* ═══════════════ AUTH CARD AREA ═══════════════ */}
      <div
        className="relative flex-1 -mt-6"
        style={{
          background: "#fff",
          borderRadius: "20px 20px 0 0",
          boxShadow: "0 -8px 24px rgba(0,0,0,0.08)",
        }}
      >
        <div className="px-5 pt-7 pb-8">
          {/* Shield icon + heading */}
          <div className="flex flex-col items-center text-center mb-6">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
              style={{ background: "#FFF7D6", color: "#6B5C00" }}
            >
              <Shield className="w-6 h-6" />
            </div>
            <h2 className="text-[17px] font-bold" style={{ color: "#0F172A" }}>
              {t("login.signIn")}
            </h2>
            <p className="text-[13px] mt-1" style={{ color: "#94A3B8" }}>
              {t("login.telegramAuthHint")}
            </p>
          </div>

          {/* Telegram error alert */}
          {isTelegram && telegramError && (
            <div
              className="mb-5 p-3.5 rounded-xl flex items-start gap-2.5"
              style={{ background: "#FEF2F2", border: "1px solid rgba(239,68,68,0.15)" }}
            >
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "#EF4444" }} />
              <div>
                <p className="text-[13px] font-semibold" style={{ color: "#B91C1C" }}>
                  {t("login.telegramAuthFailed")}
                </p>
                <p className="text-[12px] mt-0.5" style={{ color: "#EF4444", opacity: 0.8 }}>
                  {t("login.telegramAuthHint")}
                </p>
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
                className="w-full rounded-xl"
                onClick={() => void resumeTelegramAutoLogin()}
                disabled={loading || authLoading}
              >
                {t("login.backToTelegram")}
              </Button>
            </div>
          )}

          {/* User info grid (if Telegram detected) */}
          {detectedTelegramId && (
            <div
              className="mn-card p-4 mb-5 grid gap-3"
              style={{ gridTemplateColumns: "1fr 1fr" }}
            >
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#94A3B8" }}>
                  {t("login.telegramId")}
                </p>
                <p className="text-[14px] font-bold mt-0.5" style={{ color: "#0F172A" }}>
                  {detectedTelegramId}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#94A3B8" }}>
                  {t("login.status")}
                </p>
                <p className="text-[14px] font-bold mt-0.5" style={{ color: "#272424" }}>
                  {t("login.detected")}
                </p>
              </div>
            </div>
          )}

          {/* Blue info hint box */}
          <div
            className="rounded-xl p-3.5 mb-5 flex items-start gap-2.5"
            style={{ background: "#EFF6FF" }}
          >
            <svg
              className="w-4 h-4 shrink-0 mt-0.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#3B82F6"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
            <p className="text-[12px] leading-relaxed" style={{ color: "#1E40AF" }}>
              {t("login.subtitle")}
            </p>
          </div>

          <div
            className="rounded-xl p-3.5 mb-5"
            style={{ background: "#FFF7D6", border: "1px solid rgba(255,213,49,0.45)" }}
          >
            <p className="text-[13px] font-semibold mb-1" style={{ color: "#272424" }}>
              {t("login.demoTitle", { defaultValue: "Гостевой доступ" })}
            </p>
            <p className="text-[12px] mb-3" style={{ color: "#6B5C00", opacity: 0.78 }}>
              {t("login.demoSubtitle", { defaultValue: "Откройте демонстрационный режим без личного аккаунта." })}
            </p>
            <Button
              type="button"
              variant="outline"
              className="w-full h-10 rounded-xl text-[14px] font-semibold bg-white"
              onClick={handleDemoLogin}
              disabled={loading || authLoading}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                t("login.demoAction", { defaultValue: "Войти как гость" })
              )}
            </Button>
          </div>

          {/* Login form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Telegram ID field — only when NOT auto-detected */}
            {!detectedTelegramId && (
              <div>
                <label className="mn-label">{t("login.telegramId")}</label>
                <input
                  value={telegramId}
                  onChange={(e) => setTelegramId(e.target.value)}
                  placeholder="123456789"
                  className="mn-input"
                />
              </div>
            )}

            <div>
              <label className="mn-label">{t("login.password")}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="********"
                className="mn-input"
              />
            </div>

            {error && (
              <p className="text-[13px] font-medium" style={{ color: "#EF4444" }}>{error}</p>
            )}

            <Button
              type="submit"
              className="w-full h-12 rounded-xl text-[15px] font-semibold"
              style={{
                background: "#FFD531",
                color: "#272424",
                boxShadow: "0 2px 8px rgba(255,213,49,0.4)",
              }}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                t("login.signIn")
              )}
            </Button>
          </form>

          {/* Benefits list */}
          <div className="mt-8 space-y-3">
            {[
              { icon: Zap, label: t("login.benefit1") },
              { icon: BarChart3, label: t("login.benefit2") },
              { icon: Users, label: t("login.benefit3") },
            ].map((item, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: "#F8FAFC" }}
                >
                  <item.icon className="w-4 h-4" style={{ color: "#64748B" }} />
                </div>
                <span className="text-[13px]" style={{ color: "#64748B" }}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>

          {/* Consent text */}
          <p
            className="text-center text-[11px] leading-relaxed mt-6"
            style={{ color: "#94A3B8" }}
          >
            {t("login.consent")}
          </p>
        </div>
      </div>
    </div>
  );
}
