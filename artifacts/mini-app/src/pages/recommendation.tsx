import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeft,
  Check,
  Loader2,
  Plus,
  ShoppingCart,
  Sparkles,
} from "lucide-react";

type RecommendationAnswer = {
  questionKey: string;
  answer: string;
};

type ProductRecord = Record<string, any>;

function countMatches(value: string, pattern: RegExp) {
  return value.match(pattern)?.length ?? 0;
}

function isTextCompatibleWithLanguage(
  value: string | null | undefined,
  language: "ru" | "uz",
) {
  if (!value?.trim()) return false;

  const text = value.trim();
  const cyrillic = countMatches(text, /[\u0400-\u04FF]/g);
  const latin = countMatches(text, /[A-Za-z]/g);

  if (language === "ru") {
    return cyrillic > 0 || latin === 0;
  }

  return cyrillic <= Math.max(1, Math.floor(latin / 3));
}

function buildRateFallback(product: ProductRecord) {
  return [product.rateUZS, product.rateUSD, product.rateEUR]
    .filter(Boolean)
    .join(" | ");
}

function buildClientFacingSummary(
  language: "ru" | "uz",
  values: {
    purpose?: string | null;
    highlight?: string | null;
    amount?: string | null;
    rate?: string | null;
  },
) {
  const parts = [
    values.purpose?.trim() || null,
    values.highlight?.trim() || null,
    values.amount?.trim()
      ? language === "ru"
        ? `Сумма: ${values.amount.trim()}.`
        : `Summa: ${values.amount.trim()}.`
      : null,
    values.rate?.trim()
      ? language === "ru"
        ? `Ставка: ${values.rate.trim()}.`
        : `Stavka: ${values.rate.trim()}.`
      : null,
  ].filter(Boolean);

  return parts.join(" ");
}

function truncateText(value: string | null, maxLength = 220) {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

export default function RecommendationPage() {
  const { t, i18n } = useTranslation();
  const params = useParams<{ clientId: string }>();
  const [, navigate] = useLocation();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const currentLanguage = i18n.language === "ru" ? "ru" : "uz";

  const urlParams = new URLSearchParams(window.location.search);
  const answersStr = urlParams.get("answers");
  const queryAnswers: RecommendationAnswer[] = answersStr
    ? JSON.parse(decodeURIComponent(answersStr))
    : [];

  const savedQuestionnaireQuery = useQuery({
    queryKey: ["mini-client-questionnaire", params.clientId],
    queryFn: () => api.get(`/mini-app/clients/${params.clientId}`),
    enabled: queryAnswers.length === 0,
    retry: false,
  });

  const savedAnswers: RecommendationAnswer[] = Array.isArray(
    savedQuestionnaireQuery.data?.questionnaireAnswers,
  )
    ? savedQuestionnaireQuery.data.questionnaireAnswers
    : [];

  const answers = queryAnswers.length > 0 ? queryAnswers : savedAnswers;
  const serializedAnswers = JSON.stringify(answers);
  const answerMap = new Map(answers.map((item) => [item.questionKey, item.answer]));
  const needType = answerMap.get("need_type") || undefined;

  const { data, isLoading } = useQuery({
    queryKey: ["mini-recommend", params.clientId, currentLanguage, serializedAnswers],
    queryFn: () =>
      api.post("/mini-app/recommend", {
        clientId: parseInt(params.clientId),
        answers,
        language: currentLanguage,
      }),
    enabled: answers.length > 0,
  });

  const { data: allProducts = [] } = useQuery({
    queryKey: ["mini-all-products", needType ?? "credit"],
    queryFn: () =>
      api.get(
        `/mini-app/products${needType ? `?needType=${encodeURIComponent(needType)}` : ""}`,
      ),
    enabled: showAll,
  });

  const aiRecommendationsQuery = useQuery({
    queryKey: [
      "mini-ai-recommend",
      params.clientId,
      currentLanguage,
      serializedAnswers,
      data?.recommended?.map((product: ProductRecord) => product.id).join(",") ?? "",
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
        language: currentLanguage,
        questionnaireAnswers: answers,
        allowedProducts: (data?.recommended || []).map((product: ProductRecord) => ({
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

  const aiRecommendationMap = useMemo(
    () =>
      new Map(
        (aiRecommendationsQuery.data?.recommendations || []).map((item: ProductRecord) => [
          typeof item.productId === "number" ? item.productId : item.productName,
          item,
        ]),
      ),
    [aiRecommendationsQuery.data?.recommendations],
  );

  const getDisplayValue = (
    localizedValue: string | null | undefined,
    fallbackValue: string | null | undefined,
  ) => {
    if (localizedValue?.trim() && isTextCompatibleWithLanguage(localizedValue, currentLanguage)) {
      return localizedValue.trim();
    }

    if (
      fallbackValue?.trim() &&
      currentLanguage === "ru" &&
      isTextCompatibleWithLanguage(fallbackValue, currentLanguage)
    ) {
      return fallbackValue.trim();
    }

    if (
      fallbackValue?.trim() &&
      currentLanguage === "uz" &&
      !/[\u0400-\u04FF]/.test(fallbackValue)
    ) {
      return fallbackValue.trim();
    }

    return null;
  };

  const baseProducts = showAll ? allProducts : data?.recommended || [];
  const products = baseProducts.map((product: ProductRecord) => {
    const aiRecommendation: ProductRecord | null =
      aiRecommendationMap.get(product.id) ||
      aiRecommendationMap.get(product.name) ||
      null;
    const displaySegment = getDisplayValue(
      aiRecommendation?.localizedSegment,
      product.segment,
    );
    const displayRate = getDisplayValue(
      aiRecommendation?.localizedRate,
      buildRateFallback(product),
    );
    const displayAmount = getDisplayValue(
      aiRecommendation?.localizedLoanAmount,
      product.loanAmount,
    );
    const displayPurpose = getDisplayValue(
      aiRecommendation?.localizedPurpose,
      product.purpose,
    );
    const displayHighlight = getDisplayValue(
      aiRecommendation?.localizedHighlight,
      product.highlight,
    );
    const displayExplanation = isTextCompatibleWithLanguage(
      aiRecommendation?.explanation,
      currentLanguage,
    )
      ? truncateText(aiRecommendation?.explanation?.trim() || null)
      : currentLanguage === "ru" &&
          isTextCompatibleWithLanguage(product.whySuitable, currentLanguage)
        ? truncateText(product.whySuitable)
        : null;

    return {
      ...product,
      aiRecommendation,
      displaySegment,
      displayRate,
      displayAmount,
      displayPurpose,
      displayHighlight,
      displayExplanation,
      clientFacingSummary:
        displayExplanation ||
        truncateText(
          buildClientFacingSummary(currentLanguage, {
            purpose: displayPurpose,
            highlight: displayHighlight,
            amount: displayAmount,
            rate: displayRate,
          }),
        ) ||
        null,
    };
  });

  const visibleProducts = showAll
    ? products
    : [...products].sort((left: ProductRecord, right: ProductRecord) => {
        const leftRank = left.aiRecommendation?.rank ?? Number.MAX_SAFE_INTEGER;
        const rightRank = right.aiRecommendation?.rank ?? Number.MAX_SAFE_INTEGER;
        if (leftRank !== rightRank) return leftRank - rightRank;
        return left.name.localeCompare(right.name);
      });

  const saveMutation = useMutation({
    mutationFn: () => {
      const items = visibleProducts
        .filter((product: ProductRecord) => selectedIds.has(product.id))
        .map((product: ProductRecord) => ({
          productId: product.productType === "non_credit" ? null : product.id,
          productType: product.productType || "credit",
          productName: product.name,
          notes: product.clientFacingSummary || null,
        }));

      return api.post("/mini-app/basket", {
        clientId: parseInt(params.clientId),
        items,
      });
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

  if (isLoading) {
    return (
      <div className="space-y-4 pb-8">
        <button
          onClick={() => navigate(`/clients/${params.clientId}`)}
          className="flex items-center gap-1 text-sm text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("common.back")}
        </button>
        <Card>
          <CardContent className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("common.loading")}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isLoading && answers.length === 0) {
    return (
      <div className="space-y-4 pb-8">
        <button
          onClick={() => navigate(`/questionnaire/${params.clientId}`)}
          className="flex items-center gap-1 text-sm text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("common.back")}
        </button>
        <Card>
          <CardContent className="space-y-3 p-6 text-sm text-muted-foreground">
            <p>
              {currentLanguage === "ru"
                ? "Сначала заполните анкету клиента, чтобы Minerva смогла задать уточняющие вопросы и подобрать подходящие продукты."
                : "Avval mijoz anketasini to'ldiring, shunda Minerva aniqlashtiruvchi savollar berib, mos mahsulotlarni tavsiya qiladi."}
            </p>
            <Button onClick={() => navigate(`/questionnaire/${params.clientId}`)}>
              {currentLanguage === "ru"
                ? "Вернуться к анкете"
                : "So'rovnomaga qaytish"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-36">
      <button
        onClick={() => navigate(`/clients/${params.clientId}`)}
        className="flex items-center gap-1 text-sm text-muted-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("common.back")}
      </button>

      <div className="space-y-2">
        <div>
          <h1 className="text-lg font-bold">{t("recommendation.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("recommendation.found", { count: visibleProducts.length })}
          </p>
        </div>

        {!showAll && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="flex items-start gap-3 p-3">
              <div className="rounded-xl bg-primary/10 p-2 text-primary">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-primary">
                  {currentLanguage === "ru"
                    ? "AI учёл ответы анкеты"
                    : "AI so'rovnoma javoblarini hisobga oldi"}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {currentLanguage === "ru"
                    ? "Карточки ниже отсортированы по итоговому приоритету, а описания показываются только на выбранном языке."
                    : "Quyidagi kartalar yakuniy ustuvorlik bo'yicha saralangan va tavsiflar faqat tanlangan tilda ko'rsatiladi."}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
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

      {visibleProducts.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            {t("recommendation.noProducts")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visibleProducts.map((product: ProductRecord) => {
            const isSelected = selectedIds.has(product.id);

            return (
              <Card
                key={product.id}
                className={`cursor-pointer overflow-hidden transition-colors ${
                  isSelected ? "border-primary bg-primary/5" : ""
                }`}
                onClick={() => toggleProduct(product.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${
                        isSelected ? "bg-primary" : "bg-secondary"
                      }`}
                    >
                      {isSelected ? (
                        <Check className="h-4 w-4 text-primary-foreground" />
                      ) : (
                        <Plus className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-base font-semibold leading-6">
                            {product.name}
                          </p>
                          {product.displayPurpose && (
                            <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">
                              {product.displayPurpose}
                            </p>
                          )}
                        </div>

                        {product.aiRecommendation && (
                          <div className="flex flex-wrap gap-1.5 sm:max-w-[160px] sm:justify-end">
                            <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-medium text-amber-800">
                              {t("recommendation.aiRank", {
                                rank: product.aiRecommendation.rank,
                              })}
                            </span>
                            <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-medium text-emerald-800">
                              {t("recommendation.aiConfidence", {
                                value: Math.round(
                                  (product.aiRecommendation.confidence || 0) * 100,
                                ),
                              })}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        {product.displaySegment && (
                          <div className="rounded-2xl bg-slate-50 px-3 py-2">
                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              {t("recommendation.segment")}
                            </p>
                            <p className="mt-1 text-sm font-medium">
                              {product.displaySegment}
                            </p>
                          </div>
                        )}
                        {product.displayRate && (
                          <div className="rounded-2xl bg-slate-50 px-3 py-2">
                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              {t("recommendation.rate")}
                            </p>
                            <p className="mt-1 text-sm font-medium leading-5">
                              {product.displayRate}
                            </p>
                          </div>
                        )}
                        {product.displayAmount && (
                          <div className="rounded-2xl bg-slate-50 px-3 py-2 sm:col-span-2">
                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              {t("recommendation.amount")}
                            </p>
                            <p className="mt-1 text-sm font-medium leading-5">
                              {product.displayAmount}
                            </p>
                          </div>
                        )}
                      </div>

                      {product.displayHighlight && (
                        <div className="rounded-2xl border border-primary/10 bg-primary/5 px-3 py-2">
                          <p className="text-[10px] uppercase tracking-wide text-primary/70">
                            {currentLanguage === "ru"
                              ? "Ключевое преимущество"
                              : "Asosiy afzallik"}
                          </p>
                          <p className="mt-1 text-sm leading-6 text-primary">
                            {product.displayHighlight}
                          </p>
                        </div>
                      )}

                      {product.clientFacingSummary && (
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                          <p className="text-[10px] uppercase tracking-wide text-emerald-700">
                            {currentLanguage === "ru"
                              ? "Клиентское описание"
                              : "Mijoz uchun qisqa tavsif"}
                          </p>
                          <p className="mt-1 line-clamp-4 text-sm leading-6 text-emerald-800">
                            {product.clientFacingSummary}
                          </p>
                        </div>
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
        <p className="text-center text-xs text-muted-foreground">
          {t("recommendation.aiHint")}
        </p>
      )}

      {selectedIds.size > 0 && (
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
            {t("recommendation.goToBasket")} ({selectedIds.size})
          </Button>
        </div>
      )}
    </div>
  );
}
