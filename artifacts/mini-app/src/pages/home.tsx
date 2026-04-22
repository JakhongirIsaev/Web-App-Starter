import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { useLocation } from "wouter";
import {
  SectionHeader,
  ClientRow,
  StatusChip,
  getInitials,
  getGreeting,
  timeAgo,
} from "@/components/ui-primitives";
import {
  UserPlus,
  Calculator,
  Package,
  Landmark,
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
  Sparkles,
} from "lucide-react";

const STATUS_ORDER = [
  "draft",
  "questionnaire",
  "recommendation",
  "basket",
  "pdf_generated",
  "completed",
];

const STATUS_SURFACES: Record<string, string> = {
  draft: "#F8FAFC",
  questionnaire: "#EFF6FF",
  recommendation: "#FFFBEB",
  basket: "#FAF5FF",
  pdf_generated: "#F0FDFA",
  completed: "#ECFDF3",
};

/**
 * Routes a client to the next actionable screen in the workflow based on status.
 * For open statuses (draft/questionnaire/recommendation/basket/pdf_generated) we jump
 * directly to the step the user needs to continue; for closed statuses we fall back
 * to the detail page.
 */
function nextStepPath(clientId: number, status?: string): string {
  switch (status) {
    case "questionnaire":
      return `/questionnaire/${clientId}`;
    case "recommendation":
      return `/recommendation/${clientId}`;
    case "basket":
      return `/basket/${clientId}`;
    case "pdf_generated":
      return `/pdf-share/${clientId}`;
    case "draft":
    default:
      return `/clients/${clientId}`;
  }
}

export default function HomePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const { data: dashboard } = useQuery({
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

  const clients = recentClients as any[];
  const activeClients = useMemo(() => clients.slice(0, 5), [clients]);

  const statusSummary = useMemo(
    () =>
      STATUS_ORDER
        .map((status) => ({
          status,
          count: clients.filter((client) => client.status === status).length,
        }))
        .filter((item) => item.count > 0)
        .slice(0, 4),
    [clients],
  );

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

  const quickActions = [
    { icon: UserPlus, label: t("home.newClient"), path: "/new-client", iconBg: "hsl(142 71% 40%)", iconColor: "#FFFFFF" },
    { icon: Calculator, label: t("home.calc"), path: "/calculator", iconBg: "#F59E0B", iconColor: "#FFFFFF" },
    { icon: Package, label: t("nav.products"), path: "/products", iconBg: "#A855F7", iconColor: "#FFFFFF" },
    { icon: Landmark, label: t("nav.creditLines"), path: "/credit-lines", iconBg: "#3B82F6", iconColor: "#FFFFFF" },
  ];

  const today = new Date();
  const dateStr = today.toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const heroStats = [
    { label: t("home.totalClients"), value: dashboard?.totalClients ?? 0, tone: "#16A34A", surface: "rgba(255,255,255,0.16)" },
    { label: t("home.clientsToday"), value: dashboard?.clientsToday ?? dashboard?.todayTasks ?? 0, tone: "#FFFFFF", surface: "rgba(255,255,255,0.12)" },
    { label: t("home.thisMonth"), value: dashboard?.clientsThisMonth ?? 0, tone: "#FEF3C7", surface: "rgba(255,255,255,0.12)" },
    { label: t("home.todayTasks"), value: todoPendingCount, tone: "#D1FAE5", surface: "rgba(15,23,42,0.12)" },
  ];

  const firstName = user?.name?.split(" ")[0] || "";
  const branchName = user?.branch?.name || "";

  return (
    <div className="min-h-screen pb-6" style={{ background: "var(--tg-bg, #F4F4F5)" }}>
      <div className="px-4 pt-4">
        <div
          className="relative overflow-hidden rounded-[32px] px-5 pb-5 pt-5 text-white shadow-[0_24px_60px_rgba(21,128,61,0.28)]"
          style={{ background: "linear-gradient(145deg, #14532D 0%, #15803D 42%, #16A34A 78%, #22C55E 100%)" }}
        >
          <div className="absolute -right-12 top-0 h-40 w-40 rounded-full bg-white/12 blur-2xl" />
          <div className="absolute -left-8 bottom-0 h-24 w-24 rounded-full bg-black/10 blur-xl" />

          <div className="relative">
            <div className="flex items-start gap-3">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-full text-[15px] font-bold text-white shadow-[0_8px_30px_rgba(15,23,42,0.14)]"
                style={{ background: "rgba(255,255,255,0.18)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}
              >
                {getInitials(user?.name)}
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-white/75">{getGreeting()}</div>
                <div className="mt-0.5 truncate text-[24px] font-bold tracking-[-0.03em]">
                  {firstName}
                </div>
                <div className="mt-1 text-[13px] text-white/70 capitalize">
                  {dateStr}
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {branchName && (
                <div className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/90 backdrop-blur">
                  {branchName}
                </div>
              )}
              <div className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/90 backdrop-blur">
                {todoPendingCount} {t("home.todayTasks").toLowerCase()}
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2.5">
              {heroStats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-[22px] border border-white/10 px-3.5 py-3.5"
                  style={{ background: stat.surface, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
                >
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/65">
                    {stat.label}
                  </div>
                  <div className="mt-2 text-[28px] font-bold leading-none" style={{ color: stat.tone }}>
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 pt-5">
        <div className="mn-section-hdr px-0 pt-0 pb-2">{t("home.quickActions")}</div>
        <div className="grid grid-cols-4 gap-2.5">
          {quickActions.map((action) => (
            <button
              key={action.path}
              onClick={() => navigate(action.path)}
              className="flex flex-col items-center gap-2 rounded-[14px] bg-white px-1 py-3 text-center shadow-[0px_1px_3px_rgba(0,0,0,0.06),_0px_1px_2px_rgba(0,0,0,0.04)] transition-transform active:scale-[0.96]"
            >
              <div
                className="flex h-11 w-11 items-center justify-center rounded-[14px]"
                style={{ background: action.iconBg, color: action.iconColor }}
              >
                <action.icon className="h-5 w-5" strokeWidth={2} />
              </div>
              <div className="text-[11px] font-semibold leading-tight text-[#0F172A]" style={{ textWrap: "balance" as any }}>
                {action.label}
              </div>
            </button>
          ))}
        </div>
      </div>

      {todo && (todo.pendingActions?.length > 0 || todo.incompleteClients?.length > 0) ? (
        <div className="px-4 pt-5">
          <SectionHeader
            title={`${t("home.todayTasks")}${todoPendingCount > 0 ? ` (${todoPendingCount})` : ""}`}
          />
          <div className="mn-card overflow-hidden">
            {todo.pendingActions?.map((action: any, index: number) => {
              const Icon = actionTypeIcons[action.actionType] || Clock;
              const isOverdue = new Date(action.actionDate) < new Date();
              const showDivider =
                index < (todo.pendingActions?.length ?? 0) - 1 || todo.incompleteClients?.length > 0;

              return (
                <div
                  key={action.id}
                  className={`flex items-center gap-3 px-4 py-3.5 cursor-pointer active:bg-black/[0.03] ${
                    showDivider ? "border-b border-[#F1F5F9]" : ""
                  }`}
                  onClick={() => action.clientId && navigate(nextStepPath(action.clientId, action.clientStatus))}
                >
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-[14px] shrink-0"
                    style={{
                      background: isOverdue ? "rgba(239,68,68,0.1)" : "rgba(22,163,74,0.1)",
                      color: isOverdue ? "#EF4444" : "#16A34A",
                    }}
                  >
                    <Icon className="h-4 w-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold text-[#0F172A]">
                      {actionTypeLabels[action.actionType] || action.actionType}
                    </div>
                    <div className="mt-0.5 truncate text-[12px] text-[#64748B]">
                      {action.clientName || "\u2014"}
                    </div>
                  </div>

                  {isOverdue && (
                    <span className="flex items-center gap-1 text-[10px] font-semibold text-[#EF4444] shrink-0">
                      <AlertTriangle className="h-3 w-3" />
                      {t("home.overdue")}
                    </span>
                  )}

                  <ChevronRight className="h-4 w-4 shrink-0 text-[#CBD5E1]" />
                </div>
              );
            })}

            {todo.incompleteClients?.map((client: any, index: number) => (
              <div
                key={client.id}
                className={`flex items-center gap-3 px-4 py-3.5 cursor-pointer active:bg-black/[0.03] ${
                  index < (todo.incompleteClients?.length ?? 0) - 1 ? "border-b border-[#F1F5F9]" : ""
                }`}
                onClick={() => navigate(nextStepPath(client.id, client.status))}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#FEF3C7] shrink-0">
                  <FileText className="h-4 w-4 text-[#D97706]" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold text-[#0F172A]">
                    {client.fullName || t("clients.anonymous")}
                  </div>
                  <div className="mt-0.5 text-[12px] text-[#64748B]">
                    {t(`statuses.${client.status}`)}
                  </div>
                </div>

                <ChevronRight className="h-4 w-4 shrink-0 text-[#CBD5E1]" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="px-4 pt-5">
          <div className="mn-card px-5 py-6 text-center">
            <Check className="mx-auto mb-2 h-8 w-8 text-[#16A34A]" />
            <p className="text-[14px] text-[#64748B]">{t("home.noTasks")}</p>
          </div>
        </div>
      )}

      <div className="pt-5">
        <SectionHeader
          title={t("home.myClients")}
          actionLabel={`${t("clients.allStatuses")} (${clients.length})`}
          onAction={() => navigate("/clients")}
        />

        {statusSummary.length > 0 && (
          <div className="grid grid-cols-2 gap-2.5 px-4 pb-3">
            {statusSummary.map((item) => (
              <button
                key={item.status}
                onClick={() => navigate("/clients")}
                className="rounded-[22px] px-4 py-3.5 text-left shadow-[0_1px_3px_rgba(15,23,42,0.06)] transition-transform active:scale-[0.98]"
                style={{ background: STATUS_SURFACES[item.status] || "#FFFFFF" }}
              >
                <StatusChip status={item.status} />
                <div className="mt-3 text-[26px] font-bold leading-none text-[#0F172A]">
                  {item.count}
                </div>
              </button>
            ))}
          </div>
        )}

        {activeClients.length > 0 ? (
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
        ) : (
          <div className="mx-4 mn-card px-5 py-6 text-center">
            <Users className="mx-auto mb-2 h-8 w-8 text-[#94A3B8]" />
            <p className="text-[14px] text-[#64748B]">{t("clients.noClients")}</p>
          </div>
        )}
      </div>

      <div className="px-4 pt-5">
        <button
          onClick={() => navigate("/knowledge")}
          className="flex w-full items-center gap-3.5 rounded-[16px] px-[18px] py-4 text-left text-white transition-transform active:scale-[0.98]"
          style={{
            background: "linear-gradient(135deg, #F59E0B 0%, #D97706 100%)",
            boxShadow: "0px 4px 12px rgba(217,119,6,0.22)",
          }}
        >
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px]"
            style={{ background: "rgba(255,255,255,0.22)" }}
          >
            <Sparkles className="h-[22px] w-[22px]" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-bold tracking-[-0.01em]">{t("home.knowledgeTitle")}</div>
            <div className="mt-0.5 text-[11px] leading-snug opacity-90">{t("home.knowledgeHint")}</div>
          </div>
          <ChevronRight className="h-[14px] w-[14px] shrink-0 opacity-70" />
        </button>
      </div>

      {user?.role === "branch_head" && branchData && (
        <div className="px-4 pt-5">
          <SectionHeader title={t("home.branchSummary")} />
          <div className="mn-card p-4">
            <div className="mb-4 flex items-center justify-between rounded-[18px] bg-[#F8FAFC] px-4 py-3">
              <div>
                <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">
                  {t("home.totalBranchClients")}
                </div>
                <div className="mt-1 text-[24px] font-bold leading-none text-[#0F172A]">
                  {branchData.totalBranchClients}
                </div>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#ECFDF3] text-[#16A34A]">
                <TrendingUp className="h-5 w-5" />
              </div>
            </div>

            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">
              {t("home.workers")}
            </div>

            {branchData.workers?.map((worker: any) => (
              <div
                key={worker.id}
                className="flex items-center justify-between border-b border-[#F1F5F9] py-3 last:border-0"
              >
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold text-[#0F172A]">{worker.name}</div>
                  <div className="mt-0.5 text-[12px] text-[#64748B]">
                    {worker.totalClients} / {branchData.totalBranchClients}
                  </div>
                </div>
                <div className="rounded-full bg-[#ECFDF3] px-3 py-1 text-[12px] font-semibold text-[#16A34A]">
                  {worker.completedClients}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
