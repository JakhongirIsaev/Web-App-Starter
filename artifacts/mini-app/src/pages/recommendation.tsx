import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeft,
  Check,
  Loader2,
  Sparkles,
  ShoppingCart,
  Calculator,
  ChevronDown,
  ArrowUpDown,
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
  _language: "ru" | "uz",
  values: {
    purpose?: string | null;
    highlight?: string | null;
    amount?: string | null;
    rate?: string | null;
  },
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const parts = [
    values.purpose?.trim() || null,
    values.highlight?.trim() || null,
    values.amount?.trim()
      ? t("recommendation.amountLabel", { value: values.amount.trim() })
      : null,
    values.rate?.trim()
      ? t("recommendation.rateLabel", { value: values.rate.trim() })
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
  const [sortOpen, setSortOpen] = useState(false);
  const currentLanguage = i18n.language === "ru" ? "ru" : "uz";

  const urlParams = new URLSearchParams(window.location.search);
  const answersStr = urlParams.get("answers");
  const queryAnswers: RecommendationAnswer[] = (() => {
    if (!answersStr) return [];
    try {
      return JSON.parse(answersStr);
    } catch {
      try {
        return JSON.parse(decodeURIComponent(answersStr));
      } catch {
        return [];
      }
    }
  })();

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
          buildClientFacingSummary(
            currentLanguage,
            {
              purpose: displayPurpose,
              highlight: displayHighlight,
              amount: displayAmount,
              rate: displayRate,
            },
            t,
          ),
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
        .map((product: ProductRecord) => {
          const item: Record<string, unknown> = {
            productType: product.productType || "credit",
            productName: product.name,
          };
          if (product.productType !== "non_credit" && typeof product.id === "number") {
            item.productId = product.id;
          }
          const summary = product.clientFacingSummary?.trim();
          if (summary) item.notes = summary;
          return item;
        });

      return api.post("/mini-app/basket", {
        clientId: parseInt(params.clientId),
        items,
      });
    },
    onSuccess: () => navigate(`/basket/${params.clientId}`),
    onError: (err: any) => {
      const message = err?.body?.message || err?.message || t("common.error");
      window.alert(message);
    },
  });

  const toggleProduct = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clientName = savedQuestionnaireQuery.data?.fullName || t("recommendation.title");
  const matchPercent = (confidence: number) => Math.round((confidence || 0) * 100);

  const pluralize = (count: number, one: string, few: string, many: string) => {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
    return many;
  };

  /* ═══════════════ LOADING STATE ═══════════════ */
  if (isLoading) {
    return (
      <div style={{ background: "#F4F4F5" }} className="min-h-screen">
        <div className="bg-white px-5 pt-4 pb-5">
          <button
            onClick={() => navigate(`/clients/${params.clientId}`)}
            className="w-9 h-9 rounded-full flex items-center justify-center mb-4"
            style={{ background: "#F1F5F9" }}
          >
            <ArrowLeft className="w-[18px] h-[18px]" style={{ color: "#0F172A" }} />
          </button>
        </div>
        <div className="flex items-center justify-center gap-2 p-12">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#A855F7" }} />
          <span className="text-[14px]" style={{ color: "#64748B" }}>
            {t("common.loading")}
          </span>
        </div>
      </div>
    );
  }

  /* ═══════════════ NO ANSWERS STATE ═══════════════ */
  if (!isLoading && answers.length === 0) {
    // Post-B3 the questionnaire page is gone; send the user back to the
    // client detail page where the fixed-form CTA lives.
    return (
      <div style={{ background: "#F4F4F5" }} className="min-h-screen">
        <div className="bg-white px-5 pt-4 pb-5">
          <button
            onClick={() => navigate(`/clients/${params.clientId}`)}
            className="w-9 h-9 rounded-full flex items-center justify-center mb-4"
            style={{ background: "#F1F5F9" }}
          >
            <ArrowLeft className="w-[18px] h-[18px]" style={{ color: "#0F172A" }} />
          </button>
          <p className="text-[14px]" style={{ color: "#64748B" }}>
            {t("recommendation.fillQuestionnaireFirst")}
          </p>
          <button
            onClick={() => navigate(`/clients/${params.clientId}`)}
            className="mt-4 px-5 py-3 rounded-xl text-[14px] font-semibold text-white"
            style={{ background: "#16A34A" }}
          >
            {t("recommendation.backToQuestionnaire")}
          </button>
        </div>
      </div>
    );
  }

  /* ═══════════════ MAIN CONTENT ═══════════════ */
  return (
    <div style={{ background: "#F4F4F5" }} className="min-h-screen pb-36">
      {/* ═══════════════ HEADER ═══════════════ */}
      <div className="bg-white px-5 pt-4 pb-5">
        {/* Back button */}
        <button
          onClick={() => navigate(`/clients/${params.clientId}`)}
          className="w-9 h-9 rounded-full flex items-center justify-center mb-4"
          style={{ background: "#F1F5F9" }}
        >
          <ArrowLeft className="w-[18px] h-[18px]" style={{ color: "#0F172A" }} />
        </button>

        {/* Violet icon box + label */}
        <div className="flex items-center gap-2.5 mb-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "#FAF5FF", color: "#A855F7" }}
          >
            <Sparkles className="w-5 h-5" />
          </div>
          <span
            className="text-[11px] font-bold tracking-[0.08em] uppercase"
            style={{ color: "#A855F7" }}
          >
            {t("recommendation.aiSelection")}
          </span>
        </div>

        {/* Title */}
        <h1
          className="text-[20px] font-bold tracking-tight leading-tight"
          style={{ color: "#0F172A" }}
        >
          {t("recommendation.headerTitle", {
            name: clientName,
            count: visibleProducts.length,
            form: pluralize(
              visibleProducts.length,
              t("recommendation.variantOne"),
              t("recommendation.variantFew"),
              t("recommendation.variantMany"),
            ),
          })}
        </h1>
        <p className="text-[13px] mt-1" style={{ color: "#64748B" }}>
          {t("recommendation.aiSortedDescription")}
        </p>

        {/* Tab toggle: Recommended / All */}
        {!showAll && (
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setShowAll(false)}
              className="px-4 py-2 rounded-full text-[13px] font-semibold"
              style={{
                background: "#16A34A",
                color: "#fff",
              }}
            >
              {t("recommendation.recommended")}
            </button>
            <button
              onClick={() => setShowAll(true)}
              className="px-4 py-2 rounded-full text-[13px] font-semibold"
              style={{
                background: "#F1F5F9",
                color: "#64748B",
              }}
            >
              {t("recommendation.allProducts")}
            </button>
          </div>
        )}
        {showAll && (
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setShowAll(false)}
              className="px-4 py-2 rounded-full text-[13px] font-semibold"
              style={{
                background: "#F1F5F9",
                color: "#64748B",
              }}
            >
              {t("recommendation.recommended")}
            </button>
            <button
              onClick={() => setShowAll(true)}
              className="px-4 py-2 rounded-full text-[13px] font-semibold"
              style={{
                background: "#16A34A",
                color: "#fff",
              }}
            >
              {t("recommendation.allProducts")}
            </button>
          </div>
        )}
      </div>

      {/* ═══════════════ SORT BAR ═══════════════ */}
      <div className="flex items-center justify-between px-5 py-3">
        <span className="text-[13px] font-semibold" style={{ color: "#0F172A" }}>
          {visibleProducts.length}{" "}
          {pluralize(
            visibleProducts.length,
            t("recommendation.offersOne"),
            t("recommendation.offersFew"),
            t("recommendation.offersMany"),
          )}
        </span>
        <button
          onClick={() => setSortOpen(!sortOpen)}
          className="flex items-center gap-1 text-[13px] font-medium"
          style={{ color: "#64748B" }}
        >
          <ArrowUpDown className="w-3.5 h-3.5" />
          {t("recommendation.sortByMatch")}
          <ChevronDown
            className="w-3.5 h-3.5 transition-transform"
            style={{ transform: sortOpen ? "rotate(180deg)" : "rotate(0)" }}
          />
        </button>
      </div>

      {/* ═══════════════ PRODUCT CARDS ═══════════════ */}
      {visibleProducts.length === 0 ? (
        <div className="mx-5 mn-card p-8 text-center">
          <p className="text-[14px]" style={{ color: "#64748B" }}>
            {t("recommendation.noProducts")}
          </p>
        </div>
      ) : (
        <div className="px-4 space-y-3">
          {visibleProducts.map((product: ProductRecord, index: number) => {
            const isSelected = selectedIds.has(product.id);
            const confidence = matchPercent(product.aiRecommendation?.confidence);
            const isBest = index === 0 && !showAll && confidence > 0;
            const reasons = [
              product.displayHighlight,
              product.displayPurpose,
              product.displaySegment,
            ].filter(Boolean);

            return (
              <div
                key={product.id}
                className="relative rounded-2xl overflow-hidden"
                style={{
                  background: "#fff",
                  boxShadow: isSelected
                    ? "0 0 0 2px #16A34A, 0 2px 8px rgba(22,163,74,0.12)"
                    : "0 1px 3px rgba(15,23,42,0.06)",
                }}
              >
                {/* Best match badge */}
                {isBest && (
                  <div
                    className="absolute top-0 right-0 px-3 py-1.5 text-[11px] font-bold text-white"
                    style={{
                      background: "#16A34A",
                      borderRadius: "0 16px 0 12px",
                    }}
                  >
                    {t("recommendation.bestMatch")}
                  </div>
                )}

                <div className="p-4">
                  {/* Product name + key stats */}
                  <div className="pr-20">
                    <h3
                      className="text-[15px] font-bold leading-snug"
                      style={{ color: "#0F172A" }}
                    >
                      {product.name}
                    </h3>
                  </div>

                  {/* Rate / Term / Amount row */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                    {product.displayRate && (
                      <div className="text-[12px]" style={{ color: "#64748B" }}>
                        {t("recommendation.rateInline")}{" "}
                        <span className="font-semibold" style={{ color: "#0F172A" }}>
                          {product.displayRate}
                        </span>
                      </div>
                    )}
                    {product.displayAmount && (
                      <div className="text-[12px]" style={{ color: "#64748B" }}>
                        {t("recommendation.amountInline")}{" "}
                        <span className="font-semibold" style={{ color: "#0F172A" }}>
                          {product.displayAmount}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Match percentage + progress bar */}
                  {confidence > 0 && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span
                          className="text-[12px] font-medium"
                          style={{ color: "#64748B" }}
                        >
                          {t("recommendation.matchLabel")}
                        </span>
                        <span
                          className="text-[13px] font-bold"
                          style={{
                            color:
                              confidence >= 80
                                ? "#16A34A"
                                : confidence >= 50
                                  ? "#D97706"
                                  : "#64748B",
                          }}
                        >
                          {confidence}%
                        </span>
                      </div>
                      <div
                        className="h-[5px] rounded-full overflow-hidden"
                        style={{ background: "#F1F5F9" }}
                      >
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${confidence}%`,
                            background:
                              confidence >= 80
                                ? "#16A34A"
                                : confidence >= 50
                                  ? "#D97706"
                                  : "#94A3B8",
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Reason chips */}
                  {reasons.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {reasons.slice(0, 3).map((reason, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium"
                          style={{ background: "#ECFDF3", color: "#15803D" }}
                        >
                          <Check className="w-3 h-3" />
                          <span className="truncate max-w-[160px]">{reason}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Client-facing summary */}
                  {product.clientFacingSummary && (
                    <p
                      className="text-[12px] leading-[18px] mt-3 line-clamp-3"
                      style={{ color: "#64748B" }}
                    >
                      {product.clientFacingSummary}
                    </p>
                  )}

                  {/* Action buttons row */}
                  <div className="flex gap-2.5 mt-4">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate("/calculator");
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[13px] font-semibold transition-colors"
                      style={{
                        border: "1.5px solid #E2E8F0",
                        color: "#0F172A",
                        background: "#fff",
                      }}
                    >
                      <Calculator className="w-4 h-4" />
                      {t("recommendation.calculatorButton")}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleProduct(product.id);
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[13px] font-semibold transition-colors"
                      style={{
                        background: isSelected ? "#15803D" : "#16A34A",
                        color: "#fff",
                      }}
                    >
                      {isSelected ? (
                        <>
                          <Check className="w-4 h-4" />
                          {t("recommendation.added")}
                        </>
                      ) : (
                        <>
                          <ShoppingCart className="w-4 h-4" />
                          {t("recommendation.addToCart")}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* AI hint */}
      {!showAll && aiRecommendationsQuery.isFetching && (
        <p className="text-center text-[12px] mt-4" style={{ color: "#64748B" }}>
          {t("recommendation.aiHint")}
        </p>
      )}

      {/* ═══════════════ FLOATING BASKET BUTTON ═══════════════ */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-24 left-4 right-4 z-50 mx-auto max-w-md">
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-[15px] font-bold text-white"
            style={{
              background: "#16A34A",
              boxShadow: "0 8px 24px rgba(22,163,74,0.3)",
            }}
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <ShoppingCart className="h-5 w-5" />
            )}
            {t("recommendation.goToBasket")} ({selectedIds.size})
          </button>
        </div>
      )}
    </div>
  );
}
