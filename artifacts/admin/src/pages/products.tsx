import { useState, useRef } from "react";
import { 
  useListProducts, getListProductsQueryKey, 
  useListProductCategories, getListProductCategoriesQueryKey,
  useCreateProduct, useUpdateProduct, useDeleteProduct
} from "@workspace/api-client-react";
import type { Product } from "@workspace/api-client-react";
import { Plus, Pencil, Trash2, Tag, Search, Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { buildApiUrl } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
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

interface ProductForm {
  name: string;
  type: string;
  categoryId: string;
  description: string;
  minAmount: string;
  maxAmount: string;
  minTermMonths: string;
  maxTermMonths: string;
  interestRate: string;
  isActive: boolean;
}

const emptyForm: ProductForm = {
  name: "", type: "credit", categoryId: "", description: "",
  minAmount: "", maxAmount: "", minTermMonths: "", maxTermMonths: "",
  interestRate: "", isActive: true,
};

export default function Products() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [type, setType] = useState<string>("all");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const importRef = useRef<HTMLInputElement>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);

  const { data: categories } = useListProductCategories({ query: { queryKey: getListProductCategoriesQueryKey() } });
  const { data: products, isLoading } = useListProducts(
    { type: type !== "all" ? type : undefined, categoryId: categoryId !== "all" ? Number(categoryId) : undefined },
    { query: { queryKey: getListProductsQueryKey({ type: type !== "all" ? type : undefined, categoryId: categoryId !== "all" ? Number(categoryId) : undefined }) } }
  );

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListProductsQueryKey({ type: type !== "all" ? type : undefined, categoryId: categoryId !== "all" ? Number(categoryId) : undefined }) });
  };

  const openCreate = () => { setEditProduct(null); setForm(emptyForm); setDialogOpen(true); };

  const openEdit = (p: Product) => {
    setEditProduct(p);
    setForm({
      name: p.name, type: p.type, categoryId: p.categoryId?.toString() || "",
      description: p.description || "", minAmount: p.minAmount?.toString() || "",
      maxAmount: p.maxAmount?.toString() || "", minTermMonths: p.minTermMonths?.toString() || "",
      maxTermMonths: p.maxTermMonths?.toString() || "", interestRate: p.interestRate?.toString() || "",
      isActive: p.isActive,
    });
    setDialogOpen(true);
  };

  const buildPayload = () => {
    const data: any = { name: form.name, type: form.type, description: form.description || undefined, isActive: form.isActive };
    if (form.categoryId) data.categoryId = Number(form.categoryId);
    if (form.type === "credit") {
      if (form.minAmount) data.minAmount = Number(form.minAmount);
      if (form.maxAmount) data.maxAmount = Number(form.maxAmount);
      if (form.minTermMonths) data.minTermMonths = Number(form.minTermMonths);
      if (form.maxTermMonths) data.maxTermMonths = Number(form.maxTermMonths);
      if (form.interestRate) data.interestRate = Number(form.interestRate);
    }
    return data;
  };

  const handleSubmit = () => {
    if (!form.name.trim()) return;
    const data = buildPayload();
    if (editProduct) {
      updateProduct.mutate({ id: editProduct.id, data }, {
        onSuccess: () => { toast({ title: t("products.productUpdated") }); setDialogOpen(false); invalidate(); },
        onError: (e: any) => toast({ variant: "destructive", title: t("common.error"), description: e.message }),
      });
    } else {
      createProduct.mutate({ data }, {
        onSuccess: () => { toast({ title: t("products.productCreated") }); setDialogOpen(false); invalidate(); },
        onError: (e: any) => toast({ variant: "destructive", title: t("common.error"), description: e.message }),
      });
    }
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteProduct.mutate({ id: deleteTarget.id }, {
      onSuccess: () => { toast({ title: t("products.productDeleted") }); setDeleteTarget(null); invalidate(); },
      onError: (e: any) => toast({ variant: "destructive", title: t("common.error"), description: e.message }),
    });
  };

  const handleExport = () => {
    if (!filteredProducts.length) return;
    const rows = filteredProducts.map(p => ({
      id: p.id, name: p.name, type: p.type, category: p.category?.name || "",
      description: p.description || "", minAmount: p.minAmount || "", maxAmount: p.maxAmount || "",
      minTermMonths: p.minTermMonths || "", maxTermMonths: p.maxTermMonths || "",
      interestRate: p.interestRate || "", isActive: p.isActive,
    }));
    downloadCsv(rows, `products_${formatAdminFileDate()}.csv`);
    toast({ title: t("common.exportSuccess") });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(buildApiUrl("/api/products/import"), {
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

  const isPending = createProduct.isPending || updateProduct.isPending;
  const filteredProducts = (products || []).filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t("products.title")}</h2>
          <p className="text-muted-foreground mt-1">{t("products.subtitle")}</p>
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
            {t("products.addProduct")}
          </Button>
        </div>
      </div>

      <div className="bg-card border border-border/50 rounded-lg shadow-sm">
        <div className="p-4 border-b border-border/50 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder={t("products.searchPlaceholder")} className="pl-9 max-w-md" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-4">
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("products.allTypes")}</SelectItem>
                <SelectItem value="credit">{t("products.credit")}</SelectItem>
                <SelectItem value="non_credit">{t("products.nonCredit")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("products.allCategories")}</SelectItem>
                {categories?.map(c => (<SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="relative w-full overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("products.productName")}</TableHead>
                <TableHead>{t("products.type")}</TableHead>
                <TableHead>{t("products.category")}</TableHead>
                <TableHead>{t("products.termsLimits")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead className="text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-16 rounded-full" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-8 w-20 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : filteredProducts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">{t("products.noProducts")}</TableCell>
                </TableRow>
              ) : (
                filteredProducts.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <div className="font-medium text-foreground">{product.name}</div>
                      {product.description && <div className="text-xs text-muted-foreground mt-1 truncate max-w-xs">{product.description}</div>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={product.type === 'credit' ? 'bg-primary/10 text-primary' : ''}>
                        {product.type === 'credit' ? t("products.credit") : t("products.nonCredit")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <div className="flex items-center gap-1.5"><Tag className="h-3.5 w-3.5" />{product.category?.name || t("products.uncategorized")}</div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {product.type === 'credit' ? (
                        <div className="space-y-1">
                          {product.minAmount && product.maxAmount ? <div className="text-muted-foreground">{product.minAmount.toLocaleString()} - {product.maxAmount.toLocaleString()}</div> : null}
                          {product.interestRate ? <div className="font-medium text-primary">{product.interestRate}% APR</div> : null}
                        </div>
                      ) : <span className="text-muted-foreground italic">N/A</span>}
                    </TableCell>
                    <TableCell>
                      {product.isActive
                        ? <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">{t("common.active")}</Badge>
                        : <Badge variant="outline" className="bg-gray-500/10 text-gray-600 border-gray-500/20">{t("common.inactive")}</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => openEdit(product)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setDeleteTarget(product)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editProduct ? t("products.editProductTitle") : t("products.addProductTitle")}</DialogTitle>
            <DialogDescription>{editProduct ? t("products.editProductDesc") : t("products.addProductDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("products.productNameLabel")}</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t("products.productNamePlaceholder")} />
              </div>
              <div className="space-y-2">
                <Label>{t("products.typeLabel")}</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="credit">{t("products.credit")}</SelectItem>
                    <SelectItem value="non_credit">{t("products.nonCredit")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("products.categoryLabel")}</Label>
                <Select value={form.categoryId || "none"} onValueChange={v => setForm(f => ({ ...f, categoryId: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder={t("products.selectCategory")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("products.noCategory")}</SelectItem>
                    {categories?.map(c => (<SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end pb-1 gap-3">
                <Switch id="prod-active" checked={form.isActive} onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))} />
                <Label htmlFor="prod-active">{t("common.active")}</Label>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("products.description")}</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder={t("products.descriptionPlaceholder")} rows={3} />
            </div>
            {form.type === "credit" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("products.minAmount")}</Label>
                    <Input type="number" value={form.minAmount} onChange={e => setForm(f => ({ ...f, minAmount: e.target.value }))} placeholder="500000" />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("products.maxAmount")}</Label>
                    <Input type="number" value={form.maxAmount} onChange={e => setForm(f => ({ ...f, maxAmount: e.target.value }))} placeholder="50000000" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>{t("products.minTerm")}</Label>
                    <Input type="number" value={form.minTermMonths} onChange={e => setForm(f => ({ ...f, minTermMonths: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("products.maxTerm")}</Label>
                    <Input type="number" value={form.maxTermMonths} onChange={e => setForm(f => ({ ...f, maxTermMonths: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("products.interestRate")}</Label>
                    <Input type="number" step="0.1" value={form.interestRate} onChange={e => setForm(f => ({ ...f, interestRate: e.target.value }))} />
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleSubmit} disabled={isPending || !form.name.trim()}>
              {isPending ? t("common.saving") : editProduct ? t("common.saveChanges") : t("products.addProduct")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("products.deleteProduct")}</AlertDialogTitle>
            <AlertDialogDescription>{t("products.deleteProductConfirm", { name: deleteTarget?.name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteProduct.isPending ? t("common.deleting") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
