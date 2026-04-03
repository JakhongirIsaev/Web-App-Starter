import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, Plus, Minus, ShoppingCart, Check } from "lucide-react";

export default function RecommendationPage() {
  const { t } = useTranslation();
  const params = useParams<{ clientId: string }>();
  const [, navigate] = useLocation();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showAll, setShowAll] = useState(false);

  const urlParams = new URLSearchParams(window.location.search);
  const answersStr = urlParams.get("answers");
  const answers = answersStr ? JSON.parse(decodeURIComponent(answersStr)) : [];

  const { data } = useQuery({
    queryKey: ["mini-recommend", params.clientId],
    queryFn: () => api.post("/mini-app/recommend", { clientId: parseInt(params.clientId), answers }),
  });

  const { data: allProducts } = useQuery({
    queryKey: ["mini-all-products"],
    queryFn: () => api.get("/mini-app/products"),
    enabled: showAll,
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const products = showAll ? allProducts || [] : data?.recommended || [];
      const items = products
        .filter((p: any) => selectedIds.has(p.id))
        .map((p: any) => ({
          productId: p.id,
          productType: "credit",
          productName: p.name,
          notes: p.whySuitable || null,
        }));
      return api.post("/mini-app/basket", { clientId: parseInt(params.clientId), items });
    },
    onSuccess: () => navigate(`/clients/${params.clientId}`),
  });

  const toggleProduct = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const products = showAll ? allProducts || [] : data?.recommended || [];

  return (
    <div className="space-y-4 pb-4">
      <button onClick={() => navigate(`/clients/${params.clientId}`)} className="flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="w-4 h-4" />
        {t("common.back")}
      </button>

      <div>
        <h1 className="text-lg font-bold">{t("recommendation.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("recommendation.found", { count: products.length })}
        </p>
      </div>

      <div className="flex gap-2">
        <Button
          variant={showAll ? "outline" : "default"}
          size="sm"
          onClick={() => setShowAll(false)}
        >
          {t("recommendation.recommended")}
        </Button>
        <Button
          variant={showAll ? "default" : "outline"}
          size="sm"
          onClick={() => setShowAll(true)}
        >
          {t("recommendation.allProducts")}
        </Button>
      </div>

      {products.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            {t("recommendation.noProducts")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {products.map((p: any) => {
            const isSelected = selectedIds.has(p.id);
            return (
              <Card
                key={p.id}
                className={`cursor-pointer transition-colors ${isSelected ? "border-primary bg-primary/5" : ""}`}
                onClick={() => toggleProduct(p.id)}
              >
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${isSelected ? "bg-primary" : "bg-secondary"}`}>
                      {isSelected ? (
                        <Check className="w-4 h-4 text-primary-foreground" />
                      ) : (
                        <Plus className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{p.name}</p>
                      <div className="flex flex-wrap gap-2 mt-1.5">
                        {p.segment && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                            {p.segment}
                          </span>
                        )}
                        {p.rateUZS && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">
                            {t("recommendation.rate")}: {p.rateUZS}
                          </span>
                        )}
                        {p.loanAmount && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                            {p.loanAmount}
                          </span>
                        )}
                      </div>
                      {p.purpose && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.purpose}</p>
                      )}
                      {p.whySuitable && (
                        <p className="text-xs text-primary mt-2">{p.whySuitable}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="fixed bottom-20 left-4 right-4 z-50">
          <Button
            className="w-full gap-2 shadow-lg"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            <ShoppingCart className="w-4 h-4" />
            {t("recommendation.goToBasket")} ({selectedIds.size})
          </Button>
        </div>
      )}
    </div>
  );
}
