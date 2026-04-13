import {
  useGetDashboardSummary, getGetDashboardSummaryQueryKey,
  useGetBranchStats, getGetBranchStatsQueryKey,
  useGetClientStatusBreakdown, getGetClientStatusBreakdownQueryKey,
  useGetRecentActivity, getGetRecentActivityQueryKey
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { buildApiUrl } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Users, CheckCircle2, Building2, Package, Activity, Sparkles, Wifi, WifiOff, Phone, Calendar, FileText, Clock, AlertTriangle, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";
import { formatAdminDateTime } from "@/lib/time";
import { useLocation } from "wouter";

const ACTION_TYPE_ICONS: Record<string, any> = {
  follow_up: Phone,
  meeting: Calendar,
  proposal: FileText,
  documents: FileText,
};

export default function Dashboard() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey() }
  });
  
  const { data: branchStats, isLoading: isLoadingBranch } = useGetBranchStats({
    query: { queryKey: getGetBranchStatsQueryKey() }
  });

  const { data: statusBreakdown, isLoading: isLoadingStatus } = useGetClientStatusBreakdown({
    query: { queryKey: getGetClientStatusBreakdownQueryKey() }
  });

  const { data: activities, isLoading: isLoadingActivity } = useGetRecentActivity(
    { limit: 10 },
    { query: { queryKey: getGetRecentActivityQueryKey({ limit: 10 }) } }
  );

  const { data: aiHealth } = useQuery({
    queryKey: ["ai-health"],
    queryFn: async () => {
      const res = await fetch(buildApiUrl("/api/ai/health"));
      if (!res.ok) return { status: "degraded", ollamaReachable: false, model: "unknown", modelAvailable: false };
      return res.json();
    },
    refetchInterval: 60000,
    retry: false,
  });

  const { data: tasks, isLoading: isLoadingTasks } = useQuery({
    queryKey: ["dashboard-tasks"],
    queryFn: async () => {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(buildApiUrl("/api/dashboard/tasks"), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 120000,
  });

  const STATUS_COLORS: Record<string, string> = {
    draft:          "hsl(215 16% 52%)",   // slate-gray
    questionnaire:  "hsl(215 90% 52%)",   // blue
    recommendation: "hsl(38 95% 52%)",    // amber
    basket:         "hsl(270 80% 58%)",   // purple
    pdf_generated:  "hsl(174 72% 40%)",   // teal
    completed:      "hsl(142 65% 42%)",   // green
    rejected:       "hsl(0 80% 58%)",     // red
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">{t("dashboard.title")}</h2>
        <p className="text-muted-foreground mt-1">{t("dashboard.subtitle")}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card className="shadow-sm border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("dashboard.activeClients")}</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? <Skeleton className="h-8 w-20" /> : (
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
            {isLoadingSummary ? <Skeleton className="h-8 w-20" /> : (
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
            <Building2 className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? <Skeleton className="h-8 w-20" /> : (
              <>
                <div className="text-3xl font-bold">{summary?.totalBranches || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("dashboard.withHunters", { count: summary?.totalHunters || 0 })}
                </p>
              </>
            )}
          </CardContent>
        </Card>
        <Card className="shadow-sm border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("dashboard.totalProducts")}</CardTitle>
            <Package className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? <Skeleton className="h-8 w-20" /> : (
              <div className="text-3xl font-bold">{summary?.totalProducts || 0}</div>
            )}
          </CardContent>
        </Card>
        <Card className={`shadow-sm ${aiHealth?.ollamaReachable ? 'border-green-500/30 bg-green-500/5' : 'border-orange-500/30 bg-orange-500/5'}`}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("dashboard.aiStatus")}</CardTitle>
            <Sparkles className={`h-4 w-4 ${aiHealth?.ollamaReachable ? 'text-green-500' : 'text-orange-500'}`} />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {aiHealth?.ollamaReachable ? (
                <Wifi className="h-5 w-5 text-green-500" />
              ) : (
                <WifiOff className="h-5 w-5 text-orange-500" />
              )}
              <Badge variant={aiHealth?.ollamaReachable ? "default" : "secondary"}>
                {aiHealth?.ollamaReachable ? t("dashboard.aiOnline") : t("dashboard.aiOffline")}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {aiHealth?.model || "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm border-border/50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            <CardTitle>{t("dashboard.todayTasks")}</CardTitle>
          </div>
          <CardDescription>{t("dashboard.todayTasksDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingTasks ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : !tasks?.length ? (
            <div className="text-center py-6 text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-primary" />
              <p className="text-sm">{t("dashboard.noTasks")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tasks.slice(0, 8).map((task: any) => {
                const Icon = ACTION_TYPE_ICONS[task.actionType] || Clock;
                const isOverdue = new Date(task.actionDate) < new Date();
                return (
                  <div
                    key={task.id}
                    onClick={() => task.clientId && navigate(`/clients/${task.clientId}`)}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors ${isOverdue ? "border-destructive/30 bg-destructive/5" : "border-border"}`}
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isOverdue ? "bg-destructive/10" : "bg-primary/10"}`}>
                      <Icon className={`w-4 h-4 ${isOverdue ? "text-destructive" : "text-primary"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {t(`dashboard.${task.actionType}`, { defaultValue: task.actionType })}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{task.clientName || "—"}</p>
                    </div>
                    {task.priority === "high" && (
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0">!</Badge>
                    )}
                    {isOverdue && (
                      <span className="text-[10px] text-destructive font-medium flex items-center gap-0.5">
                        <AlertTriangle className="w-3 h-3" />
                        {t("dashboard.overdue")}
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

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
                      cursor={{fill: 'hsl(var(--muted))'}}
                      contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--card))' }}
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
            <CardTitle>{t("dashboard.clientStatus")}</CardTitle>
            <CardDescription>{t("dashboard.clientStatusDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingStatus ? (
              <div className="flex h-[350px] items-center justify-center">
                <Skeleton className="h-[250px] w-[250px] rounded-full" />
              </div>
            ) : (
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={80}
                      outerRadius={120}
                      paddingAngle={2}
                      dataKey="count"
                      nameKey="status"
                    >
                      {statusBreakdown?.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.status] || STATUS_COLORS.draft} />
                      ))}
                    </Pie>
                    <RechartsTooltip 
                      formatter={(value: number, name: string) => [value, t(`statuses.${name}`)]}
                      contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--card))' }}
                    />
                    <Legend 
                      formatter={(value) => <span className="text-xs font-medium">{t(`statuses.${value}`)}</span>}
                      layout="horizontal" 
                      verticalAlign="bottom"
                      align="center"
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm border-border/50">
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
              {[1, 2, 3, 4, 5].map(i => (
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
            <div className="text-center py-8 text-muted-foreground">
              {t("dashboard.noActivity")}
            </div>
          ) : (
            <div className="space-y-6">
              {activities?.map((activity) => (
                <div key={activity.id} className="flex gap-4 items-start">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-medium">
                      {activity.userName?.substring(0, 2).toUpperCase() || 'SYS'}
                    </span>
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm">
                      <span className="font-semibold">{activity.userName || 'System'}</span>
                      {" "}{activity.description}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatAdminDateTime(activity.createdAt)}</span>
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
  );
}
