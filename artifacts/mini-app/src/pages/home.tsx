import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { useLocation } from "wouter";
import {
  KpiCard,
  SectionHeader,
  ClientRow,
  getInitials,
  getGreeting,
  timeAgo,
  fmtShort,
} from "@/components/ui-primitives";
import {
  UserPlus,
  Calculator,
  Sparkles,
  BookOpen,
  Bell,
  Users,
  CalendarCheck,
  TrendingUp,
  Phone,
  Calendar,
  FileText,
  Clock,
  AlertTriangle,
  Check,
  ChevronRight,
  Loader2,
} from "lucide-react";

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

  const { data: recentClients = [] } = useQuery({
    queryKey: ["mini-clients"],
    queryFn: () => api.get("/mini-app/clients"),
  });

  const activeClients = (recentClients as any[]).slice(0, 5);

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

  /* ── quick actions config ── */
  const quickActions = [
    { icon: UserPlus,    label: t("home.newClient"),      path: "/new-client",  iconBg: "#ECFDF3", iconColor: "#16A34A" },
    { icon: Calculator,  label: t("home.calc"),           path: "/calculator",  iconBg: "#FEF3C7", iconColor: "#D97706" },
    { icon: Sparkles,    label: "AI-\u043F\u043E\u0434\u0431\u043E\u0440", path: "/recommendation", iconBg: "#F3E8FF", iconColor: "#7C3AED" },
    { icon: BookOpen,    label: t("home.knowledgeBase"),  path: "/knowledge",   iconBg: "#DBEAFE", iconColor: "#2563EB" },
  ];

  /* ── today's date string ── */
  const today = new Date();
  const dateStr = today.toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div style={{ background: "var(--tg-bg, #F4F4F5)" }} className="min-h-screen pb-4">
      {/* ═══════════════ GRADIENT HEADER ═══════════════ */}
      <div
        className="relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #15803D 0%, #16A34A 55%, #22C55E 100%)",
          padding: "20px 20px 72px",
        }}
      >
        {/* Top row: avatar + greeting + bell */}
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-[15px] text-white shrink-0"
            style={{ background: "rgba(255,255,255,0.2)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
          >
            {getInitials(user?.name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] text-white/80 font-medium leading-tight">
              {getGreeting()}
            </div>
            <div className="text-[20px] font-bold text-white tracking-tight mt-0.5 truncate">
              {user?.name?.split(" ")[0] || ""}
            </div>
          </div>
          <button
            className="relative w-10 h-10 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "rgba(255,255,255,0.15)" }}
          >
            <Bell className="w-5 h-5 text-white" />
            {todoPendingCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-amber-400 rounded-full border-2 border-green-600" />
            )}
          </button>
        </div>

        {/* Date line */}
        <div className="text-[13px] text-white/70 mt-3 capitalize">{dateStr}</div>
      </div>

      {/* ═══════════════ KPI TILES (overlapping gradient) ═══════════════ */}
      <div className="px-4" style={{ marginTop: -56 }}>
        {dashboardLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-[#64748B]" />
          </div>
        ) : dashboard ? (
          <div className="grid grid-cols-3 gap-2.5">
            <KpiCard
              label={t("home.totalClients")}
              value={dashboard.totalClients ?? 0}
              icon={Users}
              tint="#16A34A"
              bg="#ECFDF3"
            />
            <KpiCard
              label={t("home.clientsToday")}
              value={dashboard.clientsToday ?? dashboard.todayTasks ?? 0}
              icon={CalendarCheck}
              tint="#2563EB"
              bg="#DBEAFE"
            />
            <KpiCard
              label={t("home.thisMonth")}
              value={dashboard.clientsThisMonth ?? 0}
              icon={TrendingUp}
              tint="#D97706"
              bg="#FEF3C7"
            />
          </div>
        ) : null}
      </div>

      {/* ═══════════════ QUICK ACTIONS (2x2 grid) ═══════════════ */}
      <div className="px-4 pt-5">
        <div className="mn-section-hdr px-0 pt-0 pb-2">{t("home.quickActions")}</div>
        <div className="grid grid-cols-2 gap-2.5">
          {quickActions.map((a) => (
            <button
              key={a.path}
              onClick={() => navigate(a.path)}
              className="mn-card flex items-center gap-3 p-3.5 active:scale-[0.97] transition-transform"
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: a.iconBg, color: a.iconColor }}
              >
                <a.icon className="w-5 h-5" />
              </div>
              <span className="text-[13px] font-semibold text-[#0F172A] text-left leading-tight">
                {a.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ═══════════════ TODAY TASKS ═══════════════ */}
      {todo && (todo.pendingActions?.length > 0 || todo.incompleteClients?.length > 0) && (
        <div className="px-4 pt-5">
          <SectionHeader
            title={`${t("home.todayTasks")}${todoPendingCount > 0 ? ` (${todoPendingCount})` : ""}`}
          />
          <div className="mn-card overflow-hidden">
            {todo.pendingActions?.map((action: any, i: number) => {
              const Icon = actionTypeIcons[action.actionType] || Clock;
              const isOverdue = new Date(action.actionDate) < new Date();
              return (
                <div
                  key={action.id}
                  className={`flex items-center gap-3 px-4 py-3.5 cursor-pointer active:bg-black/[0.03] ${
                    i < (todo.pendingActions?.length ?? 0) - 1 || todo.incompleteClients?.length > 0
                      ? "border-b border-[#F1F5F9]"
                      : ""
                  }`}
                  onClick={() => action.clientId && navigate(`/clients/${action.clientId}`)}
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      background: isOverdue ? "rgba(239,68,68,0.1)" : "rgba(22,163,74,0.1)",
                      color: isOverdue ? "#EF4444" : "#16A34A",
                    }}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-semibold text-[#0F172A] truncate">
                      {actionTypeLabels[action.actionType] || action.actionType}
                    </div>
                    <div className="text-[12px] text-[#64748B] truncate mt-0.5">
                      {action.clientName || "\u2014"}
                    </div>
                  </div>
                  {isOverdue && (
                    <span className="flex items-center gap-1 text-[10px] text-[#EF4444] font-semibold shrink-0">
                      <AlertTriangle className="w-3 h-3" />
                      {t("home.overdue")}
                    </span>
                  )}
                  <ChevronRight className="w-4 h-4 text-[#CBD5E1] shrink-0" />
                </div>
              );
            })}

            {todo.incompleteClients?.map((c: any, i: number) => (
              <div
                key={c.id}
                className={`flex items-center gap-3 px-4 py-3.5 cursor-pointer active:bg-black/[0.03] ${
                  i < (todo.incompleteClients?.length ?? 0) - 1 ? "border-b border-[#F1F5F9]" : ""
                }`}
                onClick={() => navigate(`/clients/${c.id}`)}
              >
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-[#FEF3C7]">
                  <FileText className="w-4 h-4 text-[#D97706]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-semibold text-[#0F172A] truncate">
                    {c.fullName || t("clients.anonymous")}
                  </div>
                  <div className="text-[12px] text-[#64748B] mt-0.5">
                    {t(`statuses.${c.status}`)}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-[#CBD5E1] shrink-0" />
              </div>
            ))}
          </div>
        </div>
      )}

      {!todo?.pendingActions?.length && !todo?.incompleteClients?.length && (
        <div className="px-4 pt-5">
          <div className="mn-card p-6 text-center">
            <Check className="w-8 h-8 text-[#16A34A] mx-auto mb-2" />
            <p className="text-[14px] text-[#64748B]">{t("home.noTasks")}</p>
          </div>
        </div>
      )}

      {/* ═══════════════ ACTIVE CLIENTS ═══════════════ */}
      {activeClients.length > 0 && (
        <div className="pt-5">
          <SectionHeader
            title={t("home.myClients")}
            actionLabel={`${t("clients.allStatuses")} (${(recentClients as any[]).length})`}
            onAction={() => navigate("/clients")}
          />
          <div className="mx-4 mn-card overflow-hidden">
            {activeClients.map((client: any) => (
              <ClientRow
                key={client.id}
                client={{
                  id: client.id,
                  fullName: client.fullName,
                  initials: getInitials(client.fullName),
                  status: client.status,
                  amount: client.amount,
                  product: client.product,
                  updatedAt: timeAgo(client.updatedAt),
                }}
                onClick={() => navigate(`/clients/${client.id}`)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════ KNOWLEDGE TEASER ═══════════════ */}
      <div className="px-4 pt-5">
        <div
          className="mn-card overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
          style={{
            background: "linear-gradient(135deg, #F59E0B 0%, #D97706 100%)",
            boxShadow: "0px 4px 12px rgba(217,119,6,0.22)",
          }}
          onClick={() => navigate("/knowledge")}
        >
          <div className="flex items-center gap-3.5 p-4 text-white">
            <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Sparkles className="w-[22px] h-[22px]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-bold tracking-tight">
                {t("knowledge.title") === "\u0411\u0430\u0437\u0430 \u0437\u043D\u0430\u043D\u0438\u0439" ? "\u041D\u043E\u0432\u043E\u0435 \u0432 \u043F\u0440\u043E\u0434\u0443\u043A\u0442\u0430\u0445" : "Product updates"}
              </div>
              <div className="text-[12px] text-white/90 mt-0.5 leading-snug">
                {t("knowledge.subtitle")}
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-white/70 shrink-0" />
          </div>
        </div>
      </div>

      {/* ═══════════════ BRANCH HEAD SUMMARY ═══════════════ */}
      {user?.role === "branch_head" && branchData && (
        <div className="px-4 pt-5">
          <SectionHeader title={t("home.branchSummary")} />
          <div className="mn-card p-4">
            <div className="flex justify-between mb-3">
              <span className="text-[13px] text-[#64748B]">{t("home.totalBranchClients")}</span>
              <span className="text-[15px] font-bold text-[#0F172A]">{branchData.totalBranchClients}</span>
            </div>
            <div className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wide mb-2">
              {t("home.workers")}
            </div>
            {branchData.workers?.map((w: any) => (
              <div
                key={w.id}
                className="flex justify-between items-center py-2.5 border-b border-[#F1F5F9] last:border-0"
              >
                <span className="text-[14px] text-[#0F172A]">{w.name}</span>
                <div className="flex gap-3 text-[12px] text-[#64748B]">
                  <span>{w.totalClients}</span>
                  <span className="text-[#16A34A] font-semibold">{w.completedClients}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
