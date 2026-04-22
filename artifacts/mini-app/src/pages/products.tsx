import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Package,
  Plus,
  Search,
  ShoppingCart,
} from "lucide-react";

type ProductItem = {
  id: number;
  number: number | null;
  name: string;
  productType?: string | null;
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

function normalizeSegment(segment: string | null | undefined): string | null {
  const value = segment?.trim().toLowerCase();
  if (!value) return null;
  if (value === "средний") return "средний";
  if (value === "малый") return "малый";
  if (value === "микро") return "микро";
  return segment?.trim() || null;
}

function formatSapCode(value: string | null | undefined): string {
  if (!value) return "";
  const parts = value.split(/\s+/).filter(Boolean);
  return parts.length > 1 ? parts.join("\n") : value;
}

function SegmentBadge({ segment, t }: { segment: string | null; t: ReturnType<typeof useTranslation>["t"] }) {
  switch (normalizeSegment(segment)) {
    case "средний":
      return <Badge variant="outline" className="bg-blue-500/10 text-blue-700 border-blue-500/20">{t("products.medium")}</Badge>;
    case "малый":
      return <Badge variant="outline" className="bg-orange-500/10 text-orange-700 border-orange-500/20">{t("products.small")}</Badge>;
    case "микро":
      return <Badge variant="outline" className="bg-purple-500/10 text-purple-700 border-purple-500/20">{t("products.micro")}</Badge>;
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
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectionHydrated, setSelectionHydrated] = useState(false);

  const urlParams = new URLSearchParams(window.location.search);
  const clientId = urlParams.get("clientId");
  const needType = urlParams.get("needType") || undefined;
  const canSaveToBasket = Boolean(clientId);

  const { data: clientData } = useQuery({
    queryKey: ["mini-client", clientId],
    queryFn: () => api.get(`/mini-app/clients/${clientId}`),
    enabled: canSaveToBasket,
  });

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["mini-products", needType ?? "all"],
    queryFn: () =>
      api.get(
        `/mini-app/products${needType ? `?needType=${encodeURIComponent(needType)}` : ""}`,
      ),
  });

  useEffect(() => {
    if (!canSaveToBasket || selectionHydrated || !clientData?.basketItems) return;

    const nextSelected = new Set<number>();
    for (const item of clientData.basketItems as Array<{ productId?: number | null }>) {
      if (typeof item.productId === "number") {
        nextSelected.add(item.productId);
      }
    }
    setSelectedIds(nextSelected);
    setSelectionHydrated(true);
  }, [canSaveToBasket, clientData?.basketItems, selectionHydrated]);

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

  const saveMutation = useMutation({
    mutationFn: () => {
      const catalogProducts = products as ProductItem[];
      const visibleProductIds = new Set(catalogProducts.map((item) => item.id));

      const preservedItems = Array.isArray(clientData?.basketItems)
        ? clientData.basketItems
            .filter((item: any) => {
              if (item.productType === "non_credit") return true;
              return typeof item.productId === "number" && !visibleProductIds.has(item.productId);
            })
            .map((item: any) => ({
              productId: item.productType === "non_credit" ? null : item.productId || null,
              productType: item.productType || "credit",
              productName: item.productName,
              notes: item.notes || null,
            }))
        : [];

      const selectedItems = catalogProducts
        .filter((product) => selectedIds.has(product.id))
        .map((product) => ({
          productId: product.productType === "non_credit" ? null : product.id,
          productType: product.productType || "credit",
          productName: product.name,
          notes: null,
        }));

      return api.post("/mini-app/basket", {
        clientId: Number(clientId),
        items: [...preservedItems, ...selectedItems],
      });
    },
    onSuccess: () => navigate(`/clients/${clientId}?focus=offer`),
  });

  const toggleProductSelection = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="space-y-4 pb-32">
      {canSaveToBasket ? (
        <button
          onClick={() => navigate(`/clients/${clientId}?focus=offer`)}
          className="flex items-center gap-1 text-sm text-muted-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("common.back")}
        </button>
      ) : null}

      <div className="flex items-center gap-2">
        <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center">
          <Package className="w-5 h-5 text-purple-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold">{t("nav.products")}</h1>
          <p className="text-xs text-muted-foreground">
            {filtered.length} {t("recommendation.allProducts").toLowerCase()}
          </p>
          {canSaveToBasket && clientData?.client?.fullName ? (
            <p className="text-xs text-primary">
              {clientData.client.fullName}
            </p>
          ) : null}
        </div>
      </div>

      {canSaveToBasket ? (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-primary">{t("basket.title")}</p>
              <p className="text-xs text-muted-foreground">
                {t("recommendation.selectedCount", { count: selectedIds.size })}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate(`/recommendation/${clientId}`)}>
              {t("recommendation.recommended")}
            </Button>
          </CardContent>
        </Card>
      ) : null}

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
            const selected = selectedIds.has(item.id);

            return (
              <Card key={item.id} className={`overflow-hidden ${selected ? "border-primary bg-primary/5" : ""}`}>
                <CardContent className="p-0">
                  <div className="p-3">
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        className="flex-1 min-w-0 text-left"
                        onClick={() => setExpandedId(expanded ? null : item.id)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                #{item.number ?? "-"}
                              </span>
                              <p className="text-sm font-medium truncate">{item.name}</p>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <SegmentBadge segment={item.segment} t={t} />
                              {item.sapCode && (
                                <span className="text-[10px] text-muted-foreground whitespace-pre-line">
                                  SAP: {formatSapCode(item.sapCode)}
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

                      {canSaveToBasket ? (
                        <Button
                          type="button"
                          size="icon"
                          className={`h-10 w-10 rounded-xl ${selected ? "" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"}`}
                          variant={selected ? "default" : "secondary"}
                          onClick={() => toggleProductSelection(item.id)}
                        >
                          {selected ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  {expanded && (
                    <div className="border-t p-3 space-y-2 text-xs">
                      {item.loanAmount && <InfoRow label={t("products.loanAmount")} value={item.loanAmount} />}
                      {item.rateUZS && <InfoRow label={t("products.rateUzs")} value={item.rateUZS} />}
                      {item.rateUSD && <InfoRow label={t("products.rateUsd")} value={item.rateUSD} />}
                      {item.rateEUR && <InfoRow label={t("products.rateEur")} value={item.rateEUR} />}
                      {item.termWorkingCapital && <InfoRow label={t("products.termWC")} value={item.termWorkingCapital} />}
                      {item.termFixedAssets && <InfoRow label={t("products.termFA")} value={item.termFixedAssets} />}
                      {item.termUntargeted && <InfoRow label={t("questionnaire.loanPurposeOptions.untargeted")} value={item.termUntargeted} />}
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

      {canSaveToBasket && selectedIds.size > 0 ? (
        <div className="fixed bottom-24 left-4 right-4 z-50 mx-auto max-w-md">
          <Button
            className="w-full gap-2 shadow-lg"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShoppingCart className="h-4 w-4" />
            )}
            {t("basket.save")} ({selectedIds.size})
          </Button>
        </div>
      ) : null}
    </div>
  );
}
