import { useState } from "react";
import { useListBranches, getListBranchesQueryKey, useCreateBranch, useUpdateBranch, useDeleteBranch } from "@workspace/api-client-react";
import type { Branch } from "@workspace/api-client-react";
import { Plus, Building2, MapPin, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Branches() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: branches, isLoading } = useListBranches({ query: { queryKey: getListBranchesQueryKey() } });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editBranch, setEditBranch] = useState<Branch | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null);

  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [isActive, setIsActive] = useState(true);

  const createBranch = useCreateBranch();
  const updateBranch = useUpdateBranch();
  const deleteBranch = useDeleteBranch();

  const openCreate = () => {
    setEditBranch(null);
    setName("");
    setCity("");
    setIsActive(true);
    setDialogOpen(true);
  };

  const openEdit = (b: Branch) => {
    setEditBranch(b);
    setName(b.name);
    setCity(b.city);
    setIsActive(b.isActive);
    setDialogOpen(true);
  };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListBranchesQueryKey() });

  const handleSubmit = () => {
    if (!name.trim() || !city.trim()) return;
    if (editBranch) {
      updateBranch.mutate({ id: editBranch.id, data: { name, city, isActive } }, {
        onSuccess: () => { toast({ title: "Branch updated" }); setDialogOpen(false); invalidate(); },
        onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
      });
    } else {
      createBranch.mutate({ data: { name, city, isActive } }, {
        onSuccess: () => { toast({ title: "Branch created" }); setDialogOpen(false); invalidate(); },
        onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
      });
    }
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteBranch.mutate({ id: deleteTarget.id }, {
      onSuccess: () => { toast({ title: "Branch deleted" }); setDeleteTarget(null); invalidate(); },
      onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
    });
  };

  const isPending = createBranch.isPending || updateBranch.isPending;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Branches</h2>
          <p className="text-muted-foreground mt-1">Manage physical locations and branch operations.</p>
        </div>
        <Button className="gap-2" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Add Branch
        </Button>
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
            <h3 className="text-lg font-medium text-foreground">No branches found</h3>
            <p>Add your first branch to start operating.</p>
            <Button className="mt-4" variant="outline" onClick={openCreate}>Add Branch</Button>
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
                    <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">Active</Badge>
                  ) : (
                    <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20">Closed</Badge>
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
                    Edit Details
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
            <DialogTitle>{editBranch ? "Edit Branch" : "Add Branch"}</DialogTitle>
            <DialogDescription>{editBranch ? "Update branch details." : "Create a new branch location."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="branch-name">Branch Name</Label>
              <Input id="branch-name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Main Office" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="branch-city">City</Label>
              <Input id="branch-city" value={city} onChange={e => setCity(e.target.value)} placeholder="e.g. Almaty" />
            </div>
            <div className="flex items-center gap-3">
              <Switch id="branch-active" checked={isActive} onCheckedChange={setIsActive} />
              <Label htmlFor="branch-active">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={isPending || !name.trim() || !city.trim()}>
              {isPending ? "Saving..." : editBranch ? "Save Changes" : "Create Branch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Branch</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteBranch.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
