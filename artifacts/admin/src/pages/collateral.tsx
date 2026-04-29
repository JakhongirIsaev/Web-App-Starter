import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Settings, Tag } from "lucide-react";
import { RowActions } from "@/components/row-actions";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { buildApiUrl } from "@/lib/api";
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

const getToken = () => localStorage.getItem("auth_token");

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(buildApiUrl(`/api${url}`), {
    ...options,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
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
