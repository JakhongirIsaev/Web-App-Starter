import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, BookOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { buildApiUrl } from "@/lib/api";
import { buildJsonHeaders } from "@/lib/auth-headers";
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

interface RecommendationDocument {
  id: number;
  title: string;
  body: string;
  tags: string;
  isActive: boolean;
  sortOrder: number;
  authorId: number | null;
  createdAt: string;
  updatedAt: string;
}

interface DocForm {
  title: string;
  body: string;
  tags: string;
  isActive: boolean;
  sortOrder: number;
}

const emptyForm: DocForm = { title: "", body: "", tags: "", isActive: true, sortOrder: 0 };

export default function RecommendationsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: docs = [], isLoading } = useQuery<RecommendationDocument[]>({
    queryKey: ["admin/recommendation-documents"],
    queryFn: () => apiFetch("/admin/recommendation-documents"),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RecommendationDocument | null>(null);
  const [form, setForm] = useState<DocForm>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<RecommendationDocument | null>(null);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (doc: RecommendationDocument) => {
    setEditing(doc);
    setForm({
      title: doc.title,
      body: doc.body,
      tags: doc.tags,
      isActive: doc.isActive,
      sortOrder: doc.sortOrder,
    });
    setDialogOpen(true);
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin/recommendation-documents"] });

  const create = useMutation({
    mutationFn: (body: DocForm) =>
      apiFetch("/admin/recommendation-documents", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: t("recommendations.created") });
      setDialogOpen(false);
      invalidate();
    },
    onError: (err: Error) =>
      toast({ title: t("recommendations.saveFailed"), description: err.message, variant: "destructive" }),
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: DocForm }) =>
      apiFetch(`/admin/recommendation-documents/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: t("recommendations.saved") });
      setDialogOpen(false);
      invalidate();
    },
    onError: (err: Error) =>
      toast({ title: t("recommendations.saveFailed"), description: err.message, variant: "destructive" }),
  });

  const archive = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/admin/recommendation-documents/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: t("recommendations.archived") });
      setDeleteTarget(null);
      invalidate();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.body.trim()) {
      toast({ title: t("recommendations.requiredFields"), variant: "destructive" });
      return;
    }
    if (editing) update.mutate({ id: editing.id, body: form });
    else create.mutate(form);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" />
            {t("recommendations.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t("recommendations.subtitle")}</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          {t("recommendations.newDoc")}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : docs.length === 0 ? (
        <div className="border-2 border-dashed border-border rounded-xl p-12 text-center text-muted-foreground">
          <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">{t("recommendations.empty")}</p>
          <p className="text-xs mt-1">{t("recommendations.emptyHint")}</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("recommendations.colTitle")}</TableHead>
              <TableHead>{t("recommendations.colTags")}</TableHead>
              <TableHead className="text-center">{t("recommendations.colActive")}</TableHead>
              <TableHead className="text-right">{t("recommendations.colSort")}</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {docs.map((doc) => (
              <TableRow key={doc.id}>
                <TableCell className="font-medium">
                  <div>{doc.title}</div>
                  <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                    {doc.body.slice(0, 120)}
                    {doc.body.length > 120 ? "…" : ""}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {doc.tags
                      .split(",")
                      .map((tag) => tag.trim())
                      .filter(Boolean)
                      .map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                      ))}
                  </div>
                </TableCell>
                <TableCell className="text-center">{doc.isActive ? "✓" : "—"}</TableCell>
                <TableCell className="text-right">{doc.sortOrder}</TableCell>
                <TableCell>
                  <RowActions
                    actions={[
                      { label: t("common.edit"), icon: Pencil, onClick: () => openEdit(doc) },
                      { label: t("common.archive"), icon: Trash2, danger: true, onClick: () => setDeleteTarget(doc) },
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? t("recommendations.editTitle") : t("recommendations.newDoc")}</DialogTitle>
            <DialogDescription>{t("recommendations.formHint")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>{t("recommendations.fieldTitle")}</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder={t("recommendations.titlePlaceholder")}
                required
              />
            </div>
            <div>
              <Label>{t("recommendations.fieldBody")}</Label>
              <Textarea
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                placeholder={t("recommendations.bodyPlaceholder")}
                rows={10}
                className="font-mono text-sm"
                required
              />
              <p className="text-xs text-muted-foreground mt-1">{t("recommendations.markdownHint")}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("recommendations.fieldTags")}</Label>
                <Input
                  value={form.tags}
                  onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                  placeholder="transport,>7y,jewelry"
                />
              </div>
              <div>
                <Label>{t("recommendations.fieldSort")}</Label>
                <Input
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.isActive}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, isActive: checked }))}
              />
              <Label>{t("recommendations.fieldActive")}</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={create.isPending || update.isPending}>
                {create.isPending || update.isPending ? t("common.saving") : t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("recommendations.archiveTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("recommendations.archiveDesc", { title: deleteTarget?.title ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && archive.mutate(deleteTarget.id)}>
              {t("common.archive")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
