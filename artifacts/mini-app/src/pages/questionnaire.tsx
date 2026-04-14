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

function isQuestionDefinition(value: unknown): value is QuestionDefinition {
  if (!value || typeof value !== "object") return false;
  const candidate = value as QuestionDefinition;
  return (
    typeof candidate.key === "string" &&
    typeof candidate.label === "string" &&
    (candidate.type === "select" || candidate.type === "input")
  );
}

function getFallbackQuestions(
  language: "ru" | "uz",
  needType?: string,
): QuestionDefinition[] {
  const isNonCredit = needType === "non_credit";

  if (language === "ru") {
    if (isNonCredit) {
      return [
        {
          key: "service_goal",
          label: "Какой некредитный сервис клиенту нужен в первую очередь?",
          type: "select",
          options: [
            { value: "settlement", label: "Расчётно-кассовое обслуживание" },
            { value: "terminal", label: "POS-терминал и эквайринг" },
            { value: "payroll", label: "Зарплатный проект" },
            { value: "foreign_payments", label: "Валютные и международные платежи" },
          ],
        },
        {
          key: "monthly_turnover_band",
          label: "Какой ожидаемый ежемесячный оборот по счёту?",
          type: "select",
          options: [
            { value: "up_to_100m", label: "До 100 млн сум" },
            { value: "100m_to_500m", label: "100–500 млн сум" },
            { value: "over_500m", label: "Свыше 500 млн сум" },
            { value: "not_sure", label: "Пока неясно" },
          ],
        },
        {
          key: "has_pos_need",
          label: "Нужно ли клиенту принимать оплату картами и QR?",
          type: "select",
          options: [
            { value: "yes", label: "Да, обязательно" },
            { value: "later", label: "Позже может понадобиться" },
            { value: "no", label: "Нет" },
          ],
        },
        {
          key: "foreign_payments_need",
          label: "Есть ли потребность в валютных или международных переводах?",
          type: "select",
          options: [
            { value: "yes", label: "Да" },
            { value: "no", label: "Нет" },
            { value: "not_sure", label: "Пока не определено" },
          ],
        },
      ];
    }

    return [
      {
        key: "preferred_currency",
        label: "В какой валюте клиенту удобнее оформить продукт?",
        type: "select",
        helperText: "Это сразу сокращает неподходящие валютные варианты.",
        options: [
          { value: "uzs", label: "Сум" },
          { value: "usd", label: "Доллар США" },
          { value: "eur", label: "Евро" },
          { value: "not_sure", label: "Пока не определено" },
        ],
      },
      {
        key: "monthly_payment_comfort",
        label: "Какой ежемесячный платёж для клиента комфортен?",
        type: "select",
        helperText: "Это помогает точнее подобрать сумму и срок.",
        options: [
          { value: "up_to_10m", label: "До 10 млн сум" },
          { value: "10m_to_30m", label: "10-30 млн сум" },
          { value: "over_30m", label: "Свыше 30 млн сум" },
          { value: "not_sure", label: "Пока неясно" },
        ],
      },
      {
        key: "repayment_preference",
        label: "Какой график погашения клиенту удобнее?",
        type: "select",
        options: [
          { value: "annuity", label: "Равный платёж каждый месяц" },
          { value: "differentiated", label: "Сначала выше, потом ниже" },
          { value: "not_sure", label: "Пусть эксперт подскажет" },
        ],
      },
    ];
  }

  if (isNonCredit) {
    return [
      {
        key: "service_goal",
        label: "Mijozga birinchi navbatda qaysi nokredit xizmat kerak?",
        type: "select",
        options: [
          { value: "settlement", label: "Hisob-kitob xizmati" },
          { value: "terminal", label: "POS-terminal va ekvayring" },
          { value: "payroll", label: "Ish haqi loyihasi" },
          { value: "foreign_payments", label: "Valyuta va xalqaro to'lovlar" },
        ],
      },
      {
        key: "monthly_turnover_band",
        label: "Hisob bo'yicha kutilayotgan oylik aylanma qancha?",
        type: "select",
        options: [
          { value: "up_to_100m", label: "100 mln so'mgacha" },
          { value: "100m_to_500m", label: "100–500 mln so'm" },
          { value: "over_500m", label: "500 mln so'mdan yuqori" },
          { value: "not_sure", label: "Hali aniq emas" },
        ],
      },
      {
        key: "has_pos_need",
        label: "Mijozga karta va QR orqali to'lov qabul qilish kerakmi?",
        type: "select",
        options: [
          { value: "yes", label: "Ha, albatta" },
          { value: "later", label: "Keyin kerak bo'lishi mumkin" },
          { value: "no", label: "Yo'q" },
        ],
      },
      {
        key: "foreign_payments_need",
        label: "Valyuta yoki xalqaro o'tkazmalar kerak bo'ladimi?",
        type: "select",
        options: [
          { value: "yes", label: "Ha" },
          { value: "no", label: "Yo'q" },
          { value: "not_sure", label: "Hali aniqlanmagan" },
        ],
      },
    ];
  }

  return [
    {
      key: "preferred_currency",
      label: "Mijozga mahsulot qaysi valyutada qulayroq?",
      type: "select",
      helperText: "Bu mos bo'lmagan valyuta variantlarini darhol qisqartiradi.",
      options: [
        { value: "uzs", label: "So'm" },
        { value: "usd", label: "AQSh dollari" },
        { value: "eur", label: "Yevro" },
        { value: "not_sure", label: "Hali aniqlanmagan" },
      ],
    },
    {
      key: "monthly_payment_comfort",
      label: "Mijoz uchun qaysi oylik to'lov diapazoni qulay?",
      type: "select",
      helperText: "Bu summa va muddatni aniqroq moslashtirishga yordam beradi.",
      options: [
        { value: "up_to_10m", label: "10 mln so'mgacha" },
        { value: "10m_to_30m", label: "10-30 mln so'm" },
        { value: "over_30m", label: "30 mln so'mdan yuqori" },
        { value: "not_sure", label: "Hali aniq emas" },
      ],
    },
    {
      key: "repayment_preference",
      label: "Mijozga qaysi to'lov jadvali qulayroq?",
      type: "select",
      options: [
        { value: "annuity", label: "Har oy bir xil to'lov" },
        { value: "differentiated", label: "Boshlanishida katta, keyin kamayadigan" },
        { value: "not_sure", label: "Ekspert tavsiya bersin" },
      ],
    },
  ];
}

function mergeFollowUpQuestions(
  generatedQuestions: QuestionDefinition[],
  fallbackQuestions: QuestionDefinition[],
) {
  const usedKeys = new Set<string>();
  const merged: QuestionDefinition[] = [];

  for (const question of [...generatedQuestions, ...fallbackQuestions]) {
    if (!question.key || usedKeys.has(question.key)) continue;
    usedKeys.add(question.key);
    merged.push(question);
    if (merged.length >= 4) break;
  }

  return merged;
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

  const generateQuestionsMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post("/ai/generate-questionnaire", {
        language: currentLanguage,
        existingAnswers: answers,
        maxQuestions: 4,
      });

      return Array.isArray(response.questions)
        ? response.questions.filter(isQuestionDefinition)
        : [];
    },
  });

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
    const fallbackQuestions = getFallbackQuestions(currentLanguage, needType);

    try {
      const generated = await generateQuestionsMutation.mutateAsync();
      const merged = mergeFollowUpQuestions(generated, fallbackQuestions);
      setAiQuestions(merged);
      setFollowUpSource(generated.length > 0 ? "ai" : "fallback");
      setStep(baseQuestions.length);
      return;
    } catch {
      setAiQuestions(fallbackQuestions);
      setFollowUpSource("fallback");
      setStep(baseQuestions.length);
    }
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

  const aiHeading =
    currentLanguage === "ru"
      ? "AI уточняет профиль клиента"
      : "AI mijoz profilini aniqlashtirmoqda";
  const aiDescription =
    currentLanguage === "ru"
      ? "Дополнительные вопросы помогают точнее подобрать продукт, срок и комфортный ежемесячный платёж."
      : "Qo'shimcha savollar mahsulot, muddat va qulay oylik to'lovni aniqroq tanlashga yordam beradi.";
  const fallbackDescription =
    currentLanguage === "ru"
      ? "AI временно недоступен, поэтому используются встроенные уточняющие вопросы."
      : "AI vaqtincha band, shu sababli ichki aniqlashtiruvchi savollar ishlatilmoqda.";
  const getFollowUpButtonLabel = () => {
    if (submitMutation.isPending || generateQuestionsMutation.isPending) {
      return t("questionnaire.submitting");
    }
    if (isLastStep) {
      return t("questionnaire.submit");
    }
    if (step === baseQuestions.length - 1 && aiQuestions.length === 0) {
      return currentLanguage === "ru"
        ? "Получить уточняющие вопросы"
        : "Aniqlashtiruvchi savollarni olish";
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
                  Сумма должна быть не менее 1 000 000
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
          submitMutation.isPending ||
          generateQuestionsMutation.isPending
        }
      >
        {(submitMutation.isPending || generateQuestionsMutation.isPending) && (
          <Loader2 className="h-4 w-4 animate-spin" />
        )}
        {getFollowUpButtonLabel()}
        {!submitMutation.isPending &&
          !generateQuestionsMutation.isPending &&
          !isLastStep && <ChevronRight className="h-4 w-4" />}
      </Button>
    </div>
  );
}
