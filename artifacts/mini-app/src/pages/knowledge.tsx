import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, BookOpen, ChevronDown, ChevronUp } from "lucide-react";
import { fmtDate } from "@/lib/format";

export default function KnowledgePage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: articles = [], isLoading } = useQuery({
    queryKey: ["mini-articles"],
    queryFn: () => api.get("/mini-app/articles"),
  });

  const filtered = articles.filter(
    (a: any) =>
      !search ||
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      a.content?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center">
          <BookOpen className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold">{t("knowledge.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("knowledge.subtitle")}</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("knowledge.searchPlaceholder")}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <p className="text-center text-muted-foreground py-8">{t("common.loading")}</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <BookOpen className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">{t("knowledge.noArticles")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((article: any) => {
            const isExpanded = expandedId === article.id;
            return (
              <Card
                key={article.id}
                className="cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : article.id)}
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium">{article.title}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {article.authorName && t("knowledge.by", { name: article.authorName })}
                        {" · "}
                        {fmtDate(article.createdAt)}
                      </p>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    )}
                  </div>
                  {isExpanded && article.content && (
                    <div className="mt-3 pt-3 border-t text-sm text-foreground whitespace-pre-wrap">
                      {article.content}
                    </div>
                  )}
                  {!isExpanded && article.content && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{article.content}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
