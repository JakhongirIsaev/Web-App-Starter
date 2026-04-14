import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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

  const useTelegramAccountLabel =
    i18n.language === "ru"
      ? "Вернуться ко входу через Telegram"
      : "Telegram akkauntiga qaytish";

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
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-background">
      <div className="absolute top-4 right-4">
        <Button variant="ghost" size="sm" onClick={toggleLang} className="text-xs font-semibold">
          {i18n.language === "ru" ? "UZ" : "RU"}
        </Button>
      </div>

      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-16 h-16 flex items-center justify-center mx-auto mb-3">
            <MinervaIcon size={56} />
          </div>
          <h1 className="text-xl font-bold text-foreground">{t("app.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("app.subtitle")}</p>
        </div>

        {isTelegram && telegramError && (
          <Card className="mb-4 border-destructive/50">
            <CardContent className="pt-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-destructive">{t("login.telegramAuthFailed")}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t("login.telegramAuthHint")}</p>
                  {detectedTelegramId && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Telegram ID: <span className="font-semibold">{detectedTelegramId}</span>
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {isTelegram && manualTelegramLogin && detectedTelegramId && (
          <Card className="mb-4 border-primary/30 bg-primary/5">
            <CardContent className="pt-4 space-y-3">
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
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">{t("login.title")}</CardTitle>
            <CardDescription>{t("login.subtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium">{t("login.telegramId")}</label>
                <Input
                  value={telegramId}
                  onChange={(e) => setTelegramId(e.target.value)}
                  placeholder={detectedTelegramId || "399083740"}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t("login.password")}</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="********"
                  className="mt-1"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t("login.authenticating") : t("login.signIn")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
