import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  History, Save, Undo2, Percent, Calculator, BadgeDollarSign,
  Calendar, Ban, TrendingUp, ShieldAlert, Plus, X, Check, Clock,
} from "lucide-react";
import { buildApiUrl } from "@/lib/api";
import { buildAuthHeaders, buildJsonHeaders } from "@/lib/auth-headers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface PolicyParams {
  minCoverageRatio: number;
  collateralDiscounts: {
    governmentSecurities: number;
    realEstate: number;
    vehicles: number;
    corporateSecurities: number;
    inventoryCirculation: number;
    equipment: number;
  };
  transportAgeThresholdYears: number;
  transportAgeDiscount: number;
  dscrMax: number;
  dscrMaxFx: number;
  debtToEquityMax: number;
  loanToWorkingCapitalMax: number;
  minRatesUzs: { micro: { le12m: number; gt12m: number }; small: { le12m: number; gt12m: number }; medium: { any: number } };
  minRatesFx: { micro: number; small: number; medium: number };
  maxTermMonths: { workingCapital: number; fixedAssets: number };
  negativeIndustryKeywords: string[];
  graduatedLending: { loan1MaxMonths: number; loan1MaxMonthsTrade: number; loan2MaxMonths: number; loan3MaxMonths: number };
  creditCommitteeLimitsUsd: { singleBorrower: number; relatedGroup: number };
}

interface PolicyVersion {
  id: number;
  version: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  value: PolicyParams;
  createdBy: number | null;
  createdAt: string;
}

type Path = (string | number)[];

const setNested = <T,>(obj: T, path: Path, value: unknown): T => {
  const next = JSON.parse(JSON.stringify(obj));
  let cur: any = next;
  for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]];
  cur[path[path.length - 1]] = value;
  return next;
};

const getNested = (obj: any, path: Path): any => {
  let cur = obj;
  for (const p of path) cur = cur?.[p];
  return cur;
};

const isEqualDeep = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

// Field constraints mirror the Zod schema in the API. Keep in sync.
const FIELD_LIMITS: Record<string, { min: number; max: number; step?: number; suffix?: string }> = {
  minCoverageRatio: { min: 0.5, max: 5, step: 0.01, suffix: "×" },
  "collateralDiscounts.governmentSecurities": { min: 0, max: 1, step: 0.01, suffix: "×" },
  "collateralDiscounts.realEstate": { min: 0, max: 1, step: 0.01, suffix: "×" },
  "collateralDiscounts.vehicles": { min: 0, max: 1, step: 0.01, suffix: "×" },
  "collateralDiscounts.corporateSecurities": { min: 0, max: 1, step: 0.01, suffix: "×" },
  "collateralDiscounts.inventoryCirculation": { min: 0, max: 1, step: 0.01, suffix: "×" },
  "collateralDiscounts.equipment": { min: 0, max: 1, step: 0.01, suffix: "×" },
  transportAgeThresholdYears: { min: 1, max: 30, step: 1, suffix: "лет" },
  transportAgeDiscount: { min: 0, max: 1, step: 0.01, suffix: "×" },
  dscrMax: { min: 0, max: 2, step: 0.01 },
  dscrMaxFx: { min: 0, max: 2, step: 0.01 },
  debtToEquityMax: { min: 0, max: 10, step: 0.01 },
  loanToWorkingCapitalMax: { min: 0, max: 2, step: 0.01 },
  rateUzs: { min: 0, max: 1, step: 0.001, suffix: "× год" },
  rateFx: { min: 0, max: 1, step: 0.001, suffix: "× год" },
  "maxTermMonths.workingCapital": { min: 1, max: 120, step: 1, suffix: "мес." },
  "maxTermMonths.fixedAssets": { min: 1, max: 120, step: 1, suffix: "мес." },
  "graduatedLending.loan1MaxMonths": { min: 1, max: 24, step: 1, suffix: "мес." },
  "graduatedLending.loan1MaxMonthsTrade": { min: 1, max: 24, step: 1, suffix: "мес." },
  "graduatedLending.loan2MaxMonths": { min: 1, max: 36, step: 1, suffix: "мес." },
  "graduatedLending.loan3MaxMonths": { min: 1, max: 48, step: 1, suffix: "мес." },
  "creditCommitteeLimitsUsd.singleBorrower": { min: 0, max: 1e12, step: 1000, suffix: "USD" },
  "creditCommitteeLimitsUsd.relatedGroup": { min: 0, max: 1e12, step: 1000, suffix: "USD" },
};

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });

export default function CreditPolicyPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const activeQuery = useQuery<PolicyParams>({
    queryKey: ["policy-params", "active"],
    queryFn: async () => {
      const res = await fetch(buildApiUrl("/api/admin/policy-params/active"), { headers: buildAuthHeaders() });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
  });

  const versionsQuery = useQuery<PolicyVersion[]>({
    queryKey: ["policy-params", "versions"],
    queryFn: async () => {
      const res = await fetch(buildApiUrl("/api/admin/policy-params/versions"), { headers: buildAuthHeaders() });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
  });

  const [draft, setDraft] = useState<PolicyParams | null>(null);
  const [version, setVersion] = useState<string>("");
  const [effectiveFrom, setEffectiveFrom] = useState<string>("");
  const [viewingVersionId, setViewingVersionId] = useState<number | null>(null);
  const [tab, setTab] = useState("rates");
  const [discardOpen, setDiscardOpen] = useState(false);
  const [keywordInput, setKeywordInput] = useState("");

  // Initialize draft from active when data loads.
  useEffect(() => {
    if (activeQuery.data && !draft) {
      setDraft(activeQuery.data);
      const now = new Date();
      setVersion(`${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}`);
      setEffectiveFrom(now.toISOString());
    }
  }, [activeQuery.data, draft]);

  const save = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error("no draft");
      const res = await fetch(buildApiUrl("/api/admin/policy-params/versions"), {
        method: "POST",
        headers: buildJsonHeaders(),
        body: JSON.stringify({ version, effectiveFrom, value: draft }),
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("policy.savedTitle", { defaultValue: "Сохранено" }) });
      qc.invalidateQueries({ queryKey: ["policy-params"] });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        title: t("policy.saveFailed", { defaultValue: "Не удалось сохранить" }),
        description: err instanceof Error ? err.message : String(err),
      });
    },
  });

  const active = activeQuery.data;
  const isLoading = activeQuery.isLoading || !draft || !active;

  // List of paths whose draft value differs from the active version.
  const changedPaths = useMemo(() => {
    if (!draft || !active) return new Set<string>();
    const out = new Set<string>();
    const walk = (a: any, b: any, prefix: string) => {
      if (Array.isArray(a) || Array.isArray(b)) {
        if (!isEqualDeep(a, b)) out.add(prefix);
        return;
      }
      if (a && typeof a === "object" && b && typeof b === "object") {
        for (const k of Object.keys({ ...a, ...b })) walk(a[k], b[k], prefix ? `${prefix}.${k}` : k);
        return;
      }
      if (a !== b) out.add(prefix);
    };
    walk(draft, active, "");
    return out;
  }, [draft, active]);

  const update = (path: Path, value: number) => {
    if (!draft) return;
    setDraft(setNested(draft, path, value));
  };

  const onDiscardConfirm = () => {
    if (active) setDraft(JSON.parse(JSON.stringify(active)));
    setDiscardOpen(false);
    setViewingVersionId(null);
    setKeywordInput("");
  };

  const onLoadVersion = (v: PolicyVersion) => {
    setDraft(JSON.parse(JSON.stringify(v.value)));
    setViewingVersionId(v.id);
  };

  const removeKeyword = (kw: string) => {
    if (!draft) return;
    setDraft({ ...draft, negativeIndustryKeywords: draft.negativeIndustryKeywords.filter((k) => k !== kw) });
  };

  const addKeyword = () => {
    const v = keywordInput.trim();
    if (!v || !draft) return;
    if (draft.negativeIndustryKeywords.includes(v)) {
      setKeywordInput("");
      return;
    }
    setDraft({ ...draft, negativeIndustryKeywords: [...draft.negativeIndustryKeywords, v] });
    setKeywordInput("");
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-72" />
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  const changes = changedPaths.size;
  const isViewingHistorical = viewingVersionId !== null;

  return (
    <div className="p-6 max-w-7xl mx-auto pb-24">
      {/* ── Top bar ── */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight">
            {t("policy.title", { defaultValue: "Параметры кредитной политики" })}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("policy.subtitle", { defaultValue: "Редактируемые ставки, коэффициенты и сроки, применяемые к новым кредитным расчётам." })}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {changes > 0 && (
            <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 border border-amber-200">
              {t("policy.unsavedChanges", { defaultValue: "Несохранённых: {{n}}", n: changes })}
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={changes === 0}
            onClick={() => setDiscardOpen(true)}
            className="gap-2"
          >
            <Undo2 className="w-4 h-4" />
            {t("policy.discardChanges", { defaultValue: "Отменить" })}
          </Button>
          <Button
            size="sm"
            disabled={save.isPending || changes === 0}
            onClick={() => save.mutate()}
            className="gap-2"
          >
            <Save className="w-4 h-4" />
            {save.isPending
              ? t("common.saving", { defaultValue: "Сохранение…" })
              : t("policy.saveAsNewVersion", { defaultValue: "Сохранить как новую версию" })}
          </Button>
        </div>
      </div>

      {/* ── Body grid: history sidebar + form ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* History sidebar */}
        <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-3rem)] lg:overflow-auto">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm">
              {t("policy.versionHistory", { defaultValue: "История версий" })}
            </h2>
            <Badge variant="outline" className="ml-auto text-[10px]">
              {versionsQuery.data?.length ?? 0}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("policy.versionHistoryHint", { defaultValue: "Кликните на версию, чтобы загрузить её для просмотра или редактирования." })}
          </p>

          <div className="space-y-1.5">
            {versionsQuery.isLoading && (
              <>
                <Skeleton className="h-16 rounded-lg" />
                <Skeleton className="h-16 rounded-lg" />
              </>
            )}
            {versionsQuery.data?.length === 0 && (
              <p className="text-xs text-muted-foreground italic py-4 text-center border rounded-lg border-dashed">
                {t("policy.noVersions", { defaultValue: "Версий пока нет" })}
              </p>
            )}
            {versionsQuery.data?.map((v, i) => {
              const isActive = i === 0 || (v.effectiveTo === null && new Date(v.effectiveFrom) <= new Date());
              const isViewing = viewingVersionId === v.id;
              return (
                <button
                  key={v.id}
                  onClick={() => onLoadVersion(v)}
                  className={cn(
                    "w-full text-left rounded-lg border p-3 hover:bg-accent transition-colors",
                    isViewing && "ring-2 ring-primary border-primary",
                    !isViewing && isActive && "border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/10",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-medium">{v.version}</span>
                    {isActive && (
                      <Badge variant="default" className="text-[9px] bg-emerald-600 hover:bg-emerald-600">
                        {t("policy.active", { defaultValue: "Активна" })}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-1">
                    <Clock className="w-3 h-3" />
                    <span className="tabular-nums">{formatDateTime(v.effectiveFrom)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Form */}
        <div className="min-w-0 space-y-4">
          {/* Version meta strip */}
          <div className="rounded-xl border bg-card p-4 flex flex-wrap items-end gap-4 shadow-sm">
            <div className="flex-1 min-w-[140px]">
              <Label className="text-xs text-muted-foreground">
                {t("policy.versionLabel", { defaultValue: "Новая версия" })}
              </Label>
              <Input value={version} onChange={(e) => setVersion(e.target.value)} className="font-mono" />
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs text-muted-foreground">
                {t("policy.effectiveFromLabel", { defaultValue: "Действует с" })}
              </Label>
              <Input
                type="datetime-local"
                value={effectiveFrom.slice(0, 16)}
                onChange={(e) => setEffectiveFrom(new Date(e.target.value).toISOString())}
              />
            </div>
            {isViewingHistorical && (
              <Badge variant="outline" className="gap-1">
                <History className="w-3 h-3" />
                {t("policy.viewingHistorical", { defaultValue: "Просмотр исторической версии" })}
              </Badge>
            )}
          </div>

          {/* Tabs */}
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid grid-cols-3 lg:grid-cols-6 w-full h-auto p-1">
              <TabsTrigger value="rates" className="gap-1.5"><BadgeDollarSign className="w-3.5 h-3.5" />{t("policy.tabs.rates", { defaultValue: "Ставки" })}</TabsTrigger>
              <TabsTrigger value="ratios" className="gap-1.5"><TrendingUp className="w-3.5 h-3.5" />{t("policy.tabs.ratios", { defaultValue: "Коэффициенты" })}</TabsTrigger>
              <TabsTrigger value="collateral" className="gap-1.5"><Percent className="w-3.5 h-3.5" />{t("policy.tabs.collateral", { defaultValue: "Залог" })}</TabsTrigger>
              <TabsTrigger value="terms" className="gap-1.5"><Calendar className="w-3.5 h-3.5" />{t("policy.tabs.terms", { defaultValue: "Сроки" })}</TabsTrigger>
              <TabsTrigger value="limits" className="gap-1.5"><ShieldAlert className="w-3.5 h-3.5" />{t("policy.tabs.limits", { defaultValue: "Лимиты" })}</TabsTrigger>
              <TabsTrigger value="industries" className="gap-1.5"><Ban className="w-3.5 h-3.5" />{t("policy.tabs.industries", { defaultValue: "Отрасли" })}</TabsTrigger>
            </TabsList>

            <TabsContent value="rates" className="mt-4 space-y-4">
              <Card title={t("policy.section.ratesUzs", { defaultValue: "Минимальные ставки — UZS" })} icon={<BadgeDollarSign className="w-4 h-4" />}>
                <PolicyField label="Micro ≤ 12 мес." path={["minRatesUzs", "micro", "le12m"]} draft={draft} active={active} changedPaths={changedPaths} update={update} limitKey="rateUzs" />
                <PolicyField label="Micro > 12 мес." path={["minRatesUzs", "micro", "gt12m"]} draft={draft} active={active} changedPaths={changedPaths} update={update} limitKey="rateUzs" />
                <PolicyField label="Small ≤ 12 мес." path={["minRatesUzs", "small", "le12m"]} draft={draft} active={active} changedPaths={changedPaths} update={update} limitKey="rateUzs" />
                <PolicyField label="Small > 12 мес." path={["minRatesUzs", "small", "gt12m"]} draft={draft} active={active} changedPaths={changedPaths} update={update} limitKey="rateUzs" />
                <PolicyField label="Medium" path={["minRatesUzs", "medium", "any"]} draft={draft} active={active} changedPaths={changedPaths} update={update} limitKey="rateUzs" />
              </Card>
              <Card title={t("policy.section.ratesFx", { defaultValue: "Минимальные ставки — валюта" })} icon={<BadgeDollarSign className="w-4 h-4" />}>
                <PolicyField label="Micro" path={["minRatesFx", "micro"]} draft={draft} active={active} changedPaths={changedPaths} update={update} limitKey="rateFx" />
                <PolicyField label="Small" path={["minRatesFx", "small"]} draft={draft} active={active} changedPaths={changedPaths} update={update} limitKey="rateFx" />
                <PolicyField label="Medium" path={["minRatesFx", "medium"]} draft={draft} active={active} changedPaths={changedPaths} update={update} limitKey="rateFx" />
              </Card>
            </TabsContent>

            <TabsContent value="ratios" className="mt-4 space-y-4">
              <Card title={t("policy.section.ratios", { defaultValue: "Коэффициенты" })} icon={<TrendingUp className="w-4 h-4" />}>
                <PolicyField label={t("policy.dscrMax", { defaultValue: "Макс. DSCR" })} path={["dscrMax"]} draft={draft} active={active} changedPaths={changedPaths} update={update} />
                <PolicyField label={t("policy.dscrMaxFx", { defaultValue: "Макс. DSCR (валюта)" })} path={["dscrMaxFx"]} draft={draft} active={active} changedPaths={changedPaths} update={update} />
                <PolicyField label={t("policy.debtToEquity", { defaultValue: "Макс. долг/капитал" })} path={["debtToEquityMax"]} draft={draft} active={active} changedPaths={changedPaths} update={update} />
                <PolicyField label={t("policy.loanToWc", { defaultValue: "Макс. кредит/оборотный капитал" })} path={["loanToWorkingCapitalMax"]} draft={draft} active={active} changedPaths={changedPaths} update={update} />
              </Card>
            </TabsContent>

            <TabsContent value="collateral" className="mt-4 space-y-4">
              <Card title={t("policy.section.coverage", { defaultValue: "Покрытие" })} icon={<Calculator className="w-4 h-4" />}>
                <PolicyField label={t("policy.minCoverageRatio", { defaultValue: "Мин. коэф. покрытия" })} path={["minCoverageRatio"]} draft={draft} active={active} changedPaths={changedPaths} update={update} />
              </Card>
              <Card title={t("policy.section.discounts", { defaultValue: "Дисконты по типам залога" })} icon={<Percent className="w-4 h-4" />}>
                <PolicyField label={t("policy.realEstate", { defaultValue: "Недвижимость" })} path={["collateralDiscounts", "realEstate"]} draft={draft} active={active} changedPaths={changedPaths} update={update} />
                <PolicyField label={t("policy.vehicles", { defaultValue: "Транспорт" })} path={["collateralDiscounts", "vehicles"]} draft={draft} active={active} changedPaths={changedPaths} update={update} />
                <PolicyField label={t("policy.equipment", { defaultValue: "Оборудование" })} path={["collateralDiscounts", "equipment"]} draft={draft} active={active} changedPaths={changedPaths} update={update} />
                <PolicyField label={t("policy.govSecurities", { defaultValue: "Гос. ценные бумаги" })} path={["collateralDiscounts", "governmentSecurities"]} draft={draft} active={active} changedPaths={changedPaths} update={update} />
                <PolicyField label={t("policy.corpSecurities", { defaultValue: "Корп. ценные бумаги" })} path={["collateralDiscounts", "corporateSecurities"]} draft={draft} active={active} changedPaths={changedPaths} update={update} />
                <PolicyField label={t("policy.inventory", { defaultValue: "Товары в обороте" })} path={["collateralDiscounts", "inventoryCirculation"]} draft={draft} active={active} changedPaths={changedPaths} update={update} />
                <PolicyField label={t("policy.transportAge", { defaultValue: "Порог возраста транспорта" })} path={["transportAgeThresholdYears"]} draft={draft} active={active} changedPaths={changedPaths} update={update} />
                <PolicyField label={t("policy.transportAgeDisc", { defaultValue: "Дисконт за возраст транспорта" })} path={["transportAgeDiscount"]} draft={draft} active={active} changedPaths={changedPaths} update={update} />
              </Card>
            </TabsContent>

            <TabsContent value="terms" className="mt-4 space-y-4">
              <Card title={t("policy.section.terms", { defaultValue: "Максимальные сроки" })} icon={<Calendar className="w-4 h-4" />}>
                <PolicyField label={t("policy.maxTermWc", { defaultValue: "Оборотный капитал" })} path={["maxTermMonths", "workingCapital"]} draft={draft} active={active} changedPaths={changedPaths} update={update} />
                <PolicyField label={t("policy.maxTermFa", { defaultValue: "Основные средства" })} path={["maxTermMonths", "fixedAssets"]} draft={draft} active={active} changedPaths={changedPaths} update={update} />
              </Card>
              <Card title={t("policy.section.graduatedLending", { defaultValue: "Серия кредитов" })} icon={<Calendar className="w-4 h-4" />}>
                <PolicyField label={t("policy.loan1Max", { defaultValue: "Кредит №1" })} path={["graduatedLending", "loan1MaxMonths"]} draft={draft} active={active} changedPaths={changedPaths} update={update} />
                <PolicyField label={t("policy.loan1MaxTrade", { defaultValue: "Кредит №1 (торговля)" })} path={["graduatedLending", "loan1MaxMonthsTrade"]} draft={draft} active={active} changedPaths={changedPaths} update={update} />
                <PolicyField label={t("policy.loan2Max", { defaultValue: "Кредит №2" })} path={["graduatedLending", "loan2MaxMonths"]} draft={draft} active={active} changedPaths={changedPaths} update={update} />
                <PolicyField label={t("policy.loan3Max", { defaultValue: "Кредит №3" })} path={["graduatedLending", "loan3MaxMonths"]} draft={draft} active={active} changedPaths={changedPaths} update={update} />
              </Card>
            </TabsContent>

            <TabsContent value="limits" className="mt-4 space-y-4">
              <Card title={t("policy.section.committee", { defaultValue: "Лимиты кредитного комитета (USD)" })} icon={<ShieldAlert className="w-4 h-4" />}>
                <PolicyField label={t("policy.singleBorrower", { defaultValue: "Один заёмщик" })} path={["creditCommitteeLimitsUsd", "singleBorrower"]} draft={draft} active={active} changedPaths={changedPaths} update={update} />
                <PolicyField label={t("policy.relatedGroup", { defaultValue: "Связанная группа" })} path={["creditCommitteeLimitsUsd", "relatedGroup"]} draft={draft} active={active} changedPaths={changedPaths} update={update} />
              </Card>
            </TabsContent>

            <TabsContent value="industries" className="mt-4 space-y-4">
              <div className="rounded-xl border bg-card p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <Ban className="w-4 h-4 text-rose-600" />
                  <h3 className="font-semibold">{t("policy.section.industries", { defaultValue: "Запрещённые отрасли" })}</h3>
                  <Badge variant="outline" className="ml-auto text-[10px]">
                    {draft.negativeIndustryKeywords.length} / 50
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  {t("policy.industriesHint", { defaultValue: "Если заявка содержит хоть одно из этих ключевых слов, она помечается как несоответствующая." })}
                </p>

                <div className="flex flex-wrap gap-1.5 mb-3 min-h-[32px]">
                  {draft.negativeIndustryKeywords.length === 0 && (
                    <span className="text-xs text-muted-foreground italic py-1">
                      {t("policy.noKeywords", { defaultValue: "Список пуст" })}
                    </span>
                  )}
                  {draft.negativeIndustryKeywords.map((kw) => (
                    <Badge key={kw} variant="secondary" className="gap-1.5 pr-1">
                      {kw}
                      <button
                        type="button"
                        onClick={() => removeKeyword(kw)}
                        className="rounded-full hover:bg-foreground/10 p-0.5"
                        aria-label={`Remove ${kw}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Input
                    placeholder={t("policy.addKeywordPlaceholder", { defaultValue: "Например: казино" })}
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addKeyword(); } }}
                    disabled={draft.negativeIndustryKeywords.length >= 50}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addKeyword}
                    disabled={!keywordInput.trim() || draft.negativeIndustryKeywords.length >= 50}
                    className="gap-1.5 shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    {t("common.add", { defaultValue: "Добавить" })}
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Discard confirm */}
      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("policy.discardConfirmTitle", { defaultValue: "Отменить изменения?" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("policy.discardConfirmDesc", {
                defaultValue: "Все {{n}} несохранённых изменений будут потеряны.",
                n: changes,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel", { defaultValue: "Отмена" })}</AlertDialogCancel>
            <AlertDialogAction onClick={onDiscardConfirm}>
              {t("policy.discardChanges", { defaultValue: "Отменить" })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h3 className="font-semibold">{title}</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
    </div>
  );
}

function PolicyField({
  label,
  path,
  draft,
  active,
  changedPaths,
  update,
  limitKey,
}: {
  label: string;
  path: Path;
  draft: PolicyParams;
  active: PolicyParams;
  changedPaths: Set<string>;
  update: (path: Path, value: number) => void;
  limitKey?: string;
}) {
  const value = getNested(draft, path) as number;
  const activeValue = getNested(active, path) as number;
  const pathStr = path.join(".");
  const limits = FIELD_LIMITS[limitKey ?? pathStr];
  const isChanged = changedPaths.has(pathStr);
  const outOfBounds = limits ? value < limits.min || value > limits.max : false;

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
          {label}
          {isChanged && (
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" title="Изменено" />
          )}
        </Label>
        {limits && (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {limits.min}–{limits.max}
          </span>
        )}
      </div>
      <div className="relative">
        <Input
          type="number"
          step={limits?.step ?? 0.01}
          min={limits?.min}
          max={limits?.max}
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) update(path, n);
          }}
          className={cn(
            "tabular-nums pr-12",
            isChanged && "border-amber-300 focus-visible:ring-amber-300/40",
            outOfBounds && "border-rose-400 focus-visible:ring-rose-400/40",
          )}
        />
        {limits?.suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">
            {limits.suffix}
          </span>
        )}
      </div>
      {isChanged && (
        <p className="text-[10px] text-muted-foreground mt-1 tabular-nums flex items-center gap-1">
          <Check className="w-2.5 h-2.5" />
          Было: {Number.isFinite(activeValue) ? activeValue : "—"}
        </p>
      )}
      {outOfBounds && limits && (
        <p className="text-[10px] text-rose-600 mt-1">
          Допустимо: {limits.min}–{limits.max}
        </p>
      )}
    </div>
  );
}
