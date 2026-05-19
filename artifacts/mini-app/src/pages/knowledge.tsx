import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Search, BookOpen, ChevronDown, ChevronUp, GraduationCap, Monitor, FileText, Landmark, HelpCircle, Layers, Clock } from "lucide-react";
import { fmtDate } from "@/lib/format";

/* ── Category configuration with v2 color system ── */
const CATEGORY_CONFIG: Record<string, {
  icon: typeof BookOpen;
  bg: string;
  fg: string;
}> = {
  onboarding:     { icon: GraduationCap, bg: "#FFF7D6", fg: "#6B5C00" },   // brand yellow
  credit_process: { icon: Landmark,      bg: "#FFFBEB", fg: "#D97706" },   // amber
  sap:            { icon: Monitor,        bg: "#F5F3FF", fg: "#7C3AED" },   // violet
  documents:      { icon: FileText,       bg: "#EFF6FF", fg: "#2563EB" },   // blue
  faq:            { icon: HelpCircle,     bg: "#FFF7D6", fg: "#6B5C00" },   // brand yellow
  general:        { icon: Layers,         bg: "#F8FAFC", fg: "#64748B" },   // gray
};

const TILE_COLORS = [
  { bg: "#FFF7D6", fg: "#6B5C00" },  // brand yellow
  { bg: "#FFFBEB", fg: "#D97706" },  // amber
  { bg: "#F5F3FF", fg: "#7C3AED" },  // violet
  { bg: "#EFF6FF", fg: "#2563EB" },  // blue
];

export default function KnowledgePage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const { data: articles = [], isLoading } = useQuery({
    queryKey: ["mini-articles"],
    queryFn: () => api.get("/mini-app/articles"),
  });

  /* Derive categories with counts */
  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = {};
    articles.forEach((a: any) => {
      const cat = a.category || "general";
      map[cat] = (map[cat] || 0) + 1;
    });
    return map;
  }, [articles]);

  const categories = Object.keys(categoryCounts);

  const filtered = articles.filter((a: any) => {
    const matchesSearch =
      !search ||
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      a.content?.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = activeCategory === "all" || (a.category || "general") === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const getCategoryLabel = (cat: string) => t(`knowledge.categories.${cat}`, cat);

  const getCategoryConfig = (cat: string) => CATEGORY_CONFIG[cat] || CATEGORY_CONFIG.general;

  /* Determine which articles are "new" (within 7 days) */
  const isNew = (dateStr: string | undefined) => {
    if (!dateStr) return false;
    return Date.now() - new Date(dateStr).getTime() < 7 * 24 * 60 * 60 * 1000;
  };

  /* Estimate reading time (~200 words/min for Russian) */
  const readingTime = (content: string | undefined) => {
    if (!content) return 1;
    const words = content.trim().split(/\s+/).length;
    return Math.max(1, Math.round(words / 200));
  };

  return (
    <div className="min-h-screen" style={{ background: "#F4F4F5" }}>
      {/* ── Search bar ── */}
      <div className="px-4 pt-4">
        <div className="mn-card relative">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px]"
            style={{ color: "#94A3B8" }}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("knowledge.searchPlaceholder")}
            className="w-full rounded-[14px] border-none bg-transparent py-3.5 pl-11 pr-4 text-[15px] outline-none"
            style={{ color: "#0F172A" }}
          />
        </div>
      </div>

      {/* ── Category grid (2x2) ── */}
      {!search && categories.length > 0 && (
        <div className="px-4 mt-3 grid grid-cols-2 gap-3">
          {categories.slice(0, 4).map((cat, idx) => {
            const config = getCategoryConfig(cat);
            const tileColor = TILE_COLORS[idx % TILE_COLORS.length];
            const Icon = config.icon;
            const isActive = activeCategory === cat;

            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(isActive ? "all" : cat)}
                className="mn-card p-3.5 flex flex-col items-start gap-2.5 text-left transition-all"
                style={{
                  outline: isActive ? `2px solid ${tileColor.fg}` : "none",
                  outlineOffset: -2,
                }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: tileColor.bg, color: tileColor.fg }}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[13px] font-semibold" style={{ color: "#0F172A" }}>
                    {getCategoryLabel(cat)}
                  </p>
                  <p className="text-[12px] mt-0.5" style={{ color: "#64748B" }}>
                    {t("knowledge.articleCount", { count: categoryCounts[cat] })}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Section header ── */}
      <div className="flex items-center justify-between px-5 pt-5 pb-2">
        <span className="text-[13px] font-bold tracking-[-0.01em]" style={{ color: "#0F172A" }}>
          {search ? t("knowledge.title") : t("knowledge.newArticles")}
        </span>
        {activeCategory !== "all" && (
          <button
            onClick={() => setActiveCategory("all")}
            className="text-[12px] font-semibold"
            style={{ color: "#272424" }}
          >
            {t("knowledge.allCategories")}
          </button>
        )}
      </div>

      {/* ── Articles list ── */}
      {isLoading ? (
        <div className="px-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="mn-card p-4">
              <div className="mn-skel h-3 w-20 mb-3" />
              <div className="mn-skel h-4 w-3/4 mb-2" />
              <div className="mn-skel h-3 w-full" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="mn-card mx-4 p-8 flex flex-col items-center">
          <BookOpen className="w-10 h-10 mb-2" style={{ color: "#CBD5E1" }} />
          <p className="text-[14px]" style={{ color: "#64748B" }}>{t("knowledge.noArticles")}</p>
        </div>
      ) : (
        <div className="px-4 space-y-3 pb-6">
          {filtered.map((article: any) => {
            const isExpanded = expandedId === article.id;
            const cat = article.category || "general";
            const config = getCategoryConfig(cat);
            const articleIsNew = isNew(article.createdAt);

            return (
              <div
                key={article.id}
                className="mn-card overflow-hidden cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : article.id)}
              >
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Amber gradient icon */}
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                      style={{
                        background: `linear-gradient(135deg, ${config.bg} 0%, ${config.bg} 100%)`,
                        color: config.fg,
                      }}
                    >
                      <config.icon className="w-5 h-5" />
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Category label + NEW badge */}
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="text-[11px] font-semibold uppercase tracking-wide"
                          style={{ color: config.fg }}
                        >
                          {getCategoryLabel(cat)}
                        </span>
                        {articleIsNew && (
                          <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                            style={{ background: "#FFF7D6", color: "#6B5C00" }}
                          >
                            {t("knowledge.newBadge")}
                          </span>
                        )}
                      </div>

                      {/* Title */}
                      <h3
                        className="text-[14px] font-semibold leading-snug"
                        style={{ color: "#0F172A" }}
                      >
                        {article.title}
                      </h3>

                      {/* Excerpt (2-line clamp) */}
                      {!isExpanded && article.content && (
                        <p
                          className="text-[13px] mt-1 leading-relaxed"
                          style={{
                            color: "#64748B",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {article.content}
                        </p>
                      )}

                      {/* Reading time + date */}
                      <div className="flex items-center gap-3 mt-2">
                        <span className="flex items-center gap-1 text-[11px]" style={{ color: "#94A3B8" }}>
                          <Clock className="w-3 h-3" />
                          {t("knowledge.readingMinutes", { count: readingTime(article.content) })}
                        </span>
                        <span className="text-[11px]" style={{ color: "#CBD5E1" }}>
                          {fmtDate(article.createdAt)}
                        </span>
                      </div>
                    </div>

                    {/* Expand chevron */}
                    <div className="shrink-0 pt-1">
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" style={{ color: "#94A3B8" }} />
                      ) : (
                        <ChevronDown className="w-4 h-4" style={{ color: "#94A3B8" }} />
                      )}
                    </div>
                  </div>

                  {/* Expanded content */}
                  {isExpanded && article.content && (
                    <div
                      className="mt-4 pt-4 text-[14px] leading-relaxed whitespace-pre-wrap"
                      style={{ color: "#334155", borderTop: "1px solid #F1F5F9" }}
                    >
                      {article.content}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
