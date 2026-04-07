import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, Plus, ShoppingCart, Check, Sparkles, Loader2, AlertTriangle, Lightbulb } from "lucide-react";

interface AIFacts {
  clientProfile?: string;
  whyRecommended?: string[];
  riskNotes?: string[];
  tips?: string[];
}

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

  const { data: aiFacts, isLoading: aiFactsLoading } = useQuery<AIFacts>({
    queryKey: ["ai-recommend-facts", params.clientId],
    queryFn: () =>
      api.post("/ai/recommend-facts", {
        clientId: parseInt(params.clientId),
        answers,
        recommendedProducts: data?.recommended || [],
      }),
    enabled: !!data?.recommended?.length,
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

      {/* AI Facts Card */}
      {aiFactsLoading ? (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-primary animate-spin flex-shrink-0" />
            <p className="text-sm text-muted-foreground">{t("recommendation.aiAnalyzing")}</p>
          </CardContent>
        </Card>
      ) : aiFacts?.clientProfile ? (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-primary" />
              {t("recommendation.aiInsights")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-3">
            <p className="text-sm">{aiFacts.clientProfile}</p>

            {aiFacts.whyRecommended && aiFacts.whyRecommended.length > 0 && (
              <div>
                <p className="text-xs font-medium text-primary mb-1">{t("recommendation.whyRecommended")}</p>
                <ul className="space-y-1">
                  {aiFacts.whyRecommended.map((r, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <Check className="w-3 h-3 text-green-600 mt-0.5 flex-shrink-0" />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {aiFacts.riskNotes && aiFacts.riskNotes.length > 0 && (
              <div>
                <p className="text-xs font-medium text-orange-600 mb-1">{t("recommendation.riskNotes")}</p>
                <ul className="space-y-1">
                  {aiFacts.riskNotes.map((r, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <AlertTriangle className="w-3 h-3 text-orange-500 mt-0.5 flex-shrink-0" />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {aiFacts.tips && aiFacts.tips.length > 0 && (
              <div>
                <p className="text-xs font-medium text-blue-600 mb-1">{t("recommendation.tips")}</p>
                <ul className="space-y-1">
                  {aiFacts.tips.map((tip, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <Lightbulb className="w-3 h-3 text-blue-500 mt-0.5 flex-shrink-0" />
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

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
                        {p.rateUzs && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">
                            {t("recommendation.rate")}: {p.rateUzs}
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
