import React, { useState, useRef, useMemo } from "react";
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
import { format } from "date-fns";
import { downloadCsv } from "@/lib/csv";
import { localizePurpose, localizeHighlight, localizeDisbursement, localizeMonthsField, localizeLoanAmount } from "@/lib/localize";
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

const getToken = () => localStorage.getItem("auth_token");

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(buildApiUrl(`/api${url}`), {
    ...options,
    headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null;
  return res.json();
}

interface CreditProductForm {
  name: string; number: string; sapCode: string; segment: string;
  disbursementForm: string; loanAmount: string; termWorkingCapital: string;
  termFixedAssets: string; termUntargeted: string; rateUZS: string;
  rateUSD: string; rateEUR: string; gracePeriod: string; purpose: string; highlight: string;
}

const emptyForm: CreditProductForm = {
  name: "", number: "", sapCode: "", segment: "", disbursementForm: "",
  loanAmount: "", termWorkingCapital: "", termFixedAssets: "", termUntargeted: "",
  rateUZS: "", rateUSD: "", rateEUR: "", gracePeriod: "", purpose: "", highlight: "",
};

const writeRoles = ["superadmin", "head_office_admin", "editor"];
const adminRoles = ["superadmin", "head_office_admin"];

const segmentOrder = ["микро", "малый", "средний"];

interface ProductGroup {
  number: number;
  name: string;
  sapCode: string;
  segments: Record<string, any>;
}

export default function CreditProducts({ user }: { user?: { role: string } }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const importRef = useRef<HTMLInputElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [form, setForm] = useState<CreditProductForm>(emptyForm);
  const [expandedNumber, setExpandedNumber] = useState<number | null>(null);
  const [selectedSegments, setSelectedSegments] = useState<Record<number, string>>({});
  const canWrite = user && writeRoles.includes(user.role);
  const canAdmin = user && adminRoles.includes(user.role);

  const queryKey = ["credit-products", search, page];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => apiFetch(`/credit-products?search=${search}&segment=&page=${page}&pageSize=100`),
  });

  const createMut = useMutation({ mutationFn: (d: any) => apiFetch("/credit-products", { method: "POST", body: JSON.stringify(d) }) });
  const updateMut = useMutation({ mutationFn: ({ id, ...d }: any) => apiFetch(`/credit-products/${id}`, { method: "PUT", body: JSON.stringify(d) }) });
  const deleteMut = useMutation({ mutationFn: (id: number) => apiFetch(`/credit-products/${id}`, { method: "DELETE" }) });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["credit-products"] });

  const openCreate = () => { setEditItem(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (item: any) => {
    setEditItem(item);
    setForm({
      name: item.name || "", number: item.number?.toString() || "", sapCode: item.sapCode || "",
      segment: item.segment || "", disbursementForm: item.disbursementForm || "",
      loanAmount: item.loanAmount || "", termWorkingCapital: item.termWorkingCapital || "",
      termFixedAssets: item.termFixedAssets || "", termUntargeted: item.termUntargeted || "",
      rateUZS: item.rateUZS || "", rateUSD: item.rateUSD || "", rateEUR: item.rateEUR || "",
      gracePeriod: item.gracePeriod || "", purpose: item.purpose || "", highlight: item.highlight || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) return;
    const payload = { ...form, number: form.number ? Number(form.number) : null };
    if (editItem) {
      updateMut.mutate({ id: editItem.id, ...payload }, {
        onSuccess: () => { toast({ title: t("creditProducts.productUpdated") }); setDialogOpen(false); invalidate(); },
        onError: (e: any) => toast({ variant: "destructive", title: t("common.error"), description: e.message }),
      });
    } else {
      createMut.mutate(payload, {
        onSuccess: () => { toast({ title: t("creditProducts.productCreated") }); setDialogOpen(false); invalidate(); },
        onError: (e: any) => toast({ variant: "destructive", title: t("common.error"), description: e.message }),
      });
    }
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMut.mutate(deleteTarget.id, {
      onSuccess: () => { toast({ title: t("creditProducts.productDeleted") }); setDeleteTarget(null); invalidate(); },
      onError: (e: any) => toast({ variant: "destructive", title: t("common.error"), description: e.message }),
    });
  };

  const handleExport = () => {
    if (!data?.data?.length) return;
    const rows = data.data.map((p: any) => ({
      number: p.number || "", name: p.name, sapCode: p.sapCode || "", segment: p.segment || "",
      disbursementForm: p.disbursementForm || "", loanAmount: p.loanAmount || "",
      termWorkingCapital: p.termWorkingCapital || "", termFixedAssets: p.termFixedAssets || "",
      termUntargeted: p.termUntargeted || "", rateUZS: p.rateUZS || "", rateUSD: p.rateUSD || "",
      rateEUR: p.rateEUR || "", gracePeriod: p.gracePeriod || "", purpose: p.purpose || "", highlight: p.highlight || "",
    }));
    downloadCsv(rows, `credit_products_${format(new Date(), "yyyy-MM-dd")}.csv`);
    toast({ title: t("common.exportSuccess") });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(buildApiUrl("/api/credit-products/import"), {
        method: "POST", headers: { Authorization: `Bearer ${getToken()}` }, body: formData,
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      toast({ title: t("common.importSuccess"), description: `${result.imported} records` });
      invalidate();
    } catch (err: any) {
      toast({ variant: "destructive", title: t("common.importError"), description: err.message });
    }
    if (importRef.current) importRef.current.value = "";
  };

  const items = data?.data || [];
  const isPending = createMut.isPending || updateMut.isPending;

  const grouped = useMemo(() => {
    const map = new Map<number, ProductGroup>();
    for (const p of items) {
      const num = p.number || p.id;
      if (!map.has(num)) {
        map.set(num, {
          number: num,
          name: p.name,
          sapCode: p.sapCode || "",
          segments: {},
        });
      }
      const segKey = p.segment || "__default";
      map.get(num)!.segments[segKey] = p;
    }
    return Array.from(map.values()).sort((a, b) => a.number - b.number);
  }, [items]);

  const getSegmentBadge = (seg: string, active: boolean) => {
    const base = active ? "cursor-pointer" : "cursor-pointer opacity-50";
    switch (seg) {
      case "средний": return <Badge variant="outline" className={`bg-blue-500/10 text-blue-600 border-blue-500/20 ${base}`}>{t("creditProducts.medium")}</Badge>;
      case "малый": return <Badge variant="outline" className={`bg-orange-500/10 text-orange-600 border-orange-500/20 ${base}`}>{t("creditProducts.small")}</Badge>;
      case "микро": return <Badge variant="outline" className={`bg-purple-500/10 text-purple-600 border-purple-500/20 ${base}`}>{t("creditProducts.micro")}</Badge>;
      default: return <Badge variant="secondary" className={base}>{seg}</Badge>;
    }
  };

  const getSelectedSeg = (group: ProductGroup) => {
    const segs = Object.keys(group.segments);
    const chosen = selectedSegments[group.number];
    if (chosen && group.segments[chosen]) return chosen;
    return segmentOrder.find((s) => segs.includes(s)) || segs[0] || "__default";
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t("creditProducts.title")}</h2>
          <p className="text-muted-foreground mt-1">{t("creditProducts.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          {canAdmin && (
            <>
              <input type="file" ref={importRef} accept=".csv" onChange={handleImport} className="hidden" />
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
              <Plus className="h-4 w-4" />{t("creditProducts.addProduct")}
            </Button>
          )}
        </div>
      </div>

      <div className="bg-card border border-border/50 rounded-lg shadow-sm">
        <div className="p-4 border-b border-border/50">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder={t("creditProducts.searchPlaceholder")} className="pl-9 max-w-md" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
        </div>

        <div className="relative w-full overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-12">{t("creditProducts.number")}</TableHead>
                <TableHead>{t("creditProducts.name")}</TableHead>
                <TableHead>{t("creditProducts.sapCode")}</TableHead>
                <TableHead>{t("creditProducts.segment")}</TableHead>
                <TableHead>{t("creditProducts.loanAmount")}</TableHead>
                <TableHead>{t("creditProducts.rateUZS")}</TableHead>
                <TableHead className="text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-8" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-20 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : grouped.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">{t("creditProducts.noProducts")}</TableCell>
                </TableRow>
              ) : (
                grouped.map((group) => {
                  const isExpanded = expandedNumber === group.number;
                  const currentSeg = getSelectedSeg(group);
                  const product = group.segments[currentSeg];
                  const availableSegs = segmentOrder.filter((s) => group.segments[s]);

                  return (
                    <React.Fragment key={group.number}>
                      <TableRow className="cursor-pointer" onClick={() => setExpandedNumber(isExpanded ? null : group.number)}>
                        <TableCell className="font-mono text-muted-foreground">{group.number}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="font-medium text-foreground">{group.name}</div>
                            {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground font-mono text-xs">{group.sapCode || "-"}</TableCell>
                        <TableCell>
                          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                            {availableSegs.map((seg) => (
                              <span
                                key={seg}
                                onClick={() => {
                                  setSelectedSegments((prev) => ({ ...prev, [group.number]: seg }));
                                  if (!isExpanded) setExpandedNumber(group.number);
                                }}
                              >
                                {getSegmentBadge(seg, currentSeg === seg)}
                              </span>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                          {product ? (localizeLoanAmount(product.loanAmount, lang) || "-") : "-"}
                        </TableCell>
                        <TableCell className="text-sm font-medium text-primary">
                          {product?.rateUZS || "-"}
                        </TableCell>
                        {canWrite && (
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => product && openEdit(product)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              {canAdmin && (
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => product && setDeleteTarget(product)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        )}
                        {!canWrite && <TableCell />}
                      </TableRow>
                      {isExpanded && product && (
                        <TableRow key={`${group.number}-detail`}>
                          <TableCell colSpan={7} className="bg-muted/30 p-4">
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                              <div><span className="font-medium text-muted-foreground">{t("creditProducts.disbursementForm")}:</span> <span className="ml-1">{localizeDisbursement(product.disbursementForm, lang) || "-"}</span></div>
                              <div><span className="font-medium text-muted-foreground">{t("creditProducts.termWorkingCapital")}:</span> <span className="ml-1">{localizeMonthsField(product.termWorkingCapital, lang) || "-"}</span></div>
                              <div><span className="font-medium text-muted-foreground">{t("creditProducts.termFixedAssets")}:</span> <span className="ml-1">{localizeMonthsField(product.termFixedAssets, lang) || "-"}</span></div>
                              <div><span className="font-medium text-muted-foreground">{t("creditProducts.termUntargeted")}:</span> <span className="ml-1">{localizeMonthsField(product.termUntargeted, lang) || "-"}</span></div>
                              <div><span className="font-medium text-muted-foreground">{t("creditProducts.rateUSD")}:</span> <span className="ml-1">{product.rateUSD || "-"}</span></div>
                              <div><span className="font-medium text-muted-foreground">{t("creditProducts.rateEUR")}:</span> <span className="ml-1">{product.rateEUR || "-"}</span></div>
                              <div><span className="font-medium text-muted-foreground">{t("creditProducts.gracePeriod")}:</span> <span className="ml-1">{localizeMonthsField(product.gracePeriod, lang) || "-"}</span></div>
                              <div className="col-span-2 md:col-span-3"><span className="font-medium text-muted-foreground">{t("creditProducts.purpose")}:</span> <span className="ml-1">{localizePurpose(product.purpose, lang) || "-"}</span></div>
                              {product.highlight && <div className="col-span-2 md:col-span-3"><span className="font-medium text-muted-foreground">{t("creditProducts.highlight")}:</span> <span className="ml-1">{localizeHighlight(product.highlight, lang)}</span></div>}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        {data?.total != null && (
          <div className="p-4 border-t border-border/50 flex items-center justify-between text-sm text-muted-foreground">
            <span>{t("common.total")}: {data.total} {t("creditProducts.records")} ({grouped.length} {t("creditProducts.products")})</span>
            {data.total > 100 && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t("common.prev")}</Button>
                <Button variant="outline" size="sm" disabled={items.length < 100} onClick={() => setPage(p => p + 1)}>{t("common.nextPage")}</Button>
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem ? t("creditProducts.editProductTitle") : t("creditProducts.addProductTitle")}</DialogTitle>
            <DialogDescription>{editItem ? t("creditProducts.editProductDesc") : t("creditProducts.addProductDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{t("creditProducts.number")}</Label>
                <Input type="number" value={form.number} onChange={e => setForm(f => ({ ...f, number: e.target.value }))} />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>{t("creditProducts.name")}</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("creditProducts.sapCode")}</Label>
                <Input value={form.sapCode} onChange={e => setForm(f => ({ ...f, sapCode: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{t("creditProducts.segment")}</Label>
                <Select value={form.segment || "none"} onValueChange={v => setForm(f => ({ ...f, segment: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">-</SelectItem>
                    <SelectItem value="средний">{t("creditProducts.medium")}</SelectItem>
                    <SelectItem value="малый">{t("creditProducts.small")}</SelectItem>
                    <SelectItem value="микро">{t("creditProducts.micro")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("creditProducts.disbursementForm")}</Label>
                <Input value={form.disbursementForm} onChange={e => setForm(f => ({ ...f, disbursementForm: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{t("creditProducts.loanAmount")}</Label>
                <Input value={form.loanAmount} onChange={e => setForm(f => ({ ...f, loanAmount: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{t("creditProducts.termWorkingCapital")}</Label>
                <Input value={form.termWorkingCapital} onChange={e => setForm(f => ({ ...f, termWorkingCapital: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{t("creditProducts.termFixedAssets")}</Label>
                <Input value={form.termFixedAssets} onChange={e => setForm(f => ({ ...f, termFixedAssets: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{t("creditProducts.termUntargeted")}</Label>
                <Input value={form.termUntargeted} onChange={e => setForm(f => ({ ...f, termUntargeted: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{t("creditProducts.rateUZS")}</Label>
                <Input value={form.rateUZS} onChange={e => setForm(f => ({ ...f, rateUZS: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{t("creditProducts.rateUSD")}</Label>
                <Input value={form.rateUSD} onChange={e => setForm(f => ({ ...f, rateUSD: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{t("creditProducts.rateEUR")}</Label>
                <Input value={form.rateEUR} onChange={e => setForm(f => ({ ...f, rateEUR: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("creditProducts.gracePeriod")}</Label>
              <Input value={form.gracePeriod} onChange={e => setForm(f => ({ ...f, gracePeriod: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>{t("creditProducts.purpose")}</Label>
              <Textarea value={form.purpose} onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))} rows={3} />
            </div>
            <div className="space-y-2">
              <Label>{t("creditProducts.highlight")}</Label>
              <Textarea value={form.highlight} onChange={e => setForm(f => ({ ...f, highlight: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleSubmit} disabled={isPending || !form.name.trim()}>
              {isPending ? t("common.saving") : editItem ? t("common.saveChanges") : t("creditProducts.addProduct")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("creditProducts.deleteProduct")}</AlertDialogTitle>
            <AlertDialogDescription>{t("creditProducts.deleteProductConfirm", { name: deleteTarget?.name })}</AlertDialogDescription>
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
