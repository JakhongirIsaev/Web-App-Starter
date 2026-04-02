import { useState, useRef } from "react";
import { useListBranches, getListBranchesQueryKey, useCreateBranch, useUpdateBranch, useDeleteBranch } from "@workspace/api-client-react";
import type { Branch } from "@workspace/api-client-react";
import { Plus, Building2, MapPin, Trash2, Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { buildApiUrl } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Branches() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: branches, isLoading } = useListBranches({ query: { queryKey: getListBranchesQueryKey() } });
  const importRef = useRef<HTMLInputElement>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editBranch, setEditBranch] = useState<Branch | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null);

  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [isActive, setIsActive] = useState(true);

  const createBranch = useCreateBranch();
  const updateBranch = useUpdateBranch();
  const deleteBranch = useDeleteBranch();

  const openCreate = () => { setEditBranch(null); setName(""); setCity(""); setIsActive(true); setDialogOpen(true); };

  const openEdit = (b: Branch) => { setEditBranch(b); setName(b.name); setCity(b.city); setIsActive(b.isActive); setDialogOpen(true); };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListBranchesQueryKey() });

  const handleSubmit = () => {
    if (!name.trim() || !city.trim()) return;
    if (editBranch) {
      updateBranch.mutate({ id: editBranch.id, data: { name, city, isActive } }, {
        onSuccess: () => { toast({ title: t("branches.branchUpdated") }); setDialogOpen(false); invalidate(); },
        onError: (e: any) => toast({ variant: "destructive", title: t("common.error"), description: e.message }),
      });
    } else {
      createBranch.mutate({ data: { name, city, isActive } }, {
        onSuccess: () => { toast({ title: t("branches.branchCreated") }); setDialogOpen(false); invalidate(); },
        onError: (e: any) => toast({ variant: "destructive", title: t("common.error"), description: e.message }),
      });
    }
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteBranch.mutate({ id: deleteTarget.id }, {
      onSuccess: () => { toast({ title: t("branches.branchDeleted") }); setDeleteTarget(null); invalidate(); },
      onError: (e: any) => toast({ variant: "destructive", title: t("common.error"), description: e.message }),
    });
  };

  const handleExport = () => {
    if (!branches?.length) return;
    const rows = branches.map(b => ({ id: b.id, name: b.name, city: b.city, isActive: b.isActive }));
    downloadCsv(rows, `branches_${format(new Date(), "yyyy-MM-dd")}.csv`);
    toast({ title: t("common.exportSuccess") });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(buildApiUrl("/api/branches/import"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
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

  const isPending = createBranch.isPending || updateBranch.isPending;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t("branches.title")}</h2>
          <p className="text-muted-foreground mt-1">{t("branches.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <input type="file" ref={importRef} accept=".csv" onChange={handleImport} className="hidden" />
          <Button variant="outline" className="gap-2" onClick={() => importRef.current?.click()}>
            <Upload className="h-4 w-4" />
            {t("common.import")}
          </Button>
          <Button variant="outline" className="gap-2" onClick={handleExport}>
            <Download className="h-4 w-4" />
            {t("common.export")}
          </Button>
          <Button className="gap-2" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            {t("branches.addBranch")}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="shadow-sm border-border/50">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-6 w-3/4 mt-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-1/2 mb-4" />
                <div className="pt-4 border-t border-border/50 flex gap-4">
                  <Skeleton className="h-4 w-1/3" />
                </div>
              </CardContent>
            </Card>
          ))
        ) : branches?.length === 0 ? (
          <div className="col-span-full py-12 text-center text-muted-foreground border-2 border-dashed border-border rounded-lg">
            <Building2 className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium text-foreground">{t("branches.noBranches")}</h3>
            <p>{t("branches.noBranchesHint")}</p>
            <Button className="mt-4" variant="outline" onClick={openCreate}>{t("branches.addBranch")}</Button>
          </div>
        ) : (
          branches?.map((branch) => (
            <Card key={branch.id} className="shadow-sm border-border/50 hover:border-primary/50 transition-colors group">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    <Building2 className="h-5 w-5" />
                  </div>
                  {branch.isActive ? (
                    <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">{t("common.active")}</Badge>
                  ) : (
                    <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20">{t("branches.closed")}</Badge>
                  )}
                </div>
                <CardTitle className="mt-4 text-xl">{branch.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                  <MapPin className="h-4 w-4" />
                  {branch.city}
                </div>
                <div className="pt-4 border-t border-border/50 flex justify-between items-center">
                  <Button variant="ghost" size="sm" className="h-8 px-2 -ml-2 text-primary hover:text-primary hover:bg-primary/10" onClick={() => openEdit(branch)}>
                    {t("branches.editDetails")}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setDeleteTarget(branch)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editBranch ? t("branches.editBranch") : t("branches.addBranchTitle")}</DialogTitle>
            <DialogDescription>{editBranch ? t("branches.editBranchDesc") : t("branches.addBranchDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="branch-name">{t("branches.branchName")}</Label>
              <Input id="branch-name" value={name} onChange={e => setName(e.target.value)} placeholder={t("branches.branchNamePlaceholder")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="branch-city">{t("branches.city")}</Label>
              <Input id="branch-city" value={city} onChange={e => setCity(e.target.value)} placeholder={t("branches.cityPlaceholder")} />
            </div>
            <div className="flex items-center gap-3">
              <Switch id="branch-active" checked={isActive} onCheckedChange={setIsActive} />
              <Label htmlFor="branch-active">{t("common.active")}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleSubmit} disabled={isPending || !name.trim() || !city.trim()}>
              {isPending ? t("common.saving") : editBranch ? t("common.saveChanges") : t("branches.addBranch")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("branches.deleteBranch")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("branches.deleteBranchConfirm", { name: deleteTarget?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteBranch.isPending ? t("common.deleting") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
