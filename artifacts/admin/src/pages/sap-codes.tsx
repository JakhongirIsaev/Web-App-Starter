import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Search, Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { downloadCsv } from "@/lib/csv";
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

const BASE = import.meta.env.BASE_URL;
const getToken = () => localStorage.getItem("auth_token");

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(`${BASE}api${url}`, {
    ...options,
    headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null;
  return res.json();
}

interface SapCodeForm {
  status: string; productId: string; name: string;
  productType: string; categoryId: string; categoryName: string;
}

const emptyForm: SapCodeForm = {
  status: "", productId: "", name: "", productType: "", categoryId: "", categoryName: "",
};

const writeRoles = ["superadmin", "head_office_admin", "editor"];
const adminRoles = ["superadmin", "head_office_admin"];

export default function SapCodes({ user }: { user?: { role: string } }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const importRef = useRef<HTMLInputElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [form, setForm] = useState<SapCodeForm>(emptyForm);
  const canWrite = user && writeRoles.includes(user.role);
  const canAdmin = user && adminRoles.includes(user.role);

  const queryKey = ["sap-codes", search, status, page];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => apiFetch(`/sap-codes?search=${search}&status=${status !== "all" ? status : ""}&page=${page}&pageSize=50`),
  });

  const createMut = useMutation({ mutationFn: (d: any) => apiFetch("/sap-codes", { method: "POST", body: JSON.stringify(d) }) });
  const updateMut = useMutation({ mutationFn: ({ id, ...d }: any) => apiFetch(`/sap-codes/${id}`, { method: "PUT", body: JSON.stringify(d) }) });
  const deleteMut = useMutation({ mutationFn: (id: number) => apiFetch(`/sap-codes/${id}`, { method: "DELETE" }) });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["sap-codes"] });

  const openCreate = () => { setEditItem(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (item: any) => {
    setEditItem(item);
    setForm({
      status: item.status || "", productId: item.productId || "",
      name: item.name || "", productType: item.productType || "",
      categoryId: item.categoryId || "", categoryName: item.categoryName || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) return;
    if (editItem) {
      updateMut.mutate({ id: editItem.id, ...form }, {
        onSuccess: () => { toast({ title: t("sapCodes.codeUpdated") }); setDialogOpen(false); invalidate(); },
        onError: (e: any) => toast({ variant: "destructive", title: t("common.error"), description: e.message }),
      });
    } else {
      createMut.mutate(form, {
        onSuccess: () => { toast({ title: t("sapCodes.codeCreated") }); setDialogOpen(false); invalidate(); },
        onError: (e: any) => toast({ variant: "destructive", title: t("common.error"), description: e.message }),
      });
    }
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMut.mutate(deleteTarget.id, {
      onSuccess: () => { toast({ title: t("sapCodes.codeDeleted") }); setDeleteTarget(null); invalidate(); },
      onError: (e: any) => toast({ variant: "destructive", title: t("common.error"), description: e.message }),
    });
  };

  const handleExport = () => {
    if (!data?.data?.length) return;
    const rows = data.data.map((p: any) => ({
      status: p.status || "", productId: p.productId || "", name: p.name,
      productType: p.productType || "", categoryId: p.categoryId || "", categoryName: p.categoryName || "",
    }));
    downloadCsv(rows, `sap_codes_${format(new Date(), "yyyy-MM-dd")}.csv`);
    toast({ title: t("common.exportSuccess") });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`${BASE}api/sap-codes/import`, {
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
  const total = data?.total || 0;
  const isPending = createMut.isPending || updateMut.isPending;

  const getStatusBadge = (s: string) => {
    switch (s?.toLowerCase()) {
      case "действующий": return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">{t("sapCodes.active")}</Badge>;
      case "заблокировать": return <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20">{t("sapCodes.blocked")}</Badge>;
      case "открыть": return <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20">{t("sapCodes.toOpen")}</Badge>;
      default: return <Badge variant="secondary">{s}</Badge>;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t("sapCodes.title")}</h2>
          <p className="text-muted-foreground mt-1">{t("sapCodes.subtitle")}</p>
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
              <Plus className="h-4 w-4" />{t("sapCodes.addCode")}
            </Button>
          )}
        </div>
      </div>

      <div className="bg-card border border-border/50 rounded-lg shadow-sm">
        <div className="p-4 border-b border-border/50 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder={t("sapCodes.searchPlaceholder")} className="pl-9 max-w-md" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("sapCodes.allStatuses")}</SelectItem>
              <SelectItem value="действующий">{t("sapCodes.active")}</SelectItem>
              <SelectItem value="заблокировать">{t("sapCodes.blocked")}</SelectItem>
              <SelectItem value="открыть">{t("sapCodes.toOpen")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="relative w-full overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("sapCodes.status")}</TableHead>
                <TableHead>{t("sapCodes.productId")}</TableHead>
                <TableHead>{t("sapCodes.name")}</TableHead>
                <TableHead>{t("sapCodes.productType")}</TableHead>
                <TableHead>{t("sapCodes.categoryId")}</TableHead>
                <TableHead>{t("sapCodes.categoryName")}</TableHead>
                <TableHead className="text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-5 w-24" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">{t("sapCodes.noCodes")}</TableCell>
                </TableRow>
              ) : (
                items.map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.status ? getStatusBadge(item.status) : "-"}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{item.productId || "-"}</TableCell>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-muted-foreground">{item.productType || "-"}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{item.categoryId || "-"}</TableCell>
                    <TableCell className="text-muted-foreground">{item.categoryName || "-"}</TableCell>
                    {canWrite ? (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => openEdit(item)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {canAdmin && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setDeleteTarget(item)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    ) : <TableCell />}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {total > 0 && (
          <div className="p-4 border-t border-border/50 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("common.showing", { count: items.length, total })}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t("common.previous")}</Button>
              <Button variant="outline" size="sm" disabled={page * 50 >= total} onClick={() => setPage(p => p + 1)}>{t("common.next")}</Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editItem ? t("sapCodes.editCodeTitle") : t("sapCodes.addCodeTitle")}</DialogTitle>
            <DialogDescription>{editItem ? t("sapCodes.editCodeDesc") : t("sapCodes.addCodeDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("sapCodes.productId")}</Label>
                <Input value={form.productId} onChange={e => setForm(f => ({ ...f, productId: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{t("sapCodes.status")}</Label>
                <Select value={form.status || "none"} onValueChange={v => setForm(f => ({ ...f, status: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">-</SelectItem>
                    <SelectItem value="действующий">{t("sapCodes.active")}</SelectItem>
                    <SelectItem value="заблокировать">{t("sapCodes.blocked")}</SelectItem>
                    <SelectItem value="открыть">{t("sapCodes.toOpen")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("sapCodes.name")}</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>{t("sapCodes.productType")}</Label>
              <Input value={form.productType} onChange={e => setForm(f => ({ ...f, productType: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("sapCodes.categoryId")}</Label>
                <Input value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{t("sapCodes.categoryName")}</Label>
                <Input value={form.categoryName} onChange={e => setForm(f => ({ ...f, categoryName: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleSubmit} disabled={isPending || !form.name.trim()}>
              {isPending ? t("common.saving") : editItem ? t("common.saveChanges") : t("sapCodes.addCode")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("sapCodes.deleteCode")}</AlertDialogTitle>
            <AlertDialogDescription>{t("sapCodes.deleteCodeConfirm", { name: deleteTarget?.name })}</AlertDialogDescription>
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
