import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, Package, ChevronDown, ChevronUp } from "lucide-react";

interface ProductGroup {
  number: number;
  name: string;
  sapCode: string;
  segments: Record<string, any>;
}

export default function ProductsPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [expandedNumber, setExpandedNumber] = useState<number | null>(null);
  const [selectedSegments, setSelectedSegments] = useState<Record<number, string>>({});

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["mini-products"],
    queryFn: () => api.get("/mini-app/products"),
  });

  const grouped = useMemo(() => {
    const map = new Map<number, ProductGroup>();
    for (const p of products as any[]) {
      const num = p.number || p.id;
      if (!map.has(num)) {
        map.set(num, {
          number: num,
          name: p.name,
          sapCode: p.sapCode || "",
          segments: {},
        });
      }
      const segKey = p.segment || "__default";
      map.get(num)!.segments[segKey] = p;
    }
    return Array.from(map.values()).sort((a, b) => a.number - b.number);
  }, [products]);

  const filtered = grouped.filter((g) =>
    !search || g.name.toLowerCase().includes(search.toLowerCase())
  );

  const segmentOrder = ["микро", "малый", "средний"];
  const segmentLabels: Record<string, string> = {
    "микро": t("products.micro"),
    "малый": t("products.small"),
    "средний": t("products.medium"),
  };

  const getSelectedSegment = (group: ProductGroup) => {
    const segs = Object.keys(group.segments);
    const chosen = selectedSegments[group.number];
    if (chosen && group.segments[chosen]) return chosen;
    return segmentOrder.find((s) => segs.includes(s)) || segs[0] || "__default";
  };

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center">
          <Package className="w-5 h-5 text-purple-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold">{t("nav.products")}</h1>
          <p className="text-xs text-muted-foreground">{filtered.length} {t("recommendation.allProducts").toLowerCase()}</p>
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
          {filtered.map((group) => {
            const isExpanded = expandedNumber === group.number;
            const currentSeg = getSelectedSegment(group);
            const product = group.segments[currentSeg];
            const availableSegs = segmentOrder.filter((s) => group.segments[s]);

            return (
              <Card key={group.number} className="overflow-hidden">
                <CardContent className="p-0">
                  <div
                    className="p-3 cursor-pointer"
                    onClick={() => setExpandedNumber(isExpanded ? null : group.number)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            #{group.number}
                          </span>
                          <p className="text-sm font-medium truncate">{group.name}</p>
                        </div>
                        {group.sapCode && (
                          <span className="text-[10px] text-muted-foreground mt-0.5 block">
                            SAP: {group.sapCode}
                          </span>
                        )}
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t">
                      {availableSegs.length > 1 && (
                        <div className="px-3 pt-3 pb-1">
                          <p className="text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wider">{t("products.businessType")}</p>
                          <div className="flex gap-1.5">
                            {availableSegs.map((seg) => (
                              <button
                                key={seg}
                                onClick={() => setSelectedSegments((prev) => ({ ...prev, [group.number]: seg }))}
                                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                                  currentSeg === seg
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                                }`}
                              >
                                {segmentLabels[seg] || seg}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {product && (
                        <div className="p-3 space-y-2 text-xs">
                          {product.loanAmount && (
                            <InfoRow label={t("products.loanAmount")} value={product.loanAmount} />
                          )}
                          {product.rateUZS && (
                            <InfoRow label={t("products.rateUzs")} value={product.rateUZS} />
                          )}
                          {product.rateUSD && (
                            <InfoRow label={t("products.rateUsd")} value={product.rateUSD} />
                          )}
                          {product.rateEUR && (
                            <InfoRow label={t("products.rateEur")} value={product.rateEUR} />
                          )}
                          {product.termWorkingCapital && (
                            <InfoRow label={t("products.termWC")} value={product.termWorkingCapital} />
                          )}
                          {product.termFixedAssets && (
                            <InfoRow label={t("products.termFA")} value={product.termFixedAssets} />
                          )}
                          {product.gracePeriod && (
                            <InfoRow label={t("products.gracePeriod")} value={product.gracePeriod} />
                          )}
                          {product.disbursementForm && (
                            <InfoRow label={t("products.disbursement")} value={product.disbursementForm} />
                          )}
                          {product.purpose && (
                            <div>
                              <p className="text-muted-foreground mb-0.5">{t("products.purpose")}</p>
                              <p className="text-foreground text-xs leading-relaxed">{product.purpose}</p>
                            </div>
                          )}
                          {product.highlight && (
                            <div className="bg-primary/10 rounded-lg p-2">
                              <p className="text-primary font-medium text-xs">{product.highlight}</p>
                            </div>
                          )}
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
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground flex-shrink-0">{label}</span>
      <span className="text-foreground font-medium text-right">{value}</span>
    </div>
  );
}
