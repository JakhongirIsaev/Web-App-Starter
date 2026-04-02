import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { Users, Plus, BookOpen, Calculator, Phone, Calendar, FileText, Clock, AlertTriangle, Check, ChevronRight } from "lucide-react";

export default function HomePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

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

  const quickActions = [
    { icon: Plus, label: t("home.newClient"), path: "/new-client", color: "bg-primary text-primary-foreground" },
    { icon: Users, label: t("home.myClients"), path: "/clients", color: "bg-blue-500 text-white" },
    { icon: BookOpen, label: t("home.knowledgeBase"), path: "/knowledge", color: "bg-amber-500 text-white" },
    { icon: Calculator, label: t("home.calc"), path: "/calculator", color: "bg-purple-500 text-white" },
  ];

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

  const todoPendingCount = (todo?.pendingActions?.length || 0) + (todo?.incompleteClients?.length || 0);

  return (
    <div className="space-y-4 pb-4">
      <div className="bg-primary text-primary-foreground p-4 rounded-b-2xl -mx-4 -mt-4 px-4 pt-4">
        <h1 className="text-lg font-semibold">{t("home.greeting", { name: user?.name?.split(" ")[0] || "" })}</h1>
        <p className="text-primary-foreground/70 text-sm">{t("app.subtitle")}</p>

        {todoPendingCount > 0 && (
          <div className="mt-3 bg-white/15 rounded-xl p-3 flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">{t("home.todayTasks")}</p>
              <p className="text-xs text-primary-foreground/70">{todoPendingCount} {t("home.pendingTasks")}</p>
            </div>
            <ChevronRight className="w-5 h-5 text-primary-foreground/70" />
          </div>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-2 px-1">{t("home.quickActions")}</h2>
        <div className="grid grid-cols-4 gap-2">
          {quickActions.map((a) => (
            <button
              key={a.path}
              onClick={() => navigate(a.path)}
              className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-card border border-card-border active:scale-95 transition-transform"
            >
              <div className={`w-10 h-10 rounded-xl ${a.color} flex items-center justify-center`}>
                <a.icon className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-medium text-center leading-tight">{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      {dashboard && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-2 px-1">{t("home.myStats")}</h2>
          <div className="grid grid-cols-3 gap-2">
            <StatCard label={t("home.totalClients")} value={dashboard.totalClients} />
            <StatCard label={t("home.clientsToday")} value={dashboard.clientsToday} />
            <StatCard label={t("home.thisMonth")} value={dashboard.clientsThisMonth} />
            <StatCard label={t("home.completed")} value={dashboard.completedThisMonth} />
            <StatCard label={t("home.proposals")} value={dashboard.proposalsToday} />
          </div>
        </div>
      )}

      {todo && (todo.pendingActions?.length > 0 || todo.incompleteClients?.length > 0) && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-2 px-1">{t("home.todayTasks")}</h2>
          <div className="space-y-2">
            {todo.pendingActions?.map((action: any) => {
              const Icon = actionTypeIcons[action.actionType] || Clock;
              const isOverdue = new Date(action.actionDate) < new Date();
              return (
                <Card key={action.id} className={`${isOverdue ? "border-destructive/50" : ""} cursor-pointer`}
                  onClick={() => action.clientId && navigate(`/clients/${action.clientId}`)}>
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isOverdue ? "bg-destructive/10" : "bg-primary/10"}`}>
                      <Icon className={`w-4 h-4 ${isOverdue ? "text-destructive" : "text-primary"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {actionTypeLabels[action.actionType] || action.actionType}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{action.clientName || "—"}</p>
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
                <p className="text-xs font-medium text-muted-foreground mb-1.5 px-1">{t("home.incompleteClients")}</p>
                {todo.incompleteClients.map((c: any) => (
                  <Card key={c.id} className="mb-1.5 cursor-pointer" onClick={() => navigate(`/clients/${c.id}`)}>
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
                        <FileText className="w-4 h-4 text-amber-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{c.fullName || t("clients.anonymous")}</p>
                        <p className="text-xs text-muted-foreground">{t(`statuses.${c.status}`)}</p>
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
        <Card>
          <CardContent className="p-6 text-center">
            <Check className="w-8 h-8 text-primary mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">{t("home.noTasks")}</p>
          </CardContent>
        </Card>
      )}

      {user?.role === "branch_head" && branchData && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-2 px-1">{t("home.branchSummary")}</h2>
          <Card>
            <CardContent className="p-3">
              <div className="flex justify-between mb-3">
                <span className="text-sm text-muted-foreground">{t("home.totalBranchClients")}</span>
                <span className="font-semibold">{branchData.totalBranchClients}</span>
              </div>
              <p className="text-xs font-medium text-muted-foreground mb-2">{t("home.workers")}</p>
              {branchData.workers?.map((w: any) => (
                <div key={w.id} className="flex justify-between items-center py-1.5 border-b border-border last:border-0">
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

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="p-3 text-center">
        <p className="text-xl font-bold text-primary">{value ?? 0}</p>
        <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{label}</p>
      </CardContent>
    </Card>
  );
}
