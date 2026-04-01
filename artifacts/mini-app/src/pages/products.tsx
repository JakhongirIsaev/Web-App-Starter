import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, Package, ChevronDown, ChevronUp } from "lucide-react";

export default function ProductsPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [segmentFilter, setSegmentFilter] = useState("");

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["mini-products"],
    queryFn: () => api.get("/mini-app/products"),
  });

  const segments = [...new Set(products.map((p: any) => p.segment).filter(Boolean))];

  const filtered = products.filter((p: any) => {
    const matchSearch = !search || p.name?.toLowerCase().includes(search.toLowerCase());
    const matchSegment = !segmentFilter || p.segment === segmentFilter;
    return matchSearch && matchSegment;
  });

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center">
          <Package className="w-5 h-5 text-purple-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold">{t("nav.products")}</h1>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("recommendation.allProducts")}
          className="pl-9"
        />
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        <button
          onClick={() => setSegmentFilter("")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${
            !segmentFilter ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
          }`}
        >
          {t("clients.allStatuses")}
        </button>
        {segments.map((s: string) => (
          <button
            key={s}
            onClick={() => setSegmentFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${
              segmentFilter === s ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-center text-muted-foreground py-8">{t("common.loading")}</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            {t("common.noResults")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((p: any) => {
            const isExpanded = expandedId === p.id;
            return (
              <Card
                key={p.id}
                className="cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : p.id)}
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{p.name}</p>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {p.segment && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">{p.segment}</span>
                        )}
                        {p.sapCode && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">SAP: {p.sapCode}</span>
                        )}
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    )}
                  </div>

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t space-y-2 text-xs">
                      {p.loanAmount && <InfoRow label={t("recommendation.amount")} value={p.loanAmount} />}
                      {p.rateUzs && <InfoRow label="UZS" value={p.rateUzs} />}
                      {p.rateUsd && <InfoRow label="USD" value={p.rateUsd} />}
                      {p.rateEur && <InfoRow label="EUR" value={p.rateEur} />}
                      {p.termWorkingCapital && <InfoRow label={t("recommendation.term")} value={p.termWorkingCapital} />}
                      {p.termFixedAssets && <InfoRow label={t("recommendation.term") + " (ОС)"} value={p.termFixedAssets} />}
                      {p.gracePeriod && <InfoRow label={t("calculator.gracePeriod")} value={p.gracePeriod} />}
                      {p.disbursementForm && <InfoRow label={t("creditProducts.disbursementForm") || "Форма выдачи"} value={p.disbursementForm} />}
                      {p.purpose && (
                        <div>
                          <p className="text-muted-foreground mb-0.5">{t("recommendation.title")}</p>
                          <p className="text-foreground">{p.purpose}</p>
                        </div>
                      )}
                      {p.highlight && (
                        <div className="bg-primary/10 rounded-lg p-2">
                          <p className="text-primary font-medium">{p.highlight}</p>
                        </div>
                      )}
                    </div>
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium text-right">{value}</span>
    </div>
  );
}
