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
  Users,
  TrendingUp,
  Phone,
  Calendar,
  FileText,
  Clock,
  AlertTriangle,
  Check,
  ChevronRight,
  Zap,
} from "lucide-react";

interface MyDayData {
  today: number;
  week: number;
  byStatus: Record<string, number>;
}

// Status state machine after Phase B3a. "questionnaire" is gone; "lead" is the
// sole mid-funnel marker.
const STATUS_ORDER = [
  "draft",
  "lead",
  "recommendation",
  "basket",
  "pdf_generated",
  "completed",
];

const STATUS_SURFACES: Record<string, string> = {
  draft: "#F8FAFC",
  lead: "#EFF6FF",
  recommendation: "#FFFBEB",
  basket: "#FAF5FF",
  pdf_generated: "#F0FDFA",
  completed: "#ECFDF3",
};

/**
 * Routes a client to the next actionable screen in the workflow based on status.
 * For open statuses (draft/lead/recommendation/basket/pdf_generated) we jump
 * directly to the step the user needs to continue; for closed statuses we fall
 * back to the detail page.
 */
function nextStepPath(clientId: number, _status?: string): string {
  // Demo mode: every status routes to the client detail page. The legacy
  // /recommendation and /basket screens expose the real Ipak Yuli product
  // catalog (rates, limits) and are intentionally not surfaced.
  return `/clients/${clientId}`;
}

export default function HomePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const { data: dashboard } = useQuery({
    queryKey: ["mini-dashboard"],
    queryFn: () => api.get("/mini-app/dashboard"),
  });

  const { data: myDay } = useQuery<MyDayData>({
    queryKey: ["my-day"],
    queryFn: () => api.get("/mini-app/dashboard/me"),
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
    { icon: UserPlus, label: t("home.newClient"), path: "/new-client", iconBg: "#FFD531", iconColor: "#272424" },
    { icon: Calculator, label: t("home.calc"), path: "/calculator", iconBg: "#F59E0B", iconColor: "#FFFFFF" },
  ];

  const inlineStats = [
    { label: t("home.totalClients"), value: dashboard?.totalClients ?? 0, color: "#FFFFFF" },
    { label: t("home.clientsToday"), value: dashboard?.clientsToday ?? dashboard?.todayTasks ?? todoPendingCount, color: "#FBBF24" },
    { label: t("home.thisMonth"), value: dashboard?.clientsThisMonth ?? 0, color: "#FFFFFF" },
  ];

  const displayName = user?.name || "";
  const branchName = user?.branch?.name || "";

  return (
    <div className="min-h-screen pb-6" style={{ background: "hsl(140 20% 97%)" }}>
      <div
        className="relative overflow-hidden px-5 text-white"
        style={{
          padding: "18px 20px 22px",
          background: "linear-gradient(180deg, #272424 0%, #3A3636 60%, #4A4444 100%)",
        }}
      >
        <svg width="100%" height="100%" className="pointer-events-none absolute inset-0" style={{ opacity: 0.08 }}>
          <defs>
            <pattern id="mn-stripes" width="16" height="100" patternUnits="userSpaceOnUse">
              <rect x="0" y="0" width="2" height="100" fill="#fff" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#mn-stripes)" />
        </svg>
        <div className="relative">
          <div className="mb-3.5 flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-full text-[16px] font-bold"
              style={{
                background: "#FFD531",
                color: "#272424",
                border: "2px solid rgba(255,255,255,0.2)",
              }}
            >
              {getInitials(user?.name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-medium opacity-75">{getGreeting()},</div>
              <div className="mt-0.5 truncate text-[17px] font-bold tracking-[-0.01em]">{displayName}</div>
            </div>
            <div
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold"
              style={{ background: "rgba(255,255,255,0.15)" }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#4ADE80" }} />
              {t("home.online")}
            </div>
          </div>

          {branchName && (
            <div className="mb-1.5 text-[11px] font-medium uppercase opacity-70" style={{ letterSpacing: "0.06em" }}>
              {t("home.branchLabel")} · {branchName}
            </div>
          )}

          <div
            className="mt-2 flex items-stretch gap-2.5 rounded-[14px] px-3.5 py-3"
            style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
          >
            {inlineStats.map((stat, i) => (
              <div key={stat.label} className="flex flex-1 items-stretch gap-2.5">
                {i > 0 && <div className="w-px" style={{ background: "rgba(255,255,255,0.2)" }} />}
                <div className="flex-1">
                  <div className="text-[22px] font-bold leading-none tracking-[-0.02em]" style={{ color: stat.color }}>
                    {stat.value}
                  </div>
                  <div className="mt-1 text-[10px] opacity-75">{stat.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {myDay && (
        <div className="mx-4 mt-4 mn-card overflow-hidden">
          {/* Phase E design — the today/week stat duo was removed because the
              hero card above already shows totalClients/today/month. Keeping
              the funnel breakdown only — that's the unique value here. */}
          <div className="p-4">
            <div className="text-[11px] text-[#64748B] uppercase tracking-wide mb-2">
              {t("myDay.funnel")}
            </div>
            <div className="space-y-2">
              {[
                { key: "lead", label: t("myDay.lead") },
                { key: "recommendation", label: t("myDay.recommendation") },
                { key: "basket", label: t("myDay.basket") },
                { key: "pdf_generated", label: t("myDay.pdfGenerated") },
                { key: "completed", label: t("myDay.approved") },
              ].map((s) => {
                const n = myDay.byStatus[s.key] ?? 0;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => navigate(`/clients?status=${s.key}`)}
                    className="flex w-full items-center justify-between text-sm py-1 active:opacity-70"
                  >
                    <span className="text-[#0F172A]">{s.label}</span>
                    <span className="text-[#64748B] font-mono">{n}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="px-4 pt-[18px]">
        <div
          className="mb-2.5 px-1 text-[11px] font-semibold uppercase"
          style={{ letterSpacing: "0.06em", color: "hsl(150 10% 45%)" }}
        >
          {t("home.quickActions")}
        </div>
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
              <div className="text-[11px] font-semibold leading-tight" style={{ color: "hsl(150 40% 8%)", textWrap: "balance" as any }}>
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
                      background: isOverdue ? "rgba(239,68,68,0.1)" : "rgba(255,213,49,0.2)",
                      color: isOverdue ? "#EF4444" : "#6B5C00",
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

      <button
        type="button"
        onClick={() => navigate("/quick-lead")}
        className="fixed bottom-24 right-5 z-30 w-14 h-14 rounded-full flex items-center justify-center active:scale-90 transition-transform"
        style={{
          background: "#FFD531",
          boxShadow: "0 6px 18px rgba(255,213,49,0.45)",
        }}
        aria-label={t("quickLead.title", { defaultValue: "Быстрый лид" })}
      >
        <Zap className="w-6 h-6 text-[#272424]" />
      </button>

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
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FFF7D6] text-[#6B5C00]">
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
                <div className="rounded-full bg-[#FFF7D6] px-3 py-1 text-[12px] font-semibold text-[#6B5C00]">
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
