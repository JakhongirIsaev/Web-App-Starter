import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Calculator, CheckCircle2, ListChecks, Pencil, Plus, Settings, Tag, Trash2,
  XCircle, Filter, Download, TrendingUp, AlertTriangle, BarChart3, Activity,
  ExternalLink,
} from "lucide-react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { RowActions } from "@/components/row-actions";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { buildApiUrl } from "@/lib/api";
import { buildJsonHeaders } from "@/lib/auth-headers";
import { cn } from "@/lib/utils";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(buildApiUrl(`/api${url}`), {
    ...options,
    headers: buildJsonHeaders(options?.headers),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

interface CollateralSettings {
  coverageRatio: number;
}
interface CollateralType {
  id: number;
  code: string;
  nameRu: string;
  nameUz: string | null;
  nameEn: string | null;
  isActive: boolean;
  sortOrder: number;
}
interface BranchRow {
  id: number;
  name: string;
}
interface PolicyParams {
  collateralDiscounts: {
    realEstate: number;
    vehicles: number;
    equipment: number;
    governmentSecurities: number;
    corporateSecurities: number;
    inventoryCirculation: number;
  };
  transportAgeThresholdYears: number;
  transportAgeDiscount: number;
}

interface EstimateRow {
  id: number;
  clientId: number;
  clientName: string | null;
  branchId: number | null;
  branchName: string | null;
  productName: string;
  requestedLoanAmount: string;
  currency: string;
  totalAcceptedValue: string;
  coveragePercent: string;
  maxLoanAmount: string;
  resultStatus: "enough" | "not_enough";
  hasEquipmentOnly: boolean;
  createdAt: string;
  createdByName: string | null;
}

const moneyFmt = new Intl.NumberFormat("ru-RU");
const fmt = (v: string | number) => {
  const n = typeof v === "string" ? Number.parseFloat(v) : v;
  return Number.isFinite(n) ? moneyFmt.format(n) : String(v);
};

export default function CollateralAdmin() {
  const { t } = useTranslation();
  const [calcOpen, setCalcOpen] = useState(false);

  return (
    <div className="p-6 max-w-7xl mx-auto pb-20">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("collateralAdmin.title", { defaultValue: "Залог" })}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("collateralAdmin.subtitleV2", { defaultValue: "Оперативный обзор расчётов залога по филиалам, конфигурация коэффициентов и типов." })}
          </p>
        </div>
        <Button onClick={() => setCalcOpen(true)} className="gap-2 shrink-0">
          <Calculator className="w-4 h-4" />
          {t("collateralAdmin.openCalc", { defaultValue: "Калькулятор" })}
        </Button>
      </div>

      {/* ── Stat cards ── */}
      <StatsRow />

      {/* ── Estimates dashboard (the operational view) ── */}
      <EstimatesDashboard />

      {/* ── Configuration row: settings + types side-by-side ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-8">
        <SettingsCard />
        <TypesCard />
      </div>

      {/* ── Calculator dialog ── */}
      <CalculatorDialog open={calcOpen} onOpenChange={setCalcOpen} />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────── *
 * STATS ROW                                                            *
 * ─────────────────────────────────────────────────────────────────── */

function StatsRow() {
  const { t } = useTranslation();
  // Pull last-30d metrics from the estimates endpoint with no filters but a
  // pageSize large enough to compute aggregates locally.
  const { data, isLoading } = useQuery<{ data: EstimateRow[]; total: number }>({
    queryKey: ["admin/collateral-estimates", "stats"],
    queryFn: () => apiFetch("/admin/collateral-estimates?pageSize=100"),
  });

  const stats = useMemo(() => {
    if (!data) return null;
    const rows = data.data;
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recent = rows.filter((r) => new Date(r.createdAt).getTime() >= weekAgo);
    const notEnough = rows.filter((r) => r.resultStatus === "not_enough").length;
    const avgCoverage = rows.length
      ? rows.reduce((s, r) => s + Number.parseFloat(r.coveragePercent || "0"), 0) / rows.length
      : 0;
    return {
      total: data.total,
      thisWeek: recent.length,
      notEnoughPct: rows.length ? Math.round((notEnough / rows.length) * 100) : 0,
      avgCoverage: Math.round(avgCoverage),
    };
  }, [data]);

  const cards = [
    {
      label: t("collateralAdmin.statTotal", { defaultValue: "Всего расчётов" }),
      value: stats?.total ?? 0,
      icon: BarChart3,
      tone: "text-foreground",
    },
    {
      label: t("collateralAdmin.statThisWeek", { defaultValue: "За 7 дней" }),
      value: stats?.thisWeek ?? 0,
      icon: Activity,
      tone: "text-foreground",
    },
    {
      label: t("collateralAdmin.statNotEnoughPct", { defaultValue: "Не хватает залога" }),
      value: stats ? `${stats.notEnoughPct}%` : "—",
      icon: AlertTriangle,
      tone: (stats?.notEnoughPct ?? 0) > 30 ? "text-rose-600" : "text-foreground",
    },
    {
      label: t("collateralAdmin.statAvgCoverage", { defaultValue: "Среднее покрытие" }),
      value: stats ? `${stats.avgCoverage}%` : "—",
      icon: TrendingUp,
      tone: "text-foreground",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      {cards.map((c, i) => (
        <div key={i} className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <c.icon className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{c.label}</span>
          </div>
          {isLoading ? (
            <Skeleton className="h-7 w-16" />
          ) : (
            <div className={cn("text-2xl font-bold tabular-nums", c.tone)}>{c.value}</div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────── *
 * ESTIMATES DASHBOARD                                                  *
 * ─────────────────────────────────────────────────────────────────── */

function EstimatesDashboard() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [resultStatus, setResultStatus] = useState<"all" | "enough" | "not_enough">("all");
  const [branchId, setBranchId] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const branchesQuery = useQuery<BranchRow[]>({
    queryKey: ["branches", "list-for-filter"],
    queryFn: () => apiFetch("/branches"),
  });

  const params = new URLSearchParams({ page: String(page), pageSize: "20" });
  if (resultStatus !== "all") params.set("resultStatus", resultStatus);
  if (branchId !== "all") params.set("branchId", branchId);
  if (from) params.set("from", from);
  if (to) params.set("to", to);

  const { data, isLoading } = useQuery<{
    data: EstimateRow[];
    total: number;
    page: number;
    pageSize: number;
  }>({
    queryKey: ["admin/collateral-estimates", { page, resultStatus, branchId, from, to }],
    queryFn: () => apiFetch(`/admin/collateral-estimates?${params.toString()}`),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const exportCsv = async () => {
    try {
      // Pull the full filtered set (cap at 500 rows for a single download).
      const csvParams = new URLSearchParams({ page: "1", pageSize: "500" });
      if (resultStatus !== "all") csvParams.set("resultStatus", resultStatus);
      if (branchId !== "all") csvParams.set("branchId", branchId);
      if (from) csvParams.set("from", from);
      if (to) csvParams.set("to", to);
      const res = await apiFetch(`/admin/collateral-estimates?${csvParams.toString()}`);
      const rows: EstimateRow[] = res.data;
      const header = ["Дата", "Клиент", "Филиал", "Продукт", "Запрос", "Залог", "Покрытие %", "Статус", "Создал"];
      const body = rows.map((r) => [
        new Date(r.createdAt).toLocaleString("ru-RU"),
        r.clientName ?? `#${r.clientId}`,
        r.branchName ?? "",
        r.productName,
        r.requestedLoanAmount,
        r.totalAcceptedValue,
        Number(r.coveragePercent).toFixed(0),
        r.resultStatus === "enough" ? "Достаточно" : "Недостаточно",
        r.createdByName ?? "",
      ]);
      const csv = [header, ...body]
        .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
        .join("\n");
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `collateral-estimates-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: t("common.exportDone", { defaultValue: "Экспортировано" }) });
    } catch (err: any) {
      toast({ variant: "destructive", title: t("common.exportFailed", { defaultValue: "Ошибка экспорта" }), description: String(err?.message ?? err) });
    }
  };

  const resetFilters = () => {
    setResultStatus("all");
    setBranchId("all");
    setFrom("");
    setTo("");
    setPage(1);
  };

  const hasFilters = resultStatus !== "all" || branchId !== "all" || from || to;

  return (
    <section className="rounded-xl border bg-card shadow-sm">
      {/* Section header */}
      <div className="flex items-center justify-between gap-2 p-5 pb-3">
        <div className="flex items-center gap-2">
          <ListChecks className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-semibold">{t("collateralAdmin.allEstimatesTitle", { defaultValue: "Расчёты залога по филиалам" })}</h2>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data?.data?.length} className="gap-2">
          <Download className="w-3.5 h-3.5" />
          CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="px-5 pb-4 flex flex-wrap items-end gap-3 border-b">
        {/* Status pills */}
        <div className="flex items-center gap-1 rounded-lg border p-1">
          {[
            { v: "all", label: t("collateralAdmin.statusAll", { defaultValue: "Все" }) },
            { v: "enough", label: t("collateralAdmin.statusEnough", { defaultValue: "Достаточно" }) },
            { v: "not_enough", label: t("collateralAdmin.statusNotEnough", { defaultValue: "Недостаточно" }) },
          ].map((opt) => (
            <button
              key={opt.v}
              onClick={() => { setResultStatus(opt.v as any); setPage(1); }}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs transition-colors",
                resultStatus === opt.v ? "bg-foreground text-background" : "hover:bg-accent",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Branch select */}
        <div className="min-w-[180px]">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("collateralAdmin.colBranch", { defaultValue: "Филиал" })}
          </Label>
          <Select value={branchId} onValueChange={(v) => { setBranchId(v); setPage(1); }}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("collateralAdmin.allBranches", { defaultValue: "Все филиалы" })}</SelectItem>
              {branchesQuery.data?.map((b) => (
                <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Date range */}
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("policy.from", { defaultValue: "С" })}</Label>
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="h-9 w-[140px]" />
        </div>
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("policy.to", { defaultValue: "По" })}</Label>
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="h-9 w-[140px]" />
        </div>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={resetFilters} className="gap-1 text-muted-foreground">
            <Filter className="w-3.5 h-3.5" />
            {t("common.reset", { defaultValue: "Сбросить" })}
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[110px]">{t("collateralAdmin.colDate", { defaultValue: "Дата" })}</TableHead>
              <TableHead>{t("collateralAdmin.colClient", { defaultValue: "Клиент" })}</TableHead>
              <TableHead>{t("collateralAdmin.colBranch", { defaultValue: "Филиал" })}</TableHead>
              <TableHead>{t("collateralAdmin.colProduct", { defaultValue: "Продукт" })}</TableHead>
              <TableHead className="text-right">{t("collateralAdmin.colRequested", { defaultValue: "Запрос" })}</TableHead>
              <TableHead className="text-right">{t("collateralAdmin.colAccepted", { defaultValue: "Залог" })}</TableHead>
              <TableHead className="text-right w-[90px]">{t("collateralAdmin.colCoverage", { defaultValue: "Покрытие" })}</TableHead>
              <TableHead className="w-[140px]">{t("collateralAdmin.colStatus", { defaultValue: "Статус" })}</TableHead>
              <TableHead>{t("collateralAdmin.colCreatedBy", { defaultValue: "Создал" })}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">{t("common.loading", { defaultValue: "Загрузка…" })}</TableCell></TableRow>
            )}
            {!isLoading && (!data || data.data.length === 0) && (
              <TableRow><TableCell colSpan={9} className="py-12 text-center">
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <ListChecks className="w-8 h-8 opacity-40" />
                  <p className="text-sm">{t("collateralAdmin.noEstimates", { defaultValue: "Расчёты ещё не создавались" })}</p>
                  {hasFilters && (
                    <Button variant="link" size="sm" onClick={resetFilters}>
                      {t("common.reset", { defaultValue: "Сбросить фильтры" })}
                    </Button>
                  )}
                </div>
              </TableCell></TableRow>
            )}
            {data?.data.map((row) => {
              const cov = Number(row.coveragePercent);
              const isLow = row.resultStatus === "not_enough";
              return (
                <TableRow key={row.id} className={isLow ? "bg-rose-50/30 dark:bg-rose-950/10 hover:bg-rose-50/60 dark:hover:bg-rose-950/20" : undefined}>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">
                    {new Date(row.createdAt).toLocaleDateString("ru-RU")}
                  </TableCell>
                  <TableCell className="text-sm">
                    <Link href={`/clients/${row.clientId}`} className="hover:underline">
                      {row.clientName ?? `#${row.clientId}`}
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.branchName ?? "—"}</TableCell>
                  <TableCell className="text-xs">{row.productName}</TableCell>
                  <TableCell className="text-sm tabular-nums text-right">{fmt(row.requestedLoanAmount)}</TableCell>
                  <TableCell className="text-sm tabular-nums text-right">{fmt(row.totalAcceptedValue)}</TableCell>
                  <TableCell className="text-right">
                    <span className={cn("inline-block tabular-nums text-sm font-medium", isLow && "text-rose-700 dark:text-rose-400")}>
                      {cov.toFixed(0)}%
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={isLow ? "destructive" : "default"} className={!isLow ? "bg-emerald-600 hover:bg-emerald-600" : undefined}>
                      {isLow ? t("collateralAdmin.statusNotEnough", { defaultValue: "Недостаточно" }) : t("collateralAdmin.statusEnough", { defaultValue: "Достаточно" })}
                    </Badge>
                    {row.hasEquipmentOnly && (
                      <Badge variant="outline" className="ml-1 text-[9px]">
                        {t("collateralAdmin.equipOnlyTag", { defaultValue: "только оборудование" })}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.createdByName ?? "—"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {data && data.total > 0 && (
        <div className="flex items-center justify-between px-5 py-3 text-xs border-t">
          <span className="text-muted-foreground">
            {t("activityLog.showing", {
              defaultValue: "Показано {{from}}–{{to}} из {{total}}",
              from: (data.page - 1) * data.pageSize + 1,
              to: Math.min(data.page * data.pageSize, data.total),
              total: data.total,
            })}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>‹</Button>
            <span className="tabular-nums">{data.page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>›</Button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────── *
 * SETTINGS CARD                                                        *
 * ─────────────────────────────────────────────────────────────────── */

function SettingsCard() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const settingsQuery = useQuery<CollateralSettings>({
    queryKey: ["admin/collateral-settings"],
    queryFn: () => apiFetch("/admin/collateral-settings"),
  });
  const policyQuery = useQuery<PolicyParams>({
    queryKey: ["policy-params", "active"],
    queryFn: () => apiFetch("/admin/policy-params/active"),
  });

  const [coverageRatio, setCoverageRatio] = useState("1.25");

  useEffect(() => {
    if (settingsQuery.data) {
      setCoverageRatio(String(settingsQuery.data.coverageRatio));
    }
  }, [settingsQuery.data]);

  const saveSettings = useMutation({
    mutationFn: (body: CollateralSettings) =>
      apiFetch("/admin/collateral-settings", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin/collateral-settings"] });
      toast({ title: t("collateralAdmin.saved", { defaultValue: "Сохранено" }) });
    },
    onError: (err: Error) => toast({ title: t("collateralAdmin.saveFailed", { defaultValue: "Не удалось сохранить" }), description: err.message, variant: "destructive" }),
  });

  const onSave = (e: React.FormEvent) => {
    e.preventDefault();
    const ratio = Number(coverageRatio);
    if (!Number.isFinite(ratio) || ratio <= 1.0 || ratio > 3.0) {
      toast({ title: t("collateralAdmin.invalidValues", { defaultValue: "Проверьте введённые значения" }), variant: "destructive" });
      return;
    }
    saveSettings.mutate({ coverageRatio: ratio });
  };

  const p = policyQuery.data;
  const dirty = settingsQuery.data && Number(coverageRatio) !== settingsQuery.data.coverageRatio;

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <Settings className="w-4 h-4 text-muted-foreground" />
        <h2 className="font-semibold">{t("collateralAdmin.settingsTitle", { defaultValue: "Системные параметры" })}</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        {t("collateralAdmin.settingsHint", { defaultValue: "Изменения применяются только к новым расчётам. Старые расчёты сохраняют свои значения." })}
      </p>

      <form onSubmit={onSave} className="space-y-3 mb-5">
        <div>
          <div className="flex items-end justify-between gap-2">
            <Label htmlFor="coverage" className="text-sm">
              {t("collateralAdmin.coverageRatio", { defaultValue: "Коэффициент покрытия" })}
            </Label>
            <span className="text-[10px] text-muted-foreground">1.01 – 3.00</span>
          </div>
          <div className="relative">
            <Input
              id="coverage"
              type="number"
              step="0.01"
              min="1.01"
              max="3"
              value={coverageRatio}
              onChange={(e) => setCoverageRatio(e.target.value)}
              className={cn("tabular-nums pr-8", dirty && "border-amber-300")}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">×</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {t("collateralAdmin.coverageRatioHint", { defaultValue: "Залог должен покрывать сумму кредита с учётом этого коэффициента (например, 1.25 = 125%)." })}
          </p>
        </div>
        <Button type="submit" size="sm" disabled={saveSettings.isPending || !dirty}>
          {saveSettings.isPending ? t("common.saving", { defaultValue: "Сохранение…" }) : t("common.save", { defaultValue: "Сохранить" })}
        </Button>
      </form>

      {/* Live discount schedule from credit-policy */}
      <div className="rounded-lg border bg-muted/30 p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-medium">{t("collateralAdmin.discountScheduleTitle", { defaultValue: "Шкала дисконтов" })}</h3>
          <Link href="/credit-policy" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
            {t("collateralAdmin.editInPolicy", { defaultValue: "Редактировать" })}
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
        <p className="text-[11px] text-muted-foreground mb-3">
          {t("collateralAdmin.discountSourceHint", { defaultValue: "Значения берутся из кредитной политики." })}
        </p>
        {policyQuery.isLoading ? (
          <Skeleton className="h-32" />
        ) : p ? (
          <table className="w-full text-sm">
            <tbody>
              <DiscountRow label={t("policy.realEstate", { defaultValue: "Недвижимость" })} value={p.collateralDiscounts.realEstate} />
              <DiscountRow label={t("policy.vehicles", { defaultValue: "Транспорт" })} value={p.collateralDiscounts.vehicles} />
              <DiscountRow label={t("policy.equipment", { defaultValue: "Оборудование" })} value={p.collateralDiscounts.equipment} />
              <DiscountRow label={t("policy.govSecurities", { defaultValue: "Гос. ценные бумаги" })} value={p.collateralDiscounts.governmentSecurities} />
              <DiscountRow label={t("policy.corpSecurities", { defaultValue: "Корп. ценные бумаги" })} value={p.collateralDiscounts.corporateSecurities} />
              <DiscountRow label={t("policy.inventory", { defaultValue: "Товары в обороте" })} value={p.collateralDiscounts.inventoryCirculation} />
              <DiscountRow
                label={t("collateralAdmin.transportOlder", { defaultValue: "Транспорт > {{n}} лет", n: p.transportAgeThresholdYears })}
                value={p.transportAgeDiscount}
                muted
              />
            </tbody>
          </table>
        ) : null}
      </div>
    </section>
  );
}

function DiscountRow({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <tr className="border-b border-border/40 last:border-0">
      <td className={cn("py-1.5 text-sm", muted && "text-muted-foreground")}>{label}</td>
      <td className="py-1.5 text-right tabular-nums text-sm font-medium">
        {Math.round(value * 100)}%
      </td>
    </tr>
  );
}

/* ─────────────────────────────────────────────────────────────────── *
 * TYPES CARD                                                            *
 * ─────────────────────────────────────────────────────────────────── */

function TypesCard() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<CollateralType | null>(null);

  const typesQuery = useQuery<CollateralType[]>({
    queryKey: ["collateral-types"],
    queryFn: () => apiFetch("/collateral-types"),
  });

  const saveType = useMutation({
    mutationFn: (input: { id: number; body: Partial<CollateralType> }) =>
      apiFetch(`/admin/collateral-types/${input.id}`, {
        method: "PATCH",
        body: JSON.stringify(input.body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["collateral-types"] });
      setEditing(null);
      toast({ title: t("collateralAdmin.typeSaved", { defaultValue: "Тип залога сохранён" }) });
    },
    onError: (err: Error) =>
      toast({ title: t("collateralAdmin.saveFailed", { defaultValue: "Не удалось сохранить" }), description: err.message, variant: "destructive" }),
  });

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <Tag className="w-4 h-4 text-muted-foreground" />
        <h2 className="font-semibold">{t("collateralAdmin.typesTitle", { defaultValue: "Типы залога" })}</h2>
        <Badge variant="outline" className="ml-auto text-[10px]">
          {typesQuery.data?.filter((tp) => tp.isActive).length ?? 0} {t("collateralAdmin.activeShort", { defaultValue: "акт." })}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        {t("collateralAdmin.typesHint", { defaultValue: "Названия отображаются в калькуляторе и мини-апп клиента." })}
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("collateralAdmin.colType", { defaultValue: "Тип" })}</TableHead>
            <TableHead>{t("collateralAdmin.colCode", { defaultValue: "Код" })}</TableHead>
            <TableHead className="text-center w-[80px]">{t("collateralAdmin.colActive", { defaultValue: "Акт." })}</TableHead>
            <TableHead className="text-right w-[60px]">{t("collateralAdmin.colSort", { defaultValue: "Сорт." })}</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {typesQuery.isLoading && (
            <TableRow><TableCell colSpan={5}><Skeleton className="h-6" /></TableCell></TableRow>
          )}
          {(typesQuery.data ?? []).map((type) => (
            <TableRow key={type.id} className={!type.isActive ? "opacity-60" : undefined}>
              <TableCell className="font-medium">{type.nameRu}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{type.code}</TableCell>
              <TableCell className="text-center">
                {type.isActive ? <CheckCircle2 className="w-4 h-4 text-emerald-600 inline" /> : <XCircle className="w-4 h-4 text-muted-foreground inline" />}
              </TableCell>
              <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{type.sortOrder}</TableCell>
              <TableCell>
                <RowActions
                  actions={[
                    { label: t("common.edit", { defaultValue: "Редактировать" }), icon: Pencil, onClick: () => setEditing(type) },
                  ]}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("collateralAdmin.editType", { defaultValue: "Редактировать тип" })}</DialogTitle>
            <DialogDescription className="font-mono">{editing?.code}</DialogDescription>
          </DialogHeader>
          {editing && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveType.mutate({
                  id: editing.id,
                  body: {
                    nameRu: editing.nameRu,
                    nameUz: editing.nameUz,
                    isActive: editing.isActive,
                    sortOrder: editing.sortOrder,
                  },
                });
              }}
              className="space-y-4"
            >
              <div>
                <Label>{t("collateralAdmin.nameRu", { defaultValue: "Название (RU)" })}</Label>
                <Input value={editing.nameRu} onChange={(e) => setEditing({ ...editing, nameRu: e.target.value })} />
              </div>
              <div>
                <Label>{t("collateralAdmin.nameUz", { defaultValue: "Название (UZ)" })}</Label>
                <Input value={editing.nameUz ?? ""} onChange={(e) => setEditing({ ...editing, nameUz: e.target.value })} />
              </div>
              <div>
                <Label>{t("collateralAdmin.colSort", { defaultValue: "Сортировка" })}</Label>
                <Input
                  type="number"
                  value={editing.sortOrder}
                  onChange={(e) => setEditing({ ...editing, sortOrder: Number(e.target.value) })}
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={editing.isActive}
                  onCheckedChange={(checked) => setEditing({ ...editing, isActive: checked })}
                />
                <Label>{t("collateralAdmin.colActive", { defaultValue: "Активен" })}</Label>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  {t("common.cancel", { defaultValue: "Отмена" })}
                </Button>
                <Button type="submit" disabled={saveType.isPending}>
                  {t("common.save", { defaultValue: "Сохранить" })}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────── *
 * CALCULATOR (in dialog)                                               *
 * ─────────────────────────────────────────────────────────────────── */

interface CalcItem {
  id: string;
  typeCode: string;
  marketValue: string;
  year: string;
}

interface CalcPreviewResult {
  loanAmount: number;
  coverageRatio: number;
  items: Array<{
    typeCode: string;
    marketValue: number;
    acceptedValue: number;
    discountApplied: number | null;
    discountReason: string | null;
    year: number | null;
  }>;
  totals: {
    totalMarketValue: number;
    totalAcceptedValue: number;
    requiredCollateralValue: number;
    coveragePercent: number;
    maxLoanAmount: number;
    resultStatus: "enough" | "not_enough";
    shortfall: number;
  };
}

const newCalcItem = (typeCode: string): CalcItem => ({
  id: Math.random().toString(36).slice(2),
  typeCode,
  marketValue: "",
  year: "",
});

function CalculatorDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const typesQuery = useQuery<CollateralType[]>({
    queryKey: ["collateral-types"],
    queryFn: () => apiFetch("/collateral-types"),
    enabled: open,
  });

  const activeTypes = (typesQuery.data ?? []).filter((tp) => tp.isActive);
  const defaultType = activeTypes[0]?.code ?? "real_estate";

  const [loanAmount, setLoanAmount] = useState("");
  const [items, setItems] = useState<CalcItem[]>([newCalcItem(defaultType)]);
  const [result, setResult] = useState<CalcPreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Reset state when the dialog closes so reopening gives a fresh sheet.
  useEffect(() => {
    if (!open) {
      setLoanAmount("");
      setItems([newCalcItem(defaultType)]);
      setResult(null);
      setError(null);
    }
  }, [open, defaultType]);

  useEffect(() => {
    if (!open) return;
    const loan = Number.parseFloat(loanAmount);
    if (!Number.isFinite(loan) || loan <= 0) {
      setResult(null);
      setError(null);
      return;
    }
    const cleanItems = items
      .map((it) => ({
        typeCode: it.typeCode,
        marketValue: Number.parseFloat(it.marketValue),
        year: it.year ? Number.parseInt(it.year, 10) : undefined,
      }))
      .filter((it) => Number.isFinite(it.marketValue) && it.marketValue > 0);
    if (cleanItems.length === 0) {
      setResult(null);
      setError(null);
      return;
    }

    const ctrl = new AbortController();
    setPending(true);
    setError(null);
    apiFetch("/collateral/preview", {
      method: "POST",
      body: JSON.stringify({ loanAmount: loan, items: cleanItems }),
      signal: ctrl.signal,
    })
      .then((res: CalcPreviewResult) => setResult(res))
      .catch((err: any) => {
        if (err?.name === "AbortError") return;
        setError(err?.message ?? "Ошибка расчёта");
      })
      .finally(() => setPending(false));
    return () => ctrl.abort();
  }, [loanAmount, items, open]);

  const updateItem = (id: string, patch: Partial<CalcItem>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const removeItem = (id: string) =>
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.id !== id) : prev));
  const addItem = () => setItems((prev) => [...prev, newCalcItem(defaultType)]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="w-4 h-4" />
            {t("collateralAdmin.calcTitle", { defaultValue: "Калькулятор залога" })}
          </DialogTitle>
          <DialogDescription>
            {t("collateralAdmin.calcDesc", { defaultValue: "Тестовый расчёт по текущим правилам. Ничего не сохраняется." })}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-[280px_1fr]">
          <div>
            <Label htmlFor="calc-loan">{t("collateralAdmin.calcLoan", { defaultValue: "Сумма кредита, сум" })}</Label>
            <Input
              id="calc-loan"
              type="number"
              min="0"
              step="1000000"
              placeholder="например, 100000000"
              value={loanAmount}
              onChange={(e) => setLoanAmount(e.target.value)}
              className="font-mono tabular-nums"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {t("collateralAdmin.calcRequired", {
                defaultValue: "Покрытие × {{r}} → требуется {{v}}",
                r: result?.coverageRatio ?? "—",
                v: result ? fmt(result.totals.requiredCollateralValue) : "—",
              })}
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("collateralAdmin.calcItems", { defaultValue: "Предметы залога" })}
            </Label>
            {items.map((it) => (
              <div key={it.id} className="grid grid-cols-[1fr_1fr_90px_36px] gap-2 items-start">
                <Select value={it.typeCode} onValueChange={(v) => updateItem(it.id, { typeCode: v, year: v === "transport" ? it.year : "" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {activeTypes.map((tp) => (
                      <SelectItem key={tp.code} value={tp.code}>{tp.nameRu}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min="0"
                  step="1000000"
                  placeholder={t("collateralAdmin.calcMarketValuePlaceholder", { defaultValue: "рыночная стоимость" })}
                  value={it.marketValue}
                  onChange={(e) => updateItem(it.id, { marketValue: e.target.value })}
                  className="font-mono tabular-nums"
                />
                <Input
                  type="number"
                  min="1900"
                  max={new Date().getFullYear()}
                  placeholder={t("collateralAdmin.calcYearPlaceholder", { defaultValue: "год" })}
                  value={it.year}
                  onChange={(e) => updateItem(it.id, { year: e.target.value })}
                  disabled={it.typeCode !== "transport"}
                  title={it.typeCode === "transport" ? "Год выпуска (для расчёта дисконта)" : "Только для транспорта"}
                  className="tabular-nums"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeItem(it.id)}
                  disabled={items.length === 1}
                  title={t("common.delete", { defaultValue: "Удалить" })}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addItem} className="gap-2">
              <Plus className="w-3.5 h-3.5" />
              {t("collateralAdmin.addItem", { defaultValue: "Добавить предмет" })}
            </Button>
          </div>
        </div>

        <div className="mt-2 border-t pt-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!result && !error && (
            <p className="text-sm text-muted-foreground">
              {t("collateralAdmin.calcEmpty", { defaultValue: "Заполните сумму кредита и хотя бы один предмет залога." })}
            </p>
          )}
          {result && (
            <div className="grid gap-4 md:grid-cols-[1fr_280px]">
              <div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="text-left py-2">{t("collateralAdmin.colType", { defaultValue: "Тип" })}</th>
                      <th className="text-right py-2">{t("collateralAdmin.calcMarket", { defaultValue: "Рыночная" })}</th>
                      <th className="text-right py-2">{t("collateralAdmin.calcDiscount", { defaultValue: "Дисконт" })}</th>
                      <th className="text-right py-2">{t("collateralAdmin.calcAccepted", { defaultValue: "Принимается" })}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.items.map((it, i) => {
                      const typeName = activeTypes.find((tp) => tp.code === it.typeCode)?.nameRu ?? it.typeCode;
                      return (
                        <tr key={i} className="border-b border-border/40">
                          <td className="py-2">
                            {typeName}
                            {it.year !== null && (
                              <span className="text-xs text-muted-foreground ml-1">({it.year})</span>
                            )}
                          </td>
                          <td className="py-2 text-right tabular-nums">{fmt(it.marketValue)}</td>
                          <td className="py-2 text-right tabular-nums text-muted-foreground">
                            {it.discountApplied !== null ? `${Math.round(it.discountApplied * 100)}%` : "100%"}
                          </td>
                          <td className="py-2 text-right tabular-nums font-medium">{fmt(it.acceptedValue)}</td>
                        </tr>
                      );
                    })}
                    <tr className="font-semibold">
                      <td className="py-2">{t("collateralAdmin.calcTotal", { defaultValue: "Итого" })}</td>
                      <td className="py-2 text-right tabular-nums">{fmt(result.totals.totalMarketValue)}</td>
                      <td></td>
                      <td className="py-2 text-right tabular-nums">{fmt(result.totals.totalAcceptedValue)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div
                className={cn(
                  "rounded-md p-4 border self-start",
                  result.totals.resultStatus === "enough"
                    ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30"
                    : "border-rose-200 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/30",
                )}
              >
                <div className="flex items-center gap-2 mb-3">
                  {result.totals.resultStatus === "enough" ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <XCircle className="w-5 h-5 text-rose-600" />
                  )}
                  <span className="font-semibold">
                    {result.totals.resultStatus === "enough"
                      ? t("collateralAdmin.statusEnough", { defaultValue: "Достаточно" })
                      : t("collateralAdmin.statusNotEnough", { defaultValue: "Недостаточно" })}
                  </span>
                  {pending && <span className="text-xs text-muted-foreground ml-auto">…</span>}
                </div>
                <dl className="text-sm space-y-1.5">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">{t("collateralAdmin.colCoverage", { defaultValue: "Покрытие" })}</dt>
                    <dd className="tabular-nums font-medium">{result.totals.coveragePercent.toFixed(0)}%</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">{t("collateralAdmin.calcMaxLoan", { defaultValue: "Макс. кредит" })}</dt>
                    <dd className="tabular-nums">{fmt(result.totals.maxLoanAmount)}</dd>
                  </div>
                  {result.totals.resultStatus === "not_enough" && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">{t("collateralAdmin.calcShortfall", { defaultValue: "Не хватает" })}</dt>
                      <dd className="tabular-nums font-medium text-rose-700 dark:text-rose-400">
                        {fmt(result.totals.shortfall)}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
