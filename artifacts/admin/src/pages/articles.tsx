import { useState, useRef } from "react";
import {
  useListArticles, getListArticlesQueryKey,
  useCreateArticle, useUpdateArticle, useDeleteArticle,
  useListBranches, getListBranchesQueryKey
} from "@workspace/api-client-react";
import type { Article } from "@workspace/api-client-react";
import { Plus, BookOpen, Globe2, Building2, Pencil, Trash2, Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { RowActions } from "@/components/row-actions";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { buildApiUrl } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import { formatAdminFileDate, formatAdminShortDate } from "@/lib/time";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const ARTICLE_CATEGORIES = ["general", "onboarding", "sap", "documents", "credit_process", "faq"] as const;

const writeRoles = ["superadmin", "head_office_admin", "editor"];

interface ArticleForm {
  title: string;
  content: string;
  category: string;
  isPublished: boolean;
  targetAllBranches: boolean;
  branchIds: number[];
}

const emptyForm: ArticleForm = { title: "", content: "", category: "general", isPublished: false, targetAllBranches: true, branchIds: [] };


export default function Articles({ user }: { user?: { role: string } }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editArticle, setEditArticle] = useState<Article | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Article | null>(null);
  const [form, setForm] = useState<ArticleForm>(emptyForm);
  const importRef = useRef<HTMLInputElement>(null);

  const canWrite = user && writeRoles.includes(user.role);

  const { data: articles, isLoading } = useListArticles(
    { isPublished: tab === "published" ? true : tab === "drafts" ? false : undefined },
    { query: { queryKey: getListArticlesQueryKey({ isPublished: tab === "published" ? true : tab === "drafts" ? false : undefined }) } }
  );

  const { data: branches } = useListBranches({ query: { queryKey: getListBranchesQueryKey() } });

  const createArticle = useCreateArticle();
  const updateArticle = useUpdateArticle();
  const deleteArticle = useDeleteArticle();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListArticlesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListArticlesQueryKey({ isPublished: tab === "published" ? true : tab === "drafts" ? false : undefined }) });
  };

  const openCreate = () => { setEditArticle(null); setForm(emptyForm); setDialogOpen(true); };

  const openEdit = (a: Article) => {
    setEditArticle(a);
    setForm({ title: a.title, content: a.content, category: (a as any).category || "general", isPublished: a.isPublished, targetAllBranches: a.targetAllBranches, branchIds: a.branchIds || [] });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.title.trim() || !form.content.trim()) return;
    const data: any = { title: form.title, content: form.content, category: form.category, isPublished: form.isPublished, targetAllBranches: form.targetAllBranches };
    if (!form.targetAllBranches) data.branchIds = form.branchIds;
    if (editArticle) {
      updateArticle.mutate({ id: editArticle.id, data }, {
        onSuccess: () => { toast({ title: t("articles.articleUpdated") }); setDialogOpen(false); invalidate(); },
        onError: (e: any) => toast({ variant: "destructive", title: t("common.error"), description: e.message }),
      });
    } else {
      createArticle.mutate({ data }, {
        onSuccess: () => { toast({ title: t("articles.articleCreated") }); setDialogOpen(false); invalidate(); },
        onError: (e: any) => toast({ variant: "destructive", title: t("common.error"), description: e.message }),
      });
    }
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteArticle.mutate({ id: deleteTarget.id }, {
      onSuccess: () => { toast({ title: t("articles.articleDeleted") }); setDeleteTarget(null); invalidate(); },
      onError: (e: any) => toast({ variant: "destructive", title: t("common.error"), description: e.message }),
    });
  };

  const toggleBranch = (branchId: number) => {
    setForm(f => ({
      ...f,
      branchIds: f.branchIds.includes(branchId) ? f.branchIds.filter(id => id !== branchId) : [...f.branchIds, branchId]
    }));
  };

  const handleExport = () => {
    if (!articles?.length) return;
    const rows = articles.map(a => ({
      id: a.id, title: a.title, content: a.content.substring(0, 500),
      isPublished: a.isPublished, targetAllBranches: a.targetAllBranches,
      author: a.author?.name || "", updatedAt: a.updatedAt,
    }));
    downloadCsv(rows, `maqolalar_${formatAdminFileDate()}.xlsx`);
    toast({ title: t("common.exportSuccess") });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(buildApiUrl("/api/articles/import"), {
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

  const isPending = createArticle.isPending || updateArticle.isPending;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t("articles.title")}</h2>
          <p className="text-muted-foreground mt-1">{t("articles.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canWrite && (
            <>
              <input type="file" ref={importRef} accept=".csv" onChange={handleImport} className="hidden" />
              <Button variant="outline" className="gap-2" onClick={() => importRef.current?.click()}>
                <Upload className="h-4 w-4" />
                {t("common.import")}
              </Button>
            </>
          )}
          <Button variant="outline" className="gap-2" onClick={handleExport}>
            <Download className="h-4 w-4" />
            {t("common.export")}
          </Button>
          {canWrite && (
            <Button className="gap-2" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              {t("articles.createArticle")}
            </Button>
          )}
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="all">{t("articles.allArticles")}</TabsTrigger>
          <TabsTrigger value="published">{t("articles.published")}</TabsTrigger>
          <TabsTrigger value="drafts">{t("articles.drafts")}</TabsTrigger>
        </TabsList>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="shadow-sm border-border/50">
                <CardHeader className="pb-4"><Skeleton className="h-6 w-3/4 mb-2" /><Skeleton className="h-4 w-1/4" /></CardHeader>
                <CardContent><Skeleton className="h-16 w-full" /></CardContent>
                <CardFooter className="pt-0"><Skeleton className="h-5 w-24 rounded-full" /></CardFooter>
              </Card>
            ))
          ) : articles?.length === 0 ? (
            <div className="col-span-full py-12 text-center text-muted-foreground border-2 border-dashed border-border rounded-lg">
              <BookOpen className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium text-foreground">{t("articles.noArticles")}</h3>
              <p>{t("articles.noArticlesHint")}</p>
              {canWrite && (
                <Button className="mt-4" variant="outline" onClick={openCreate}>{t("articles.createArticle")}</Button>
              )}
            </div>
          ) : (
            articles?.map((article) => (
              <Card key={article.id} className="shadow-sm border-border/50 hover:border-primary/50 transition-colors flex flex-col group">
                <CardHeader className="pb-3 flex-1">
                  <div className="flex justify-between items-start gap-4 mb-2">
                    <CardTitle className="text-lg leading-tight group-hover:text-primary transition-colors">{article.title}</CardTitle>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20 whitespace-nowrap text-[10px]">
                        {t(`articles.categories.${(article as any).category || "general"}`)}
                      </Badge>
                      {article.isPublished
                        ? <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20 whitespace-nowrap">{t("articles.published")}</Badge>
                        : <Badge variant="outline" className="bg-gray-500/10 text-gray-600 border-gray-500/20 whitespace-nowrap">{t("articles.draft")}</Badge>}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    {article.targetAllBranches
                      ? <><Globe2 className="h-3.5 w-3.5" /> {t("articles.allBranches")}</>
                      : <><Building2 className="h-3.5 w-3.5" /> {t("articles.branchCount", { count: article.branchIds?.length || 0 })}</>}
                  </div>
                </CardHeader>
                <CardContent className="pb-4">
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {article.content.replace(/<[^>]*>?/gm, '').substring(0, 150)}...
                  </p>
                </CardContent>
                <CardFooter className="pt-0 text-xs text-muted-foreground flex justify-between items-center border-t border-border/30 px-6 py-3 mt-auto">
                  <span>{t("articles.by", { name: article.author?.name || 'System' })}</span>
                  <div className="flex items-center gap-2">
                    <span>{formatAdminShortDate(article.updatedAt)}</span>
                    {canWrite && (
                      <RowActions
                        actions={[
                          { label: t("common.edit"), icon: Pencil, onClick: () => openEdit(article) },
                          { label: t("common.delete"), icon: Trash2, danger: true, onClick: () => setDeleteTarget(article) },
                        ]}
                      />
                    )}
                  </div>
                </CardFooter>
              </Card>
            ))
          )}
        </div>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editArticle ? t("articles.editTitle") : t("articles.createTitle")}</DialogTitle>
            <DialogDescription>{editArticle ? t("articles.editDesc") : t("articles.createDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t("articles.titleLabel")}</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder={t("articles.titlePlaceholder")} />
            </div>
            <div className="space-y-2">
              <Label>{t("articles.categoryLabel")}</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ARTICLE_CATEGORIES.map(cat => (
                    <SelectItem key={cat} value={cat}>{t(`articles.categories.${cat}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("articles.contentLabel")}</Label>
              <Textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} placeholder={t("articles.contentPlaceholder")} rows={10} className="font-mono text-sm" />
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <Switch id="art-published" checked={form.isPublished} onCheckedChange={v => setForm(f => ({ ...f, isPublished: v }))} />
                <Label htmlFor="art-published">{t("articles.publishedLabel")}</Label>
              </div>
              <div className="flex items-center gap-3">
                <Switch id="art-all-branches" checked={form.targetAllBranches} onCheckedChange={v => setForm(f => ({ ...f, targetAllBranches: v }))} />
                <Label htmlFor="art-all-branches">{t("articles.allBranchesLabel")}</Label>
              </div>
            </div>
            {!form.targetAllBranches && branches && (
              <div className="space-y-2">
                <Label>{t("articles.targetBranches")}</Label>
                <div className="border rounded-lg p-3 space-y-2 max-h-32 overflow-y-auto">
                  {branches.map(b => (
                    <div key={b.id} className="flex items-center gap-2">
                      <Checkbox id={`branch-${b.id}`} checked={form.branchIds.includes(b.id)} onCheckedChange={() => toggleBranch(b.id)} />
                      <Label htmlFor={`branch-${b.id}`} className="font-normal">{b.name} ({b.city})</Label>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleSubmit} disabled={isPending || !form.title.trim() || !form.content.trim()}>
              {isPending ? t("common.saving") : editArticle ? t("common.saveChanges") : t("articles.createArticle")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("articles.deleteArticle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("articles.deleteArticleConfirm", { name: deleteTarget?.title })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteArticle.isPending ? t("common.deleting") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
