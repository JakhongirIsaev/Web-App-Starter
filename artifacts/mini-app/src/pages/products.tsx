import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Package, Search } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type ProductItem = {
  id: number;
  number: number | null;
  name: string;
  sapCode: string | null;
  segment: string | null;
  disbursementForm: string | null;
  loanAmount: string | null;
  termWorkingCapital: string | null;
  termFixedAssets: string | null;
  termUntargeted: string | null;
  rateUZS: string | null;
  rateUSD: string | null;
  rateEUR: string | null;
  gracePeriod: string | null;
  purpose: string | null;
  highlight: string | null;
};

function SegmentBadge({ segment, t }: { segment: string | null; t: ReturnType<typeof useTranslation>["t"] }) {
  switch (segment) {
    case "СЃСЂРµРґРЅРёР№":
      return <Badge variant="outline" className="bg-blue-500/10 text-blue-700 border-blue-500/20">{t("products.medium")}</Badge>;
    case "РјР°Р»С‹Р№":
      return <Badge variant="outline" className="bg-orange-500/10 text-orange-700 border-orange-500/20">{t("products.small")}</Badge>;
    case "РјРёРєСЂРѕ":
      return <Badge variant="outline" className="bg-purple-500/10 text-purple-700 border-purple-500/20">{t("products.micro")}</Badge>;
    case "":
    case null:
      return <Badge variant="secondary">-</Badge>;
    default:
      return <Badge variant="secondary">{segment}</Badge>;
  }
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground flex-shrink-0">{label}</span>
      <span className="text-foreground font-medium text-right">{value}</span>
    </div>
  );
}

export default function ProductsPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["mini-products"],
    queryFn: () => api.get("/mini-app/products"),
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (products as ProductItem[]).filter((item) => {
      if (!term) return true;
      return [
        item.number ?? "",
        item.name,
        item.sapCode,
        item.segment,
        item.loanAmount,
        item.purpose,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [products, search]);

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
          onChange={(event) => setSearch(event.target.value)}
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
          {filtered.map((item) => {
            const expanded = expandedId === item.id;

            return (
              <Card key={item.id} className="overflow-hidden">
                <CardContent className="p-0">
                  <button
                    type="button"
                    className="w-full text-left p-3"
                    onClick={() => setExpandedId(expanded ? null : item.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            #{item.number ?? "—"}
                          </span>
                          <p className="text-sm font-medium truncate">{item.name}</p>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <SegmentBadge segment={item.segment} t={t} />
                          {item.sapCode && (
                            <span className="text-[10px] text-muted-foreground">
                              SAP: {item.sapCode}
                            </span>
                          )}
                        </div>
                      </div>
                      {expanded ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                      )}
                    </div>
                  </button>

                  {expanded && (
                    <div className="border-t p-3 space-y-2 text-xs">
                      {item.loanAmount && <InfoRow label={t("products.loanAmount")} value={item.loanAmount} />}
                      {item.rateUZS && <InfoRow label={t("products.rateUzs")} value={item.rateUZS} />}
                      {item.rateUSD && <InfoRow label={t("products.rateUsd")} value={item.rateUSD} />}
                      {item.rateEUR && <InfoRow label={t("products.rateEur")} value={item.rateEUR} />}
                      {item.termWorkingCapital && <InfoRow label={t("products.termWC")} value={item.termWorkingCapital} />}
                      {item.termFixedAssets && <InfoRow label={t("products.termFA")} value={item.termFixedAssets} />}
                      {item.termUntargeted && <InfoRow label={t("creditProducts.termUntargeted")} value={item.termUntargeted} />}
                      {item.gracePeriod && <InfoRow label={t("products.gracePeriod")} value={item.gracePeriod} />}
                      {item.disbursementForm && <InfoRow label={t("products.disbursement")} value={item.disbursementForm} />}
                      {item.purpose && (
                        <div>
                          <p className="text-muted-foreground mb-0.5">{t("products.purpose")}</p>
                          <p className="text-foreground text-xs leading-relaxed whitespace-pre-wrap">{item.purpose}</p>
                        </div>
                      )}
                      {item.highlight && (
                        <div className="bg-primary/10 rounded-lg p-2">
                          <p className="text-primary font-medium text-xs whitespace-pre-wrap">{item.highlight}</p>
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
