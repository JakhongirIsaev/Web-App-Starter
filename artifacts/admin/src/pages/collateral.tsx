import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Calculator, CheckCircle2, ListChecks, Pencil, Plus, Settings, Tag, Trash2, XCircle } from "lucide-react";
import { RowActions } from "@/components/row-actions";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { buildApiUrl } from "@/lib/api";
import { buildJsonHeaders } from "@/lib/auth-headers";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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

export default function CollateralAdmin() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const settingsQuery = useQuery<CollateralSettings>({
    queryKey: ["admin/collateral-settings"],
    queryFn: () => apiFetch("/admin/collateral-settings"),
  });
  const typesQuery = useQuery<CollateralType[]>({
    queryKey: ["collateral-types"],
    queryFn: () => apiFetch("/collateral-types"),
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
      toast({ title: t("collateralAdmin.saved") });
    },
    onError: (err: Error) => toast({ title: t("collateralAdmin.saveFailed"), description: err.message, variant: "destructive" }),
  });

  const onSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const ratio = Number(coverageRatio);
    if (!Number.isFinite(ratio) || ratio <= 1.0 || ratio > 3.0) {
      toast({ title: t("collateralAdmin.invalidValues"), variant: "destructive" });
      return;
    }
    saveSettings.mutate({ coverageRatio: ratio });
  };

  // ── Type editor ──
  const [editing, setEditing] = useState<CollateralType | null>(null);

  const saveType = useMutation({
    mutationFn: (input: { id: number; body: Partial<CollateralType> }) =>
      apiFetch(`/admin/collateral-types/${input.id}`, {
        method: "PATCH",
        body: JSON.stringify(input.body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["collateral-types"] });
      setEditing(null);
      toast({ title: t("collateralAdmin.typeSaved") });
    },
    onError: (err: Error) => toast({ title: t("collateralAdmin.saveFailed"), description: err.message, variant: "destructive" }),
  });

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">{t("collateralAdmin.title")}</h1>
      <p className="text-sm text-muted-foreground mb-6">{t("collateralAdmin.subtitle")}</p>

      {/* CALCULATOR */}
      <CalculatorSection types={typesQuery.data ?? []} />

      {/* SYSTEM SETTINGS */}
      <section className="mb-8 border rounded-lg p-5 bg-card">
        <header className="flex items-center gap-2 mb-4">
          <Settings className="w-4 h-4" />
          <h2 className="font-semibold">{t("collateralAdmin.settingsTitle")}</h2>
        </header>
        <p className="text-xs text-muted-foreground mb-4">{t("collateralAdmin.settingsHint")}</p>

        <form onSubmit={onSaveSettings} className="space-y-4 max-w-md">
          <div>
            <Label htmlFor="coverage">{t("collateralAdmin.coverageRatio")}</Label>
            <Input
              id="coverage"
              type="number"
              step="0.01"
              min="1.01"
              max="3"
              value={coverageRatio}
              onChange={(e) => setCoverageRatio(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">{t("collateralAdmin.coverageRatioHint")}</p>
          </div>
          <Button type="submit" disabled={saveSettings.isPending}>
            {saveSettings.isPending ? t("common.saving") : t("common.save")}
          </Button>
        </form>

        <div className="mt-6 rounded-md border bg-muted/40 p-4 max-w-md">
          <h3 className="text-sm font-medium mb-2">{t("collateralAdmin.discountScheduleTitle")}</h3>
          <p className="text-xs text-muted-foreground mb-3">{t("collateralAdmin.discountScheduleHint")}</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-1.5 text-xs font-medium text-muted-foreground">{t("collateralAdmin.discountColType")}</th>
                <th className="text-right py-1.5 text-xs font-medium text-muted-foreground">{t("collateralAdmin.discountColRate")}</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              <tr className="border-b border-border/50">
                <td className="py-1.5">{t("collateralAdmin.discountRealEstate")}</td>
                <td className="text-right tabular-nums py-1.5">60%</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-1.5">{t("collateralAdmin.discountTransportUnder3")}</td>
                <td className="text-right tabular-nums py-1.5">70%</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-1.5">{t("collateralAdmin.discountTransport3to5")}</td>
                <td className="text-right tabular-nums py-1.5">60%</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-1.5">{t("collateralAdmin.discountTransport5to7")}</td>
                <td className="text-right tabular-nums py-1.5">50%</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-1.5">{t("collateralAdmin.discountTransport7plus")}</td>
                <td className="text-right tabular-nums py-1.5">30%</td>
              </tr>
              <tr>
                <td className="py-1.5">{t("collateralAdmin.discountJewelryEquipment")}</td>
                <td className="text-right tabular-nums py-1.5">100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* COLLATERAL TYPES */}
      <section className="border rounded-lg p-5 bg-card">
        <header className="flex items-center gap-2 mb-4">
          <Tag className="w-4 h-4" />
          <h2 className="font-semibold">{t("collateralAdmin.typesTitle")}</h2>
        </header>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("collateralAdmin.colType")}</TableHead>
              <TableHead>{t("collateralAdmin.colCode")}</TableHead>
              <TableHead className="text-center">{t("collateralAdmin.colActive")}</TableHead>
              <TableHead className="text-right">{t("collateralAdmin.colSort")}</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(typesQuery.data ?? []).map((type) => (
              <TableRow key={type.id}>
                <TableCell className="font-medium">{type.nameRu}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{type.code}</TableCell>
                <TableCell className="text-center">{type.isActive ? "✓" : "—"}</TableCell>
                <TableCell className="text-right">{type.sortOrder}</TableCell>
                <TableCell>
                  <RowActions
                    actions={[
                      {
                        label: t("common.edit"),
                        icon: Pencil,
                        onClick: () => setEditing(type),
                      },
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      {/* CROSS-BRANCH ESTIMATES */}
      <CrossBranchEstimatesSection />

      {/* EDIT TYPE DIALOG */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("collateralAdmin.editType")}</DialogTitle>
            <DialogDescription>{editing?.code}</DialogDescription>
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
                <Label>{t("collateralAdmin.nameRu")}</Label>
                <Input value={editing.nameRu} onChange={(e) => setEditing({ ...editing, nameRu: e.target.value })} />
              </div>
              <div>
                <Label>{t("collateralAdmin.nameUz")}</Label>
                <Input value={editing.nameUz ?? ""} onChange={(e) => setEditing({ ...editing, nameUz: e.target.value })} />
              </div>
              <div>
                <Label>{t("collateralAdmin.colSort")}</Label>
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
                <Label>{t("collateralAdmin.colActive")}</Label>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={saveType.isPending}>
                  {t("common.save")}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
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
function fmt(v: string | number) {
  const n = typeof v === "string" ? Number.parseFloat(v) : v;
  return Number.isFinite(n) ? moneyFmt.format(n) : String(v);
}

function CrossBranchEstimatesSection() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [resultStatus, setResultStatus] = useState<"all" | "enough" | "not_enough">("all");

  const params = new URLSearchParams({ page: String(page), pageSize: "20" });
  if (resultStatus !== "all") params.set("resultStatus", resultStatus);

  const { data, isLoading } = useQuery<{
    data: EstimateRow[];
    total: number;
    page: number;
    pageSize: number;
  }>({
    queryKey: ["admin/collateral-estimates", { page, resultStatus }],
    queryFn: () => apiFetch(`/admin/collateral-estimates?${params.toString()}`),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <section className="mt-6 border rounded-lg p-5 bg-card">
      <header className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <ListChecks className="w-4 h-4" />
          <h2 className="font-semibold">{t("collateralAdmin.allEstimatesTitle")}</h2>
        </div>
        <div className="w-44">
          <Select value={resultStatus} onValueChange={(v) => { setResultStatus(v as any); setPage(1); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("collateralAdmin.statusAll")}</SelectItem>
              <SelectItem value="enough">{t("collateralAdmin.statusEnough")}</SelectItem>
              <SelectItem value="not_enough">{t("collateralAdmin.statusNotEnough")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-4">{t("common.loading")}</p>
      ) : !data || data.data.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">{t("collateralAdmin.noEstimates")}</p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("collateralAdmin.colDate")}</TableHead>
                <TableHead>{t("collateralAdmin.colClient")}</TableHead>
                <TableHead>{t("collateralAdmin.colBranch")}</TableHead>
                <TableHead>{t("collateralAdmin.colProduct")}</TableHead>
                <TableHead className="text-right">{t("collateralAdmin.colRequested")}</TableHead>
                <TableHead className="text-right">{t("collateralAdmin.colAccepted")}</TableHead>
                <TableHead className="text-right">{t("collateralAdmin.colCoverage")}</TableHead>
                <TableHead>{t("collateralAdmin.colStatus")}</TableHead>
                <TableHead>{t("collateralAdmin.colCreatedBy")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">
                    {new Date(row.createdAt).toLocaleDateString("ru-RU")}
                  </TableCell>
                  <TableCell className="text-sm">{row.clientName ?? `#${row.clientId}`}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.branchName ?? "—"}</TableCell>
                  <TableCell className="text-xs">{row.productName}</TableCell>
                  <TableCell className="text-sm tabular-nums text-right">{fmt(row.requestedLoanAmount)}</TableCell>
                  <TableCell className="text-sm tabular-nums text-right">{fmt(row.totalAcceptedValue)}</TableCell>
                  <TableCell className="text-sm tabular-nums text-right">
                    {Number(row.coveragePercent).toFixed(0)}%
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.resultStatus === "enough" ? "default" : "destructive"}>
                      {row.resultStatus === "enough"
                        ? t("collateralAdmin.statusEnough")
                        : t("collateralAdmin.statusNotEnough")}
                    </Badge>
                    {row.hasEquipmentOnly && (
                      <Badge variant="outline" className="ml-1 text-[9px]">{t("collateralAdmin.equipOnlyTag")}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.createdByName ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between mt-3 text-xs">
            <span className="text-muted-foreground">
              {t("activityLog.showing", {
                from: (data.page - 1) * data.pageSize + 1,
                to: Math.min(data.page * data.pageSize, data.total),
                total: data.total,
              })}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</Button>
              <span>{data.page} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>›</Button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

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

function CalculatorSection({ types }: { types: CollateralType[] }) {
  const activeTypes = types.filter((t) => t.isActive);
  const defaultType = activeTypes[0]?.code ?? "real_estate";

  const [loanAmount, setLoanAmount] = useState("");
  const [items, setItems] = useState<CalcItem[]>([newCalcItem(defaultType)]);
  const [result, setResult] = useState<CalcPreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Recalculate whenever inputs change. Keep the last result visible while
  // recomputing so the UI doesn't flicker on every keystroke.
  useEffect(() => {
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
  }, [loanAmount, items]);

  const updateItem = (id: string, patch: Partial<CalcItem>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const removeItem = (id: string) =>
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.id !== id) : prev));
  const addItem = () => setItems((prev) => [...prev, newCalcItem(defaultType)]);

  return (
    <section className="mb-8 border rounded-lg p-5 bg-card">
      <header className="flex items-center gap-2 mb-1">
        <Calculator className="w-4 h-4" />
        <h2 className="font-semibold">Калькулятор залога</h2>
      </header>
      <p className="text-xs text-muted-foreground mb-4">
        Введите запрашиваемую сумму и предметы залога — расчёт обновляется автоматически. Ничего не сохраняется.
      </p>

      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <div>
          <Label htmlFor="calc-loan">Сумма кредита, сум</Label>
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
            Покрытие × {result?.coverageRatio ?? "—"} → требуется {result ? fmt(result.totals.requiredCollateralValue) : "—"}
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Предметы залога</Label>
          {items.map((it) => (
            <div key={it.id} className="grid grid-cols-[180px_1fr_120px_36px] gap-2 items-start">
              <Select value={it.typeCode} onValueChange={(v) => updateItem(it.id, { typeCode: v, year: v === "transport" ? it.year : "" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {activeTypes.map((t) => (
                    <SelectItem key={t.code} value={t.code}>{t.nameRu}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                min="0"
                step="1000000"
                placeholder="рыночная стоимость"
                value={it.marketValue}
                onChange={(e) => updateItem(it.id, { marketValue: e.target.value })}
                className="font-mono tabular-nums"
              />
              <Input
                type="number"
                min="1900"
                max={new Date().getFullYear()}
                placeholder="год"
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
                title="Удалить"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addItem} className="gap-2">
            <Plus className="w-3.5 h-3.5" />
            Добавить предмет
          </Button>
        </div>
      </div>

      <div className="mt-5 border-t pt-5">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!result && !error && (
          <p className="text-sm text-muted-foreground">Заполните сумму кредита и хотя бы один предмет залога.</p>
        )}
        {result && (
          <div className="grid gap-4 md:grid-cols-[1fr_280px]">
            <div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="text-left py-2">Тип</th>
                    <th className="text-right py-2">Рыночная</th>
                    <th className="text-right py-2">Дисконт</th>
                    <th className="text-right py-2">Принимается</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((it, i) => {
                    const typeName = activeTypes.find((t) => t.code === it.typeCode)?.nameRu ?? it.typeCode;
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
                    <td className="py-2">Итого</td>
                    <td className="py-2 text-right tabular-nums">{fmt(result.totals.totalMarketValue)}</td>
                    <td></td>
                    <td className="py-2 text-right tabular-nums">{fmt(result.totals.totalAcceptedValue)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div
              className={`rounded-md p-4 border ${
                result.totals.resultStatus === "enough"
                  ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30"
                  : "border-rose-200 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/30"
              }`}
            >
              <div className="flex items-center gap-2 mb-3">
                {result.totals.resultStatus === "enough" ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                ) : (
                  <XCircle className="w-5 h-5 text-rose-600" />
                )}
                <span className="font-semibold">
                  {result.totals.resultStatus === "enough" ? "Достаточно" : "Недостаточно"}
                </span>
                {pending && <span className="text-xs text-muted-foreground ml-auto">…</span>}
              </div>
              <dl className="text-sm space-y-1.5">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Покрытие</dt>
                  <dd className="tabular-nums font-medium">{result.totals.coveragePercent.toFixed(0)}%</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Макс. кредит</dt>
                  <dd className="tabular-nums">{fmt(result.totals.maxLoanAmount)}</dd>
                </div>
                {result.totals.resultStatus === "not_enough" && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Не хватает</dt>
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
    </section>
  );
}
