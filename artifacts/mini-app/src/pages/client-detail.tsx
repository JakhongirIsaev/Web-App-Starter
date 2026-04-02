import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, Plus, Check, Phone, Calendar, FileText, MessageSquare, Calculator, Scan, CreditCard, Car, FileCheck, Trash2, FileDown, Send, Loader2, CheckCircle } from "lucide-react";
import { fmtDate, fmtDateTime, fmtNum } from "@/lib/format";

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 border-gray-200",
  questionnaire: "bg-blue-100 text-blue-700 border-blue-200",
  recommendation: "bg-amber-100 text-amber-700 border-amber-200",
  basket: "bg-purple-100 text-purple-700 border-purple-200",
  pdf_generated: "bg-teal-100 text-teal-700 border-teal-200",
  completed: "bg-green-100 text-green-700 border-green-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
};

const statusFlow = ["draft", "questionnaire", "recommendation", "basket", "pdf_generated", "completed"];

export default function ClientDetailPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [showActionForm, setShowActionForm] = useState(false);
  const [actionType, setActionType] = useState("follow_up");
  const [actionDate, setActionDate] = useState("");
  const [actionPriority, setActionPriority] = useState("medium");

  const { data, isLoading } = useQuery({
    queryKey: ["mini-client", params.id],
    queryFn: () => api.get(`/mini-app/clients/${params.id}`),
  });

  const { data: documents = [] } = useQuery({
    queryKey: ["client-documents", params.id],
    queryFn: () => api.get(`/mini-app/clients/${params.id}/documents`),
  });

  const deleteDocMutation = useMutation({
    mutationFn: (docId: number) => api.delete(`/mini-app/documents/${docId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-documents", params.id] });
    },
  });

  const addNoteMutation = useMutation({
    mutationFn: () => api.post(`/mini-app/clients/${params.id}/notes`, { content: noteContent, type: "note" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mini-client", params.id] });
      setNoteContent("");
      setShowNoteForm(false);
    },
  });

  const addActionMutation = useMutation({
    mutationFn: () =>
      api.post(`/mini-app/clients/${params.id}/next-action`, {
        actionType,
        actionDate,
        priority: actionPriority,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mini-client", params.id] });
      queryClient.invalidateQueries({ queryKey: ["mini-todo"] });
      setShowActionForm(false);
      setActionDate("");
    },
  });

  const completeActionMutation = useMutation({
    mutationFn: (id: number) => api.put(`/mini-app/next-actions/${id}/complete`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mini-client", params.id] });
      queryClient.invalidateQueries({ queryKey: ["mini-todo"] });
    },
  });

  const [pdfResult, setPdfResult] = useState<{ success: boolean; telegramSent: boolean } | null>(null);

  const generatePdfMutation = useMutation({
    mutationFn: () => api.post(`/mini-app/clients/${params.id}/generate-pdf`, { sendViaTelegram: true }),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["mini-client", params.id] });
      setPdfResult(result);
    },
  });

  if (isLoading) return <p className="text-center py-8 text-muted-foreground">{t("common.loading")}</p>;
  if (!data?.client) return <p className="text-center py-8">{t("common.error")}</p>;

  const { client, notes, nextActions, basketItems, calculations } = data;
  const currentIdx = statusFlow.indexOf(client.status);

  const getNextAction = () => {
    if (client.status === "draft") return { label: t("clientDetail.startQuestionnaire"), path: `/questionnaire/${client.id}` };
    if (client.status === "questionnaire") return { label: t("recommendation.title"), path: `/recommendation/${client.id}` };
    if (client.status === "recommendation") return { label: t("basket.title"), path: `/recommendation/${client.id}` };
    return null;
  };

  const nextStep = getNextAction();

  return (
    <div className="space-y-4 pb-4">
      <button onClick={() => navigate("/clients")} className="flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="w-4 h-4" />
        {t("common.back")}
      </button>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-primary font-bold text-lg">{(client.fullName || "?")[0].toUpperCase()}</span>
            </div>
            <div className="flex-1">
              <h2 className="font-semibold">{client.fullName || t("clients.anonymous")}</h2>
              <p className="text-sm text-muted-foreground">{client.phone || t("clients.noPhone")}</p>
            </div>
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${statusColors[client.status] || ""}`}>
              {t(`statuses.${client.status}`)}
            </span>
          </div>

          <div className="flex gap-1 mb-3">
            {statusFlow.map((s, i) => (
              <div
                key={s}
                className={`h-1.5 flex-1 rounded-full ${i <= currentIdx ? "bg-primary" : "bg-border"}`}
              />
            ))}
          </div>

          <p className="text-xs text-muted-foreground">{t("clientDetail.status")}: {fmtDate(client.createdAt)}</p>
        </CardContent>
      </Card>

      {nextStep && (
        <Button className="w-full" onClick={() => navigate(nextStep.path)}>
          {nextStep.label}
        </Button>
      )}

      {nextActions?.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">{t("clientDetail.nextAction")}</h3>
          {nextActions.map((a: any) => (
            <Card key={a.id} className="mb-2">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-sm font-medium">{a.actionType}</p>
                  <p className="text-xs text-muted-foreground">{fmtDate(a.actionDate)} · {a.priority}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => completeActionMutation.mutate(a.id)}
                >
                  <Check className="w-4 h-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={() => setShowNoteForm(!showNoteForm)}>
          <MessageSquare className="w-4 h-4" />
          {t("clientDetail.addNote")}
        </Button>
        <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={() => setShowActionForm(!showActionForm)}>
          <Calendar className="w-4 h-4" />
          {t("clientDetail.addAction")}
        </Button>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => navigate(`/calculator?clientId=${client.id}`)}>
          <Calculator className="w-4 h-4" />
        </Button>
      </div>

      <Button
        variant="outline"
        className="w-full gap-2 border-primary/30 text-primary hover:bg-primary/5"
        onClick={() => navigate(`/scan/${client.id}`)}
      >
        <Scan className="w-4 h-4" />
        {t("scanDoc.scanDocument")}
      </Button>

      {documents.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">{t("scanDoc.documents")} ({documents.length})</h3>
          {documents.map((doc: any) => {
            const docIcon = doc.docType === "passport" ? CreditCard
              : doc.docType === "vehicle_doc" ? Car
              : doc.docType === "certificate" ? FileCheck
              : FileText;
            const DocIcon = docIcon;
            return (
              <Card key={doc.id} className="mb-1.5">
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <DocIcon className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t(`scanDoc.types.${doc.docType === "vehicle_doc" ? "vehicleDoc" : doc.docType}`)}</p>
                    <p className="text-xs text-muted-foreground">{fmtDate(doc.createdAt)}</p>
                    {doc.extractedData && Object.keys(doc.extractedData).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {Object.entries(doc.extractedData).slice(0, 3).map(([k, v]) => (
                          <span key={k} className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                            {t(`scanDoc.fields.${k}`, k)}: {String(v).substring(0, 20)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive h-8 w-8 p-0"
                    onClick={() => deleteDocMutation.mutate(doc.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {showNoteForm && (
        <Card>
          <CardContent className="p-3 space-y-2">
            <Input
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder={t("clientDetail.notePlaceholder")}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => addNoteMutation.mutate()} disabled={!noteContent || addNoteMutation.isPending}>
                {t("common.save")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowNoteForm(false)}>
                {t("common.cancel")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {showActionForm && (
        <Card>
          <CardContent className="p-3 space-y-2">
            <select
              value={actionType}
              onChange={(e) => setActionType(e.target.value)}
              className="w-full p-2 border rounded-lg text-sm bg-background"
            >
              <option value="follow_up">{t("home.followUp")}</option>
              <option value="meeting">{t("home.meeting")}</option>
              <option value="proposal">{t("home.proposal")}</option>
              <option value="documents">{t("home.documents")}</option>
            </select>
            <Input type="date" value={actionDate} onChange={(e) => setActionDate(e.target.value)} />
            <select
              value={actionPriority}
              onChange={(e) => setActionPriority(e.target.value)}
              className="w-full p-2 border rounded-lg text-sm bg-background"
            >
              <option value="high">{t("clientDetail.high")}</option>
              <option value="medium">{t("clientDetail.medium")}</option>
              <option value="low">{t("clientDetail.low")}</option>
            </select>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => addActionMutation.mutate()} disabled={!actionDate || addActionMutation.isPending}>
                {t("common.save")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowActionForm(false)}>
                {t("common.cancel")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {basketItems?.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">{t("clientDetail.basket")}</h3>
          {basketItems.map((item: any) => (
            <Card key={item.id} className="mb-1.5">
              <CardContent className="p-3">
                <p className="text-sm font-medium">{item.productName}</p>
                <p className="text-xs text-muted-foreground">{item.productType}</p>
              </CardContent>
            </Card>
          ))}

          {pdfResult ? (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="p-3 text-center space-y-2">
                <CheckCircle className="w-8 h-8 text-green-600 mx-auto" />
                <p className="text-sm font-medium text-green-800">{t("pdf.generated")}</p>
                <p className="text-xs text-muted-foreground">
                  {pdfResult.telegramSent ? t("pdf.sentViaTelegram") : t("pdf.notSentViaTelegram")}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Button
              className="w-full gap-2 mt-2"
              variant={client.status === "basket" ? "default" : "outline"}
              onClick={() => generatePdfMutation.mutate()}
              disabled={generatePdfMutation.isPending}
            >
              {generatePdfMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t("pdf.generating")}
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  {t("pdf.generate")}
                </>
              )}
            </Button>
          )}
        </div>
      )}

      {calculations?.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">{t("clientDetail.calculations")}</h3>
          {calculations.map((c: any) => (
            <Card key={c.id} className="mb-1.5">
              <CardContent className="p-3">
                <p className="text-sm font-medium">{c.productName}</p>
                <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                  <span>{fmtNum(c.loanAmount)} {c.currency}</span>
                  <span>{c.termMonths} {t("calculator.month")}</span>
                  <span>{c.interestRate}%</span>
                </div>
                <p className="text-sm font-semibold text-primary mt-1">{fmtNum(c.monthlyPayment)} / {t("calculator.month")}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {notes?.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">{t("clientDetail.history")}</h3>
          {notes.map((n: any) => (
            <Card key={n.id} className="mb-1.5">
              <CardContent className="p-3">
                <p className="text-sm">{n.content}</p>
                <p className="text-xs text-muted-foreground mt-1">{n.userName} · {fmtDateTime(n.createdAt)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
