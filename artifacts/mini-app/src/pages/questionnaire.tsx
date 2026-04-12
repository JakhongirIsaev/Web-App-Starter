import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, ChevronRight, Check, Loader2, Sparkles } from "lucide-react";
import { formatIntegerInput, parseIntegerInput } from "@/lib/format";

interface AIQuestion {
  question: string;
  type: "select" | "input";
  options?: Array<{ value: string; label: string }>;
  key: string;
  done: boolean;
  summary?: Record<string, unknown>;
}

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

interface Answer {
  questionKey: string;
  question: string;
  answer: string;
  displayAnswer: string;
  type: "select" | "input";
}

interface QuestionnaireSummary {
  clientType?: string;
  businessType?: string;
  businessSize?: string;
  needType?: string;
  loanPurpose?: string;
  desiredAmount?: string;
  desiredTerm?: string;
  businessLocation?: string;
  collateral?: string;
  creditHistory?: string;
  riskFactors?: string[];
  badges?: string[];
  nextSteps?: string[];
  fitScore?: number;
}

export default function QuestionnairePage() {
  const desiredAmountMin = 1_000_000;
  const desiredAmountMax = 100_000_000_000;
  const { t } = useTranslation();
  const params = useParams<{ clientId: string }>();
  const [, navigate] = useLocation();
  const clientId = Number(params.clientId);
  const totalSteps = 10;

  const [currentQuestion, setCurrentQuestion] = useState<AIQuestion | null>(null);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [finalSummary, setFinalSummary] = useState<QuestionnaireSummary | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bootstrapRef = useRef(false);

  const { data: clientData } = useQuery({
    queryKey: ["mini-questionnaire-client", clientId],
    queryFn: async () => api.get(`/mini-app/clients/${clientId}`),
    enabled: Number.isFinite(clientId),
  });

  const submitMutation = useMutation({
    mutationFn: async ({ finalAnswers }: { finalAnswers: Answer[] }) => {
      const payload = finalAnswers.map(({ questionKey, answer }) => ({ questionKey, answer }));

      return api.post("/mini-app/recommend", { clientId, answers: payload });
    },
    onSuccess: (_data, variables) => {
      const payload = variables.finalAnswers.map(({ questionKey, answer }) => ({ questionKey, answer }));
      navigate(`/recommendation/${params.clientId}?answers=${encodeURIComponent(JSON.stringify(payload))}`);
    },
  });

  const nextQuestionMutation = useMutation({
    mutationFn: async ({ history }: { history: ConversationMessage[]; answers: Answer[] }) => {
      const res = await api.post("/ai/questionnaire/next", {
        clientId,
        conversationHistory: history,
      });
      return res as AIQuestion;
    },
    onSuccess: (data, variables) => {
      if (data.done) {
        setIsComplete(true);
        setCurrentQuestion(null);
        setCurrentAnswer("");
        setFinalSummary((data.summary as QuestionnaireSummary | undefined) || null);
        setConversationHistory((prev) => [...prev, { role: "assistant", content: data.question || t("questionnaire.summaryTitle") }]);
        submitMutation.mutate({ finalAnswers: variables.answers });
        return;
      }

      setCurrentQuestion(data);
      setCurrentAnswer("");
      setConversationHistory((prev) => [...prev, { role: "assistant", content: JSON.stringify(data) }]);
    },
  });

  useEffect(() => {
    if (bootstrapRef.current) return;
    bootstrapRef.current = true;
    nextQuestionMutation.mutate({ history: [], answers: [] });
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [answers, currentQuestion, finalSummary]);

  useEffect(() => {
    setInputError(null);
  }, [currentQuestion?.key]);

  const submitAnswer = (value: string, displayAnswer?: string) => {
    if (!currentQuestion || isLoading) return;

    let rawAnswer = value.trim();
    if (!rawAnswer) return;

    if (currentQuestion.key === "desired_amount") {
      const numericValue = parseIntegerInput(rawAnswer);
      if (!numericValue || numericValue < desiredAmountMin || numericValue > desiredAmountMax) {
        setInputError(
          t("questionnaire.amountRangeError", {
            min: desiredAmountMin.toLocaleString("ru-RU"),
            max: desiredAmountMax.toLocaleString("ru-RU"),
          }),
        );
        return;
      }

      rawAnswer = String(numericValue);
    }

    setInputError(null);

    const visibleAnswer =
      displayAnswer ||
      currentQuestion.options?.find((opt) => opt.value === rawAnswer)?.label ||
      (currentQuestion.key === "desired_amount" ? formatIntegerInput(rawAnswer) : rawAnswer);

    const nextAnswers: Answer[] = [
      ...answers,
      {
        questionKey: currentQuestion.key,
        question: currentQuestion.question,
        answer: rawAnswer,
        displayAnswer: visibleAnswer,
        type: currentQuestion.type,
      },
    ];

    const nextHistory: ConversationMessage[] = [...conversationHistory, { role: "user", content: rawAnswer }];

    setAnswers(nextAnswers);
    setConversationHistory(nextHistory);
    nextQuestionMutation.mutate({ history: nextHistory, answers: nextAnswers });
  };

  const isLoading = nextQuestionMutation.isPending || submitMutation.isPending;
  const currentStep = Math.min(answers.length + (currentQuestion ? 1 : 0), totalSteps);
  const clientName = clientData?.client?.fullName || t("clientDetail.title");
  const clientStatus = clientData?.client?.status ? t(`statuses.${clientData.client.status}`) : "—";
  const summaryItems = finalSummary
      ? [
        { label: t("questionnaire.clientType"), value: finalSummary.clientType },
        { label: t("questionnaire.businessType"), value: finalSummary.businessType },
        { label: t("questionnaire.businessSize"), value: finalSummary.businessSize },
        { label: t("questionnaire.needType"), value: finalSummary.needType },
        { label: t("questionnaire.loanPurpose"), value: finalSummary.loanPurpose },
        { label: t("questionnaire.desiredAmount"), value: finalSummary.desiredAmount },
        { label: t("questionnaire.desiredTerm"), value: finalSummary.desiredTerm },
        { label: t("questionnaire.businessLocation"), value: finalSummary.businessLocation },
        { label: t("questionnaire.collateral"), value: finalSummary.collateral },
        { label: t("questionnaire.creditHistory"), value: finalSummary.creditHistory },
      ].filter((item) => Boolean(item.value))
    : [];

  return (
    <div className="space-y-4 pb-6">
      <button
        onClick={() => navigate(`/clients/${params.clientId}`)}
        className="flex items-center gap-1 text-sm text-muted-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        {t("common.back")}
      </button>

      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-background to-emerald-50/70">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-bold truncate">{clientName}</h1>
                <p className="text-sm text-muted-foreground truncate">{clientData?.client?.phone || t("clients.noPhone")}</p>
              </div>
            </div>
            <Badge variant="secondary" className="shrink-0 rounded-full px-3 py-1 text-xs">
              {t("questionnaire.step", { current: Math.max(1, currentStep), total: totalSteps })}
            </Badge>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="rounded-full border-primary/20 bg-white/70 text-primary">
              {t("questionnaire.aiSubtitle")}
            </Badge>
            <span>{clientStatus}</span>
          </div>

          <div className="grid grid-cols-8 gap-1">
            {Array.from({ length: totalSteps }).map((_, index) => (
              <div
                key={index}
                className={`h-1.5 rounded-full transition-colors ${index < currentStep ? "bg-primary" : "bg-border"}`}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {summaryItems.length > 0 && isComplete && (
        <Card className="border-emerald-200 bg-emerald-50/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600" />
              {t("questionnaire.summaryTitle")}
            </CardTitle>
            <CardDescription>{t("questionnaire.summaryHint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              {summaryItems.map((item) => (
                <div key={item.label} className="rounded-xl bg-white/80 border border-emerald-100 p-2.5">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{item.label}</div>
                  <div className="mt-1 font-medium text-foreground">{String(item.value)}</div>
                </div>
              ))}
            </div>

            {finalSummary?.badges && finalSummary.badges.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {finalSummary.badges.map((badge) => (
                  <Badge key={badge} variant="outline" className="rounded-full bg-white/80">
                    {badge}
                  </Badge>
                ))}
              </div>
            )}

            {finalSummary?.riskFactors && finalSummary.riskFactors.length > 0 && (
              <div className="rounded-xl bg-white/80 border border-emerald-100 p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">{t("recommendation.riskNotes")}</p>
                <ul className="space-y-1 text-sm">
                  {finalSummary.riskFactors.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-emerald-600 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {submitMutation.isPending && (
              <div className="flex items-center gap-3 rounded-xl bg-white/80 border border-emerald-100 p-3">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <div>
                  <p className="text-sm font-medium">{t("questionnaire.submitting")}</p>
                  <p className="text-xs text-muted-foreground">{t("questionnaire.summaryHint")}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {answers.map((item) => (
          <div key={`${item.questionKey}-${item.answer}-${item.question}`} className="space-y-2">
            <div className="flex justify-start">
              <div className="max-w-[88%] rounded-2xl rounded-bl-md bg-muted px-4 py-3 text-sm leading-relaxed text-foreground">
                {item.question}
              </div>
            </div>
            <div className="flex justify-end">
              <div className="max-w-[88%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm leading-relaxed text-primary-foreground">
                {item.displayAnswer}
              </div>
            </div>
          </div>
        ))}
      </div>

      {isLoading && !currentQuestion ? (
        <Card>
          <CardContent className="p-6 text-center space-y-3">
            <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto" />
            <p className="text-sm text-muted-foreground">{t("questionnaire.aiThinking")}</p>
          </CardContent>
        </Card>
      ) : currentQuestion && !isComplete ? (
        <Card className="overflow-hidden border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base leading-snug">{currentQuestion.question}</CardTitle>
            <CardDescription>{t("questionnaire.aiSubtitle")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {currentQuestion.type === "select" && currentQuestion.options ? (
              <div className="space-y-2">
                {currentQuestion.options.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setCurrentAnswer(opt.value);
                      submitAnswer(opt.value, opt.label);
                    }}
                    disabled={isLoading}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition-all flex items-center justify-between ${
                      currentAnswer === opt.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40 bg-background"
                    }`}
                  >
                    <span className="text-sm font-medium">{opt.label}</span>
                    {currentAnswer === opt.value ? (
                      <Check className="w-4 h-4 text-primary" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <Input
                  value={currentAnswer}
                  onChange={(e) => {
                    const nextValue =
                      currentQuestion.key === "desired_amount"
                        ? formatIntegerInput(e.target.value)
                        : e.target.value;
                    setCurrentAnswer(nextValue);
                    if (inputError) setInputError(null);
                  }}
                  placeholder={
                    currentQuestion.key === "desired_amount"
                      ? t("questionnaire.desiredAmountPlaceholder")
                      : currentQuestion.key === "business_location"
                        ? t("questionnaire.businessLocationPlaceholder")
                        : t("questionnaire.inputPlaceholder")
                  }
                  className="text-base h-12 rounded-2xl"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && currentAnswer.trim()) {
                      submitAnswer(currentAnswer);
                    }
                  }}
                />
                {currentQuestion.key === "desired_amount" && (
                  <p className="text-xs text-muted-foreground">
                    {t("questionnaire.desiredAmountHint", {
                      min: desiredAmountMin.toLocaleString("ru-RU"),
                      max: desiredAmountMax.toLocaleString("ru-RU"),
                    })}
                  </p>
                )}
                {inputError && <p className="text-xs text-destructive">{inputError}</p>}
                <Button
                  className="w-full gap-1 h-12 rounded-2xl"
                  onClick={() => submitAnswer(currentAnswer)}
                  disabled={!currentAnswer.trim() || isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t("questionnaire.aiThinking")}
                    </>
                  ) : (
                    <>
                      {t("common.next")}
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {isComplete && !submitMutation.isPending && (
        <Card className="border-dashed border-primary/30 bg-primary/5">
          <CardContent className="p-5 text-center space-y-2">
            <Check className="w-10 h-10 text-primary mx-auto" />
            <p className="text-sm font-semibold">{t("questionnaire.summaryTitle")}</p>
            <p className="text-xs text-muted-foreground">{t("questionnaire.summaryHint")}</p>
          </CardContent>
        </Card>
      )}

      <div ref={scrollRef} />
    </div>
  );
}
