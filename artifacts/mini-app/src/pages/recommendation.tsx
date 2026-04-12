import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  const clientId = Number(params.clientId);

  const urlParams = new URLSearchParams(window.location.search);
  const answersStr = urlParams.get("answers");
  let answers: Array<{ questionKey: string; answer: string }> = [];
  try {
    answers = answersStr ? JSON.parse(answersStr) : [];
  } catch {
    answers = [];
  }

  const { data: clientData } = useQuery({
    queryKey: ["mini-recommend-client", clientId],
    queryFn: () => api.get(`/mini-app/clients/${clientId}`),
    enabled: Number.isFinite(clientId),
  });

  const { data } = useQuery({
    queryKey: ["mini-recommend", params.clientId, answersStr],
    queryFn: () => api.post("/mini-app/recommend", { clientId, answers }),
  });

  const { data: allProducts } = useQuery({
    queryKey: ["mini-all-products"],
    queryFn: () => api.get("/mini-app/products"),
    enabled: showAll,
  });

  const { data: aiFacts, isLoading: aiFactsLoading } = useQuery<AIFacts>({
    queryKey: ["ai-recommend-facts", params.clientId, answersStr],
    queryFn: () =>
      api.post("/ai/recommend-facts", {
        clientId,
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
  const clientName = clientData?.client?.fullName || t("recommendation.title");
  const currentStatus = clientData?.client?.status ? t(`statuses.${clientData.client.status}`) : "—";

  return (
    <div className="space-y-4 pb-4">
      <button onClick={() => navigate(`/clients/${params.clientId}`)} className="flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="w-4 h-4" />
        {t("common.back")}
      </button>

      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-amber-50 via-background to-emerald-50/70">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <Badge variant="outline" className="rounded-full border-primary/20 bg-white/80 text-primary">
                  {t("recommendation.aiInsights")}
                </Badge>
              </div>
              <h1 className="text-lg font-bold truncate">{clientName}</h1>
              <p className="text-sm text-muted-foreground">
                {t("recommendation.found", { count: products.length })}
              </p>
            </div>
            <Badge variant="secondary" className="shrink-0 rounded-full px-3 py-1 text-xs">
              {currentStatus}
            </Badge>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-2xl border border-white/80 bg-white/80 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("recommendation.recommended")}</div>
              <div className="mt-1 font-semibold text-foreground">{data?.recommended?.length || 0}</div>
            </div>
            <div className="rounded-2xl border border-white/80 bg-white/80 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("recommendation.selectedCount", { count: selectedIds.size })}</div>
              <div className="mt-1 font-semibold text-foreground">{selectedIds.size}</div>
            </div>
            <div className="rounded-2xl border border-white/80 bg-white/80 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("recommendation.allProducts")}</div>
              <div className="mt-1 font-semibold text-foreground">{showAll ? (allProducts || []).length : data?.recommended?.length || 0}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI Facts Card */}
      {aiFactsLoading ? (
        <Card className="border-primary/20 bg-primary/5 rounded-2xl">
          <CardContent className="p-4 flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-primary animate-spin flex-shrink-0" />
            <p className="text-sm text-muted-foreground">{t("recommendation.aiAnalyzing")}</p>
          </CardContent>
        </Card>
      ) : aiFacts?.clientProfile ? (
        <Card className="border-primary/20 bg-primary/5 rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-primary" />
              {t("recommendation.aiInsights")}
            </CardTitle>
            <CardDescription>{aiFacts.clientProfile}</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-3">
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
                className={`cursor-pointer transition-all rounded-2xl ${isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-border/70"}`}
                onClick={() => toggleProduct(p.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${isSelected ? "bg-primary" : "bg-secondary"}`}>
                      {isSelected ? (
                        <Check className="w-4 h-4 text-primary-foreground" />
                      ) : (
                        <Plus className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold leading-snug">{p.name}</p>
                        <div className="flex flex-wrap gap-2 mt-1.5">
                          {p.segment && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                              {p.segment}
                            </span>
                          )}
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                            {t("recommendation.rateDependsOnProject")}
                          </span>
                          {p.loanAmount && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">
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
          <div className="rounded-2xl border border-primary/20 bg-background/95 backdrop-blur shadow-lg p-3 space-y-2">
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>{t("recommendation.selectedCount", { count: selectedIds.size })}</span>
              <span>{showAll ? t("recommendation.allProducts") : t("recommendation.recommended")}</span>
            </div>
            <Button
              className="w-full gap-2 shadow-none rounded-xl"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
              {t("recommendation.goToBasket")} ({selectedIds.size})
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
