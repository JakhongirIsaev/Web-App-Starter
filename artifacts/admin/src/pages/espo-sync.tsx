import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw, AlertTriangle, CheckCircle2, Clock, ListChecks, RotateCcw,
  ExternalLink, Database, History, Play, ChevronDown,
} from "lucide-react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { buildApiUrl } from "@/lib/api";
import { buildAuthHeaders, buildJsonHeaders } from "@/lib/auth-headers";
import { cn } from "@/lib/utils";

interface SyncJob {
  id: number;
  clientId: number;
  clientName: string | null;
  status: string;
  attempts: number;
  lastError: string | null;
  espoLeadId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SyncStats {
  pending: number;
  failed: number;
  succeeded: number;
  total: number;
}

interface ReconciliationRun {
  id: number;
  ranAt: string;
  windowFrom: string;
  windowTo: string;
  espoLeadCount: number;
  localLeadCount: number;
  missingInEspo: Array<{ clientId: number; externalUuid: string; espoLeadId: string | null }>;
  missingInLocal: Array<{ espoLeadId: string; cLocalLeadUuid: string | null }>;
  notes: string | null;
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(buildApiUrl(`/api${url}`), {
    ...init,
    headers: init?.method && init.method !== "GET" ? buildJsonHeaders() : buildAuthHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null as any;
  return res.json();
}

export default function EspoSyncPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [tab, setTab] = useState<"failed" | "pending" | "succeeded" | "reconciliation">("failed");
  const [bulkRetryOpen, setBulkRetryOpen] = useState(false);

  const statsQuery = useQuery<SyncStats>({
    queryKey: ["admin/espo-sync/stats"],
    queryFn: () => apiFetch("/admin/espo-sync/stats"),
  });

  const lastRunQuery = useQuery<ReconciliationRun | null>({
    queryKey: ["admin/espo-sync/reconciliation"],
    queryFn: () => apiFetch("/admin/espo-sync/reconciliation"),
  });

  const retry = useMutation({
    mutationFn: (id: number) => apiFetch(`/admin/espo-sync/retry/${id}`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: t("espoSync.retrySuccess", { defaultValue: "Задача переотправлена" }) });
      qc.invalidateQueries({ queryKey: ["admin/espo-sync"] });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        title: t("espoSync.retryFailed", { defaultValue: "Не удалось переотправить" }),
        description: err instanceof Error ? err.message : String(err),
      });
    },
  });

  const bulkRetry = useMutation({
    mutationFn: () => apiFetch<{ enqueued: number; total: number }>("/admin/espo-sync/retry-all-failed", { method: "POST" }),
    onSuccess: (data) => {
      toast({
        title: t("espoSync.bulkRetryDone", { defaultValue: "Переотправлено: {{n}}", n: data.enqueued }),
      });
      qc.invalidateQueries({ queryKey: ["admin/espo-sync"] });
      setBulkRetryOpen(false);
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        title: t("espoSync.retryFailed", { defaultValue: "Не удалось переотправить" }),
        description: err instanceof Error ? err.message : String(err),
      });
      setBulkRetryOpen(false);
    },
  });

  const runReconcile = useMutation({
    mutationFn: () => apiFetch("/admin/espo-sync/reconciliation/run", { method: "POST" }),
    onSuccess: () => {
      toast({
        title: t("espoSync.reconcileQueued", { defaultValue: "Сверка запущена" }),
        description: t("espoSync.reconcileQueuedDesc", { defaultValue: "Результат появится через 1–2 минуты" }),
      });
      // Invalidate after a short delay to give the worker time to write.
      setTimeout(() => qc.invalidateQueries({ queryKey: ["admin/espo-sync"] }), 5000);
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        title: t("espoSync.reconcileFailed", { defaultValue: "Не удалось запустить сверку" }),
        description: err instanceof Error ? err.message : String(err),
      });
    },
  });

  const stats = statsQuery.data;
  const lastRun = lastRunQuery.data;

  return (
    <div className="p-6 max-w-7xl mx-auto pb-12">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Database className="w-7 h-7 text-primary" />
            {t("espoSync.title", { defaultValue: "Синхронизация с Espo" })}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("espoSync.subtitleV2", { defaultValue: "Отправка лидов в EspoCRM, отслеживание ошибок и сверка." })}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => runReconcile.mutate()} disabled={runReconcile.isPending} className="gap-2 shrink-0">
          <Play className="w-3.5 h-3.5" />
          {runReconcile.isPending
            ? t("espoSync.reconcileRunning", { defaultValue: "Запускаем…" })
            : t("espoSync.runReconcile", { defaultValue: "Запустить сверку" })}
        </Button>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard
          label={t("espoSync.statSucceeded", { defaultValue: "Успешно" })}
          value={stats?.succeeded ?? "—"}
          icon={CheckCircle2}
          tone="text-emerald-600 dark:text-emerald-400"
          loading={statsQuery.isLoading}
        />
        <StatCard
          label={t("espoSync.statPending", { defaultValue: "В очереди" })}
          value={stats?.pending ?? "—"}
          icon={Clock}
          tone={stats && stats.pending > 0 ? "text-amber-600 dark:text-amber-400" : undefined}
          loading={statsQuery.isLoading}
        />
        <StatCard
          label={t("espoSync.statFailed", { defaultValue: "Ошибок" })}
          value={stats?.failed ?? "—"}
          icon={AlertTriangle}
          tone={stats && stats.failed > 0 ? "text-rose-600 dark:text-rose-400" : undefined}
          loading={statsQuery.isLoading}
        />
        <StatCard
          label={t("espoSync.statTotal", { defaultValue: "Всего задач" })}
          value={stats?.total ?? "—"}
          icon={ListChecks}
          loading={statsQuery.isLoading}
        />
      </div>

      {/* ── Last reconciliation banner ── */}
      <ReconciliationCard run={lastRun} loading={lastRunQuery.isLoading} />

      {/* ── Tabs ── */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="mt-6">
        <TabsList className="grid w-full grid-cols-4 h-auto p-1">
          <TabsTrigger value="failed" className="gap-1.5 text-xs">
            <AlertTriangle className="w-3.5 h-3.5" />
            {t("espoSync.tabFailed", { defaultValue: "Ошибки" })}
            {stats && stats.failed > 0 && (
              <Badge variant="destructive" className="ml-1 h-4 px-1 text-[9px]">{stats.failed}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="pending" className="gap-1.5 text-xs">
            <Clock className="w-3.5 h-3.5" />
            {t("espoSync.tabPending", { defaultValue: "В очереди" })}
            {stats && stats.pending > 0 && (
              <Badge variant="outline" className="ml-1 h-4 px-1 text-[9px]">{stats.pending}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="succeeded" className="gap-1.5 text-xs">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {t("espoSync.tabSucceeded", { defaultValue: "Успешно" })}
          </TabsTrigger>
          <TabsTrigger value="reconciliation" className="gap-1.5 text-xs">
            <History className="w-3.5 h-3.5" />
            {t("espoSync.tabReconciliation", { defaultValue: "История сверок" })}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="failed" className="mt-4">
          <JobsTable
            status="failed"
            actionLabel={t("espoSync.retry", { defaultValue: "Переотправить" })}
            onRetry={(id) => retry.mutate(id)}
            isRetrying={retry.isPending}
            bulkAction={
              stats && stats.failed > 0 ? (
                <Button variant="outline" size="sm" onClick={() => setBulkRetryOpen(true)} className="gap-2">
                  <RotateCcw className="w-3.5 h-3.5" />
                  {t("espoSync.retryAll", { defaultValue: "Переотправить все" })} ({stats.failed})
                </Button>
              ) : undefined
            }
          />
        </TabsContent>

        <TabsContent value="pending" className="mt-4">
          <JobsTable status="pending" />
        </TabsContent>

        <TabsContent value="succeeded" className="mt-4">
          <JobsTable status="succeeded" />
        </TabsContent>

        <TabsContent value="reconciliation" className="mt-4">
          <ReconciliationHistory />
        </TabsContent>
      </Tabs>

      {/* Bulk retry confirm */}
      <AlertDialog open={bulkRetryOpen} onOpenChange={setBulkRetryOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("espoSync.bulkRetryTitle", { defaultValue: "Переотправить все ошибки?" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("espoSync.bulkRetryDesc", {
                defaultValue: "Будут переотправлены все {{n}} задач со статусом «Ошибка» (до 200 за раз).",
                n: stats?.failed ?? 0,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel", { defaultValue: "Отмена" })}</AlertDialogCancel>
            <AlertDialogAction onClick={() => bulkRetry.mutate()} disabled={bulkRetry.isPending}>
              {bulkRetry.isPending
                ? t("common.saving", { defaultValue: "…" })
                : t("espoSync.retryAll", { defaultValue: "Переотправить все" })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────── */

function StatCard({ label, value, icon: Icon, tone, loading }: { label: string; value: any; icon: any; tone?: string; loading?: boolean }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn("w-3.5 h-3.5", tone ?? "text-muted-foreground")} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      {loading ? (
        <Skeleton className="h-8 w-16" />
      ) : (
        <div className={cn("text-2xl font-bold tabular-nums", tone)}>{value}</div>
      )}
    </div>
  );
}

function ReconciliationCard({ run, loading }: { run: ReconciliationRun | null | undefined; loading: boolean }) {
  const { t } = useTranslation();
  if (loading) return <Skeleton className="h-24" />;
  if (!run) {
    return (
      <div className="rounded-xl border-2 border-dashed bg-card p-5 text-center text-sm text-muted-foreground">
        <RefreshCw className="w-6 h-6 mx-auto mb-2 opacity-40" />
        {t("espoSync.noReconcile", { defaultValue: "Сверка ещё не запускалась. Нажмите «Запустить сверку» выше." })}
      </div>
    );
  }
  const issues = run.missingInEspo.length + run.missingInLocal.length;
  const isHealthy = issues === 0;
  return (
    <div className={cn(
      "rounded-xl border p-5 shadow-sm",
      isHealthy ? "bg-emerald-50/40 border-emerald-200 dark:bg-emerald-950/10 dark:border-emerald-900/40"
                : "bg-rose-50/40 border-rose-200 dark:bg-rose-950/10 dark:border-rose-900/40",
    )}>
      <div className="flex items-start gap-4 flex-wrap">
        {isHealthy ? (
          <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
        ) : (
          <AlertTriangle className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-[280px]">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-sm">
              {t("espoSync.lastReconcile", { defaultValue: "Последняя сверка" })}
            </h3>
            <span className="text-xs text-muted-foreground tabular-nums">
              {new Date(run.ranAt).toLocaleString("ru-RU")}
            </span>
          </div>
          <p className="text-sm">
            {t("espoSync.reconcileSummary", {
              defaultValue: "В Espo {{e}} лидов · локально {{l}} лидов · окно: {{from}} → {{to}}",
              e: run.espoLeadCount,
              l: run.localLeadCount,
              from: new Date(run.windowFrom).toLocaleString("ru-RU"),
              to: new Date(run.windowTo).toLocaleString("ru-RU"),
            })}
          </p>
          {!isHealthy && (
            <div className="flex flex-wrap gap-2 mt-2">
              {run.missingInEspo.length > 0 && (
                <Badge variant="destructive">
                  {run.missingInEspo.length} {t("espoSync.notInEspo", { defaultValue: "лидов нет в Espo" })}
                </Badge>
              )}
              {run.missingInLocal.length > 0 && (
                <Badge className="bg-amber-600 hover:bg-amber-600">
                  {run.missingInLocal.length} {t("espoSync.notInLocal", { defaultValue: "лидов нет локально" })}
                </Badge>
              )}
            </div>
          )}
          {run.notes && (
            <div className="text-xs text-muted-foreground italic mt-2">{run.notes}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function JobsTable({
  status,
  actionLabel,
  onRetry,
  isRetrying,
  bulkAction,
}: {
  status: "failed" | "pending" | "succeeded";
  actionLabel?: string;
  onRetry?: (id: number) => void;
  isRetrying?: boolean;
  bulkAction?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: jobs = [], isLoading } = useQuery<SyncJob[]>({
    queryKey: ["admin/espo-sync", status],
    queryFn: () => apiFetch(`/admin/espo-sync/jobs?status=${status}`),
  });

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      {bulkAction && (
        <div className="px-4 py-2 border-b flex items-center justify-end">
          {bulkAction}
        </div>
      )}
      {isLoading ? (
        <div className="p-4 space-y-2">
          <Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="p-12 text-center text-muted-foreground">
          <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">
            {t(`espoSync.empty.${status}`, {
              defaultValue: status === "failed"
                ? "Ошибок нет. Все лиды синхронизированы 🎉"
                : status === "pending"
                  ? "Очередь пуста"
                  : "Пока нет успешных синхронизаций",
            })}
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">{t("espoSync.col.id", { defaultValue: "Job ID" })}</TableHead>
              <TableHead>{t("espoSync.col.client", { defaultValue: "Клиент" })}</TableHead>
              <TableHead className="w-24 text-center">{t("espoSync.col.attempts", { defaultValue: "Попыток" })}</TableHead>
              <TableHead className="w-44">{t("espoSync.col.espoLead", { defaultValue: "Espo Lead ID" })}</TableHead>
              <TableHead className="w-44">{t("espoSync.col.updated", { defaultValue: "Обновлено" })}</TableHead>
              {status === "failed" && <TableHead>{t("espoSync.col.error", { defaultValue: "Ошибка" })}</TableHead>}
              <TableHead className="w-32 text-right">{t("espoSync.col.action", { defaultValue: "Действия" })}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.flatMap((job) => {
              const expanded = expandedId === job.id;
              const hasError = !!job.lastError;
              const items = [
                <TableRow
                  key={job.id}
                  className={cn(hasError && "cursor-pointer hover:bg-muted/40")}
                  onClick={() => hasError && setExpandedId(expanded ? null : job.id)}
                >
                  <TableCell className="font-mono text-xs">{job.id}</TableCell>
                  <TableCell>
                    <Link href={`/clients/${job.clientId}`} onClick={(e) => e.stopPropagation()}>
                      <span className="inline-flex items-center gap-1 text-sm hover:underline">
                        {job.clientName ?? `#${job.clientId}`}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={job.attempts > 3 ? "destructive" : "outline"} className="tabular-nums">
                      {job.attempts}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {job.espoLeadId ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">
                    {new Date(job.updatedAt).toLocaleString("ru-RU")}
                  </TableCell>
                  {status === "failed" && (
                    <TableCell className="max-w-md">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-rose-700 dark:text-rose-400 truncate">{job.lastError ?? "—"}</span>
                        {hasError && (
                          <ChevronDown
                            className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform shrink-0", expanded && "rotate-180")}
                          />
                        )}
                      </div>
                    </TableCell>
                  )}
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    {onRetry && actionLabel && (
                      <Button size="sm" variant="outline" onClick={() => onRetry(job.id)} disabled={isRetrying}>
                        {actionLabel}
                      </Button>
                    )}
                    {job.espoLeadId && (
                      <span className="text-[10px] text-muted-foreground ml-2">
                        <ExternalLink className="w-3 h-3 inline" />
                      </span>
                    )}
                  </TableCell>
                </TableRow>,
              ];
              if (expanded && hasError) {
                items.push(
                  <TableRow key={`${job.id}-err`}>
                    <TableCell colSpan={status === "failed" ? 7 : 6} className="bg-muted/30">
                      <pre className="text-xs font-mono whitespace-pre-wrap break-all p-3 max-h-64 overflow-auto">
                        {job.lastError}
                      </pre>
                    </TableCell>
                  </TableRow>,
                );
              }
              return items;
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function ReconciliationHistory() {
  const { t } = useTranslation();
  const { data = [], isLoading } = useQuery<ReconciliationRun[]>({
    queryKey: ["admin/espo-sync/reconciliation/history"],
    queryFn: () => apiFetch("/admin/espo-sync/reconciliation/history"),
  });

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      {isLoading ? (
        <div className="p-4 space-y-2">
          <Skeleton className="h-12" /><Skeleton className="h-12" />
        </div>
      ) : data.length === 0 ? (
        <div className="p-12 text-center text-muted-foreground">
          <History className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">{t("espoSync.noHistory", { defaultValue: "Сверки ещё не запускались" })}</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-44">{t("espoSync.col.ranAt", { defaultValue: "Запущена" })}</TableHead>
              <TableHead className="w-32 text-right">{t("espoSync.col.espoLeads", { defaultValue: "Лидов в Espo" })}</TableHead>
              <TableHead className="w-32 text-right">{t("espoSync.col.localLeads", { defaultValue: "Локально" })}</TableHead>
              <TableHead className="w-32 text-right">{t("espoSync.col.missingEspo", { defaultValue: "Нет в Espo" })}</TableHead>
              <TableHead className="w-32 text-right">{t("espoSync.col.missingLocal", { defaultValue: "Нет локально" })}</TableHead>
              <TableHead>{t("espoSync.col.notes", { defaultValue: "Заметки" })}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((r) => {
              const issues = r.missingInEspo.length + r.missingInLocal.length;
              return (
                <TableRow key={r.id} className={issues > 0 ? "bg-rose-50/30 dark:bg-rose-950/10" : undefined}>
                  <TableCell className="text-xs tabular-nums">{new Date(r.ranAt).toLocaleString("ru-RU")}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.espoLeadCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.localLeadCount}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.missingInEspo.length > 0 ? (
                      <span className="text-rose-700 dark:text-rose-400 font-semibold">{r.missingInEspo.length}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.missingInLocal.length > 0 ? (
                      <span className="text-amber-700 dark:text-amber-400 font-semibold">{r.missingInLocal.length}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground italic">{r.notes ?? "—"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
