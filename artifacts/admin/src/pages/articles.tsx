import { useState } from "react";
import { useListArticles, getListArticlesQueryKey } from "@workspace/api-client-react";
import { Plus, BookOpen, Globe2, Building2 } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Articles() {
  const [tab, setTab] = useState("all");

  const { data: articles, isLoading } = useListArticles(
    { 
      isPublished: tab === "published" ? true : tab === "drafts" ? false : undefined 
    },
    { 
      query: { 
        queryKey: getListArticlesQueryKey({ 
          isPublished: tab === "published" ? true : tab === "drafts" ? false : undefined 
        }) 
      } 
    }
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Knowledge Base</h2>
          <p className="text-muted-foreground mt-1">Manage guides, policies, and instructional articles for specialists.</p>
        </div>
        <Button className="gap-2">
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
                <CardHeader className="pb-4">
                  <Skeleton className="h-6 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-1/4" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-16 w-full" />
                </CardContent>
                <CardFooter className="pt-0">
                  <Skeleton className="h-5 w-24 rounded-full" />
                </CardFooter>
              </Card>
            ))
          ) : articles?.length === 0 ? (
            <div className="col-span-full py-12 text-center text-muted-foreground border-2 border-dashed border-border rounded-lg">
              <BookOpen className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium text-foreground">No articles found</h3>
              <p>Create your first knowledge base article to help your team.</p>
              <Button className="mt-4" variant="outline">Create Article</Button>
            </div>
          ) : (
            articles?.map((article) => (
              <Card key={article.id} className="shadow-sm border-border/50 hover:border-primary/50 transition-colors flex flex-col cursor-pointer hover-elevate group">
                <CardHeader className="pb-3 flex-1">
                  <div className="flex justify-between items-start gap-4 mb-2">
                    <CardTitle className="text-lg leading-tight group-hover:text-primary transition-colors">
                      {article.title}
                    </CardTitle>
                    {article.isPublished ? (
                      <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20 whitespace-nowrap">Published</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-gray-500/10 text-gray-600 border-gray-500/20 whitespace-nowrap">Draft</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    {article.targetAllBranches ? (
                      <><Globe2 className="h-3.5 w-3.5" /> All Branches</>
                    ) : (
                      <><Building2 className="h-3.5 w-3.5" /> {article.branchIds?.length || 0} Branches</>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pb-4">
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {/* Very simple strip html for preview */}
                    {article.content.replace(/<[^>]*>?/gm, '').substring(0, 150)}...
                  </p>
                </CardContent>
                <CardFooter className="pt-0 text-xs text-muted-foreground flex justify-between items-center border-t border-border/30 px-6 py-3 mt-auto">
                  <span>By {article.author?.name || 'System'}</span>
                  <span>{format(new Date(article.updatedAt), 'MMM d, yyyy')}</span>
                </CardFooter>
              </Card>
            ))
          )}
        </div>
      </Tabs>
    </div>
  );
}