import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Activity, Building2, CheckCircle2, FilterX, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { API_BASE } from "@/lib/api-origin";

type DashboardFilters = {
  branchId: string;
  createdFrom: string;
  createdTo: string;
  clientType: string;
  segment: string;
  gender: string;
};

type DashboardSummary = {
  totalClients: number;
  totalActiveClients: number;
  totalCompletedToday: number;
  totalBranches: number;
  totalHunters: number;
  totalProducts: number;
  completedThisMonth: number;
  rejectedThisMonth: number;
};

type BranchStatsRow = {
  branchId: number;
  branchName: string;
  totalClients: number;
  completedClients: number;
  activeHunters: number;
};

type StatusRow = {
  status: string;
  count: number;
};

type ActivityRow = {
  id: number;
  createdAt: string;
  userName: string | null;
  branchName: string | null;
  description: string;
};

type BranchOption = {
  id: number;
  name: string;
};

const STATUS_ORDER = ["draft", "questionnaire", "recommendation", "basket", "pdf_generated", "completed", "rejected"];
const STATUS_COLORS: Record<string, string> = {
  draft: "hsl(215 16% 52%)",
  questionnaire: "hsl(215 90% 52%)",
  recommendation: "hsl(38 95% 52%)",
  basket: "hsl(270 80% 58%)",
  pdf_generated: "hsl(174 72% 40%)",
  completed: "hsl(142 65% 42%)",
  rejected: "hsl(0 80% 58%)",
};

const initialFilters: DashboardFilters = {
  branchId: "all",
  createdFrom: "",
  createdTo: "",
  clientType: "all",
  segment: "all",
  gender: "all",
};

async function dashboardFetch<T>(path: string, filters: DashboardFilters, extraParams?: Record<string, string | number>) {
  const params = new URLSearchParams();
  if (filters.branchId !== "all") params.set("branchId", filters.branchId);
  if (filters.createdFrom) params.set("createdFrom", filters.createdFrom);
  if (filters.createdTo) params.set("createdTo", filters.createdTo);
  if (filters.clientType !== "all") params.set("clientType", filters.clientType);
  if (filters.segment !== "all") params.set("segment", filters.segment);
  if (filters.gender !== "all") params.set("gender", filters.gender);
  if (extraParams) {
    Object.entries(extraParams).forEach(([key, value]) => params.set(key, String(value)));
  }

  const token = localStorage.getItem("auth_token");
  const query = params.toString();
  const response = await fetch(`${API_BASE}${path}${query ? `?${query}` : ""}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<T>;
}

function FunnelCard({
  title,
  description,
  rows,
}: {
  title: string;
  description: string;
  rows: Array<{ status: string; label: string; count: number }>;
}) {
  const maxCount = Math.max(...rows.map((row) => row.count), 1);
  const hasData = rows.some((row) => row.count > 0);

  return (
    <Card className="shadow-sm border-border/50">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="h-[360px] flex items-center justify-center text-sm text-muted-foreground">
            {description}
          </div>
        ) : (
          <div className="h-[360px] flex flex-col justify-center gap-3">
            {rows.map((row) => {
              const width = 34 + (row.count / maxCount) * 66;
              return (
                <div key={row.status} className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{row.label}</span>
                    <span className="font-semibold text-foreground">{row.count}</span>
                  </div>
                  <div className="flex justify-center">
                    <div
                      className="min-h-11 rounded-2xl text-white px-4 py-3 flex items-center justify-between gap-4 shadow-sm"
                      style={{
                        width: `${width}%`,
                        background: STATUS_COLORS[row.status],
                      }}
                    >
                      <span className="text-sm font-medium truncate">{row.label}</span>
                      <span className="text-sm font-bold shrink-0">{row.count}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard({ user }: { user?: { role: string } }) {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<DashboardFilters>(initialFilters);
  const isBranchHead = user?.role === "branch_head";

  const { data: branches } = useQuery({
    queryKey: ["dashboard-branches"],
    queryFn: () => dashboardFetch<BranchOption[]>("/branches", initialFilters),
  });

  const { data: summary, isLoading: isLoadingSummary } = useQuery({
    queryKey: ["dashboard-summary", filters],
    queryFn: () => dashboardFetch<DashboardSummary>("/dashboard/summary", filters),
  });

  const { data: branchStats, isLoading: isLoadingBranch } = useQuery({
    queryKey: ["dashboard-branch-stats", filters],
    queryFn: () => dashboardFetch<BranchStatsRow[]>("/dashboard/branch-stats", filters),
  });

  const { data: statusBreakdown, isLoading: isLoadingStatus } = useQuery({
    queryKey: ["dashboard-client-status", filters],
    queryFn: () => dashboardFetch<StatusRow[]>("/dashboard/client-status", filters),
  });

  const { data: activities, isLoading: isLoadingActivity } = useQuery({
    queryKey: ["dashboard-activity"],
    queryFn: () => dashboardFetch<ActivityRow[]>("/dashboard/activity", initialFilters, { limit: 10 }),
  });

  const statusData = STATUS_ORDER.map((status) => {
    const row = statusBreakdown?.find((entry) => entry.status === status);
    return {
      status,
      label: t(`statuses.${status}`),
      count: row?.count ?? 0,
      fill: STATUS_COLORS[status],
    };
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">{t("dashboard.title")}</h2>
        <p className="text-muted-foreground mt-1">{t("dashboard.subtitle")}</p>
      </div>

      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle>{t("dashboard.filtersTitle")}</CardTitle>
          <CardDescription>{t("dashboard.filtersDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            {!isBranchHead && (
              <Select value={filters.branchId} onValueChange={(value) => setFilters((prev) => ({ ...prev, branchId: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder={t("clients.branch")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("dashboard.allBranches")}</SelectItem>
                  {branches?.map((branch) => (
                    <SelectItem key={branch.id} value={String(branch.id)}>{branch.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Input
              type="date"
              value={filters.createdFrom}
              onChange={(e) => setFilters((prev) => ({ ...prev, createdFrom: e.target.value }))}
            />
            <Input
              type="date"
              value={filters.createdTo}
              onChange={(e) => setFilters((prev) => ({ ...prev, createdTo: e.target.value }))}
            />

            <Select value={filters.clientType} onValueChange={(value) => setFilters((prev) => ({ ...prev, clientType: value }))}>
              <SelectTrigger>
                <SelectValue placeholder={t("dashboard.clientTypeFilter")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("dashboard.allClientTypes")}</SelectItem>
                <SelectItem value="individual">{t("dashboard.clientTypeIndividual")}</SelectItem>
                <SelectItem value="legal">{t("dashboard.clientTypeLegal")}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filters.segment} onValueChange={(value) => setFilters((prev) => ({ ...prev, segment: value }))}>
              <SelectTrigger>
                <SelectValue placeholder={t("dashboard.segmentFilter")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("dashboard.allSegments")}</SelectItem>
                <SelectItem value="micro">{t("dashboard.segmentMicro")}</SelectItem>
                <SelectItem value="small">{t("dashboard.segmentSmall")}</SelectItem>
                <SelectItem value="medium">{t("dashboard.segmentMedium")}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filters.gender} onValueChange={(value) => setFilters((prev) => ({ ...prev, gender: value }))}>
              <SelectTrigger>
                <SelectValue placeholder={t("dashboard.genderFilter")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("dashboard.allGenders")}</SelectItem>
                <SelectItem value="male">{t("dashboard.male")}</SelectItem>
                <SelectItem value="female">{t("dashboard.female")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" className="gap-2" onClick={() => setFilters(initialFilters)}>
              <FilterX className="h-4 w-4" />
              {t("dashboard.resetFilters")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-sm border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("dashboard.totalApplications")}</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? <Skeleton className="h-8 w-20" /> : <div className="text-3xl font-bold">{summary?.totalClients || 0}</div>}
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("dashboard.activeClients")}</CardTitle>
            <Users className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-3xl font-bold">{summary?.totalActiveClients || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("dashboard.outOf", { total: summary?.totalClients || 0 })}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("dashboard.completedToday")}</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-3xl font-bold">{summary?.totalCompletedToday || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("dashboard.thisMonth", { count: summary?.completedThisMonth || 0 })}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("dashboard.activeBranches")}</CardTitle>
            <Building2 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-3xl font-bold">{summary?.totalBranches || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("dashboard.withHunters", { count: summary?.totalHunters || 0 })}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {isLoadingStatus ? (
          <Card className="lg:col-span-4 shadow-sm border-border/50">
            <CardContent className="p-6"><Skeleton className="h-[360px] w-full" /></CardContent>
          </Card>
        ) : (
          <div className="lg:col-span-4">
            <FunnelCard
              title={t("dashboard.applicationsFunnel")}
              description={t("dashboard.applicationsFunnelDesc")}
              rows={statusData}
            />
          </div>
        )}

        <Card className="lg:col-span-3 shadow-sm border-border/50">
          <CardHeader>
            <CardTitle>{t("dashboard.applicationsByStage")}</CardTitle>
            <CardDescription>{t("dashboard.applicationsByStageDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingStatus ? (
              <div className="flex h-[360px] items-center justify-center">
                <Skeleton className="h-[320px] w-full" />
              </div>
            ) : (
              <div className="h-[360px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statusData} margin={{ top: 16, right: 8, left: 0, bottom: 48 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" angle={-24} textAnchor="end" height={72} tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis tickLine={false} axisLine={false} fontSize={12} allowDecimals={false} />
                    <RechartsTooltip
                      formatter={(value: number, _name, payload: { payload?: { label?: string } }) => [value, payload?.payload?.label || ""]}
                      contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", backgroundColor: "hsl(var(--card))" }}
                    />
                    <Bar dataKey="count" name={t("dashboard.totalApplications")} radius={[8, 8, 0, 0]}>
                      {statusData.map((entry) => (
                        <Cell key={entry.status} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="lg:col-span-4 shadow-sm border-border/50">
          <CardHeader>
            <CardTitle>{t("dashboard.branchPerformance")}</CardTitle>
            <CardDescription>{t("dashboard.branchPerformanceDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="pl-0">
            {isLoadingBranch ? (
              <div className="flex h-[350px] items-center justify-center">
                <Skeleton className="h-[300px] w-full ml-6" />
              </div>
            ) : (
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={branchStats} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="branchName" tickLine={false} axisLine={false} fontSize={12} tickMargin={10} />
                    <YAxis tickLine={false} axisLine={false} fontSize={12} tickMargin={10} />
                    <RechartsTooltip
                      cursor={{ fill: "hsl(var(--muted))" }}
                      contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", backgroundColor: "hsl(var(--card))" }}
                    />
                    <Legend />
                    <Bar dataKey="totalClients" name={t("dashboard.totalClients")} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="completedClients" name={t("dashboard.completed")} fill="hsl(217 91% 60%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3 shadow-sm border-border/50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              <CardTitle>{t("dashboard.recentActivity")}</CardTitle>
            </div>
            <CardDescription>{t("dashboard.recentActivityDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingActivity ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex gap-4">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : activities?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">{t("dashboard.noActivity")}</div>
            ) : (
              <div className="space-y-6">
                {activities?.map((activity) => (
                  <div key={activity.id} className="flex gap-4 items-start">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-medium">{activity.userName?.substring(0, 2).toUpperCase() || "SYS"}</span>
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm">
                        <span className="font-semibold">{activity.userName || "System"}</span>{" "}
                        {activity.description}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{format(new Date(activity.createdAt), "MMM d, h:mm a")}</span>
                        {activity.branchName && (
                          <>
                            <span>•</span>
                            <span>{activity.branchName}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
