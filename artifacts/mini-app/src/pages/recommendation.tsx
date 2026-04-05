import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, ShoppingCart, Check, Plus } from "lucide-react";

type RecommendationAnswer = {
  questionKey: string;
  answer: string;
};

export default function RecommendationPage() {
  const { t, i18n } = useTranslation();
  const params = useParams<{ clientId: string }>();
  const [, navigate] = useLocation();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showAll, setShowAll] = useState(false);

  const urlParams = new URLSearchParams(window.location.search);
  const answersStr = urlParams.get("answers");
  const answers: RecommendationAnswer[] = answersStr ? JSON.parse(decodeURIComponent(answersStr)) : [];
  const answerMap = new Map(answers.map((item) => [item.questionKey, item.answer]));

  const { data } = useQuery({
    queryKey: ["mini-recommend", params.clientId],
    queryFn: () => api.post("/mini-app/recommend", { clientId: parseInt(params.clientId), answers }),
  });

  const { data: allProducts } = useQuery({
    queryKey: ["mini-all-products"],
    queryFn: () => api.get("/mini-app/products"),
    enabled: showAll,
  });

  const aiRecommendationsQuery = useQuery({
    queryKey: [
      "mini-ai-recommend",
      params.clientId,
      i18n.language,
      answersStr ?? "",
      data?.recommended?.map((product: any) => product.id).join(",") ?? "",
    ],
    enabled: !showAll && Boolean(data?.recommended?.length),
    retry: false,
    queryFn: () =>
      api.post("/ai/recommend-products", {
        clientBusinessType: answerMap.get("business_type") || undefined,
        sector: answerMap.get("business_type") || undefined,
        needsGoals: answers.map((item) => `${item.questionKey}: ${item.answer}`),
        requestedAmount: answerMap.get("desired_amount") || undefined,
        termMonths: answerMap.get("desired_term") || undefined,
        language: i18n.language === "ru" ? "ru" : "uz",
        questionnaireAnswers: answers,
        allowedProducts: (data?.recommended || []).map((product: any) => ({
          id: product.id,
          name: product.name,
          sapCode: product.sapCode,
          segment: product.segment,
          purpose: product.purpose,
          highlight: product.highlight,
          loanAmount: product.loanAmount,
          termWorkingCapital: product.termWorkingCapital,
          termFixedAssets: product.termFixedAssets,
          termUntargeted: product.termUntargeted,
          rateUZS: product.rateUZS,
          rateUSD: product.rateUSD,
          rateEUR: product.rateEUR,
          disbursementForm: product.disbursementForm,
          whySuitable: product.whySuitable,
        })),
      }),
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const products = showAll ? allProducts || [] : data?.recommended || [];
      const items = products
        .filter((product: any) => selectedIds.has(product.id))
        .map((product: any) => ({
          productId: product.id,
          productType: "credit",
          productName: product.name,
          notes: product.whySuitable || null,
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

  const aiRecommendationMap = new Map(
    (aiRecommendationsQuery.data?.recommendations || []).map((item: any) => [
      typeof item.productId === "number" ? item.productId : item.productName,
      item,
    ]),
  );

  const baseProducts = showAll ? allProducts || [] : data?.recommended || [];
  const products = baseProducts.map((product: any) => ({
    ...product,
    aiRecommendation:
      aiRecommendationMap.get(product.id) ||
      aiRecommendationMap.get(product.name) ||
      null,
  }));

  const visibleProducts = showAll
    ? products
    : [...products].sort((left: any, right: any) => {
        const leftRank = left.aiRecommendation?.rank ?? Number.MAX_SAFE_INTEGER;
        const rightRank = right.aiRecommendation?.rank ?? Number.MAX_SAFE_INTEGER;
        if (leftRank !== rightRank) return leftRank - rightRank;
        return left.name.localeCompare(right.name);
      });

  return (
    <div className="space-y-4 pb-4">
      <button
        onClick={() => navigate(`/clients/${params.clientId}`)}
        className="flex items-center gap-1 text-sm text-muted-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        {t("common.back")}
      </button>

      <div>
        <h1 className="text-lg font-bold">{t("recommendation.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("recommendation.found", { count: visibleProducts.length })}
        </p>
      </div>

      <div className="flex gap-2">
        <Button variant={showAll ? "outline" : "default"} size="sm" onClick={() => setShowAll(false)}>
          {t("recommendation.recommended")}
        </Button>
        <Button variant={showAll ? "default" : "outline"} size="sm" onClick={() => setShowAll(true)}>
          {t("recommendation.allProducts")}
        </Button>
      </div>

      {visibleProducts.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            {t("recommendation.noProducts")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {visibleProducts.map((product: any) => {
            const isSelected = selectedIds.has(product.id);
            return (
              <Card
                key={product.id}
                className={`cursor-pointer transition-colors ${isSelected ? "border-primary bg-primary/5" : ""}`}
                onClick={() => toggleProduct(product.id)}
              >
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        isSelected ? "bg-primary" : "bg-secondary"
                      }`}
                    >
                      {isSelected ? (
                        <Check className="w-4 h-4 text-primary-foreground" />
                      ) : (
                        <Plus className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{product.name}</p>
                      <div className="flex flex-wrap gap-2 mt-1.5">
                        {product.aiRecommendation && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                            {t("recommendation.aiRank", { rank: product.aiRecommendation.rank })}
                          </span>
                        )}
                        {product.aiRecommendation && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                            {t("recommendation.aiConfidence", {
                              value: Math.round((product.aiRecommendation.confidence || 0) * 100),
                            })}
                          </span>
                        )}
                        {product.segment && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                            {product.segment}
                          </span>
                        )}
                        {product.rateUZS && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">
                            {t("recommendation.rate")}: {product.rateUZS}
                          </span>
                        )}
                        {product.loanAmount && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                            {product.loanAmount}
                          </span>
                        )}
                      </div>
                      {product.purpose && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{product.purpose}</p>
                      )}
                      {product.aiRecommendation?.explanation && (
                        <p className="text-xs text-primary mt-2">{product.aiRecommendation.explanation}</p>
                      )}
                      {product.whySuitable && product.whySuitable !== product.aiRecommendation?.explanation && (
                        <p className="text-[11px] text-muted-foreground mt-1">{product.whySuitable}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {!showAll && aiRecommendationsQuery.isFetching && (
        <p className="text-xs text-center text-muted-foreground">{t("recommendation.aiHint")}</p>
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
