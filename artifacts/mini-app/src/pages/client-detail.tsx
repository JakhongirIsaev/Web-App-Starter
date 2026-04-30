import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, getSignedImageUrl } from "@/lib/api";
import { getTelegramInitData } from "@/lib/telegram";
import { useLocation, useParams } from "wouter";
import { fmtDate, fmtDateTime, fmtNum } from "@/lib/format";
import {
  Monogram,
  StatusChip,
  SectionHeader,
  getInitials,
} from "@/components/ui-primitives";
import {
  ArrowLeft,
  Phone,
  MessageSquare,
  Calendar,
  ShoppingBag,
  Check,
  Calculator,
  Scan,
  Send,
  Loader2,
  CheckCircle,
  Image as ImageIcon,
  X,
  MapPin,
  Landmark,
  ChevronRight,
} from "lucide-react";

function SignedDocImage({
  doc,
  onPreview,
}: {
  doc: any;
  onPreview: (url: string) => void;
}) {
  const isAbsolute = typeof doc.storagePath === "string" && doc.storagePath.startsWith("http");

  const { data: signedUrl } = useQuery({
    queryKey: ["signed-image", doc.storagePath],
    queryFn: () => getSignedImageUrl(doc.storagePath),
    enabled: !!doc.storagePath && !isAbsolute,
    staleTime: 4 * 60 * 1000,
  });

  const src = isAbsolute ? doc.storagePath : signedUrl;

  return (
    <div className="relative group">
      {src ? (
        <img
          src={src}
          alt={doc.fileName}
          className="w-full h-24 object-cover rounded-xl border border-[#E2E8F0] cursor-pointer"
          onClick={() => onPreview(src)}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
            (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
          }}
        />
      ) : null}
      <div
        className={`${src ? "hidden" : ""} w-full h-24 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] flex flex-col items-center justify-center`}
      >
        <ImageIcon className="w-6 h-6 text-[#94A3B8]" />
      </div>
    </div>
  );
}

const statusFlow = [
  "draft",
  "questionnaire",
  "recommendation",
  "basket",
  "pdf_generated",
  "completed",
];

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

  /* ── queries ── */
  const { data, isLoading } = useQuery({
    queryKey: ["mini-client", params.id],
    queryFn: () => api.get(`/mini-app/clients/${params.id}`),
  });

  const { data: documents = [] } = useQuery({
    queryKey: ["client-documents", params.id],
    queryFn: () => api.get(`/mini-app/clients/${params.id}/documents`),
  });

  /* ── mutations ── */
  const deleteDocMutation = useMutation({
    mutationFn: (docId: number) => api.delete(`/mini-app/documents/${docId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-documents", params.id] });
    },
  });

  const addNoteMutation = useMutation({
    mutationFn: () =>
      api.post(`/mini-app/clients/${params.id}/notes`, {
        content: noteContent,
        type: "note",
      }),
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

  const saveLocationMutation = useMutation({
    mutationFn: ({ latitude, longitude }: { latitude: number; longitude: number }) =>
      api.put(`/mini-app/clients/${params.id}`, { latitude, longitude }),
    onSuccess: (updated: any) => {
      queryClient.invalidateQueries({ queryKey: ["mini-client", params.id] });
      alert(
        t("clientDetail.locationSaved", {
          lat: Number(updated?.latitude).toFixed(6),
          lng: Number(updated?.longitude).toFixed(6),
        }),
      );
    },
    onError: (err: any) => {
      alert(t("clientDetail.locationError") + (err?.message || String(err)));
    },
  });

  const [pdfResult, setPdfResult] = useState<{
    success: boolean;
    telegramSent: boolean;
  } | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const generatePdfMutation = useMutation({
    mutationFn: () => {
      const initData = getTelegramInitData();
      const body: Record<string, unknown> = {
        sendViaTelegram: Boolean(initData),
        language: i18n.language === "ru" ? "ru" : "uz",
      };
      if (initData) body.telegramInitData = initData;
      return api.post(`/mini-app/clients/${params.id}/generate-pdf`, body);
    },
    onMutate: () => setPdfError(null),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["mini-client", params.id] });
      setPdfResult(result);
    },
    onError: (err: any) => {
      setPdfError(err?.message || String(err) || t("pdf.generateFailed"));
    },
  });

  /* ── loading / error ── */
  if (isLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--tg-bg, #F4F4F5)" }}
      >
        <Loader2 className="w-6 h-6 animate-spin text-[#64748B]" />
      </div>
    );
  }
  if (!data?.client) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--tg-bg, #F4F4F5)" }}
      >
        <p className="text-[14px] text-[#64748B]">{t("common.error")}</p>
      </div>
    );
  }

  const { client, notes, nextActions, basketItems, calculations } = data;
  const currentIdx = statusFlow.indexOf(client.status);
  const savedLatitude = client.latitude !== null && client.latitude !== undefined ? Number(client.latitude) : null;
  const savedLongitude = client.longitude !== null && client.longitude !== undefined ? Number(client.longitude) : null;
  const hasBusinessLocation =
    Number.isFinite(savedLatitude) && Number.isFinite(savedLongitude);
  const mapUrl = hasBusinessLocation
    ? `https://maps.google.com/?q=${savedLatitude},${savedLongitude}`
    : null;

  const handleSaveBusinessLocation = () => {
    if (!navigator.geolocation) {
      alert(t("clientDetail.locationNotSupported"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) =>
        saveLocationMutation.mutate({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }),
      (err) => alert(t("clientDetail.locationError") + err.message),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const getNextAction = () => {
    if (client.status === "draft")
      return {
        label: t("clientDetail.startQuestionnaire"),
        path: `/questionnaire/${client.id}`,
      };
    if (client.status === "questionnaire")
      return {
        label: t("clientDetail.startQuestionnaire"),
        path: `/questionnaire/${client.id}`,
      };
    if (client.status === "recommendation")
      return {
        label: t("basket.title"),
        path: `/recommendation/${client.id}`,
      };
    return null;
  };

  const nextStep = getNextAction();

  const getActionTypeLabel = (value: string) => ({
    follow_up: t("home.followUp"),
    meeting: t("home.meeting"),
    proposal: t("home.proposal"),
    documents: t("home.documents"),
  }[value] ?? value);

  const getPriorityLabel = (value: string) => ({
    high: t("clientDetail.high"),
    medium: t("clientDetail.medium"),
    low: t("clientDetail.low"),
  }[value] ?? value);

  const getProductTypeLabel = (value: string) => ({
    credit: t("clientDetail.productTypes.credit"),
    non_credit: t("clientDetail.productTypes.nonCredit"),
  }[value] ?? value);

  /* ── timeline events from notes ── */
  const timelineColors: Record<string, { bg: string; fg: string }> = {
    note: { bg: "#DBEAFE", fg: "#2563EB" },
    status_change: { bg: "#ECFDF3", fg: "#16A34A" },
    action: { bg: "#FEF3C7", fg: "#D97706" },
    system: { bg: "#F1F5F9", fg: "#64748B" },
  };

  return (
    <div
      className="min-h-screen pb-8"
      style={{ background: "var(--tg-bg, #F4F4F5)" }}
    >
      {/* ═══════════════ BACK BUTTON ═══════════════ */}
      <div className="px-4 pt-3 pb-2">
        <button
          onClick={() => navigate("/clients")}
          className="flex items-center gap-1 text-[13px] font-semibold text-[#64748B]"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("common.back")}
        </button>
      </div>

      {/* ═══════════════ HERO CARD ═══════════════ */}
      <div className="mx-4 mn-card p-5">
        <div className="flex items-center gap-4">
          <Monogram text={getInitials(client.fullName)} size={56} />
          <div className="flex-1 min-w-0">
            <div className="text-[18px] font-bold text-[#0F172A] truncate">
              {client.fullName || t("clients.anonymous")}
            </div>
            <div className="text-[13px] text-[#64748B] mt-0.5">
              {client.phone || t("clients.noPhone")}
            </div>
            <div className="mt-2">
              <StatusChip status={client.status} />
            </div>
          </div>
        </div>

        {/* Status progress bar */}
        <div className="flex gap-1 mt-4">
          {statusFlow.map((s, i) => (
            <div
              key={s}
              className="h-1.5 flex-1 rounded-full"
              style={{
                background: i <= currentIdx ? "#16A34A" : "#E2E8F0",
              }}
            />
          ))}
        </div>
      </div>

      {/* ═══════════════ NEXT STEP CTA ═══════════════ */}
      {nextStep && (
        <div className="mx-4 mt-3">
          <button
            onClick={() => navigate(nextStep.path)}
            className="w-full h-11 rounded-xl text-[14px] font-bold text-white active:scale-[0.98] transition-transform"
            style={{ background: "#16A34A" }}
          >
            {nextStep.label}
          </button>
        </div>
      )}

      {/* ═══════════════ COLLATERAL ENTRY ═══════════════ */}
      <div className="mx-4 mt-3">
        <button
          onClick={() => navigate(`/clients/${client.id}/collateral`)}
          className="w-full rounded-2xl p-4 text-left active:scale-[0.98] transition-transform shadow-[0_10px_24px_rgba(13,61,26,0.16)]"
          style={{ background: "linear-gradient(135deg, #0D3D1A 0%, #16A34A 100%)" }}
        >
          <div className="flex items-center gap-3 text-white">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/16">
              <Landmark className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-bold">{t("collateral.title")}</div>
              <div className="mt-0.5 text-[12px] font-medium text-white/78">
                {t("collateral.estimateTitle")}
              </div>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-white/75" />
          </div>
        </button>
      </div>

      {/* ═══════════════ KEY FIGURES ═══════════════ */}
      {(calculations?.length > 0 || basketItems?.length > 0) && (
        <div className="mx-4 mt-3">
          <div className="mn-card p-4">
            {calculations?.length > 0 && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wide">
                    {t("calculator.loanAmount")}
                  </div>
                  <div className="text-[20px] font-bold text-[#0F172A] mt-1">
                    {fmtNum(calculations[0].loanAmount)}{" "}
                    <span className="text-[13px] font-semibold text-[#64748B]">
                      {calculations[0].currency}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wide">
                    {t("calculator.interestRate")}
                  </div>
                  <div className="text-[20px] font-bold text-[#0F172A] mt-1">
                    {calculations[0].interestRate}%
                  </div>
                </div>
              </div>
            )}

            {basketItems?.length > 0 && (
              <button
                onClick={() => navigate(`/basket/${client.id}`)}
                className="w-full flex items-center gap-3 mt-3 p-3 rounded-xl text-left active:scale-[0.99] transition-transform"
                style={{ background: "#F3E8FF" }}
              >
                <ShoppingBag className="w-5 h-5 text-[#7C3AED] shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-[#7C3AED]">
                    {t("clientDetail.basket")} ({basketItems.length})
                  </div>
                  <div className="text-[12px] text-[#7C3AED]/70 truncate">
                    {basketItems.map((i: any) => i.productName).join(", ")}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-[#7C3AED]/50 shrink-0" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════ CONTACT INFO ═══════════════ */}
      <div className="mx-4 mt-3">
        <div className="mn-card overflow-hidden">
          {client.phone && (
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#F1F5F9]">
              <Phone className="w-4 h-4 text-[#64748B] shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-[#64748B]">
                  {t("clientDetail.phone")}
                </div>
                <div className="text-[14px] font-semibold text-[#0F172A]">
                  {client.phone}
                </div>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#F1F5F9]">
            <Calendar className="w-4 h-4 text-[#64748B] shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-[#64748B]">
                {t("clientDetail.createdAt")}
              </div>
              <div className="text-[14px] font-semibold text-[#0F172A]">
                {fmtDate(client.createdAt)}
              </div>
            </div>
          </div>
          {client.address && (
            <div className="flex items-center gap-3 px-4 py-3.5">
              <MapPin className="w-4 h-4 text-[#64748B] shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-[#64748B]">
                  {t("clientDetail.address")}
                </div>
                <div className="text-[14px] font-semibold text-[#0F172A]">
                  {client.address}
                </div>
              </div>
            </div>
          )}
          {client.gender && (
            <div className="flex items-center gap-3 px-4 py-3.5 border-t border-[#F1F5F9]">
              <div className="w-4 h-4 rounded-full bg-[#E2E8F0] shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-[#64748B]">
                  {t("clientDetail.gender")}
                </div>
                <div className="text-[14px] font-semibold text-[#0F172A]">
                  {client.gender === "female"
                    ? t("clientDetail.genderFemale")
                    : t("clientDetail.genderMale")}
                </div>
              </div>
            </div>
          )}
          {hasBusinessLocation && mapUrl && (
            <button
              onClick={() => window.open(mapUrl, "_blank", "noopener,noreferrer")}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
            >
              <MapPin className="w-4 h-4 text-[#16A34A] shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-[#64748B]">
                  {t("clientDetail.businessLocation")}
                </div>
                <div className="text-[14px] font-semibold text-[#0F172A]">
                  {Number(savedLatitude).toFixed(6)}, {Number(savedLongitude).toFixed(6)}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#94A3B8] shrink-0" />
            </button>
          )}
        </div>
      </div>

      {/* ═══════════════ ACTION BUTTONS ROW ═══════════════ */}
      <div className="mx-4 mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={() => setShowNoteForm(!showNoteForm)}
          className="mn-card flex items-center justify-center gap-2 py-3 text-[13px] font-semibold text-[#0F172A] active:scale-[0.97] transition-transform"
        >
          <MessageSquare className="w-4 h-4 text-[#64748B]" />
          {t("clientDetail.addNote")}
        </button>
        <button
          onClick={handleSaveBusinessLocation}
          disabled={saveLocationMutation.isPending}
          className="mn-card flex items-center justify-center gap-2 py-3 text-[13px] font-semibold text-[#0F172A] active:scale-[0.97] transition-transform disabled:opacity-60"
        >
          <MapPin className="w-4 h-4 text-[#64748B]" />
          {t("clientDetail.businessLocation")}
        </button>
        <button
          onClick={() => setShowActionForm(!showActionForm)}
          className="mn-card flex items-center justify-center gap-2 py-3 text-[13px] font-semibold text-[#0F172A] active:scale-[0.97] transition-transform"
        >
          <Calendar className="w-4 h-4 text-[#64748B]" />
          {t("clientDetail.addAction")}
        </button>
        <button
          onClick={() => navigate(`/calculator?clientId=${client.id}`)}
          className="mn-card flex items-center justify-center gap-2 py-3 text-[13px] font-semibold text-[#0F172A] active:scale-[0.97] transition-transform"
        >
          <Calculator className="w-4 h-4 text-[#64748B]" />
          {t("nav.calculator")}
        </button>
      </div>

      {/* ── Scan document button ── */}
      <div className="mx-4 mt-2">
        <button
          onClick={() => navigate(`/scan/${client.id}`)}
          className="w-full mn-card flex items-center justify-center gap-2 py-3 text-[13px] font-semibold text-[#16A34A] active:scale-[0.97] transition-transform"
        >
          <Scan className="w-4 h-4" />
          {t("scanDoc.scanDocument")}
        </button>
      </div>

      {/* ═══════════════ NOTE FORM ═══════════════ */}
      {showNoteForm && (
        <div className="mx-4 mt-3 mn-card p-4 space-y-3">
          <input
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            placeholder={t("clientDetail.notePlaceholder")}
            className="w-full h-10 px-3 bg-[#F4F4F5] rounded-xl text-[14px] text-[#0F172A] placeholder:text-[#94A3B8] border-0 outline-none focus:ring-2 focus:ring-[#16A34A]/30"
          />
          <div className="flex gap-2">
            <button
              onClick={() => addNoteMutation.mutate()}
              disabled={!noteContent || addNoteMutation.isPending}
              className="h-9 px-4 rounded-lg text-[13px] font-semibold text-white disabled:opacity-50"
              style={{ background: "#16A34A" }}
            >
              {t("common.save")}
            </button>
            <button
              onClick={() => setShowNoteForm(false)}
              className="h-9 px-4 rounded-lg text-[13px] font-semibold text-[#64748B]"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════ ACTION FORM ═══════════════ */}
      {showActionForm && (
        <div className="mx-4 mt-3 mn-card p-4 space-y-3">
          <select
            value={actionType}
            onChange={(e) => setActionType(e.target.value)}
            className="w-full h-10 px-3 bg-[#F4F4F5] rounded-xl text-[14px] text-[#0F172A] border-0 outline-none"
          >
            <option value="follow_up">{t("home.followUp")}</option>
            <option value="meeting">{t("home.meeting")}</option>
            <option value="proposal">{t("home.proposal")}</option>
            <option value="documents">{t("home.documents")}</option>
          </select>
          <input
            type="date"
            value={actionDate}
            onChange={(e) => setActionDate(e.target.value)}
            className="w-full h-10 px-3 bg-[#F4F4F5] rounded-xl text-[14px] text-[#0F172A] border-0 outline-none"
          />
          <select
            value={actionPriority}
            onChange={(e) => setActionPriority(e.target.value)}
            className="w-full h-10 px-3 bg-[#F4F4F5] rounded-xl text-[14px] text-[#0F172A] border-0 outline-none"
          >
            <option value="high">{t("clientDetail.high")}</option>
            <option value="medium">{t("clientDetail.medium")}</option>
            <option value="low">{t("clientDetail.low")}</option>
          </select>
          <div className="flex gap-2">
            <button
              onClick={() => addActionMutation.mutate()}
              disabled={!actionDate || addActionMutation.isPending}
              className="h-9 px-4 rounded-lg text-[13px] font-semibold text-white disabled:opacity-50"
              style={{ background: "#16A34A" }}
            >
              {t("common.save")}
            </button>
            <button
              onClick={() => setShowActionForm(false)}
              className="h-9 px-4 rounded-lg text-[13px] font-semibold text-[#64748B]"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════ NEXT ACTIONS ═══════════════ */}
      {nextActions?.length > 0 && (
        <div className="mx-4 mt-4">
          <SectionHeader title={t("clientDetail.nextAction")} />
          <div className="mn-card overflow-hidden">
            {nextActions.map((a: any, i: number) => (
              <div
                key={a.id}
                className={`flex items-center gap-3 px-4 py-3.5 ${
                  i < nextActions.length - 1 ? "border-b border-[#F1F5F9]" : ""
                }`}
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: "#ECFDF3" }}
                >
                  <Calendar className="w-4 h-4 text-[#16A34A]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-semibold text-[#0F172A]">
                    {getActionTypeLabel(a.actionType)}
                  </div>
                  <div className="text-[12px] text-[#64748B] mt-0.5">
                    {fmtDate(a.actionDate)} &middot; {getPriorityLabel(a.priority)}
                  </div>
                </div>
                <button
                  onClick={() => completeActionMutation.mutate(a.id)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: "#ECFDF3" }}
                >
                  <Check className="w-4 h-4 text-[#16A34A]" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════ DOCUMENTS GALLERY ═══════════════ */}
      {(documents as any[]).length > 0 && (
        <div className="mx-4 mt-4">
          <SectionHeader
            title={`${t("scanDoc.documents")} (${(documents as any[]).length})`}
          />

          <div className="grid grid-cols-3 gap-2 mb-2">
            {(documents as any[]).map((doc: any) => (
              <div key={doc.id} className="relative group">
                <SignedDocImage doc={doc} onPreview={setPreviewImage} />
                <button
                  onClick={() => deleteDocMutation.mutate(doc.id)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[#EF4444] text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
                {doc.extractedData &&
                  Object.keys(doc.extractedData).length > 0 && (
                    <div className="absolute bottom-1 left-1 right-1">
                      <div className="bg-black/60 text-white text-[8px] rounded px-1 py-0.5 truncate">
                        {Object.values(doc.extractedData)[0] as string}
                      </div>
                    </div>
                  )}
              </div>
            ))}
          </div>

          {(documents as any[]).some(
            (d: any) =>
              d.extractedData && Object.keys(d.extractedData).length > 0,
          ) && (
            <div className="mn-card p-3 space-y-1 mb-2">
              <p className="text-[11px] font-semibold text-[#64748B] mb-1">
                {t("scanDoc.extractedFields")}
              </p>
              {(documents as any[]).map((doc: any) =>
                doc.extractedData &&
                Object.entries(doc.extractedData).map(([k, v]) => (
                  <div
                    key={`${doc.id}-${k}`}
                    className="flex items-center justify-between py-1 border-b border-[#F1F5F9] last:border-0"
                  >
                    <span className="text-[11px] text-[#64748B]">
                      {t(`scanDoc.fields.${k}`, k)}
                    </span>
                    <span className="text-[12px] font-semibold text-[#0F172A] text-right max-w-[60%] truncate">
                      {String(v)}
                    </span>
                  </div>
                )),
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ BASKET ITEMS (expanded) ═══════════════ */}
      {basketItems?.length > 0 && !calculations?.length && (
        <div className="mx-4 mt-4">
          <SectionHeader title={t("clientDetail.basket")} />
          {basketItems.map((item: any) => (
            <div key={item.id} className="mn-card p-4 mb-2">
              <div className="text-[14px] font-semibold text-[#0F172A]">
                {item.productName}
              </div>
              <div className="text-[12px] text-[#64748B] mt-0.5">
                {getProductTypeLabel(item.productType)}
              </div>
              {item.notes && (
                <div className="mt-2 text-[12px] text-[#64748B] leading-relaxed line-clamp-3">
                  {item.notes}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ═══════════════ PDF GENERATION ═══════════════ */}
      <div className="mx-4 mt-4">
        {pdfResult ? (
          <div className="mn-card p-5 text-center" style={{ background: "#F0FDF4" }}>
            <CheckCircle className="w-10 h-10 text-[#16A34A] mx-auto mb-2" />
            <button
              onClick={() => setPdfResult(null)}
              className="mt-3 h-9 px-4 rounded-lg text-[13px] font-semibold text-[#16A34A] border border-[#16A34A]/30"
            >
              {t("pdf.generateAgain")}
            </button>
          </div>
        ) : (
          <button
            onClick={() => generatePdfMutation.mutate()}
            disabled={generatePdfMutation.isPending}
            className="w-full h-12 rounded-xl text-[14px] font-bold text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60"
            style={{
              background:
                client.status === "basket" || basketItems?.length > 0
                  ? "#16A34A"
                  : "#FFFFFF",
              color:
                client.status === "basket" || basketItems?.length > 0
                  ? "#FFFFFF"
                  : "#16A34A",
              border:
                client.status === "basket" || basketItems?.length > 0
                  ? "none"
                  : "1px solid rgba(22,163,74,0.3)",
              boxShadow:
                client.status === "basket" || basketItems?.length > 0
                  ? "0 2px 8px rgba(22,163,74,0.25)"
                  : "none",
            }}
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
          </button>
        )}
        {pdfError && !generatePdfMutation.isPending && (
          <p className="mt-2 text-[12px] text-[#EF4444] break-words">
            {t("common.error")}: {pdfError}
          </p>
        )}
      </div>

      {/* ═══════════════ CALCULATIONS (detailed) ═══════════════ */}
      {calculations?.length > 0 && (
        <div className="mx-4 mt-4">
          <SectionHeader title={t("clientDetail.calculations")} />
          {calculations.map((c: any) => (
            <div key={c.id} className="mn-card p-4 mb-2">
              <div className="text-[14px] font-semibold text-[#0F172A]">
                {c.productName}
              </div>
              <div className="flex gap-4 text-[12px] text-[#64748B] mt-1.5">
                <span>
                  {fmtNum(c.loanAmount)} {c.currency}
                </span>
                <span>
                  {c.termMonths} {t("calculator.months")}
                </span>
                <span>{c.interestRate}%</span>
              </div>
              <div className="mt-2 text-[15px] font-bold text-[#16A34A]">
                {t("calculator.monthlyPayment")}: {fmtNum(c.monthlyPayment)}{" "}
                {c.currency}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══════════════ TIMELINE ═══════════════ */}
      {notes?.length > 0 && (
        <div className="mx-4 mt-4">
          <SectionHeader title={t("clientDetail.history")} />
          <div className="mn-card p-4">
            {notes.map((n: any, i: number) => {
              const tc = timelineColors[n.type] || timelineColors.note;
              return (
                <div key={n.id} className="flex gap-3">
                  {/* vertical connector */}
                  <div className="flex flex-col items-center">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: tc.bg }}
                    >
                      <MessageSquare
                        className="w-3.5 h-3.5"
                        style={{ color: tc.fg }}
                      />
                    </div>
                    {i < notes.length - 1 && (
                      <div className="w-px flex-1 bg-[#E2E8F0] my-1" />
                    )}
                  </div>
                  {/* content */}
                  <div className={`flex-1 min-w-0 ${i < notes.length - 1 ? "pb-4" : ""}`}>
                    <div className="text-[13px] text-[#0F172A] leading-relaxed">
                      {n.content}
                    </div>
                    <div className="text-[11px] text-[#94A3B8] mt-1">
                      {n.userName} &middot; {fmtDateTime(n.createdAt)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════════════ IMAGE PREVIEW MODAL ═══════════════ */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <button
            className="absolute top-4 right-4 text-white"
            onClick={() => setPreviewImage(null)}
          >
            <X className="w-8 h-8" />
          </button>
          <img
            src={previewImage}
            alt={t("scanDoc.previewAlt")}
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        </div>
      )}
    </div>
  );
}
