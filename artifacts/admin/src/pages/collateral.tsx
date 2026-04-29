import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Settings, Tag, ListChecks } from "lucide-react";
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
  transportAgeThreshold: number;
  transportAgeDiscount: number;
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
  const [transportAgeThreshold, setTransportAgeThreshold] = useState("7");
  const [transportAgeDiscount, setTransportAgeDiscount] = useState("0.40");

  useEffect(() => {
    if (settingsQuery.data) {
      setCoverageRatio(String(settingsQuery.data.coverageRatio));
      setTransportAgeThreshold(String(settingsQuery.data.transportAgeThreshold));
      setTransportAgeDiscount(String(settingsQuery.data.transportAgeDiscount));
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
    const threshold = Number(transportAgeThreshold);
    const discount = Number(transportAgeDiscount);
    if (
      !Number.isFinite(ratio) || ratio <= 1.0 || ratio > 3.0 ||
      !Number.isFinite(threshold) || !Number.isInteger(threshold) || threshold < 1 || threshold > 30 ||
      !Number.isFinite(discount) || discount <= 0 || discount >= 1.0
    ) {
      toast({ title: t("collateralAdmin.invalidValues"), variant: "destructive" });
      return;
    }
    saveSettings.mutate({
      coverageRatio: ratio,
      transportAgeThreshold: threshold,
      transportAgeDiscount: discount,
    });
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
          <div>
            <Label htmlFor="threshold">{t("collateralAdmin.transportAgeThreshold")}</Label>
            <Input
              id="threshold"
              type="number"
              step="1"
              min="1"
              max="30"
              value={transportAgeThreshold}
              onChange={(e) => setTransportAgeThreshold(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="discount">{t("collateralAdmin.transportAgeDiscount")}</Label>
            <Input
              id="discount"
              type="number"
              step="0.01"
              min="0.01"
              max="0.99"
              value={transportAgeDiscount}
              onChange={(e) => setTransportAgeDiscount(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">{t("collateralAdmin.transportAgeDiscountHint")}</p>
          </div>
          <Button type="submit" disabled={saveSettings.isPending}>
            {saveSettings.isPending ? t("common.saving") : t("common.save")}
          </Button>
        </form>
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
