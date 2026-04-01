import { 
  useGetDashboardSummary, getGetDashboardSummaryQueryKey,
  useGetBranchStats, getGetBranchStatsQueryKey,
  useGetClientStatusBreakdown, getGetClientStatusBreakdownQueryKey,
  useGetRecentActivity, getGetRecentActivityQueryKey
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Users, CheckCircle2, Building2, Package, Activity } from "lucide-react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";

export default function Dashboard() {
  const { t } = useTranslation();
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

  const STATUS_COLORS: Record<string, string> = {
    draft: "hsl(215 16% 47%)",
    questionnaire: "hsl(215 100% 50%)",
    recommendation: "hsl(43 100% 50%)",
    basket: "hsl(270 100% 60%)",
    pdf_generated: "hsl(240 100% 60%)",
    completed: "hsl(142 71% 45%)",
    rejected: "hsl(0 84% 60%)",
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">{t("dashboard.title")}</h2>
        <p className="text-muted-foreground mt-1">{t("dashboard.subtitle")}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
                      cursor={{fill: 'hsl(var(--muted))'}}
                      contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--card))' }}
                    />
                    <Legend />
                    <Bar dataKey="totalClients" name={t("dashboard.totalClients")} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="completedClients" name={t("dashboard.completed")} fill="hsl(142 71% 45%)" radius={[4, 4, 0, 0]} />
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
                      <span>{format(new Date(activity.createdAt), 'MMM d, h:mm a')}</span>
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
