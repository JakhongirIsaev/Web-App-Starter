import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { useLocation } from "wouter";
import {
  UserPlus,
  Calculator,
  BookOpen,
  Phone,
  ChevronRight,
  Sparkles,
  Clock,
  Calendar,
  FileText,
  AlertTriangle,
  Check,
  Loader2,
} from "lucide-react";

/* ── Minerva Design System status palette ── */
const statusChipStyles: Record<string, { bg: string; color: string }> = {
  draft:          { bg: "hsl(215 16% 52% / .12)",  color: "hsl(215 16% 42%)" },
  questionnaire:  { bg: "hsl(215 90% 52% / .12)",  color: "hsl(215 90% 42%)" },
  recommendation: { bg: "hsl(38 95% 52% / .15)",   color: "hsl(38 95% 40%)" },
  basket:         { bg: "hsl(270 80% 58% / .12)",  color: "hsl(270 70% 48%)" },
  pdf_generated:  { bg: "hsl(174 72% 40% / .13)",  color: "hsl(174 72% 32%)" },
  under_review:   { bg: "hsl(38 95% 52% / .12)",   color: "hsl(38 95% 40%)" },
  approved:       { bg: "hsl(142 65% 42% / .14)",  color: "hsl(142 65% 30%)" },
  completed:      { bg: "hsl(142 65% 42% / .14)",  color: "hsl(142 65% 30%)" },
  rejected:       { bg: "hsl(0 80% 58% / .12)",    color: "hsl(0 80% 48%)" },
};

/* ── helper: user initials from full name ── */
function getInitials(name: string | undefined | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0].substring(0, 2).toUpperCase();
}

/* ── helper: greeting based on Tashkent hour ── */
function getGreetingKey(): string {
  const now = new Date();
  // Tashkent is UTC+5
  const hour = (now.getUTCHours() + 5) % 24;
  if (hour >= 5 && hour < 12) return "Доброе утро,";
  if (hour >= 12 && hour < 17) return "Добрый день,";
  if (hour >= 17 && hour < 22) return "Добрый вечер,";
  return "Доброй ночи,";
}

/* ── helper: relative time ago ── */
function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "только что";
  if (mins < 60) return `${mins} мин`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ч`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "вчера";
  return `${days} дн`;
}

export default function HomePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [, navigate] = useLocation();

  /* ── existing data queries ── */
  const { data: dashboard, isLoading: dashboardLoading } = useQuery({
    queryKey: ["mini-dashboard"],
    queryFn: () => api.get("/mini-app/dashboard"),
  });

  const { data: todo } = useQuery({
    queryKey: ["mini-todo"],
    queryFn: () => api.get("/mini-app/todo"),
  });

  const { data: branchData } = useQuery({
    queryKey: ["branch-summary"],
    queryFn: () => api.get("/mini-app/branch-summary"),
    enabled: user?.role === "branch_head",
  });

  /* ── recent clients for active-clients list ── */
  const { data: recentClients = [] } = useQuery({
    queryKey: ["mini-clients"],
    queryFn: () => api.get("/mini-app/clients"),
  });

  const activeClients = (recentClients as any[]).slice(0, 5);

  /* ── quick actions config ── */
  const quickActions = [
    { icon: UserPlus, label: t("home.newClient"),     path: "/new-client",  bgClass: "bg-[hsl(142_71%_40%)]" },
    { icon: Calculator, label: t("home.calc"),         path: "/calculator",  bgClass: "bg-amber-500" },
    { icon: BookOpen,   label: t("home.knowledgeBase"), path: "/knowledge",   bgClass: "bg-violet-500" },
    { icon: Phone,      label: t("home.calc") === "Калькулятор" ? "Позвонить" : "Call", path: "/clients", bgClass: "bg-blue-500" },
  ];

  /* ── action type mapping (for todo section) ── */
  const actionTypeIcons: Record<string, any> = {
    follow_up: Phone,
    meeting: Calendar,
    proposal: FileText,
    documents: FileText,
  };
  const actionTypeLabels: Record<string, string> = {
    follow_up: t("home.followUp"),
    meeting: t("home.meeting"),
    proposal: t("home.proposal"),
    documents: t("home.documents"),
  };

  const todoPendingCount =
    (todo?.pendingActions?.length || 0) + (todo?.incompleteClients?.length || 0);

  return (
    <div className="pb-4">
      {/* ═══════════════ GRADIENT HEADER ═══════════════ */}
      <div
        className="relative overflow-hidden rounded-b-[20px] -mx-4 -mt-4"
        style={{
          background: "linear-gradient(180deg, #0D3D1A 0%, #155D27 60%, #1A7A32 100%)",
          minHeight: 180,
        }}
      >
        {/* SVG stripe pattern overlay */}
        <svg
          className="absolute inset-0 w-full h-full opacity-[0.08] pointer-events-none"
          preserveAspectRatio="none"
        >
          <defs>
            <pattern id="hdr-stripes" width="16" height="100" patternUnits="userSpaceOnUse">
              <rect x="0" y="0" width="2" height="100" fill="#fff" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hdr-stripes)" />
        </svg>

        <div className="relative px-5 pt-[18px] pb-[22px] text-white">
          {/* Row 1 — avatar + greeting + online pill */}
          <div className="flex items-center gap-3 mb-3.5">
            <div className="w-11 h-11 rounded-full bg-[hsl(142_71%_55%)] text-[hsl(145_55%_14%)] flex items-center justify-center font-bold text-[15px] border-2 border-white/20 shrink-0">
              {getInitials(user?.name)}
            </div>
            <div className="flex-1 min-w-0">
              {/* Row 2 — greeting line */}
              <div className="text-[13px] text-white/70 font-medium leading-tight">
                {getGreetingKey()}
              </div>
              <div className="text-[20px] font-bold tracking-tight mt-0.5 truncate">
                {user?.name?.split(" ")[0] || ""}
              </div>
            </div>
            <div className="flex items-center gap-[5px] px-2.5 py-1 bg-white/15 rounded-full text-[10px] font-semibold shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
              Онлайн
            </div>
          </div>

          {/* Row 3 — branch line */}
          <div className="text-[11px] text-white/70 font-medium uppercase tracking-wide mb-1.5">
            {t("app.subtitle")}
          </div>

          {/* Row 4 — KPI glass card */}
          {dashboardLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-white/50" />
            </div>
          ) : dashboard ? (
            <div className="flex gap-2.5 p-3 bg-white/12 backdrop-blur-sm rounded-[14px]">
              <div className="flex-1">
                <div className="text-[22px] font-bold tracking-tight leading-none">
                  {dashboard.totalClients ?? 0}
                </div>
                <div className="text-[10px] text-white/75 mt-1">
                  {t("home.totalClients")}
                </div>
              </div>
              <div className="w-px bg-white/20" />
              <div className="flex-1">
                <div className="text-[22px] font-bold tracking-tight leading-none text-amber-300">
                  {dashboard.clientsToday ?? 0}
                </div>
                <div className="text-[10px] text-white/75 mt-1">
                  {t("home.clientsToday")}
                </div>
              </div>
              <div className="w-px bg-white/20" />
              <div className="flex-1">
                <div className="text-[22px] font-bold tracking-tight leading-none">
                  {dashboard.clientsThisMonth ?? 0}
                </div>
                <div className="text-[10px] text-white/75 mt-1">
                  {t("home.thisMonth")}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* ═══════════════ QUICK ACTIONS ═══════════════ */}
      <div className="px-4 pt-[18px]">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(150_10%_45%)] mb-2.5 px-1">
          {t("home.quickActions")}
        </div>
        <div className="grid grid-cols-4 gap-2.5">
          {quickActions.map((a) => (
            <button
              key={a.path}
              onClick={() => navigate(a.path)}
              className="flex flex-col items-center gap-2 py-3 px-1 bg-white rounded-[14px] shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)] active:scale-95 transition-transform"
            >
              <div
                className={`w-11 h-11 rounded-[14px] ${a.bgClass} text-white flex items-center justify-center`}
              >
                <a.icon className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-semibold text-center leading-tight text-[hsl(150_40%_8%)] text-balance">
                {a.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ═══════════════ ACTIVE CLIENTS LIST ═══════════════ */}
      {activeClients.length > 0 && (
        <div className="px-4 pt-4">
          <div className="flex items-baseline mb-2.5 px-1">
            <div className="flex-1 text-[11px] font-semibold uppercase tracking-wide text-[hsl(150_10%_45%)]">
              {t("home.myClients")}
            </div>
            <button
              onClick={() => navigate("/clients")}
              className="text-[12px] text-[hsl(142_71%_40%)] font-semibold"
            >
              {t("clients.allStatuses") === "Все" ? `Все (${(recentClients as any[]).length})` : `All (${(recentClients as any[]).length})`}
            </button>
          </div>
          <div className="bg-white rounded-[14px] overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)]">
            {activeClients.map((client: any, i: number) => {
              const st = statusChipStyles[client.status] || statusChipStyles.draft;
              return (
                <div
                  key={client.id}
                  className={`flex items-center gap-3 px-4 py-3.5 cursor-pointer active:bg-gray-50 transition-colors ${
                    i < activeClients.length - 1 ? "border-b border-[hsl(140_15%_93%)]" : ""
                  }`}
                  onClick={() => navigate(`/clients/${client.id}`)}
                >
                  {/* Status-tinted monogram avatar */}
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-bold shrink-0"
                    style={{ background: st.bg, color: st.color }}
                  >
                    {getInitials(client.fullName)}
                  </div>

                  {/* Name + status chip */}
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-semibold text-[hsl(150_40%_8%)] truncate">
                      {client.fullName || t("clients.anonymous")}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold"
                        style={{ background: st.bg, color: st.color }}
                      >
                        <span className="w-[5px] h-[5px] rounded-full" style={{ background: "currentColor" }} />
                        {t(`statuses.${client.status}`)}
                      </span>
                      <span className="text-[11px] text-[hsl(150_10%_45%)]">
                        · {timeAgo(client.updatedAt)}
                      </span>
                    </div>
                  </div>

                  {/* Chevron */}
                  <ChevronRight className="w-3.5 h-3.5 text-[hsl(150_10%_65%)] shrink-0" />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════════════ KNOWLEDGE CARD ═══════════════ */}
      <div className="px-4 pt-4">
        <div
          className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl p-4 text-white flex items-center gap-3.5 cursor-pointer active:scale-[0.98] transition-transform"
          style={{ boxShadow: "0px 4px 12px rgba(217,119,6,0.22)" }}
          onClick={() => navigate("/knowledge")}
        >
          <div className="w-11 h-11 rounded-xl bg-white/[0.22] flex items-center justify-center shrink-0">
            <Sparkles className="w-[22px] h-[22px]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-bold tracking-tight">
              {t("knowledge.title") === "База знаний" ? "Новое в продуктах" : "Product updates"}
            </div>
            <div className="text-[11px] text-white/90 mt-0.5 leading-snug">
              {t("knowledge.subtitle")}
            </div>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-white/70 shrink-0" />
        </div>
      </div>

      {/* ═══════════════ TODAY TASKS (preserved) ═══════════════ */}
      {todo && (todo.pendingActions?.length > 0 || todo.incompleteClients?.length > 0) && (
        <div className="px-4 pt-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(150_10%_45%)] mb-2.5 px-1">
            {t("home.todayTasks")}
            {todoPendingCount > 0 && (
              <span className="ml-1.5 text-amber-600">({todoPendingCount})</span>
            )}
          </div>
          <div className="space-y-2">
            {todo.pendingActions?.map((action: any) => {
              const Icon = actionTypeIcons[action.actionType] || Clock;
              const isOverdue = new Date(action.actionDate) < new Date();
              return (
                <Card
                  key={action.id}
                  className={`${isOverdue ? "border-destructive/50" : ""} cursor-pointer rounded-[14px]`}
                  onClick={() =>
                    action.clientId && navigate(`/clients/${action.clientId}`)
                  }
                >
                  <CardContent className="p-3 flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                        isOverdue ? "bg-destructive/10" : "bg-primary/10"
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 ${
                          isOverdue ? "text-destructive" : "text-primary"
                        }`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {actionTypeLabels[action.actionType] || action.actionType}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {action.clientName || "\u2014"}
                      </p>
                    </div>
                    {isOverdue && (
                      <span className="text-[10px] text-destructive font-medium flex items-center gap-0.5">
                        <AlertTriangle className="w-3 h-3" />
                        {t("home.overdue")}
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </CardContent>
                </Card>
              );
            })}

            {todo.incompleteClients?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5 px-1">
                  {t("home.incompleteClients")}
                </p>
                {todo.incompleteClients.map((c: any) => (
                  <Card
                    key={c.id}
                    className="mb-1.5 cursor-pointer rounded-[14px]"
                    onClick={() => navigate(`/clients/${c.id}`)}
                  >
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
                        <FileText className="w-4 h-4 text-amber-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {c.fullName || t("clients.anonymous")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t(`statuses.${c.status}`)}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {!todo?.pendingActions?.length && !todo?.incompleteClients?.length && (
        <div className="px-4 pt-4">
          <Card className="rounded-[14px]">
            <CardContent className="p-6 text-center">
              <Check className="w-8 h-8 text-primary mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">{t("home.noTasks")}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══════════════ BRANCH HEAD SUMMARY (preserved) ═══════════════ */}
      {user?.role === "branch_head" && branchData && (
        <div className="px-4 pt-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(150_10%_45%)] mb-2.5 px-1">
            {t("home.branchSummary")}
          </div>
          <Card className="rounded-[14px]">
            <CardContent className="p-3">
              <div className="flex justify-between mb-3">
                <span className="text-sm text-muted-foreground">
                  {t("home.totalBranchClients")}
                </span>
                <span className="font-semibold">{branchData.totalBranchClients}</span>
              </div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                {t("home.workers")}
              </p>
              {branchData.workers?.map((w: any) => (
                <div
                  key={w.id}
                  className="flex justify-between items-center py-1.5 border-b border-[hsl(140_15%_93%)] last:border-0"
                >
                  <span className="text-sm">{w.name}</span>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span>{w.totalClients}</span>
                    <span className="text-primary">{w.completedClients}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
