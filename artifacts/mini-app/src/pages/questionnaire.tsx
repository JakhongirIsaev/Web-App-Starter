import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, ChevronRight, Check, Loader2, Sparkles } from "lucide-react";

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
  answer: string;
}

export default function QuestionnairePage() {
  const { t } = useTranslation();
  const params = useParams<{ clientId: string }>();
  const [, navigate] = useLocation();
  const [currentQuestion, setCurrentQuestion] = useState<AIQuestion | null>(null);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);
  const [questionCount, setQuestionCount] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const nextQuestionMutation = useMutation({
    mutationFn: async (history: ConversationMessage[]) => {
      const res = await api.post("/ai/questionnaire/next", {
        clientId: parseInt(params.clientId),
        conversationHistory: history,
      });
      return res as AIQuestion;
    },
    onSuccess: (data) => {
      if (data.done) {
        setIsComplete(true);
        // Save answers for recommendation page
        const summaryAnswers = data.summary
          ? Object.entries(data.summary).map(([key, val]) => ({
              questionKey: key,
              answer: String(val),
            }))
          : answers;

        // Submit questionnaire and generate recommendations
        submitMutation.mutate(summaryAnswers);
      } else {
        setCurrentQuestion(data);
        setCurrentAnswer("");
        setQuestionCount((c) => c + 1);
        // Add assistant message to history
        setConversationHistory((prev) => [
          ...prev,
          { role: "assistant", content: JSON.stringify(data) },
        ]);
      }
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (finalAnswers: Answer[]) => {
      await api.post("/mini-app/questionnaire", {
        clientId: parseInt(params.clientId),
        answers: finalAnswers,
      });
      return api.post("/mini-app/recommend", {
        clientId: parseInt(params.clientId),
        answers: finalAnswers,
      });
    },
    onSuccess: () => {
      navigate(`/recommendation/${params.clientId}?answers=${encodeURIComponent(JSON.stringify(answers))}`);
    },
  });

  // Load first question
  useEffect(() => {
    if (conversationHistory.length === 0 && !currentQuestion) {
      nextQuestionMutation.mutate([]);
    }
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentQuestion, answers]);

  const handleAnswer = (value: string) => {
    setCurrentAnswer(value);
  };

  const handleNext = () => {
    if (!currentQuestion || !currentAnswer.trim()) return;

    const newAnswer: Answer = { questionKey: currentQuestion.key, answer: currentAnswer };
    setAnswers((prev) => [...prev, newAnswer]);

    const updatedHistory: ConversationMessage[] = [
      ...conversationHistory,
      { role: "user", content: currentAnswer },
    ];
    setConversationHistory(updatedHistory);

    nextQuestionMutation.mutate(updatedHistory);
  };

  const isLoading = nextQuestionMutation.isPending || submitMutation.isPending;

  return (
    <div className="space-y-4 pb-4">
      <button
        onClick={() => navigate(`/clients/${params.clientId}`)}
        className="flex items-center gap-1 text-sm text-muted-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        {t("common.back")}
      </button>

      <div className="flex items-center gap-2">
        <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-bold">{t("questionnaire.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("questionnaire.aiSubtitle")}</p>
        </div>
      </div>

      {/* Progress indicator */}
      {questionCount > 0 && (
        <div className="flex gap-1">
          {Array.from({ length: Math.max(questionCount, 4) }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i < questionCount ? "bg-primary" : "bg-border"
              }`}
            />
          ))}
        </div>
      )}

      {/* Previous answers */}
      {answers.map((a, i) => (
        <Card key={i} className="bg-muted/30 border-muted">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground mb-1">
              {conversationHistory
                .filter((m) => m.role === "assistant")
                [i]?.content
                ? (() => {
                    try {
                      return JSON.parse(
                        conversationHistory.filter((m) => m.role === "assistant")[i].content,
                      ).question;
                    } catch {
                      return "";
                    }
                  })()
                : ""}
            </p>
            <p className="text-sm font-medium">{a.answer}</p>
          </CardContent>
        </Card>
      ))}

      {/* Current question */}
      {isLoading && !currentQuestion ? (
        <Card>
          <CardContent className="p-6 text-center space-y-3">
            <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto" />
            <p className="text-sm text-muted-foreground">{t("questionnaire.aiThinking")}</p>
          </CardContent>
        </Card>
      ) : currentQuestion && !isComplete ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{currentQuestion.question}</CardTitle>
          </CardHeader>
          <CardContent>
            {currentQuestion.type === "select" && currentQuestion.options ? (
              <div className="space-y-2">
                {currentQuestion.options.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleAnswer(opt.value)}
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
                onChange={(e) => handleAnswer(e.target.value)}
                placeholder={t("questionnaire.inputPlaceholder")}
                className="text-base"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && currentAnswer.trim()) handleNext();
                }}
              />
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Action button */}
      {currentQuestion && !isComplete && (
        <Button
          className="w-full gap-1"
          onClick={handleNext}
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
      )}

      {/* Completion state */}
      {isComplete && submitMutation.isPending && (
        <Card>
          <CardContent className="p-6 text-center space-y-3">
            <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto" />
            <p className="text-sm font-medium">{t("questionnaire.submitting")}</p>
          </CardContent>
        </Card>
      )}

      <div ref={scrollRef} />
    </div>
  );
}
