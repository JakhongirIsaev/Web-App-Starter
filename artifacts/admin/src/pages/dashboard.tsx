import { type ActivityItem } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { buildApiUrl } from "@/lib/api";
import { buildAuthHeaders } from "@/lib/auth-headers";
import {
  Users, CheckCircle2, Building2, Package, Activity,
  ChevronDown, TrendingUp, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";
import { formatAdminDateTime } from "@/lib/time";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import FunnelReport from "@/pages/funnel";

/* ── Pipeline status palette ── */
const STATUS_COLORS: Record<string, string> = {
  draft:          "hsl(215 16% 52%)",
  questionnaire:  "hsl(215 90% 52%)",
  recommendation: "hsl(38 95% 52%)",
  basket:         "hsl(270 80% 58%)",
  pdf_generated:  "hsl(174 72% 40%)",
  completed:      "hsl(142 65% 42%)",
  rejected:       "hsl(0 80% 58%)",
};

const STATUS_CHIP_STYLES: Record<string, { bg: string; text: string }> = {
  draft:          { bg: "bg-[hsl(215_16%_52%/0.12)]", text: "text-[hsl(215_16%_42%)]" },
  questionnaire:  { bg: "bg-[hsl(215_90%_52%/0.12)]", text: "text-[hsl(215_90%_42%)]" },
  recommendation: { bg: "bg-[hsl(38_95%_52%/0.15)]",  text: "text-[hsl(38_95%_40%)]" },
  basket:         { bg: "bg-[hsl(270_80%_58%/0.12)]",  text: "text-[hsl(270_70%_48%)]" },
  pdf_generated:  { bg: "bg-[hsl(174_72%_40%/0.13)]",  text: "text-[hsl(174_72%_32%)]" },
  completed:      { bg: "bg-[hsl(142_65%_42%/0.14)]",  text: "text-[hsl(142_65%_30%)]" },
  rejected:       { bg: "bg-[hsl(0_80%_58%/0.12)]",    text: "text-[hsl(0_80%_42%)]" },
};

/* ── KPI tone configs ── */
const TONE_CONFIG = {
  primary: {
    iconBg: "bg-[hsl(142_71%_40%/0.12)]",
    iconColor: "text-[hsl(142_71%_40%)]",
  },
  blue: {
    iconBg: "bg-[hsl(217_91%_60%/0.12)]",
    iconColor: "text-[hsl(217_91%_60%)]",
  },
  amber: {
    iconBg: "bg-[hsl(38_95%_48%/0.12)]",
    iconColor: "text-[hsl(38_95%_48%)]",
  },
  teal: {
    iconBg: "bg-[hsl(174_72%_40%/0.12)]",
    iconColor: "text-[hsl(174_72%_40%)]",
  },
} as const;

/* ── KPI Card ── */
function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  delta,
  tone = "primary",
  isLoading,
}: {
  icon: any;
  label: string;
  value: React.ReactNode;
  sub?: string;
  delta?: number | null;
  tone?: keyof typeof TONE_CONFIG;
  isLoading?: boolean;
}) {
  const t = TONE_CONFIG[tone];
  return (
    <div className="bg-card border border-border/50 rounded-xl shadow-sm p-4 px-[18px]">
      <div className="flex items-center gap-2.5 mb-2">
        <div className={`w-8 h-8 rounded-lg ${t.iconBg} ${t.iconColor} flex items-center justify-center`}>
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
      </div>
      {isLoading ? (
        <Skeleton className="h-8 w-20 mt-1" />
      ) : (
        <>
          <div className="text-[28px] font-bold tracking-tight leading-none">{value}</div>
          <div className="flex items-center gap-1.5 mt-1.5">
            {delta != null && (
              <span
                className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                  delta >= 0
                    ? "bg-[hsl(142_71%_40%/0.12)] text-[hsl(142_65%_30%)]"
                    : "bg-[hsl(0_80%_58%/0.12)] text-[hsl(0_80%_48%)]"
                }`}
              >
                {delta >= 0 ? "+" : ""}{delta}%
              </span>
            )}
            {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Status chip (pill + dot) ── */
function StatusChip({ status, label }: { status: string; label: string }) {
  const style = STATUS_CHIP_STYLES[status] || STATUS_CHIP_STYLES.draft;
  const color = STATUS_COLORS[status] || STATUS_COLORS.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold ${style.bg} ${style.text}`}>
      <span className="w-[5px] h-[5px] rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

/* ── Horizontal funnel bar ── */
function HorizontalFunnelBar({
  data,
  t: translate,
}: {
  data: Array<{ status: string; count: number }>;
  t: (key: string, opts?: any) => string;
}) {
  const sorted = [...data].sort((a, b) => b.count - a.count);
  const max = sorted[0]?.count || 1;
  return (
    <div className="flex flex-col gap-2">
      {sorted.map((s) => (
        <div key={s.status} className="flex items-center gap-3">
          <div className="w-[120px] text-[11px] font-mono text-muted-foreground truncate">
            {translate(`statuses.${s.status}`, { defaultValue: s.status })}
          </div>
          <div className="flex-1 h-[22px] bg-muted/50 rounded overflow-hidden">
            <div
              className="h-full rounded flex items-center justify-end px-2 text-white text-[11px] font-semibold transition-all"
              style={{
                width: `${(s.count / max) * 100}%`,
                background: STATUS_COLORS[s.status] || STATUS_COLORS.draft,
                minWidth: s.count > 0 ? 28 : 0,
              }}
            >
              {s.count}
            </div>
          </div>
          <div className="w-12 text-right text-[11px] text-muted-foreground">
            {Math.round((s.count / max) * 100)}%
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Spark bars ── */
function SparkBars({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex gap-[3px] items-end h-[54px]">
      {data.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm bg-primary transition-all"
          style={{
            height: `${(v / max) * 100}%`,
            opacity: 0.4 + (v / max) * 0.6,
          }}
        />
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { t } = useTranslation();
  const authHeaders = buildAuthHeaders();

  const [filters, setFilters] = useState({
    branchId: "",
    periodStart: "",
    periodEnd: "",
    clientType: "all",
    clientSegment: "all",
    gender: "all"
  });

  const filterParams = new URLSearchParams();
  if (filters.branchId) filterParams.set("branchId", filters.branchId);
  if (filters.periodStart) filterParams.set("periodStart", filters.periodStart);
  if (filters.periodEnd) filterParams.set("periodEnd", filters.periodEnd);
  if (filters.clientType !== "all") filterParams.set("clientType", filters.clientType);
  if (filters.clientSegment !== "all") filterParams.set("clientSegment", filters.clientSegment);
  if (filters.gender !== "all") filterParams.set("gender", filters.gender);
  const filterQs = filterParams.toString();
  const filterKey = filterQs || "none";

  const { data: summary, isLoading: isLoadingSummary } = useQuery({
    queryKey: ["dashboard-summary", filterKey],
    queryFn: async () => {
      const res = await fetch(buildApiUrl(`/api/dashboard/summary${filterQs ? `?${filterQs}` : ""}`), { headers: authHeaders });
      if (!res.ok) throw new Error(t("common.requestFailed"));
      return res.json();
    },
  });

  const { data: branchStats, isLoading: isLoadingBranch } = useQuery({
    queryKey: ["dashboard-branch-stats", filterKey],
    queryFn: async () => {
      const res = await fetch(buildApiUrl(`/api/dashboard/branch-stats${filterQs ? `?${filterQs}` : ""}`), { headers: authHeaders });
      if (!res.ok) throw new Error(t("common.requestFailed"));
      return res.json();
    },
  });

  const { data: statusBreakdown, isLoading: isLoadingStatus } = useQuery({
    queryKey: ["dashboard-client-status", filterKey],
    queryFn: async () => {
      const res = await fetch(buildApiUrl(`/api/dashboard/client-status${filterQs ? `?${filterQs}` : ""}`), { headers: authHeaders });
      if (!res.ok) throw new Error(t("common.requestFailed"));
      return res.json();
    },
  });

  const { data: activities, isLoading: isLoadingActivity } = useQuery({
    queryKey: ["dashboard-activity", filterKey],
    queryFn: async () => {
      const res = await fetch(buildApiUrl(`/api/dashboard/activity${filterQs ? `?${filterQs}` : ""}`), { headers: authHeaders });
      if (!res.ok) throw new Error(t("common.requestFailed"));
      return res.json();
    },
  });

  /* Spark bars fallback — zeros until the API provides a real daily series */
  const sparkData = useMemo(() => {
    const base = summary?.dailyDisbursements;
    if (Array.isArray(base) && base.length) return base;
    return new Array(14).fill(0);
  }, [summary]);

  return (
    <div className="space-y-[14px] animate-in fade-in duration-500">
      {/* ── Page header ── */}
      <div>
        <h2 className="text-[30px] font-bold tracking-tight">{t("dashboard.title")}</h2>
        <p className="text-[13px] text-muted-foreground mt-0.5">{t("dashboard.subtitle")}</p>
      </div>

      {/* ── Filter bar ── */}
      <div className="bg-card border border-border/50 rounded-xl shadow-sm p-4 grid grid-cols-2 lg:grid-cols-6 gap-4">
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 block">
            {t("dashboard.filterBranch")}
          </label>
          <Input
            placeholder={t("dashboard.filterBranchPlaceholder")}
            value={filters.branchId}
            onChange={(e) => setFilters((f) => ({ ...f, branchId: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 block">
            {t("dashboard.filterPeriodFrom")}
          </label>
          <Input
            type="date"
            value={filters.periodStart}
            onChange={(e) => setFilters((f) => ({ ...f, periodStart: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 block">
            {t("dashboard.filterPeriodTo")}
          </label>
          <Input
            type="date"
            value={filters.periodEnd}
            onChange={(e) => setFilters((f) => ({ ...f, periodEnd: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 block">
            {t("dashboard.clientTypeFilter")}
          </label>
          <Select value={filters.clientType} onValueChange={(v) => setFilters((f) => ({ ...f, clientType: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("dashboard.all")}</SelectItem>
              <SelectItem value="individual">{t("dashboard.clientTypeIndividual")}</SelectItem>
              <SelectItem value="corporate">{t("dashboard.clientTypeLegal")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 block">
            {t("dashboard.segmentFilter")}
          </label>
          <Select value={filters.clientSegment} onValueChange={(v) => setFilters((f) => ({ ...f, clientSegment: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("dashboard.all")}</SelectItem>
              <SelectItem value="micro">{t("dashboard.segmentMicro")}</SelectItem>
              <SelectItem value="small">{t("dashboard.segmentSmall")}</SelectItem>
              <SelectItem value="medium">{t("dashboard.segmentMedium")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 block">
            {t("dashboard.genderFilter")}
          </label>
          <Select value={filters.gender} onValueChange={(v) => setFilters((f) => ({ ...f, gender: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("dashboard.all")}</SelectItem>
              <SelectItem value="male">{t("dashboard.genderMale")}</SelectItem>
              <SelectItem value="female">{t("dashboard.genderFemale")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── KPI row ── */}
      <div className="grid gap-3.5 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Users}
          label={t("dashboard.activeClients")}
          value={summary?.totalActiveClients || 0}
          sub={t("dashboard.outOf", { total: summary?.totalClients || 0 })}
          delta={summary?.activeClientsDelta ?? null}
          tone="primary"
          isLoading={isLoadingSummary}
        />
        <KpiCard
          icon={CheckCircle2}
          label={t("dashboard.completedToday")}
          value={summary?.totalCompletedToday || 0}
          sub={t("dashboard.thisMonth", { count: summary?.completedThisMonth || 0 })}
          delta={summary?.completedDelta ?? null}
          tone="blue"
          isLoading={isLoadingSummary}
        />
        <KpiCard
          icon={Building2}
          label={t("dashboard.activeBranches")}
          value={summary?.totalBranches || 0}
          sub={t("dashboard.withHunters", { count: summary?.totalHunters || 0 })}
          delta={summary?.branchesDelta ?? null}
          tone="amber"
          isLoading={isLoadingSummary}
        />
        <KpiCard
          icon={Package}
          label={t("dashboard.totalProducts")}
          value={summary?.totalProducts || 0}
          delta={summary?.productsDelta ?? null}
          tone="teal"
          isLoading={isLoadingSummary}
        />
      </div>

      {/* ── Two-column row: funnel + spark bars ── */}
      <div className="grid lg:grid-cols-[1.3fr_1fr] gap-3.5">
        {/* Client funnel (horizontal bars) */}
        <div className="bg-card border border-border/50 rounded-xl shadow-sm">
          <div className="flex items-center p-4 px-5 border-b border-border/50">
            <div className="flex-1">
              <h3 className="text-sm font-semibold">{t("dashboard.clientStatus")}</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">{t("dashboard.clientStatusDesc")}</p>
            </div>
            <Button variant="outline" size="sm" className="text-xs gap-1 h-7">
              30 {t("dashboard.all") === "Все" ? "дней" : "days"} <ChevronDown className="w-3 h-3" />
            </Button>
          </div>
          <div className="p-5">
            {isLoadingStatus ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="w-[120px] h-4" />
                    <Skeleton className="flex-1 h-[22px] rounded" />
                    <Skeleton className="w-12 h-4" />
                  </div>
                ))}
              </div>
            ) : statusBreakdown?.length ? (
              <HorizontalFunnelBar data={statusBreakdown} t={t} />
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">{t("dashboard.noActivity")}</p>
            )}
          </div>
        </div>

        {/* Spark bars (daily disbursements) */}
        <div className="bg-card border border-border/50 rounded-xl shadow-sm">
          <div className="p-4 px-5">
            <h3 className="text-sm font-semibold">{t("dashboard.branchPerformance")}</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">{t("dashboard.branchPerformanceDesc")}</p>
          </div>
          <div className="px-5 pb-5">
            {isLoadingBranch ? (
              <Skeleton className="h-[54px] w-full rounded" />
            ) : (
              <>
                <SparkBars data={sparkData} />
                <div className="flex justify-between mt-2 text-[10px] text-muted-foreground font-mono">
                  <span>01</span><span>07</span><span>14</span>
                </div>
                {/* insight callout */}
                <div className="mt-3.5 p-2.5 px-3 bg-[hsl(142_71%_40%/0.08)] rounded-lg flex gap-2.5 items-start">
                  <TrendingUp className="w-3.5 h-3.5 mt-0.5 text-[hsl(142_65%_25%)] flex-shrink-0" />
                  <p className="text-xs text-[hsl(142_65%_25%)]">
                    <strong>+18% WoW.</strong>{" "}
                    {t("dashboard.branchPerformanceDesc")}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="bg-card border border-border/50 rounded-xl shadow-sm p-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold">{t("funnel.title", { defaultValue: "Воронка" })}</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {t("funnel.subtitle", { defaultValue: "Конверсия лидов по этапам" })}
          </p>
        </div>
        <FunnelReport embedded />
      </div>

      {/* ── Branch performance chart ── */}
      <div className="bg-card border border-border/50 rounded-xl shadow-sm">
        <div className="flex items-center p-4 px-5 border-b border-border/50">
          <div className="flex-1">
            <h3 className="text-sm font-semibold">{t("dashboard.branchPerformance")}</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">{t("dashboard.branchPerformanceDesc")}</p>
          </div>
          <Button variant="outline" size="sm" className="text-xs gap-1 h-7">
            <Download className="w-3 h-3" />
            {t("common.export")}
          </Button>
        </div>
        <div className="p-5">
          {isLoadingBranch ? (
            <div className="flex h-[300px] items-center justify-center">
              <Skeleton className="h-[260px] w-full rounded" />
            </div>
          ) : (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={branchStats} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="branchName" tickLine={false} axisLine={false} fontSize={11} tickMargin={10} />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} tickMargin={10} />
                  <RechartsTooltip
                    cursor={{ fill: "hsl(var(--muted))" }}
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid hsl(var(--border))",
                      backgroundColor: "hsl(var(--card))",
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="totalClients" name={t("dashboard.totalClients")} fill="hsl(142 71% 40%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="completedClients" name={t("dashboard.completed")} fill="hsl(217 91% 60%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* ── Recent activity ── */}
      <div className="bg-card border border-border/50 rounded-xl shadow-sm">
        <div className="flex items-center gap-2 p-4 px-5 border-b border-border/50">
          <Activity className="h-4 w-4 text-primary" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold">{t("dashboard.recentActivity")}</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">{t("dashboard.recentActivityDesc")}</p>
          </div>
        </div>
        <div className="p-5">
          {isLoadingActivity ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : activities?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {t("dashboard.noActivity")}
            </div>
          ) : (
            <div className="space-y-4">
              {activities?.map((activity: ActivityItem) => (
                <div key={activity.id} className="flex gap-3 items-start">
                  <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-semibold">
                      {activity.userName?.substring(0, 2).toUpperCase() || "SYS"}
                    </span>
                  </div>
                  <div className="flex-1 space-y-0.5">
                    <p className="text-sm">
                      <span className="font-semibold">{activity.userName || "System"}</span>{" "}
                      {activity.description}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>{formatAdminDateTime(activity.createdAt)}</span>
                      {activity.branchName && (
                        <>
                          <span className="text-border">--</span>
                          <span>{activity.branchName}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
