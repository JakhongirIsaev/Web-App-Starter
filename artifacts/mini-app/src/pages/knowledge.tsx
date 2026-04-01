import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, BookOpen, ChevronDown, ChevronUp, GraduationCap, Monitor, FileText, Landmark, HelpCircle, Layers } from "lucide-react";
import { fmtDate } from "@/lib/format";

const CATEGORY_ICONS: Record<string, any> = {
  onboarding: GraduationCap,
  sap: Monitor,
  documents: FileText,
  credit_process: Landmark,
  faq: HelpCircle,
  general: Layers,
};

const CATEGORY_COLORS: Record<string, string> = {
  onboarding: "bg-blue-500/10 text-blue-600",
  sap: "bg-purple-500/10 text-purple-600",
  documents: "bg-orange-500/10 text-orange-600",
  credit_process: "bg-green-500/10 text-green-600",
  faq: "bg-rose-500/10 text-rose-600",
  general: "bg-gray-500/10 text-gray-600",
};

export default function KnowledgePage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const { data: articles = [], isLoading } = useQuery({
    queryKey: ["mini-articles"],
    queryFn: () => api.get("/mini-app/articles"),
  });

  const categories = Array.from(new Set(articles.map((a: any) => a.category || "general")));

  const filtered = articles.filter((a: any) => {
    const matchesSearch =
      !search ||
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      a.content?.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = activeCategory === "all" || (a.category || "general") === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const getCategoryLabel = (cat: string) => t(`knowledge.categories.${cat}`, cat);

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

      {categories.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
          <button
            onClick={() => setActiveCategory("all")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              activeCategory === "all"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {t("knowledge.allCategories")}
          </button>
          {categories.map((cat: string) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                activeCategory === cat
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {getCategoryLabel(cat)}
            </button>
          ))}
        </div>
      )}

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
            const cat = article.category || "general";
            const Icon = CATEGORY_ICONS[cat] || Layers;
            const colorClass = CATEGORY_COLORS[cat] || CATEGORY_COLORS.general;

            return (
              <Card
                key={article.id}
                className="cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : article.id)}
              >
                <CardContent className="p-3">
                  <div className="flex items-start gap-2.5">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${colorClass}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-medium">{article.title}</h3>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${colorClass}`}>
                              {getCategoryLabel(cat)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {fmtDate(article.createdAt)}
                            </span>
                          </div>
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
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
