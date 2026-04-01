import { useState } from "react";
import { 
  useListProducts, getListProductsQueryKey, 
  useListProductCategories, getListProductCategoriesQueryKey,
  useCreateProduct, useUpdateProduct, useDeleteProduct
} from "@workspace/api-client-react";
import type { Product } from "@workspace/api-client-react";
import { Plus, Pencil, Trash2, Tag, Search } from "lucide-react";
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
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [type, setType] = useState<string>("all");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [search, setSearch] = useState("");

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

  const openCreate = () => {
    setEditProduct(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

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
        onSuccess: () => { toast({ title: "Product updated" }); setDialogOpen(false); invalidate(); },
        onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
      });
    } else {
      createProduct.mutate({ data }, {
        onSuccess: () => { toast({ title: "Product created" }); setDialogOpen(false); invalidate(); },
        onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
      });
    }
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteProduct.mutate({ id: deleteTarget.id }, {
      onSuccess: () => { toast({ title: "Product deleted" }); setDeleteTarget(null); invalidate(); },
      onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
    });
  };

  const isPending = createProduct.isPending || updateProduct.isPending;
  const filteredProducts = (products || []).filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Products</h2>
          <p className="text-muted-foreground mt-1">Manage credit and non-credit product offerings.</p>
        </div>
        <Button className="gap-2" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Add Product
        </Button>
      </div>

      <div className="bg-card border border-border/50 rounded-lg shadow-sm">
        <div className="p-4 border-b border-border/50 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search products..." className="pl-9 max-w-md" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-4">
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Product Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="credit">Credit</SelectItem>
                <SelectItem value="non_credit">Non-Credit</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories?.map(c => (<SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="relative w-full overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Product Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Terms / Limits</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
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
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">No products found.</TableCell>
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
                        {product.type === 'credit' ? 'Credit' : 'Non-Credit'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <div className="flex items-center gap-1.5"><Tag className="h-3.5 w-3.5" />{product.category?.name || "Uncategorized"}</div>
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
                        ? <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">Active</Badge>
                        : <Badge variant="outline" className="bg-gray-500/10 text-gray-600 border-gray-500/20">Inactive</Badge>}
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
            <DialogTitle>{editProduct ? "Edit Product" : "Add Product"}</DialogTitle>
            <DialogDescription>{editProduct ? "Update product details." : "Create a new product offering."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Product Name</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Business Credit" />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="credit">Credit</SelectItem>
                    <SelectItem value="non_credit">Non-Credit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={form.categoryId || "none"} onValueChange={v => setForm(f => ({ ...f, categoryId: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Category</SelectItem>
                    {categories?.map(c => (<SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end pb-1 gap-3">
                <Switch id="prod-active" checked={form.isActive} onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))} />
                <Label htmlFor="prod-active">Active</Label>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Product description..." rows={3} />
            </div>
            {form.type === "credit" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Min Amount</Label>
                    <Input type="number" value={form.minAmount} onChange={e => setForm(f => ({ ...f, minAmount: e.target.value }))} placeholder="e.g. 500000" />
                  </div>
                  <div className="space-y-2">
                    <Label>Max Amount</Label>
                    <Input type="number" value={form.maxAmount} onChange={e => setForm(f => ({ ...f, maxAmount: e.target.value }))} placeholder="e.g. 50000000" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Min Term (months)</Label>
                    <Input type="number" value={form.minTermMonths} onChange={e => setForm(f => ({ ...f, minTermMonths: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Max Term (months)</Label>
                    <Input type="number" value={form.maxTermMonths} onChange={e => setForm(f => ({ ...f, maxTermMonths: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Interest Rate (%)</Label>
                    <Input type="number" step="0.1" value={form.interestRate} onChange={e => setForm(f => ({ ...f, interestRate: e.target.value }))} />
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={isPending || !form.name.trim()}>
              {isPending ? "Saving..." : editProduct ? "Save Changes" : "Create Product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete "{deleteTarget?.name}"? This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteProduct.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
