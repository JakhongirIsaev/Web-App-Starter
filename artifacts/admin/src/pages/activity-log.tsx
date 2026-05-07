import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity, ChevronLeft, ChevronRight, ChevronDown, Search, Download,
  Filter, Users as UsersIcon, Calendar, BarChart3, Clock, ExternalLink,
} from "lucide-react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { buildApiUrl } from "@/lib/api";
import { buildAuthHeaders } from "@/lib/auth-headers";
import { cn } from "@/lib/utils";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatAdminDateTime } from "@/lib/time";

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(buildApiUrl(`/api${url}`), {
    headers: buildAuthHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

interface ActivityRow {
  id: number;
  type: string;
  description: string;
  entityId: number | null;
  entityType: string | null;
  userId: number | null;
  userName: string | null;
  branchName: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface PageResult {
  data: ActivityRow[];
  total: number;
  page: number;
  pageSize: number;
}

interface BranchRow { id: number; name: string }
interface UserRow { id: number; name: string }

// Group event types by category for nicer dropdown + colored badges.
const TYPE_GROUPS: Record<string, { label: string; tone: string; matchers: RegExp }> = {
  client: {
    label: "Клиенты",
    tone: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
    matchers: /^client_/,
  },
  collateral: {
    label: "Залог",
    tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
    matchers: /^(collateral_|estimate_)/,
  },
  policy: {
    label: "Политика",
    tone: "bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300",
    matchers: /^(policy_|credit_policy_)/,
  },
  espo: {
    label: "Espo",
    tone: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
    matchers: /^espo_/,
  },
  user: {
    label: "Пользователи",
    tone: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
    matchers: /^(user_|auth_|login_)/,
  },
  catalog: {
    label: "Каталог",
    tone: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300",
    matchers: /^(article_|product_|sap_|credit_line_|branch_)/,
  },
  other: {
    label: "Другое",
    tone: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    matchers: /.*/,
  },
};

function categorize(type: string): string {
  for (const [key, group] of Object.entries(TYPE_GROUPS)) {
    if (key === "other") continue;
    if (group.matchers.test(type)) return key;
  }
  return "other";
}

function todayIso() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}
function daysAgoIso(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function ActivityLogPage() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [page, setPage] = useState(1);
  const [type, setType] = useState<string>("all");
  const [userId, setUserId] = useState<string>("all");
  const [branchName, setBranchName] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const params = new URLSearchParams({ page: String(page), pageSize: "25" });
  if (type !== "all") params.set("type", type);
  if (userId !== "all") params.set("userId", userId);
  if (branchName !== "all") params.set("branchName", branchName);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (search.trim()) params.set("search", search.trim());

  const { data, isLoading, isFetching } = useQuery<PageResult>({
    queryKey: ["admin/activity-log", { type, userId, branchName, from, to, search, page }],
    queryFn: () => apiFetch<PageResult>(`/admin/activity-log?${params.toString()}`),
  });

  const { data: types = [] } = useQuery<string[]>({
    queryKey: ["admin/activity-log/types"],
    queryFn: () => apiFetch<string[]>(`/admin/activity-log/types`),
  });

  const { data: branches = [] } = useQuery<BranchRow[]>({
    queryKey: ["branches", "list-for-filter"],
    queryFn: () => apiFetch<BranchRow[]>("/branches"),
  });

  const { data: usersResp } = useQuery<{ data: UserRow[] }>({
    queryKey: ["users", "list-for-filter"],
    queryFn: () => apiFetch<{ data: UserRow[] }>("/users?pageSize=200"),
  });
  const users = usersResp?.data ?? [];

  // Today / 7d aggregates derived from a separate small-window query.
  const { data: weekData } = useQuery<PageResult>({
    queryKey: ["admin/activity-log", "week-stats"],
    queryFn: () => apiFetch<PageResult>(`/admin/activity-log?from=${daysAgoIso(7)}&pageSize=200`),
  });

  const stats = useMemo(() => {
    if (!weekData) return null;
    const today = todayIso();
    const todayCount = weekData.data.filter((r) => r.createdAt.startsWith(today)).length;
    const uniqueUsers = new Set(weekData.data.map((r) => r.userId).filter(Boolean)).size;
    const typeCounts = new Map<string, number>();
    for (const r of weekData.data) typeCounts.set(r.type, (typeCounts.get(r.type) ?? 0) + 1);
    const top = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      today: todayCount,
      week: weekData.total,
      uniqueUsers,
      topType: top ? `${top[0]} (${top[1]})` : "—",
    };
  }, [weekData]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const groupedTypes = useMemo(() => {
    const groups: Record<string, string[]> = {};
    for (const tp of types) {
      const cat = categorize(tp);
      (groups[cat] ??= []).push(tp);
    }
    return groups;
  }, [types]);

  const exportCsv = async () => {
    try {
      const csvParams = new URLSearchParams({ page: "1", pageSize: "1000" });
      if (type !== "all") csvParams.set("type", type);
      if (userId !== "all") csvParams.set("userId", userId);
      if (branchName !== "all") csvParams.set("branchName", branchName);
      if (from) csvParams.set("from", from);
      if (to) csvParams.set("to", to);
      if (search.trim()) csvParams.set("search", search.trim());
      const res = await apiFetch<PageResult>(`/admin/activity-log?${csvParams.toString()}`);
      const header = ["Время", "Тип", "Пользователь", "Филиал", "Описание", "Сущность", "ID сущности"];
      const body = res.data.map((r) => [
        new Date(r.createdAt).toLocaleString("ru-RU"),
        r.type,
        r.userName ?? "",
        r.branchName ?? "",
        r.description,
        r.entityType ?? "",
        r.entityId ?? "",
      ]);
      const csv = [header, ...body]
        .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
        .join("\n");
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `activity-log-${todayIso()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: t("common.exportDone", { defaultValue: "Экспортировано" }) });
    } catch (err: any) {
      toast({ variant: "destructive", title: t("common.exportFailed", { defaultValue: "Ошибка экспорта" }), description: String(err?.message ?? err) });
    }
  };

  const reset = () => {
    setType("all"); setUserId("all"); setBranchName("all");
    setFrom(""); setTo(""); setSearch("");
    setPage(1);
  };

  const setPreset = (preset: "today" | "yesterday" | "7d" | "30d") => {
    const t = todayIso();
    if (preset === "today") { setFrom(t); setTo(t); }
    else if (preset === "yesterday") { const y = daysAgoIso(1); setFrom(y); setTo(y); }
    else if (preset === "7d") { setFrom(daysAgoIso(7)); setTo(t); }
    else if (preset === "30d") { setFrom(daysAgoIso(30)); setTo(t); }
    setPage(1);
  };

  const hasFilters = type !== "all" || userId !== "all" || branchName !== "all" || from || to || search.trim();

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="h-7 w-7 text-primary" />
            {t("activityLog.title", { defaultValue: "Журнал активности" })}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("activityLog.subtitle", { defaultValue: "Хронология всех действий в системе." })}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data?.data?.length} className="gap-2 shrink-0">
          <Download className="w-3.5 h-3.5" />
          CSV
        </Button>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label={t("activityLog.statToday", { defaultValue: "Сегодня" })} value={stats?.today ?? "—"} icon={Clock} loading={!stats} />
        <StatCard label={t("activityLog.statWeek", { defaultValue: "За 7 дней" })} value={stats?.week ?? "—"} icon={BarChart3} loading={!stats} />
        <StatCard label={t("activityLog.statUsers", { defaultValue: "Активных пользователей" })} value={stats?.uniqueUsers ?? "—"} icon={UsersIcon} loading={!stats} />
        <StatCard label={t("activityLog.statTopType", { defaultValue: "Топ тип" })} value={stats?.topType ?? "—"} icon={Activity} loading={!stats} small />
      </div>

      {/* ── Filters ── */}
      <div className="rounded-xl border bg-card shadow-sm p-4 mb-4 space-y-3">
        {/* Quick presets */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground mr-1">{t("activityLog.quickRange", { defaultValue: "Быстро:" })}</span>
          {[
            { v: "today", label: t("activityLog.today", { defaultValue: "Сегодня" }) },
            { v: "yesterday", label: t("activityLog.yesterday", { defaultValue: "Вчера" }) },
            { v: "7d", label: "7 дн" },
            { v: "30d", label: "30 дн" },
          ].map((p) => (
            <Button key={p.v} variant="outline" size="sm" className="h-7 text-xs" onClick={() => setPreset(p.v as any)}>
              {p.label}
            </Button>
          ))}
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={reset} className="h-7 text-xs ml-auto gap-1 text-muted-foreground">
              <Filter className="w-3 h-3" />
              {t("common.reset", { defaultValue: "Сбросить" })}
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
          {/* Search */}
          <div className="lg:col-span-2">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {t("activityLog.search", { defaultValue: "Поиск" })}
            </Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder={t("activityLog.searchPlaceholder", { defaultValue: "по описанию или клиенту…" })}
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-8 h-9"
              />
            </div>
          </div>

          {/* Type */}
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("activityLog.filterType", { defaultValue: "Тип" })}</Label>
            <Select value={type} onValueChange={(v) => { setType(v); setPage(1); }}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("activityLog.allTypes", { defaultValue: "Все типы" })}</SelectItem>
                {Object.entries(TYPE_GROUPS).map(([cat, group]) => {
                  const list = groupedTypes[cat] ?? [];
                  if (list.length === 0) return null;
                  return list.sort().map((tp) => (
                    <SelectItem key={tp} value={tp}>
                      <span className="text-[10px] text-muted-foreground mr-1">[{group.label}]</span>
                      {tp}
                    </SelectItem>
                  ));
                })}
              </SelectContent>
            </Select>
          </div>

          {/* User */}
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("activityLog.filterUser", { defaultValue: "Пользователь" })}</Label>
            <Select value={userId} onValueChange={(v) => { setUserId(v); setPage(1); }}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("activityLog.allUsers", { defaultValue: "Все пользователи" })}</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Branch */}
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("activityLog.filterBranch", { defaultValue: "Филиал" })}</Label>
            <Select value={branchName} onValueChange={(v) => { setBranchName(v); setPage(1); }}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("activityLog.allBranches", { defaultValue: "Все филиалы" })}</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date range */}
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("activityLog.filterFrom", { defaultValue: "С" })}</Label>
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="h-9" />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("activityLog.filterTo", { defaultValue: "По" })}</Label>
            <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="h-9" />
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : !data || data.data.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Activity className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">{t("activityLog.empty", { defaultValue: "Записей нет" })}</p>
            {hasFilters && (
              <Button variant="link" size="sm" onClick={reset} className="mt-2">
                {t("common.reset", { defaultValue: "Сбросить фильтры" })}
              </Button>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-44">{t("activityLog.colTime", { defaultValue: "Время" })}</TableHead>
                <TableHead className="w-44">{t("activityLog.colEvent", { defaultValue: "Событие" })}</TableHead>
                <TableHead className="w-40">{t("activityLog.colUser", { defaultValue: "Пользователь" })}</TableHead>
                <TableHead className="w-32">{t("activityLog.colBranch", { defaultValue: "Филиал" })}</TableHead>
                <TableHead>{t("activityLog.colDescription", { defaultValue: "Описание" })}</TableHead>
                <TableHead className="w-28 text-right">{t("activityLog.colEntity", { defaultValue: "Сущность" })}</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.flatMap((row) => {
                const hasMetadata = row.metadata && Object.keys(row.metadata).length > 0;
                const expanded = expandedId === row.id;
                const cat = categorize(row.type);
                const tone = TYPE_GROUPS[cat].tone;
                const items = [
                  <TableRow
                    key={row.id}
                    className={cn(hasMetadata && "cursor-pointer hover:bg-muted/40")}
                    onClick={() => hasMetadata && setExpandedId(expanded ? null : row.id)}
                  >
                    <TableCell className="text-xs text-muted-foreground tabular-nums">
                      {formatAdminDateTime(row.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={cn("font-mono text-[10px] border-0", tone)}>
                        {row.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{row.userName ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{row.branchName ?? "—"}</TableCell>
                    <TableCell className="text-sm">{row.description}</TableCell>
                    <TableCell className="text-right">
                      {row.entityType === "client" && row.entityId ? (
                        <Link href={`/clients/${row.entityId}`} onClick={(e) => e.stopPropagation()}>
                          <span className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                            #{row.entityId}
                            <ExternalLink className="w-3 h-3" />
                          </span>
                        </Link>
                      ) : row.entityId ? (
                        <span className="text-xs text-muted-foreground tabular-nums">{row.entityType ?? "?"} #{row.entityId}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {hasMetadata ? (
                        <ChevronDown
                          className={cn("h-4 w-4 text-muted-foreground transition-transform", expanded && "rotate-180")}
                        />
                      ) : null}
                    </TableCell>
                  </TableRow>,
                ];
                if (expanded && hasMetadata) {
                  items.push(
                    <TableRow key={`${row.id}-meta`}>
                      <TableCell colSpan={7} className="bg-muted/30">
                        <pre className="text-xs font-mono whitespace-pre-wrap break-all p-3 max-h-64 overflow-auto">
                          {JSON.stringify(row.metadata, null, 2)}
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

        {data && data.total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <div className="text-xs text-muted-foreground">
              {t("activityLog.showing", {
                defaultValue: "Показано {{from}}–{{to}} из {{total}}",
                from: (data.page - 1) * data.pageSize + 1,
                to: Math.min(data.page * data.pageSize, data.total),
                total: data.total,
              })}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1 || isFetching}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs tabular-nums">{data.page} / {totalPages}</span>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages || isFetching}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, loading, small }: { label: string; value: any; icon: any; loading?: boolean; small?: boolean }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      {loading ? (
        <Skeleton className="h-7 w-16" />
      ) : (
        <div className={cn("font-bold tabular-nums truncate", small ? "text-base font-mono" : "text-2xl")}>{value}</div>
      )}
    </div>
  );
}
