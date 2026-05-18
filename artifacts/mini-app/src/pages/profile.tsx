import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { getInitials } from "@/components/ui-primitives";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  User,
  Bell,
  Globe,
  ChevronRight,
  Calculator,
} from "lucide-react";

const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "2.3.1";
const NOTIF_STORAGE_KEY = "minerva_notif_prefs";

interface NotifPrefs {
  push: boolean;
  sounds: boolean;
  reminders: boolean;
}

const DEFAULT_NOTIF: NotifPrefs = { push: true, sounds: true, reminders: true };

function readNotifPrefs(): NotifPrefs {
  try {
    const raw = localStorage.getItem(NOTIF_STORAGE_KEY);
    if (!raw) return DEFAULT_NOTIF;
    const parsed = JSON.parse(raw) as Partial<NotifPrefs>;
    return { ...DEFAULT_NOTIF, ...parsed };
  } catch {
    return DEFAULT_NOTIF;
  }
}

interface SettingsRow {
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  label: string;
  subtitle: string;
  value?: string;
  onClick?: () => void;
}

function SettingsRowItem({ row }: { row: SettingsRow }) {
  return (
    <button
      onClick={row.onClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-black/[0.03] border-b last:border-0 text-left"
      style={{ borderColor: "#F1F5F9" }}
    >
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: row.iconBg, color: row.iconColor }}
      >
        <row.icon className="w-[18px] h-[18px]" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-semibold" style={{ color: "#0F172A" }}>
          {row.label}
        </div>
        <div className="text-[12px] mt-0.5" style={{ color: "#64748B" }}>
          {row.subtitle}
        </div>
      </div>
      {row.value && (
        <span className="text-[13px] font-medium shrink-0 mr-1" style={{ color: "#64748B" }}>
          {row.value}
        </span>
      )}
      <ChevronRight className="w-4 h-4 shrink-0" style={{ color: "#CBD5E1" }} />
    </button>
  );
}

function PersonalDataSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();

  const role = user?.role ?? "";
  const roleLabel = t(`profile.roles.${role}`, { defaultValue: role || "—" });
  const branchLabel = user?.branch
    ? `${user.branch.name} · ${user.branch.city}`
    : t("profile.noBranch");

  const rows: Array<{ label: string; value: string }> = [
    { label: t("profile.personalSheet.name"), value: user?.name || "—" },
    { label: t("profile.personalSheet.role"), value: roleLabel },
    { label: t("profile.personalSheet.branch"), value: branchLabel },
    { label: t("profile.personalSheet.telegramId"), value: user?.telegramId || "—" },
    { label: t("profile.personalSheet.userId"), value: user?.id ? String(user.id) : "—" },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t("profile.personalSheet.title")}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 rounded-xl overflow-hidden border" style={{ borderColor: "#F1F5F9" }}>
          {rows.map((r, i) => (
            <div
              key={r.label}
              className="flex items-start justify-between gap-3 px-4 py-3"
              style={{
                borderBottom: i < rows.length - 1 ? "1px solid #F1F5F9" : "none",
                background: "#fff",
              }}
            >
              <span className="text-[13px]" style={{ color: "#64748B" }}>
                {r.label}
              </span>
              <span
                className="text-[13px] font-medium text-right break-all"
                style={{ color: "#0F172A" }}
              >
                {r.value}
              </span>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function NotificationsSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  const [prefs, setPrefs] = useState<NotifPrefs>(() => readNotifPrefs());

  const update = (patch: Partial<NotifPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // localStorage can fail in private mode — preference silently stays in-memory
      }
      return next;
    });
  };

  const toggles: Array<{ key: keyof NotifPrefs; label: string; hint: string }> = [
    {
      key: "push",
      label: t("profile.notificationsSheet.push"),
      hint: t("profile.notificationsSheet.pushHint"),
    },
    {
      key: "sounds",
      label: t("profile.notificationsSheet.sounds"),
      hint: t("profile.notificationsSheet.soundsHint"),
    },
    {
      key: "reminders",
      label: t("profile.notificationsSheet.reminders"),
      hint: t("profile.notificationsSheet.remindersHint"),
    },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t("profile.notificationsSheet.title")}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 rounded-xl overflow-hidden bg-white border" style={{ borderColor: "#F1F5F9" }}>
          {toggles.map((row, i) => (
            <label
              key={row.key}
              className="flex items-center gap-3 px-4 py-3.5"
              style={{ borderBottom: i < toggles.length - 1 ? "1px solid #F1F5F9" : "none" }}
            >
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-semibold" style={{ color: "#0F172A" }}>
                  {row.label}
                </div>
                <div className="text-[12px] mt-0.5" style={{ color: "#64748B" }}>
                  {row.hint}
                </div>
              </div>
              <Switch
                checked={prefs[row.key]}
                onCheckedChange={(v) => update({ [row.key]: v } as Partial<NotifPrefs>)}
              />
            </label>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function ProfilePage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const [personalOpen, setPersonalOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const { data: dashboard } = useQuery({
    queryKey: ["mini-dashboard"],
    queryFn: () => api.get("/mini-app/dashboard"),
  });

  const initials = getInitials(user?.name);
  const currentLang = i18n.language === "ru" ? "Русский" : "O'zbek";

  const toggleLanguage = () => {
    const next = i18n.language === "ru" ? "uz" : "ru";
    i18n.changeLanguage(next);
  };

  const heroStats = [
    {
      label: t("home.totalClients"),
      value: dashboard?.totalClients ?? 0,
    },
    {
      label: t("home.clientsToday"),
      value: dashboard?.clientsToday ?? dashboard?.todayTasks ?? 0,
    },
    {
      label: t("profile.rating"),
      value: dashboard?.rating ?? "4.8",
    },
  ];

  const role = user?.role ?? "";
  const roleLabel = t(`profile.roles.${role}`, { defaultValue: role || "—" });
  const branchSuffix = user?.branch
    ? ` · ${user.branch.name}`
    : user?.branchId
      ? ` · #${user.branchId}`
      : "";

  const toolsRows: SettingsRow[] = [
    // Credit Lines tools row hidden 2026-05-18 along with the /credit-lines route.
    // Products tools row hidden 2026-05-09 along with the /products route.
    {
      icon: Calculator,
      iconBg: "#FEF3C7",
      iconColor: "#D97706",
      label: t("nav.calculator"),
      subtitle: t("profile.calculatorHint"),
      onClick: () => navigate("/calculator"),
    },
  ];

  const accountRows: SettingsRow[] = [
    {
      icon: User,
      iconBg: "#DBEAFE",
      iconColor: "#2563EB",
      label: t("profile.personalData"),
      subtitle: t("profile.personalDataHint"),
      onClick: () => setPersonalOpen(true),
    },
    {
      icon: Bell,
      iconBg: "#FEF3C7",
      iconColor: "#D97706",
      label: t("profile.notifications"),
      subtitle: t("profile.notificationsHint"),
      onClick: () => setNotifOpen(true),
    },
    {
      icon: Globe,
      iconBg: "#ECFDF3",
      iconColor: "#16A34A",
      label: t("profile.language"),
      subtitle: t("profile.languageHint"),
      value: currentLang,
      onClick: toggleLanguage,
    },
  ];

  return (
    <div style={{ background: "#F4F4F5" }} className="min-h-screen pb-4">
      {/* ═══════════════ GRADIENT HERO HEADER ═══════════════ */}
      <div
        className="relative overflow-hidden"
        style={{
          background: "linear-gradient(180deg, #14532D 0%, #16A34A 100%)",
          padding: "24px 20px 20px",
        }}
      >
        <div className="flex flex-col items-center text-center">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center font-bold text-[20px] text-white mb-3"
            style={{
              background: "rgba(255,255,255,0.2)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
            }}
          >
            {initials}
          </div>
          <div className="text-[18px] font-bold text-white leading-tight">
            {user?.name || "—"}
          </div>
          <div className="text-[13px] text-white/80 mt-1">
            {roleLabel}
            {branchSuffix}
          </div>
          {user?.telegramId && (
            <div
              className="text-[12px] text-white/60 mt-1"
              style={{ fontFamily: "monospace" }}
            >
              TG: {user.telegramId}
            </div>
          )}
        </div>

        <div className="flex gap-2.5 mt-5">
          {heroStats.map((stat, i) => (
            <div
              key={i}
              className="flex-1 flex flex-col items-center py-3 rounded-xl"
              style={{
                background: "rgba(255,255,255,0.12)",
                backdropFilter: "blur(6px)",
                WebkitBackdropFilter: "blur(6px)",
              }}
            >
              <div className="text-[20px] font-bold text-white leading-none">
                {stat.value}
              </div>
              <div className="text-[11px] text-white/70 mt-1 text-center leading-tight">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ═══════════════ TOOLS SECTION ═══════════════ */}
      <div className="px-4 pt-5">
        <div className="text-[13px] font-bold text-[#0F172A] tracking-[-0.01em] px-1 pb-2">
          {t("profile.tools")}
        </div>
        <div
          className="rounded-2xl overflow-hidden bg-white"
          style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.06)" }}
        >
          {toolsRows.map((row, i) => (
            <SettingsRowItem key={i} row={row} />
          ))}
        </div>
      </div>

      {/* ═══════════════ ACCOUNT SECTION ═══════════════ */}
      <div className="px-4 pt-5">
        <div className="text-[13px] font-bold text-[#0F172A] tracking-[-0.01em] px-1 pb-2">
          {t("profile.account")}
        </div>
        <div
          className="rounded-2xl overflow-hidden bg-white"
          style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.06)" }}
        >
          {accountRows.map((row, i) => (
            <SettingsRowItem key={i} row={row} />
          ))}
        </div>
      </div>

      {/* ═══════════════ VERSION ═══════════════ */}
      <div className="text-center pt-5 pb-2">
        <span
          className="text-[12px]"
          style={{ color: "#94A3B8", fontFamily: "monospace" }}
        >
          {t("profile.version", { version: APP_VERSION })}
        </span>
      </div>

      {/* ═══════════════ SHEETS ═══════════════ */}
      <PersonalDataSheet open={personalOpen} onOpenChange={setPersonalOpen} />
      <NotificationsSheet open={notifOpen} onOpenChange={setNotifOpen} />
    </div>
  );
}
