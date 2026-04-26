import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { api } from "@/lib/api";
import {
  ArrowLeft,
  Sparkles,
  Briefcase,
  Home,
  Landmark,
  Car,
  ChevronRight,
  Loader2,
  Package,
} from "lucide-react";

/* ── Segment-to-type mapping ── */
function segmentToType(segment: string | undefined): string {
  if (!segment) return "business";
  const s = segment.toLowerCase();
  if (s.includes("микро")) return "micro";
  if (s.includes("мал")) return "business";
  if (s.includes("средн")) return "business";
  if (s.includes("ипотек") || s.includes("mortgage")) return "mortgage";
  if (s.includes("авто") || s.includes("auto")) return "auto";
  return "business";
}

/* ── Product-type visual mapping ── */
const TYPE_THEME: Record<string, { bg: string; fg: string; label: string; Icon: typeof Briefcase }> = {
  business:  { bg: "#ECFDF3", fg: "#15803D", label: "Бизнес",  Icon: Briefcase },
  mortgage:  { bg: "#EFF6FF", fg: "#1D4ED8", label: "Ипотека", Icon: Home },
  micro:     { bg: "#FFFBEB", fg: "#B45309", label: "Микро",   Icon: Landmark },
  auto:      { bg: "#FAF5FF", fg: "#7E22CE", label: "Авто",    Icon: Car },
};

/* ── Filter pills ── */
const FILTER_PILLS = [
  { key: "all",      label: "Все" },
  { key: "business",  label: "Бизнес" },
  { key: "mortgage",  label: "Ипотека" },
  { key: "micro",     label: "Микро" },
  { key: "auto",      label: "Авто" },
];

export default function CatalogPage() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const [activeFilter, setActiveFilter] = useState("all");

  const { data: rawProducts = [], isLoading } = useQuery({
    queryKey: ["mini-products"],
    queryFn: () => api.get("/mini-app/products"),
  });

  /* ── Enrich products with resolved type ── */
  const products = useMemo(
    () =>
      (rawProducts as any[]).map((p: any) => ({
        ...p,
        resolvedType: segmentToType(p.segment),
      })),
    [rawProducts],
  );

  /* ── Filtered list ── */
  const filtered = useMemo(
    () =>
      activeFilter === "all"
        ? products
        : products.filter((p: any) => p.resolvedType === activeFilter),
    [products, activeFilter],
  );

  return (
    <div className="min-h-screen bg-[#F4F4F5]">
      {/* ── Header ── */}
      <div className="bg-white px-5 pt-3 pb-4">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1 text-[13px] text-[#64748B] font-medium mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("common.back")}
        </button>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#FAF5FF] flex items-center justify-center">
            <Package className="w-[22px] h-[22px] text-[#7E22CE]" />
          </div>
          <div>
            <div className="text-[20px] font-bold text-[#0F172A] tracking-tight">
              Каталог продуктов
            </div>
            <div className="text-[12px] text-[#64748B] mt-0.5">
              {products.length} продуктов доступно
            </div>
          </div>
        </div>
      </div>

      {/* ── Sticky filter pills ── */}
      <div className="sticky top-0 z-30 bg-[#F4F4F5] pt-3 pb-2 px-5">
        <div className="flex gap-2 overflow-x-auto mn-scroll pb-1">
          {FILTER_PILLS.map((pill) => {
            const isActive = activeFilter === pill.key;
            return (
              <button
                key={pill.key}
                onClick={() => setActiveFilter(pill.key)}
                className={`shrink-0 px-4 py-2 rounded-full text-[13px] font-semibold transition-colors ${
                  isActive
                    ? "bg-[#0F172A] text-white"
                    : "bg-white text-[#64748B] shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                }`}
              >
                {pill.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-5 pb-32 space-y-3">
        {/* ── AI banner ── */}
        <div
          className="rounded-[16px] p-4 flex items-center gap-3.5 cursor-pointer active:scale-[0.98] transition-transform"
          style={{
            background: "linear-gradient(135deg, #15803D 0%, #16A34A 50%, #22C55E 100%)",
            boxShadow: "0 4px 16px rgba(22,163,74,0.25)",
          }}
        >
          <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <Sparkles className="w-[22px] h-[22px] text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-bold text-white tracking-tight">
              {t("catalog.aiBannerTitle")}
            </div>
            <div className="text-[12px] text-white/80 mt-0.5 leading-snug">
              {t("catalog.aiBannerHint")}
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-white/60 shrink-0" />
        </div>

        {/* ── Loading ── */}
        {isLoading && (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-[#16A34A]" />
          </div>
        )}

        {/* ── Empty ── */}
        {!isLoading && filtered.length === 0 && (
          <div className="mn-card p-8 flex flex-col items-center gap-3 text-center">
            <Package className="w-8 h-8 text-[#CBD5E1]" />
            <p className="text-[14px] text-[#64748B]">Нет продуктов в этой категории</p>
          </div>
        )}

        {/* ── Product cards ── */}
        {filtered.map((product: any) => {
          const type = product.resolvedType;
          const theme = TYPE_THEME[type] ?? TYPE_THEME.business;
          const Icon = theme.Icon;

          /* pick best rate / term / amount to show */
          const rate = product.rateUZS || product.rateUSD || product.rateEUR || "---";
          const term = product.termWorkingCapital || product.termFixedAssets || "---";
          const amount = product.loanAmount || "---";

          /* badges from highlight */
          const badges: string[] = [];
          if (product.highlight) {
            const parts = product.highlight.split(/[;,.]/).map((s: string) => s.trim()).filter(Boolean);
            badges.push(...parts.slice(0, 2));
          }

          return (
            <div key={product.id} className="mn-card overflow-hidden">
              <div className="p-4">
                <div className="flex items-start gap-3">
                  {/* Type icon */}
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: theme.bg, color: theme.fg }}
                  >
                    <Icon className="w-5 h-5" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-bold text-[#0F172A] leading-snug">
                      {product.name}
                    </div>
                    {product.purpose && (
                      <div className="text-[12px] text-[#64748B] mt-1 leading-relaxed line-clamp-2">
                        {product.purpose}
                      </div>
                    )}
                  </div>
                </div>

                {/* 3-stat row */}
                <div className="flex gap-2 mt-3">
                  <div className="flex-1 bg-[#F8FAFC] rounded-xl px-3 py-2">
                    <div className="text-[10px] text-[#64748B] uppercase tracking-wide font-medium">
                      Ставка
                    </div>
                    <div className="text-[13px] font-bold text-[#0F172A] mt-0.5 truncate">
                      {rate}
                    </div>
                  </div>
                  <div className="flex-1 bg-[#F8FAFC] rounded-xl px-3 py-2">
                    <div className="text-[10px] text-[#64748B] uppercase tracking-wide font-medium">
                      Срок
                    </div>
                    <div className="text-[13px] font-bold text-[#0F172A] mt-0.5 truncate">
                      {term}
                    </div>
                  </div>
                  <div className="flex-1 bg-[#F8FAFC] rounded-xl px-3 py-2">
                    <div className="text-[10px] text-[#64748B] uppercase tracking-wide font-medium">
                      Сумма
                    </div>
                    <div className="text-[13px] font-bold text-[#0F172A] mt-0.5 truncate">
                      {amount}
                    </div>
                  </div>
                </div>

                {/* Badge pills */}
                {badges.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {badges.map((badge, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#ECFDF3] text-[#15803D]"
                      >
                        {badge}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex border-t border-[#F1F5F9]">
                <button className="flex-1 flex items-center justify-center gap-1.5 py-3 text-[13px] font-semibold text-[#64748B] border-r border-[#F1F5F9] active:bg-[#F8FAFC] transition-colors">
                  Подробнее
                </button>
                <button
                  onClick={() => {
                    /* placeholder: add to basket */
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-3 text-[13px] font-semibold text-[#16A34A] active:bg-[#ECFDF3] transition-colors"
                >
                  В корзину
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
