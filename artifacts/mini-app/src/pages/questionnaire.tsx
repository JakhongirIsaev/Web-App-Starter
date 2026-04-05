import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, ChevronRight, Check, Loader2 } from "lucide-react";

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

export default function QuestionnairePage() {
  const { t, i18n } = useTranslation();
  const params = useParams<{ clientId: string }>();
  const [, navigate] = useLocation();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [aiQuestions, setAiQuestions] = useState<QuestionDefinition[]>([]);

  const baseQuestions: QuestionDefinition[] = [
    {
      key: "business_type",
      label: t("questionnaire.businessType"),
      type: "select",
      options: [
        { value: "trade", label: t("questionnaire.businessTypeOptions.trade") },
        { value: "services", label: t("questionnaire.businessTypeOptions.services") },
        { value: "production", label: t("questionnaire.businessTypeOptions.production") },
        { value: "agriculture", label: t("questionnaire.businessTypeOptions.agriculture") },
        { value: "other", label: t("questionnaire.businessTypeOptions.other") },
      ],
    },
    {
      key: "business_size",
      label: t("questionnaire.businessSize"),
      type: "select",
      options: [
        { value: "micro", label: t("questionnaire.businessSizeOptions.micro") },
        { value: "small", label: t("questionnaire.businessSizeOptions.small") },
        { value: "medium", label: t("questionnaire.businessSizeOptions.medium") },
      ],
    },
    {
      key: "need_type",
      label: t("questionnaire.needType"),
      type: "select",
      options: [
        { value: "credit", label: t("questionnaire.needTypeOptions.credit") },
        { value: "non_credit", label: t("questionnaire.needTypeOptions.non_credit") },
        { value: "both", label: t("questionnaire.needTypeOptions.both") },
      ],
    },
    {
      key: "loan_purpose",
      label: t("questionnaire.loanPurpose"),
      type: "select",
      options: [
        { value: "working_capital", label: t("questionnaire.loanPurposeOptions.working_capital") },
        { value: "fixed_assets", label: t("questionnaire.loanPurposeOptions.fixed_assets") },
        { value: "untargeted", label: t("questionnaire.loanPurposeOptions.untargeted") },
        { value: "not_sure", label: t("questionnaire.loanPurposeOptions.not_sure") },
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
  ];

  const allQuestions = [...baseQuestions, ...aiQuestions];
  const currentQuestion = allQuestions[step];
  const currentAnswer = currentQuestion
    ? answers.find((item) => item.questionKey === currentQuestion.key)?.answer || ""
    : "";
  const baseQuestionCount = baseQuestions.length;
  const isLastStep = step === allQuestions.length - 1;
  const canProceed = currentAnswer.trim() !== "";

  const clearGeneratedQuestions = () => {
    if (aiQuestions.length === 0) return;
    const generatedKeys = new Set(aiQuestions.map((question) => question.key));
    setAiQuestions([]);
    setAnswers((prev) => prev.filter((item) => !generatedKeys.has(item.questionKey)));
    setStep((prev) => Math.min(prev, baseQuestionCount - 1));
  };

  const setAnswer = (value: string) => {
    if (!currentQuestion) return;

    if (step < baseQuestionCount && aiQuestions.length > 0 && currentAnswer !== value) {
      clearGeneratedQuestions();
    }

    setAnswers((prev) => {
      const existing = prev.findIndex((item) => item.questionKey === currentQuestion.key);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { questionKey: currentQuestion.key, answer: value };
        return updated;
      }
      return [...prev, { questionKey: currentQuestion.key, answer: value }];
    });
  };

  const generateQuestionsMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post("/ai/generate-questionnaire", {
        language: i18n.language === "ru" ? "ru" : "uz",
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
      });
    },
    onSuccess: () => {
      navigate(`/recommendation/${params.clientId}?answers=${encodeURIComponent(JSON.stringify(answers))}`);
    },
  });

  const handleNext = async () => {
    if (!currentQuestion || !canProceed) return;

    const isLastBaseStep = step === baseQuestionCount - 1;
    if (isLastBaseStep && aiQuestions.length === 0) {
      try {
        const generatedQuestions = await generateQuestionsMutation.mutateAsync();
        if (generatedQuestions.length > 0) {
          setAiQuestions(generatedQuestions);
          setStep(step + 1);
          return;
        }
      } catch {
        // Fall back to the existing questionnaire flow if AI follow-up generation fails.
      }
    }

    if (isLastStep) {
      submitMutation.mutate();
      return;
    }

    setStep(step + 1);
  };

  const getPrimaryLabel = () => {
    if (submitMutation.isPending || generateQuestionsMutation.isPending) {
      return t("questionnaire.submitting");
    }
    if (isLastStep) {
      return t("questionnaire.submit");
    }
    if (step === baseQuestionCount - 1 && aiQuestions.length === 0) {
      return i18n.language === "ru" ? "Уточнить детали" : "Qo'shimcha savollar";
    }
    return t("common.next");
  };

  if (!currentQuestion) {
    return null;
  }

  return (
    <div className="space-y-4 pb-4">
      <button
        onClick={() => (step > 0 ? setStep(step - 1) : navigate(`/clients/${params.clientId}`))}
        className="flex items-center gap-1 text-sm text-muted-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        {t("common.back")}
      </button>

      <div>
        <h1 className="text-lg font-bold">{t("questionnaire.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("questionnaire.subtitle")}</p>
      </div>

      <div className="flex gap-1">
        {allQuestions.map((_, index) => (
          <div
            key={index}
            className={`h-1.5 flex-1 rounded-full ${index <= step ? "bg-primary" : "bg-border"}`}
          />
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        {step + 1} / {allQuestions.length}
      </p>

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
                  className={`w-full text-left p-3 rounded-xl border transition-colors flex items-center justify-between ${
                    currentAnswer === option.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <span className="text-sm">{option.label}</span>
                  {currentAnswer === option.value && <Check className="w-4 h-4 text-primary" />}
                </button>
              ))}
            </div>
          ) : (
            <Input
              value={currentAnswer}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder={currentQuestion.placeholder}
              className="text-base"
            />
          )}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button
          className="flex-1 gap-2"
          onClick={handleNext}
          disabled={!canProceed || submitMutation.isPending || generateQuestionsMutation.isPending}
        >
          {(submitMutation.isPending || generateQuestionsMutation.isPending) && (
            <Loader2 className="w-4 h-4 animate-spin" />
          )}
          {getPrimaryLabel()}
          {!submitMutation.isPending && !generateQuestionsMutation.isPending && !isLastStep && (
            <ChevronRight className="w-4 h-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
