import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, Plus, Check, Phone, Calendar, FileText, MessageSquare, Calculator, Scan, CreditCard, Car, FileCheck, Trash2, Send, Loader2, CheckCircle, Download, Image as ImageIcon, X, Eye, Sparkles, MapPin } from "lucide-react";
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
  const [showLocationForm, setShowLocationForm] = useState(false);
  const [actionType, setActionType] = useState("follow_up");
  const [actionDate, setActionDate] = useState("");
  const [actionPriority, setActionPriority] = useState("medium");
  const [businessLocationDraft, setBusinessLocationDraft] = useState("");
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["mini-client", params.id],
    queryFn: () => api.get(`/mini-app/clients/${params.id}`),
  });

  const { data: documents = [] } = useQuery({
    queryKey: ["client-documents", params.id],
    queryFn: () => api.get(`/mini-app/clients/${params.id}/documents`),
  });

  const { data: pdfSummary, isLoading: pdfSummaryLoading } = useQuery({
    queryKey: ["mini-client-pdf-summary", params.id, data?.basketItems?.length, data?.calculations?.length],
    queryFn: () =>
      api.post("/ai/pdf-summary", {
        client: data?.client,
        basketItems: data?.basketItems || [],
        calculations: data?.calculations || [],
      }),
    enabled: !!data?.client,
    retry: false,
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

  const saveBusinessLocationMutation = useMutation({
    mutationFn: () =>
      api.post(`/mini-app/clients/${params.id}/notes`, {
        content: businessLocationDraft,
        type: "business_location",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mini-client", params.id] });
      setShowLocationForm(false);
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

  const exportMutation = useMutation({
    mutationFn: async () => {
      const blob = await api.getBlob(`/mini-app/clients/${params.id}/export`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `client_${params.id}_export.txt`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  if (isLoading) return <p className="text-center py-8 text-muted-foreground">{t("common.loading")}</p>;
  if (!data?.client) return <p className="text-center py-8">{t("common.error")}</p>;

  const { client, notes, nextActions, basketItems, calculations } = data;
  const businessLocationFromNotes = (notes || []).find((note: any) => note.type === "business_location")?.content || null;
  const timelineNotes = (notes || []).filter((note: any) => note.type !== "business_location");
  const businessLocation = data.businessLocation || businessLocationFromNotes;
  const currentIdx = statusFlow.indexOf(client.status);

  const getNextAction = () => {
    if (client.status === "draft") return { label: t("clientDetail.startQuestionnaire"), path: `/questionnaire/${client.id}` };
    if (client.status === "questionnaire") return { label: t("clientDetail.continueRecommendation"), path: `/recommendation/${client.id}` };
    if (client.status === "recommendation") return { label: t("clientDetail.continueRecommendation"), path: `/recommendation/${client.id}` };
    return null;
  };

  const nextStep = getNextAction();

  const getDocImageUrl = (doc: any) => {
    if (doc.storagePath && doc.storagePath.startsWith("http")) return doc.storagePath;
    if (doc.storagePath) return `/api/storage/files/${encodeURIComponent(doc.storagePath)}`;
    return null;
  };

  const formatBadge = (badge: string) => badge.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());

  return (
    <div className="space-y-4 pb-4">
      <button onClick={() => navigate("/clients")} className="flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="w-4 h-4" />
        {t("common.back")}
      </button>

      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-background to-emerald-50/70">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
                <span className="text-lg font-bold">{(client.fullName || "?")[0].toUpperCase()}</span>
              </div>
              <div className="min-w-0">
                <h2 className="font-semibold truncate">{client.fullName || t("clients.anonymous")}</h2>
                <p className="text-sm text-muted-foreground truncate">{client.phone || t("clients.noPhone")}</p>
              </div>
            </div>
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium border shrink-0 ${statusColors[client.status] || ""}`}>
              {t(`statuses.${client.status}`)}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-xl border border-white/70 bg-white/80 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("clientDetail.status")}</p>
              <p className="mt-1 font-medium">{t(`statuses.${client.status}`)}</p>
            </div>
            <div className="rounded-xl border border-white/70 bg-white/80 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("clientDetail.createdDate")}</p>
              <p className="mt-1 font-medium">{fmtDate(client.createdAt)}</p>
            </div>
            <div className="rounded-xl border border-white/70 bg-white/80 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("clientDetail.history")}</p>
              <p className="mt-1 font-medium">{timelineNotes.length || 0}</p>
            </div>
          </div>

          <div className="flex gap-1">
            {statusFlow.map((s, i) => (
              <div
                key={s}
                className={`h-1.5 flex-1 rounded-full ${i <= currentIdx ? "bg-primary" : "bg-border"}`}
              />
            ))}
          </div>

          {client.badges && client.badges.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {client.badges.map((badge: string) => (
                <Badge key={badge} variant="outline" className="rounded-full bg-white/80">
                  {formatBadge(badge)}
                </Badge>
              ))}
            </div>
          )}
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
        <Button
          variant="outline"
          size="sm"
          className="flex-1 gap-1"
          onClick={() => {
            setBusinessLocationDraft(businessLocation || "");
            setShowLocationForm(!showLocationForm);
          }}
        >
          <MapPin className="w-4 h-4" />
          {t("clientDetail.addBusinessLocation")}
        </Button>
        <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={() => setShowActionForm(!showActionForm)}>
          <Calendar className="w-4 h-4" />
          {t("clientDetail.addAction")}
        </Button>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => navigate(`/calculator?clientId=${client.id}`)}>
          <Calculator className="w-4 h-4" />
        </Button>
      </div>

      {(businessLocation || showLocationForm) && (
        <Card>
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <MapPin className="w-4 h-4" />
              {t("clientDetail.businessLocation")}
            </div>
            {businessLocation && !showLocationForm && (
              <p className="text-sm font-medium">{businessLocation}</p>
            )}
            {showLocationForm && (
              <>
                <Input
                  value={businessLocationDraft}
                  onChange={(e) => setBusinessLocationDraft(e.target.value)}
                  placeholder={t("clientDetail.businessLocationPlaceholder")}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => saveBusinessLocationMutation.mutate()}
                    disabled={!businessLocationDraft.trim() || saveBusinessLocationMutation.isPending}
                  >
                    {t("common.save")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowLocationForm(false)}>
                    {t("common.cancel")}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

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
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-primary" />
            {t("clientDetail.aiPdfSummary")}
          </CardTitle>
          <CardDescription>{t("clientDetail.aiPdfSummaryHint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {pdfSummaryLoading ? (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              {t("questionnaire.aiThinking")}
            </div>
          ) : pdfSummary?.aiSummary ? (
            <>
              <p className="text-sm leading-relaxed">{pdfSummary.aiSummary}</p>
              {Array.isArray(pdfSummary.keyHighlights) && pdfSummary.keyHighlights.length > 0 && (
                <div className="space-y-1">
                  {pdfSummary.keyHighlights.map((highlight: string) => (
                    <div key={highlight} className="rounded-xl bg-white/80 border border-primary/10 px-3 py-2 text-xs">
                      {highlight}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("common.error")}</p>
          )}
        </CardContent>
      </Card>

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
      </div>

      <Button
        variant="outline"
        className="w-full gap-2"
        onClick={() => exportMutation.mutate()}
        disabled={exportMutation.isPending}
      >
        <Download className="w-4 h-4" />
        {exportMutation.isPending ? t("common.loading") : t("clientDetail.exportData")}
      </Button>

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
                  <span>{t("clientDetail.rateDependsOnProject")}</span>
                </div>
                <p className="text-sm font-semibold text-primary mt-1">{fmtNum(c.monthlyPayment)} / {t("calculator.months")}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {timelineNotes.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">{t("clientDetail.history")}</h3>
          {timelineNotes.map((n: any) => (
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
