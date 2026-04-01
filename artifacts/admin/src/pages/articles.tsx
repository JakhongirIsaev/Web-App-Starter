import { useState } from "react";
import {
  useListArticles, getListArticlesQueryKey,
  useCreateArticle, useUpdateArticle, useDeleteArticle,
  useListBranches, getListBranchesQueryKey
} from "@workspace/api-client-react";
import type { Article } from "@workspace/api-client-react";
import { Plus, BookOpen, Globe2, Building2, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ArticleForm {
  title: string;
  content: string;
  isPublished: boolean;
  targetAllBranches: boolean;
  branchIds: number[];
}

const emptyForm: ArticleForm = { title: "", content: "", isPublished: false, targetAllBranches: true, branchIds: [] };

export default function Articles() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editArticle, setEditArticle] = useState<Article | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Article | null>(null);
  const [form, setForm] = useState<ArticleForm>(emptyForm);

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

  const openCreate = () => {
    setEditArticle(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (a: Article) => {
    setEditArticle(a);
    setForm({ title: a.title, content: a.content, isPublished: a.isPublished, targetAllBranches: a.targetAllBranches, branchIds: a.branchIds || [] });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.title.trim() || !form.content.trim()) return;
    const data: any = { title: form.title, content: form.content, isPublished: form.isPublished, targetAllBranches: form.targetAllBranches };
    if (!form.targetAllBranches) data.branchIds = form.branchIds;
    if (editArticle) {
      updateArticle.mutate({ id: editArticle.id, data }, {
        onSuccess: () => { toast({ title: "Article updated" }); setDialogOpen(false); invalidate(); },
        onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
      });
    } else {
      createArticle.mutate({ data }, {
        onSuccess: () => { toast({ title: "Article created" }); setDialogOpen(false); invalidate(); },
        onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
      });
    }
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteArticle.mutate({ id: deleteTarget.id }, {
      onSuccess: () => { toast({ title: "Article deleted" }); setDeleteTarget(null); invalidate(); },
      onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
    });
  };

  const toggleBranch = (branchId: number) => {
    setForm(f => ({
      ...f,
      branchIds: f.branchIds.includes(branchId) ? f.branchIds.filter(id => id !== branchId) : [...f.branchIds, branchId]
    }));
  };

  const isPending = createArticle.isPending || updateArticle.isPending;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Knowledge Base</h2>
          <p className="text-muted-foreground mt-1">Manage guides, policies, and instructional articles for specialists.</p>
        </div>
        <Button className="gap-2" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Create Article
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="all">All Articles</TabsTrigger>
          <TabsTrigger value="published">Published</TabsTrigger>
          <TabsTrigger value="drafts">Drafts</TabsTrigger>
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
              <h3 className="text-lg font-medium text-foreground">No articles found</h3>
              <p>Create your first knowledge base article to help your team.</p>
              <Button className="mt-4" variant="outline" onClick={openCreate}>Create Article</Button>
            </div>
          ) : (
            articles?.map((article) => (
              <Card key={article.id} className="shadow-sm border-border/50 hover:border-primary/50 transition-colors flex flex-col group">
                <CardHeader className="pb-3 flex-1">
                  <div className="flex justify-between items-start gap-4 mb-2">
                    <CardTitle className="text-lg leading-tight group-hover:text-primary transition-colors">{article.title}</CardTitle>
                    {article.isPublished
                      ? <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20 whitespace-nowrap">Published</Badge>
                      : <Badge variant="outline" className="bg-gray-500/10 text-gray-600 border-gray-500/20 whitespace-nowrap">Draft</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    {article.targetAllBranches
                      ? <><Globe2 className="h-3.5 w-3.5" /> All Branches</>
                      : <><Building2 className="h-3.5 w-3.5" /> {article.branchIds?.length || 0} Branches</>}
                  </div>
                </CardHeader>
                <CardContent className="pb-4">
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {article.content.replace(/<[^>]*>?/gm, '').substring(0, 150)}...
                  </p>
                </CardContent>
                <CardFooter className="pt-0 text-xs text-muted-foreground flex justify-between items-center border-t border-border/30 px-6 py-3 mt-auto">
                  <span>By {article.author?.name || 'System'}</span>
                  <div className="flex items-center gap-2">
                    <span>{format(new Date(article.updatedAt), 'MMM d, yyyy')}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => openEdit(article)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteTarget(article)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
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
            <DialogTitle>{editArticle ? "Edit Article" : "Create Article"}</DialogTitle>
            <DialogDescription>{editArticle ? "Update article content and visibility." : "Write a new knowledge base article."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Article title" />
            </div>
            <div className="space-y-2">
              <Label>Content</Label>
              <Textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} placeholder="Write your article content..." rows={10} className="font-mono text-sm" />
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <Switch id="art-published" checked={form.isPublished} onCheckedChange={v => setForm(f => ({ ...f, isPublished: v }))} />
                <Label htmlFor="art-published">Published</Label>
              </div>
              <div className="flex items-center gap-3">
                <Switch id="art-all-branches" checked={form.targetAllBranches} onCheckedChange={v => setForm(f => ({ ...f, targetAllBranches: v }))} />
                <Label htmlFor="art-all-branches">All Branches</Label>
              </div>
            </div>
            {!form.targetAllBranches && branches && (
              <div className="space-y-2">
                <Label>Target Branches</Label>
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
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={isPending || !form.title.trim() || !form.content.trim()}>
              {isPending ? "Saving..." : editArticle ? "Save Changes" : "Create Article"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Article</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete "{deleteTarget?.title}"? This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteArticle.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
