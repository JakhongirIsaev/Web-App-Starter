import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, ChevronRight, Check } from "lucide-react";

interface Answer {
  questionKey: string;
  answer: string;
}

export default function QuestionnairePage() {
  const { t } = useTranslation();
  const params = useParams<{ clientId: string }>();
  const [, navigate] = useLocation();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);

  const questions = [
    {
      key: "business_type",
      label: t("questionnaire.businessType"),
      type: "select" as const,
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
      type: "select" as const,
      options: [
        { value: "micro", label: t("questionnaire.businessSizeOptions.micro") },
        { value: "small", label: t("questionnaire.businessSizeOptions.small") },
        { value: "medium", label: t("questionnaire.businessSizeOptions.medium") },
      ],
    },
    {
      key: "need_type",
      label: t("questionnaire.needType"),
      type: "select" as const,
      options: [
        { value: "credit", label: t("questionnaire.needTypeOptions.credit") },
        { value: "non_credit", label: t("questionnaire.needTypeOptions.non_credit") },
        { value: "both", label: t("questionnaire.needTypeOptions.both") },
      ],
    },
    {
      key: "loan_purpose",
      label: t("questionnaire.loanPurpose"),
      type: "select" as const,
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
      type: "input" as const,
      placeholder: t("questionnaire.desiredAmountPlaceholder"),
    },
    {
      key: "desired_term",
      label: t("questionnaire.desiredTerm"),
      type: "input" as const,
      placeholder: t("questionnaire.desiredTermPlaceholder"),
    },
  ];

  const currentQuestion = questions[step];
  const currentAnswer = answers.find((a) => a.questionKey === currentQuestion?.key)?.answer || "";

  const setAnswer = (value: string) => {
    setAnswers((prev) => {
      const existing = prev.findIndex((a) => a.questionKey === currentQuestion.key);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { questionKey: currentQuestion.key, answer: value };
        return updated;
      }
      return [...prev, { questionKey: currentQuestion.key, answer: value }];
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
      });
    },
    onSuccess: () => {
      navigate(`/recommendation/${params.clientId}?answers=${encodeURIComponent(JSON.stringify(answers))}`);
    },
  });

  const isLastStep = step === questions.length - 1;
  const canProceed = currentAnswer.trim() !== "";

  return (
    <div className="space-y-4 pb-4">
      <button onClick={() => (step > 0 ? setStep(step - 1) : navigate(`/clients/${params.clientId}`))} className="flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="w-4 h-4" />
        {t("common.back")}
      </button>

      <div>
        <h1 className="text-lg font-bold">{t("questionnaire.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("questionnaire.subtitle")}</p>
      </div>

      <div className="flex gap-1">
        {questions.map((_, i) => (
          <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-border"}`} />
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        {step + 1} / {questions.length}
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{currentQuestion.label}</CardTitle>
        </CardHeader>
        <CardContent>
          {currentQuestion.type === "select" ? (
            <div className="space-y-2">
              {currentQuestion.options?.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setAnswer(opt.value)}
                  className={`w-full text-left p-3 rounded-xl border transition-colors flex items-center justify-between ${
                    currentAnswer === opt.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <span className="text-sm">{opt.label}</span>
                  {currentAnswer === opt.value && <Check className="w-4 h-4 text-primary" />}
                </button>
              ))}
            </div>
          ) : (
            <Input
              value={currentAnswer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder={currentQuestion.placeholder}
              className="text-base"
            />
          )}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        {isLastStep ? (
          <Button className="flex-1" onClick={() => submitMutation.mutate()} disabled={!canProceed || submitMutation.isPending}>
            {submitMutation.isPending ? t("questionnaire.submitting") : t("questionnaire.submit")}
          </Button>
        ) : (
          <Button className="flex-1 gap-1" onClick={() => setStep(step + 1)} disabled={!canProceed}>
            {t("common.next")}
            <ChevronRight className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
