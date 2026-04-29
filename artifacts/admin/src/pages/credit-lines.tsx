import { useState, useRef, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Search, Download, Upload, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { buildApiUrl } from "@/lib/api";
import { buildAuthHeaders, buildJsonHeaders } from "@/lib/auth-headers";
import { downloadCsv } from "@/lib/csv";
import { localizeSection, localizeDepartment, localizeSpecialConditions, localizeNotes } from "@/lib/localize";
import { formatAdminFileDate } from "@/lib/time";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RowActions } from "@/components/row-actions";

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(buildApiUrl(`/api${url}`), {
    ...options,
    headers: buildJsonHeaders(options?.headers),
  });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null;
  return res.json();
}

interface CreditLineForm {
  number: string;
  name: string;
  department: string;
  agreementDate: string;
  agreementAmount: string;
  receivedAmount: string;
  currency: string;
  interestRate: string;
  disbursedAmount: string;
  remainingBalance: string;
  projectCount: string;
  specialConditions: string;
  notes: string;
  section: string;
}

const emptyForm: CreditLineForm = {
  number: "",
  name: "",
  department: "",
  agreementDate: "",
  agreementAmount: "",
  receivedAmount: "",
  currency: "",
  interestRate: "",
  disbursedAmount: "",
  remainingBalance: "",
  projectCount: "",
  specialConditions: "",
  notes: "",
  section: "",
};

const writeRoles = ["superadmin", "head_office_admin", "editor"];
const adminRoles = ["superadmin", "head_office_admin"];

function fmtNum(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "-";

  const str = String(value).trim();
  const num = Number(str);
  if (!Number.isFinite(num)) return str;

  const fixed = str.includes(".") ? Math.min((str.split(".")[1] || "").length, 2) : 0;
  const [intPart, decPart] = num.toFixed(fixed).split(".");
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
  return decPart ? `${formatted}.${decPart}` : formatted;
}

function trimTrailingZeros(value: number): string {
  return value
    .toFixed(2)
    .replace(/\.00$/, "")
    .replace(/(\.\d*[1-9])0+$/, "$1");
}

function normalizeCurrencyCode(value: string | null | undefined): string | null {
  if (!value) return null;

  const text = value.trim().toUpperCase();
  const digits = text.replace(/\D/g, "");
  const lookup = digits || text;

  switch (lookup) {
    case "000":
    case "860":
    case "UZS":
      return "UZS";
    case "840":
    case "USD":
      return "USD";
    case "978":
    case "EUR":
      return "EUR";
    case "392":
    case "JPY":
      return "JPY";
    default:
      return text;
  }
}

function fmtInterestRate(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") {
    const percentValue = Math.abs(value) < 1 ? value * 100 : value;
    return `${trimTrailingZeros(percentValue)}%`;
  }

  const text = String(value).trim();
  if (!text) return "-";
  if (text.includes("%")) return text;

  const normalized = text.replace(",", ".");
  if (/^[+-]?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(normalized)) {
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      const percentValue = Math.abs(parsed) < 1 ? parsed * 100 : parsed;
      return `${trimTrailingZeros(percentValue)}%`;
    }
  }

  return text;
}

function formatAgreementDate(value: string | null | undefined): string {
  if (!value) return "-";
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(value)) return value;

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return `${match[3]}.${match[2]}.${match[1]}`;
  }

  return value;
}

export default function CreditLines({ user }: { user?: { role: string } }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [currency, setCurrency] = useState("all");
  const [page, setPage] = useState(1);
  const importRef = useRef<HTMLInputElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [form, setForm] = useState<CreditLineForm>(emptyForm);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const canWrite = user && writeRoles.includes(user.role);
  const canAdmin = user && adminRoles.includes(user.role);

  const buildImportSummary = (result: { imported?: number; cleared?: number; skipped?: number[] }) => {
    const parts = [`${result.imported || 0} imported`];
    if (result.cleared) parts.push(`${result.cleared} cleared`);
    if (result.skipped?.length) parts.push(`${result.skipped.length} skipped`);
    return parts.join(", ");
  };

  const queryKey = ["credit-lines", search, currency, page];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => apiFetch(`/credit-lines?search=${search}&currency=${currency !== "all" ? currency : ""}&page=${page}&pageSize=50`),
  });

  const createMut = useMutation({ mutationFn: (payload: any) => apiFetch("/credit-lines", { method: "POST", body: JSON.stringify(payload) }) });
  const updateMut = useMutation({ mutationFn: ({ id, ...payload }: any) => apiFetch(`/credit-lines/${id}`, { method: "PUT", body: JSON.stringify(payload) }) });
  const deleteMut = useMutation({ mutationFn: (id: number) => apiFetch(`/credit-lines/${id}`, { method: "DELETE" }) });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["credit-lines"] });

  const openCreate = () => {
    setEditItem(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (item: any) => {
    setEditItem(item);
    setForm({
      number: item.number?.toString() || "",
      name: item.name || "",
      department: item.department || "",
      agreementDate: item.agreementDate || "",
      agreementAmount: item.agreementAmount || "",
      receivedAmount: item.receivedAmount || "",
      currency: normalizeCurrencyCode(item.currency) || "",
      interestRate: item.interestRate || "",
      disbursedAmount: item.disbursedAmount || "",
      remainingBalance: item.remainingBalance || "",
      projectCount: item.projectCount?.toString() || "",
      specialConditions: item.specialConditions || "",
      notes: item.notes || "",
      section: item.section || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) return;
    const payload = {
      ...form,
      currency: normalizeCurrencyCode(form.currency),
      number: form.number ? Number(form.number) : null,
      projectCount: form.projectCount ? Number(form.projectCount) : null,
    };

    if (editItem) {
      updateMut.mutate({ id: editItem.id, ...payload }, {
        onSuccess: () => { toast({ title: t("creditLines.lineUpdated") }); setDialogOpen(false); invalidate(); },
        onError: (error: any) => toast({ variant: "destructive", title: t("common.error"), description: error.message }),
      });
    } else {
      createMut.mutate(payload, {
        onSuccess: () => { toast({ title: t("creditLines.lineCreated") }); setDialogOpen(false); invalidate(); },
        onError: (error: any) => toast({ variant: "destructive", title: t("common.error"), description: error.message }),
      });
    }
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMut.mutate(deleteTarget.id, {
      onSuccess: () => { toast({ title: t("creditLines.lineDeleted") }); setDeleteTarget(null); invalidate(); },
      onError: (error: any) => toast({ variant: "destructive", title: t("common.error"), description: error.message }),
    });
  };

  const handleExport = () => {
    if (!data?.data?.length) return;
    const rows = data.data.map((item: any) => ({
      number: item.number || "",
      name: item.name,
      department: item.department || "",
      agreementDate: item.agreementDate || "",
      agreementAmount: item.agreementAmount || "",
      receivedAmount: item.receivedAmount || "",
      currency: normalizeCurrencyCode(item.currency) || "",
      interestRate: item.interestRate || "",
      disbursedAmount: item.disbursedAmount || "",
      remainingBalance: item.remainingBalance || "",
      projectCount: item.projectCount || "",
      specialConditions: item.specialConditions || "",
      notes: item.notes || "",
      section: item.section || "",
    }));
    downloadCsv(rows, `kredit_liniyalari_${formatAdminFileDate()}.csv`);
    toast({ title: t("common.exportSuccess") });
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(buildApiUrl("/api/credit-lines/import"), {
        method: "POST",
        headers: buildAuthHeaders(),
        body: formData,
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      toast({ title: t("common.importSuccess"), description: buildImportSummary(result) });
      setExpandedId(null);
      invalidate();
    } catch (error: any) {
      toast({ variant: "destructive", title: t("common.importError"), description: error.message });
    }
    if (importRef.current) importRef.current.value = "";
  };

  const items = data?.data || [];
  const total = data?.total || 0;
  const isPending = createMut.isPending || updateMut.isPending;

  const getCurrencyBadge = (value: string | null | undefined) => {
    switch (normalizeCurrencyCode(value)) {
      case "USD":
        return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">USD</Badge>;
      case "EUR":
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20">EUR</Badge>;
      case "JPY":
        return <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/20">JPY</Badge>;
      case "UZS":
        return <Badge variant="outline" className="bg-violet-500/10 text-violet-700 border-violet-500/20">UZS</Badge>;
      default:
        return value ? <Badge variant="secondary">{value}</Badge> : "-";
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t("creditLines.title")}</h2>
          <p className="text-muted-foreground mt-1">{t("creditLines.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canAdmin && (
            <>
              <input type="file" ref={importRef} accept=".csv,.xlsx,.xls" onChange={handleImport} className="hidden" />
              <Button variant="outline" className="gap-2" onClick={() => importRef.current?.click()}>
                <Upload className="h-4 w-4" />{t("common.import")}
              </Button>
            </>
          )}
          <Button variant="outline" className="gap-2" onClick={handleExport}>
            <Download className="h-4 w-4" />{t("common.export")}
          </Button>
          {canWrite && (
            <Button className="gap-2" onClick={openCreate}>
              <Plus className="h-4 w-4" />{t("creditLines.addLine")}
            </Button>
          )}
        </div>
      </div>

      <div className="bg-card border border-border/50 rounded-lg shadow-sm">
        <div className="p-4 border-b border-border/50 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder={t("creditLines.searchPlaceholder")} className="pl-9 max-w-md" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
          </div>
          <Select value={currency} onValueChange={(value) => { setCurrency(value); setPage(1); }}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("creditLines.allCurrencies")}</SelectItem>
              <SelectItem value="UZS">UZS</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="EUR">EUR</SelectItem>
              <SelectItem value="JPY">JPY</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="relative w-full overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-12">{t("creditLines.number")}</TableHead>
                <TableHead>{t("creditLines.name")}</TableHead>
                <TableHead>{t("creditLines.currency")}</TableHead>
                <TableHead>{t("creditLines.agreementAmount")}</TableHead>
                <TableHead>{t("creditLines.disbursedAmount")}</TableHead>
                <TableHead>{t("creditLines.remainingBalance")}</TableHead>
                <TableHead className="text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <TableRow key={index}>
                    {Array.from({ length: 7 }).map((__, cellIndex) => (
                      <TableCell key={cellIndex}><Skeleton className="h-5 w-24" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">{t("creditLines.noLines")}</TableCell>
                </TableRow>
              ) : (
                items.map((item: any) => (
                  <Fragment key={item.id}>
                    <TableRow className="cursor-pointer" onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}>
                      <TableCell className="font-mono text-muted-foreground">{item.number ?? "-"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="font-medium text-foreground max-w-[320px] truncate">{item.name}</div>
                          {expandedId === item.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        </div>
                      </TableCell>
                      <TableCell>{getCurrencyBadge(item.currency)}</TableCell>
                      <TableCell className="text-sm font-medium tabular-nums">{fmtNum(item.agreementAmount)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground tabular-nums">{fmtNum(item.disbursedAmount)}</TableCell>
                      <TableCell className="text-sm font-medium text-primary tabular-nums">{fmtNum(item.remainingBalance)}</TableCell>
                      {canWrite ? (
                        <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                          <RowActions
                            actions={[
                              { label: t("common.edit"), icon: Pencil, onClick: () => openEdit(item) },
                              { label: t("common.delete"), icon: Trash2, danger: true, hidden: !canAdmin, onClick: () => setDeleteTarget(item) },
                            ]}
                          />
                        </TableCell>
                      ) : <TableCell />}
                    </TableRow>
                    {expandedId === item.id && (
                      <TableRow>
                        <TableCell colSpan={7} className="bg-muted/30 p-4">
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                            <div><span className="font-medium text-muted-foreground">{t("creditLines.department")}:</span> <span className="ml-1">{localizeDepartment(item.department, lang) || "-"}</span></div>
                            <div><span className="font-medium text-muted-foreground">{t("creditLines.agreementDate")}:</span> <span className="ml-1">{formatAgreementDate(item.agreementDate)}</span></div>
                            <div><span className="font-medium text-muted-foreground">{t("creditLines.receivedAmount")}:</span> <span className="ml-1 tabular-nums">{fmtNum(item.receivedAmount)}</span></div>
                            <div><span className="font-medium text-muted-foreground">{t("creditLines.interestRate")}:</span> <span className="ml-1">{fmtInterestRate(item.interestRate)}</span></div>
                            <div><span className="font-medium text-muted-foreground">{t("creditLines.projectCount")}:</span> <span className="ml-1">{item.projectCount || "-"}</span></div>
                            <div><span className="font-medium text-muted-foreground">{t("creditLines.section")}:</span> <span className="ml-1">{localizeSection(item.section, lang) || "-"}</span></div>
                            {item.specialConditions && <div className="col-span-2 md:col-span-3"><span className="font-medium text-muted-foreground">{t("creditLines.specialConditions")}:</span> <span className="ml-1">{localizeSpecialConditions(item.specialConditions, lang)}</span></div>}
                            {item.notes && <div className="col-span-2 md:col-span-3"><span className="font-medium text-muted-foreground">{t("creditLines.notes")}:</span> <span className="ml-1">{localizeNotes(item.notes, lang)}</span></div>}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {total > 0 && (
          <div className="p-4 border-t border-border/50 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("common.showing", { count: items.length, total })}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>{t("common.previous")}</Button>
              <Button variant="outline" size="sm" disabled={page * 50 >= total} onClick={() => setPage((value) => value + 1)}>{t("common.next")}</Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem ? t("creditLines.editLineTitle") : t("creditLines.addLineTitle")}</DialogTitle>
            <DialogDescription>{editItem ? t("creditLines.editLineDesc") : t("creditLines.addLineDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{t("creditLines.number")}</Label>
                <Input type="number" value={form.number} onChange={(event) => setForm((current) => ({ ...current, number: event.target.value }))} />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>{t("creditLines.name")}</Label>
                <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("creditLines.department")}</Label>
                <Input value={form.department} onChange={(event) => setForm((current) => ({ ...current, department: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{t("creditLines.currency")}</Label>
                <Select value={form.currency || "none"} onValueChange={(value) => setForm((current) => ({ ...current, currency: value === "none" ? "" : value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">-</SelectItem>
                    <SelectItem value="UZS">UZS</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="JPY">JPY</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("creditLines.agreementDate")}</Label>
                <Input value={form.agreementDate} onChange={(event) => setForm((current) => ({ ...current, agreementDate: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{t("creditLines.interestRate")}</Label>
                <Input value={form.interestRate} onChange={(event) => setForm((current) => ({ ...current, interestRate: event.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{t("creditLines.agreementAmount")}</Label>
                <Input value={form.agreementAmount} onChange={(event) => setForm((current) => ({ ...current, agreementAmount: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{t("creditLines.receivedAmount")}</Label>
                <Input value={form.receivedAmount} onChange={(event) => setForm((current) => ({ ...current, receivedAmount: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{t("creditLines.disbursedAmount")}</Label>
                <Input value={form.disbursedAmount} onChange={(event) => setForm((current) => ({ ...current, disbursedAmount: event.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("creditLines.remainingBalance")}</Label>
                <Input value={form.remainingBalance} onChange={(event) => setForm((current) => ({ ...current, remainingBalance: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{t("creditLines.projectCount")}</Label>
                <Input type="number" value={form.projectCount} onChange={(event) => setForm((current) => ({ ...current, projectCount: event.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("creditLines.section")}</Label>
              <Input value={form.section} onChange={(event) => setForm((current) => ({ ...current, section: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>{t("creditLines.specialConditions")}</Label>
              <Textarea value={form.specialConditions} onChange={(event) => setForm((current) => ({ ...current, specialConditions: event.target.value }))} rows={2} />
            </div>
            <div className="space-y-2">
              <Label>{t("creditLines.notes")}</Label>
              <Textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleSubmit} disabled={isPending || !form.name.trim()}>
              {isPending ? t("common.saving") : editItem ? t("common.saveChanges") : t("creditLines.addLine")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("creditLines.deleteLine")}</AlertDialogTitle>
            <AlertDialogDescription>{t("creditLines.deleteLineConfirm", { name: deleteTarget?.name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteMut.isPending ? t("common.deleting") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
