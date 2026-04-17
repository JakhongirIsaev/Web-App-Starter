import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { getInitials } from "@/components/ui-primitives";
import {
  User,
  Bell,
  Globe,
  Shield,
  Target,
  Calendar,
  GraduationCap,
  ChevronRight,
  LogOut,
} from "lucide-react";

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

export default function ProfilePage() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();

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
      label: "Рейтинг",
      value: dashboard?.rating ?? "4.8",
    },
  ];

  const accountRows: SettingsRow[] = [
    {
      icon: User,
      iconBg: "#DBEAFE",
      iconColor: "#2563EB",
      label: "Личные данные",
      subtitle: "Имя, телефон, email",
    },
    {
      icon: Bell,
      iconBg: "#FEF3C7",
      iconColor: "#D97706",
      label: "Уведомления",
      subtitle: "Push, звуки, напоминания",
    },
    {
      icon: Globe,
      iconBg: "#ECFDF3",
      iconColor: "#16A34A",
      label: "Язык",
      subtitle: "Язык интерфейса приложения",
      value: currentLang,
      onClick: toggleLanguage,
    },
    {
      icon: Shield,
      iconBg: "#FAF5FF",
      iconColor: "#7C3AED",
      label: "Безопасность",
      subtitle: "Пароль, двухфакторная аутентификация",
    },
  ];

  const workRows: SettingsRow[] = [
    {
      icon: Target,
      iconBg: "#ECFDF3",
      iconColor: "#16A34A",
      label: "Цели и KPI",
      subtitle: "План продаж и показатели",
    },
    {
      icon: Calendar,
      iconBg: "#DBEAFE",
      iconColor: "#2563EB",
      label: "График работы",
      subtitle: "Смены и расписание",
    },
    {
      icon: GraduationCap,
      iconBg: "#FEF3C7",
      iconColor: "#D97706",
      label: "Обучение",
      subtitle: "Курсы и сертификаты",
    },
  ];

  const roleName =
    user?.role === "branch_head"
      ? "Руководитель филиала"
      : user?.role === "manager"
        ? "Менеджер"
        : user?.role || "Сотрудник";

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
        {/* Avatar + Name + Role */}
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
          <div
            className="text-[18px] font-bold text-white leading-tight"
          >
            {user?.name || "—"}
          </div>
          <div className="text-[13px] text-white/80 mt-1">
            {roleName}
            {user?.branchId ? ` · Филиал ${user.branchId}` : ""}
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

        {/* 3-stat glass row */}
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

      {/* ═══════════════ ACCOUNT SECTION ═══════════════ */}
      <div className="px-4 pt-5">
        <div className="text-[13px] font-bold text-[#0F172A] tracking-[-0.01em] px-1 pb-2">
          Аккаунт
        </div>
        <div className="rounded-2xl overflow-hidden bg-white" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.06)" }}>
          {accountRows.map((row, i) => (
            <SettingsRowItem key={i} row={row} />
          ))}
        </div>
      </div>

      {/* ═══════════════ WORK SECTION ═══════════════ */}
      <div className="px-4 pt-5">
        <div className="text-[13px] font-bold text-[#0F172A] tracking-[-0.01em] px-1 pb-2">
          Работа
        </div>
        <div className="rounded-2xl overflow-hidden bg-white" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.06)" }}>
          {workRows.map((row, i) => (
            <SettingsRowItem key={i} row={row} />
          ))}
        </div>
      </div>

      {/* ═══════════════ LOGOUT BUTTON ═══════════════ */}
      <div className="px-4 pt-6">
        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-[14px] font-semibold"
          style={{
            border: "1.5px solid #FCA5A5",
            color: "#DC2626",
            background: "#fff",
          }}
        >
          <LogOut className="w-[18px] h-[18px]" />
          Выйти из Minerva
        </button>
      </div>

      {/* ═══════════════ VERSION ═══════════════ */}
      <div className="text-center pt-5 pb-2">
        <span
          className="text-[12px]"
          style={{ color: "#94A3B8", fontFamily: "monospace" }}
        >
          Minerva v2.3.1
        </span>
      </div>
    </div>
  );
}
