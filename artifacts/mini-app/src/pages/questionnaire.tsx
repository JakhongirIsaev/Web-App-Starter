import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeft,
  ChevronRight,
  Check,
  Loader2,
  Sparkles,
} from "lucide-react";

interface Answer {
  questionKey: string;
  answer: string;
}

interface QuestionOption {
  value: string;
  label: string;
}

interface QuestionDefinition {
  key: string;
  label: string;
  type: "select" | "input";
  options?: QuestionOption[];
  placeholder?: string;
  helperText?: string | null;
}

function getFallbackQuestions(
  t: (key: string, params?: Record<string, unknown>) => string,
  needType?: string,
): QuestionDefinition[] {
  const isNonCredit = needType === "non_credit";

  if (isNonCredit) {
    return [
      {
        key: "service_goal",
        label: t("questionnaire.nonCreditServiceLabel"),
        type: "select",
        options: [
          { value: "settlement", label: t("questionnaire.nonCreditServiceOptions.rko") },
          { value: "terminal", label: t("questionnaire.nonCreditServiceOptions.pos") },
          { value: "payroll", label: t("questionnaire.nonCreditServiceOptions.salary") },
          { value: "foreign_payments", label: t("questionnaire.nonCreditServiceOptions.forex") },
        ],
      },
      {
        key: "monthly_turnover_band",
        label: t("questionnaire.monthlyTurnoverLabel"),
        type: "select",
        options: [
          { value: "up_to_100m", label: t("questionnaire.monthlyTurnoverOptions.under100m") },
          { value: "100m_to_500m", label: t("questionnaire.monthlyTurnoverOptions.100to500m") },
          { value: "over_500m", label: t("questionnaire.monthlyTurnoverOptions.over500m") },
          { value: "not_sure", label: t("questionnaire.monthlyTurnoverOptions.unclear") },
        ],
      },
      {
        key: "has_pos_need",
        label: t("questionnaire.posNeededLabel"),
        type: "select",
        options: [
          { value: "yes", label: t("questionnaire.posNeededOptions.yes") },
          { value: "later", label: t("questionnaire.posNeededOptions.maybe") },
          { value: "no", label: t("questionnaire.posNeededOptions.no") },
        ],
      },
      {
        key: "foreign_payments_need",
        label: t("questionnaire.intlPaymentsLabel"),
        type: "select",
        options: [
          { value: "yes", label: t("questionnaire.intlPaymentsOptions.yes") },
          { value: "no", label: t("questionnaire.intlPaymentsOptions.no") },
          { value: "not_sure", label: t("questionnaire.intlPaymentsOptions.unclear") },
        ],
      },
    ];
  }

  return [
    {
      key: "preferred_currency",
      label: t("questionnaire.currencyLabel"),
      type: "select",
      helperText: t("questionnaire.currencyHelper"),
      options: [
        { value: "uzs", label: t("questionnaire.currencyOptions.uzs") },
        { value: "usd", label: t("questionnaire.currencyOptions.usd") },
        { value: "eur", label: t("questionnaire.currencyOptions.eur") },
        { value: "not_sure", label: t("questionnaire.currencyOptions.unclear") },
      ],
    },
    {
      key: "monthly_payment_comfort",
      label: t("questionnaire.comfortPaymentLabel"),
      type: "select",
      helperText: t("questionnaire.comfortPaymentHelper"),
      options: [
        { value: "up_to_10m", label: t("questionnaire.comfortPaymentOptions.under10m") },
        { value: "10m_to_30m", label: t("questionnaire.comfortPaymentOptions.10to30m") },
        { value: "over_30m", label: t("questionnaire.comfortPaymentOptions.over30m") },
        { value: "not_sure", label: t("questionnaire.comfortPaymentOptions.unclear") },
      ],
    },
    {
      key: "repayment_preference",
      label: t("questionnaire.repaymentScheduleLabel"),
      type: "select",
      options: [
        { value: "annuity", label: t("questionnaire.repaymentScheduleOptions.equal") },
        { value: "differentiated", label: t("questionnaire.repaymentScheduleOptions.decreasing") },
        { value: "not_sure", label: t("questionnaire.repaymentScheduleOptions.expert") },
      ],
    },
  ];
}

export default function QuestionnairePage() {
  const { t, i18n } = useTranslation();
  const params = useParams<{ clientId: string }>();
  const [, navigate] = useLocation();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [aiQuestions, setAiQuestions] = useState<QuestionDefinition[]>([]);
  const [followUpSource, setFollowUpSource] = useState<"ai" | "fallback" | null>(
    null,
  );

  const currentLanguage = i18n.language === "ru" ? "ru" : "uz";

  const baseQuestions = useMemo<QuestionDefinition[]>(
    () => [
      {
        key: "business_type",
        label: t("questionnaire.businessType"),
        type: "select",
        options: [
          { value: "trade", label: t("questionnaire.businessTypeOptions.trade") },
          {
            value: "services",
            label: t("questionnaire.businessTypeOptions.services"),
          },
          {
            value: "production",
            label: t("questionnaire.businessTypeOptions.production"),
          },
          {
            value: "agriculture",
            label: t("questionnaire.businessTypeOptions.agriculture"),
          },
          { value: "other", label: t("questionnaire.businessTypeOptions.other") },
        ],
      },
      {
        key: "business_size",
        label: t("questionnaire.businessSize"),
        type: "select",
        options: [
          {
            value: "micro",
            label: t("questionnaire.businessSizeOptions.micro"),
          },
          {
            value: "small",
            label: t("questionnaire.businessSizeOptions.small"),
          },
          {
            value: "medium",
            label: t("questionnaire.businessSizeOptions.medium"),
          },
        ],
      },
      {
        key: "need_type",
        label: t("questionnaire.needType"),
        type: "select",
        options: [
          { value: "credit", label: t("questionnaire.needTypeOptions.credit") },
          {
            value: "non_credit",
            label: t("questionnaire.needTypeOptions.non_credit"),
          },
          { value: "both", label: t("questionnaire.needTypeOptions.both") },
        ],
      },
      {
        key: "loan_purpose",
        label: t("questionnaire.loanPurpose"),
        type: "select",
        options: [
          {
            value: "working_capital",
            label: t("questionnaire.loanPurposeOptions.working_capital"),
          },
          {
            value: "fixed_assets",
            label: t("questionnaire.loanPurposeOptions.fixed_assets"),
          },
          {
            value: "untargeted",
            label: t("questionnaire.loanPurposeOptions.untargeted"),
          },
          {
            value: "not_sure",
            label: t("questionnaire.loanPurposeOptions.not_sure"),
          },
        ],
      },
      {
        key: "desired_amount",
        label: t("questionnaire.desiredAmount"),
        type: "input",
        placeholder: t("questionnaire.desiredAmountPlaceholder"),
      },
      {
        key: "desired_term",
        label: t("questionnaire.desiredTerm"),
        type: "input",
        placeholder: t("questionnaire.desiredTermPlaceholder"),
      },
    ],
    [t],
  );

  const allQuestions = [...baseQuestions, ...aiQuestions];
  const currentQuestion = allQuestions[step];
  const currentAnswer = currentQuestion
    ? answers.find((item) => item.questionKey === currentQuestion.key)?.answer || ""
    : "";
  const isFollowUpStep = step >= baseQuestions.length;
  const isLastStep = step === allQuestions.length - 1;
  let canProceed = currentAnswer.trim() !== "";
  if (currentQuestion && currentQuestion.key === "desired_amount" && currentAnswer) {
    const val = Number(currentAnswer.replace(/\D/g, ""));
    canProceed = val >= 1000000 && val <= 100000000000;
  }

  const clearFollowUps = () => {
    if (aiQuestions.length === 0) return;
    const generatedKeys = new Set(aiQuestions.map((question) => question.key));
    setAiQuestions([]);
    setFollowUpSource(null);
    setAnswers((prev) =>
      prev.filter((item) => !generatedKeys.has(item.questionKey)),
    );
    setStep((prev) => Math.min(prev, baseQuestions.length - 1));
  };

  const setAnswer = (value: string) => {
    if (!currentQuestion) return;

    if (step < baseQuestions.length && aiQuestions.length > 0 && currentAnswer !== value) {
      clearFollowUps();
    }

    setAnswers((prev) => {
      const nextAnswers = [...prev];
      const existingIndex = nextAnswers.findIndex(
        (item) => item.questionKey === currentQuestion.key,
      );
      const nextItem = { questionKey: currentQuestion.key, answer: value };

      if (existingIndex >= 0) {
        nextAnswers[existingIndex] = nextItem;
        return nextAnswers;
      }

      nextAnswers.push(nextItem);
      return nextAnswers;
    });
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      await api.post("/mini-app/questionnaire", {
        clientId: parseInt(params.clientId),
        answers,
      });

      return api.post("/mini-app/recommend", {
        clientId: parseInt(params.clientId),
        answers,
        language: currentLanguage,
      });
    },
    onSuccess: () => {
      navigate(
        `/recommendation/${params.clientId}?answers=${encodeURIComponent(
          JSON.stringify(answers),
        )}`,
      );
    },
  });

  const openFollowUps = async () => {
    const needType =
      answers.find((item) => item.questionKey === "need_type")?.answer ?? undefined;
    const fallbackQuestions = getFallbackQuestions(t, needType);
    setAiQuestions(fallbackQuestions);
    setFollowUpSource("fallback");
    setStep(baseQuestions.length);
  };

  const handleNext = async () => {
    if (!currentQuestion || !canProceed) return;

    const isLastBaseQuestion = step === baseQuestions.length - 1;
    if (isLastBaseQuestion && aiQuestions.length === 0) {
      await openFollowUps();
      return;
    }

    if (isLastStep) {
      submitMutation.mutate();
      return;
    }

    setStep((prev) => prev + 1);
  };

  if (!currentQuestion) {
    return null;
  }

  const aiHeading = t("questionnaire.aiHeading");
  const aiDescription = t("questionnaire.aiDescription");
  const fallbackDescription = t("questionnaire.fallbackDescription");
  const getFollowUpButtonLabel = () => {
    if (submitMutation.isPending) {
      return t("questionnaire.submitting");
    }
    if (isLastStep) {
      return t("questionnaire.submit");
    }
    if (step === baseQuestions.length - 1 && aiQuestions.length === 0) {
      return currentLanguage === "ru"
        ? t("questionnaire.getFollowUpQuestions")
        : t("questionnaire.getFollowUpQuestions");
    }
    return t("common.next");
  };

  return (
    <div className="space-y-4 pb-8">
      <button
        onClick={() =>
          step > 0 ? setStep(step - 1) : navigate(`/clients/${params.clientId}`)
        }
        className="flex items-center gap-1 text-sm text-muted-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("common.back")}
      </button>

      <div className="space-y-1">
        <h1 className="text-lg font-bold">{t("questionnaire.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {isFollowUpStep ? aiDescription : t("questionnaire.subtitle")}
        </p>
      </div>

      <div className="flex gap-1">
        {allQuestions.map((_, index) => (
          <div
            key={index}
            className={`h-1.5 flex-1 rounded-full ${
              index <= step ? "bg-primary" : "bg-border"
            }`}
          />
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        {step + 1} / {allQuestions.length}
      </p>

      {isFollowUpStep && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex items-start gap-3 p-3">
            <div className="rounded-xl bg-primary/10 p-2 text-primary">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-primary">{aiHeading}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {followUpSource === "fallback" ? fallbackDescription : aiDescription}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{currentQuestion.label}</CardTitle>
          {currentQuestion.helperText && (
            <CardDescription>{currentQuestion.helperText}</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {currentQuestion.type === "select" ? (
            <div className="space-y-2">
              {currentQuestion.options?.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setAnswer(option.value)}
                  className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition-colors ${
                    currentAnswer === option.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <span className="text-sm leading-5">{option.label}</span>
                  {currentAnswer === option.value && (
                    <Check className="h-4 w-4 text-primary" />
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div>
              <Input
                value={currentAnswer}
                onChange={(event) => {
                  let val = event.target.value;
                  if (currentQuestion.key === "desired_amount") {
                    const raw = val.replace(/\D/g, "");
                    val = raw ? Number(raw).toLocaleString().replace(/,/g, ' ') : "";
                  }
                  setAnswer(val);
                }}
                placeholder={currentQuestion.placeholder}
                className="text-base"
                inputMode={currentQuestion.key === "desired_amount" || currentQuestion.key === "desired_term" ? "numeric" : "text"}
              />
              {currentQuestion.key === "desired_amount" && currentAnswer && !canProceed && (
                <p className="text-xs text-destructive mt-2">
                  {t("questionnaire.amountMinError")}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Button
        className="w-full gap-2"
        onClick={handleNext}
        disabled={
          !canProceed ||
          submitMutation.isPending
        }
      >
        {submitMutation.isPending && (
          <Loader2 className="h-4 w-4 animate-spin" />
        )}
        {getFollowUpButtonLabel()}
        {!submitMutation.isPending && !isLastStep && <ChevronRight className="h-4 w-4" />}
      </Button>
    </div>
  );
}
