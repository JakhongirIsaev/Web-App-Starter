import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, getAuthImageUrl } from "@/lib/api";
import { getTelegramInitData } from "@/lib/telegram";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, Plus, Check, Phone, Calendar, FileText, MessageSquare, Calculator, Scan, CreditCard, Car, FileCheck, Trash2, Send, Loader2, CheckCircle, Image as ImageIcon, X, Eye, MapPin } from "lucide-react";
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
  const { t, i18n } = useTranslation();
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [showActionForm, setShowActionForm] = useState(false);
  const [actionType, setActionType] = useState("follow_up");
  const [actionDate, setActionDate] = useState("");
  const [actionPriority, setActionPriority] = useState("medium");
  const [previewImage, setPreviewImage] = useState<string | null>(null);

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
  const [pdfError, setPdfError] = useState<string | null>(null);

  const generatePdfMutation = useMutation({
    mutationFn: () =>
      api.post(`/mini-app/clients/${params.id}/generate-pdf`, {
        sendViaTelegram: true,
        telegramInitData: getTelegramInitData(),
        language: i18n.language === "ru" ? "ru" : "uz",
      }),
    onMutate: () => {
      setPdfError(null);
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["mini-client", params.id] });
      setPdfResult(result);
    },
    onError: (err: any) => {
      setPdfError(err?.message || String(err) || "Failed to generate PDF");
    },
  });

  if (isLoading) return <p className="text-center py-8 text-muted-foreground">{t("common.loading")}</p>;
  if (!data?.client) return <p className="text-center py-8">{t("common.error")}</p>;

  const { client, notes, nextActions, basketItems, calculations } = data;
  const currentIdx = statusFlow.indexOf(client.status);

  const getNextAction = () => {
    if (client.status === "draft") return { label: t("clientDetail.startQuestionnaire"), path: `/questionnaire/${client.id}` };
    if (client.status === "questionnaire") return { label: t("clientDetail.startQuestionnaire"), path: `/questionnaire/${client.id}` };
    if (client.status === "recommendation") return { label: t("basket.title"), path: `/recommendation/${client.id}` };
    return null;
  };

  const nextStep = getNextAction();

  const getDocImageUrl = (doc: any) => {
    if (doc.storagePath && doc.storagePath.startsWith("http")) return doc.storagePath;
    if (doc.storagePath) {
      return getAuthImageUrl(`/storage/file?path=${encodeURIComponent(doc.storagePath)}`);
    }
    return null;
  };

  return (
    <div className="space-y-4 pb-8">
      <button onClick={() => navigate("/clients")} className="flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="w-4 h-4" />
        {t("common.back")}
      </button>

      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <span className="text-primary font-bold text-lg">{(client.fullName || "?")[0].toUpperCase()}</span>
              </div>
              <div className="min-w-0">
                <h2 className="truncate font-semibold">
                  {client.fullName || t("clients.anonymous")}
                </h2>
                <p className="text-sm text-muted-foreground">{client.phone || t("clients.noPhone")}</p>
              </div>
            </div>
            <span className={`inline-flex w-fit px-2.5 py-1 rounded-full text-xs font-medium border ${statusColors[client.status] || ""}`}>
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

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="sm" className="gap-1" onClick={() => setShowNoteForm(!showNoteForm)}>
          <MessageSquare className="w-4 h-4" />
          {t("clientDetail.addNote")}
        </Button>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => {
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              (pos) => alert(t("clientDetail.locationReceived", { lat: pos.coords.latitude, lng: pos.coords.longitude })),
              (err) => alert(t("clientDetail.locationError") + err.message)
            );
          } else {
            alert(t("clientDetail.locationNotSupported"));
          }
        }}>
          <MapPin className="w-4 h-4" />
          {t("clientDetail.businessLocation")}
        </Button>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => setShowActionForm(!showActionForm)}>
          <Calendar className="w-4 h-4" />
          {t("clientDetail.addAction")}
        </Button>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => navigate(`/calculator?clientId=${client.id}`)}>
          <Calculator className="w-4 h-4" />
          {t("nav.calculator")}
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

          <div className="grid grid-cols-3 gap-2 mb-2">
            {documents.map((doc: any) => {
              const imgUrl = getDocImageUrl(doc);
              return (
                <div key={doc.id} className="relative group">
                  {imgUrl ? (
                    <img
                      src={imgUrl}
                      alt={doc.fileName}
                      className="w-full h-24 object-cover rounded-lg border cursor-pointer"
                      onClick={() => setPreviewImage(imgUrl)}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                        (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
                      }}
                    />
                  ) : null}
                  <div className={`${imgUrl ? "hidden" : ""} w-full h-24 rounded-lg border bg-muted/50 flex flex-col items-center justify-center`}>
                    <ImageIcon className="w-6 h-6 text-muted-foreground" />
                    <span className="text-[9px] text-muted-foreground mt-1">{t(`scanDoc.types.${doc.docType === "vehicle_doc" ? "vehicleDoc" : doc.docType}`)}</span>
                  </div>
                  <button
                    onClick={() => deleteDocMutation.mutate(doc.id)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  {doc.extractedData && Object.keys(doc.extractedData).length > 0 && (
                    <div className="absolute bottom-1 left-1 right-1">
                      <div className="bg-black/60 text-white text-[8px] rounded px-1 py-0.5 truncate">
                        {Object.values(doc.extractedData)[0] as string}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {documents.some((d: any) => d.extractedData && Object.keys(d.extractedData).length > 0) && (
            <Card className="mb-2">
              <CardContent className="p-3 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground mb-1">{t("scanDoc.extractedFields")}</p>
                {documents.map((doc: any) =>
                  doc.extractedData && Object.entries(doc.extractedData).map(([k, v]) => (
                    <div key={`${doc.id}-${k}`} className="flex items-center justify-between py-0.5 border-b border-border/30 last:border-0">
                      <span className="text-[10px] text-muted-foreground">{t(`scanDoc.fields.${k}`, k)}</span>
                      <span className="text-xs font-medium text-right max-w-[60%] truncate">{String(v)}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          )}
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
                {item.notes && (
                  <p className="mt-2 text-xs leading-5 text-muted-foreground line-clamp-3">
                    {item.notes}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div>
        {pdfResult ? (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="p-3 text-center space-y-2">
              <CheckCircle className="w-8 h-8 text-green-600 mx-auto" />
              <p className="text-sm font-medium text-green-800">{t("pdf.generated")}</p>
              <p className="text-xs text-muted-foreground">
                {pdfResult.telegramSent ? t("pdf.sentViaTelegram") : t("pdf.notSentViaTelegram")}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => setPdfResult(null)}
              >
                {t("pdf.generateAgain")}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Button
            className="w-full gap-2"
            variant={client.status === "basket" || basketItems?.length > 0 ? "default" : "outline"}
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
        {pdfError && !generatePdfMutation.isPending && (
          <p className="mt-2 text-xs text-red-600 break-words">
            {t("common.error")}: {pdfError}
          </p>
        )}
      </div>



      {calculations?.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">{t("clientDetail.calculations")}</h3>
          {calculations.map((c: any) => (
            <Card key={c.id} className="mb-1.5">
              <CardContent className="p-3">
                <p className="text-sm font-medium">{c.productName}</p>
                <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                  <span>{fmtNum(c.loanAmount)} {c.currency}</span>
                  <span>{c.termMonths} {t("calculator.months")}</span>
                  <span>{c.interestRate}%</span>
                </div>
                <p className="mt-1 text-sm font-semibold text-primary">
                  {t("calculator.monthlyPayment")}: {fmtNum(c.monthlyPayment)} {c.currency}
                </p>
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

      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <button className="absolute top-4 right-4 text-white" onClick={() => setPreviewImage(null)}>
            <X className="w-8 h-8" />
          </button>
          <img src={previewImage} alt="Preview" className="max-w-full max-h-full object-contain rounded-lg" />
        </div>
      )}
    </div>
  );
}
