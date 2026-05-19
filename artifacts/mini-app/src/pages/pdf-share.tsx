import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth-context";
import { api, buildApiUrl } from "@/lib/api";
import { getTelegramInitData } from "@/lib/telegram";
import {
  Monogram,
  getInitials,
} from "@/components/ui-primitives";
import {
  ArrowLeft,
  CheckCircle,
  MessageCircle,
  Forward,
  Download,
  Link2,
  FileText,
  User,
  Loader2,
  Check,
} from "lucide-react";

export default function PdfSharePage() {
  const { t, i18n } = useTranslation();
  const params = useParams<{ clientId: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [downloading, setDownloading] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["mini-client", params.clientId],
    queryFn: () => api.get(`/mini-app/clients/${params.clientId}`),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F4F4F5] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[#272424]" />
      </div>
    );
  }

  if (!data?.client) {
    return (
      <div className="min-h-screen bg-[#F4F4F5] flex items-center justify-center">
        <p className="text-[#64748B] text-sm">{t("common.error")}</p>
      </div>
    );
  }

  const { client, basketItems = [] } = data;
  const initials = getInitials(client.fullName);
  const productsCount = basketItems.length;
  const pagesCount = Math.max(productsCount + 1, 2);
  const filePrefix = i18n.language === "ru" ? "predlozhenie" : "taklif";
  const fallbackName = i18n.language === "ru" ? "klient" : "mijoz";
  const fileName = `${filePrefix}_${(client.fullName || fallbackName).replace(/\s+/g, "_")}.pdf`;
  const fileSize = `${(0.8 + productsCount * 0.3).toFixed(1)} MB`;

  const language = i18n.language === "ru" ? "ru" : "uz";

  const handleSendTelegram = async () => {
    setSending(true);
    setSendResult(null);
    try {
      const initData = getTelegramInitData();
      const body: Record<string, unknown> = {
        sendViaTelegram: true,
        language,
      };
      if (initData) body.telegramInitData = initData;
      const result = await api.post(`/mini-app/clients/${params.clientId}/generate-pdf`, body) as any;
      setSendResult(result?.telegramSent ? "sent" : "not_sent");
    } catch {
      setSendResult("error");
    } finally {
      setSending(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const blob = await api.getBlob(`/mini-app/clients/${params.clientId}/download-pdf?language=${language}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch { /* ignore */ } finally {
      setDownloading(false);
    }
  };

  const handleCopyLink = async () => {
    const url = buildApiUrl(`/api/mini-app/clients/${params.clientId}/download-pdf?language=${language}`);
    const fullUrl = url.startsWith("http") ? url : `${window.location.origin}${url}`;
    await navigator.clipboard.writeText(fullUrl).catch(() => {});
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const handleForward = async () => {
    const url = buildApiUrl(`/api/mini-app/clients/${params.clientId}/download-pdf?language=${language}`);
    const fullUrl = url.startsWith("http") ? url : `${window.location.origin}${url}`;
    const text = language === "ru"
      ? `Коммерческое предложение: ${client.fullName}`
      : `Tijorat taklifi: ${client.fullName}`;
    if (navigator.share) {
      await navigator.share({ title: text, url: fullUrl }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(`${text}\n${fullUrl}`).catch(() => {});
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  };

  /* ── Action grid items ── */
  const shareActions = [
    {
      label: sending ? t("common.loading") : sendResult === "sent" ? t("pdfShare.sent") : t("pdfShare.chat"),
      Icon: sending ? Loader2 : sendResult === "sent" ? Check : MessageCircle,
      primary: true,
      disabled: sending,
      onClick: handleSendTelegram,
    },
    {
      label: t("pdfShare.forward"),
      Icon: Forward,
      primary: false,
      disabled: false,
      onClick: handleForward,
    },
    {
      label: downloading ? t("common.loading") : t("pdfShare.download"),
      Icon: downloading ? Loader2 : Download,
      primary: false,
      disabled: downloading,
      onClick: handleDownload,
    },
    {
      label: linkCopied ? t("pdfShare.copied") : t("pdfShare.copyLink"),
      Icon: linkCopied ? Check : Link2,
      primary: false,
      disabled: false,
      onClick: handleCopyLink,
    },
  ];

  return (
    <div className="min-h-screen bg-[#F4F4F5]">
      {/* ── Back button ── */}
      <div className="bg-[#F4F4F5] px-5 pt-3 pb-1">
        <button
          onClick={() => navigate(`/basket/${params.clientId}`)}
          className="flex items-center gap-1 text-[13px] text-[#64748B] font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("common.back")}
        </button>
      </div>

      <div className="px-5 pt-3 pb-8 space-y-4">
        {/* ── Success ribbon ── */}
        <div
          className="rounded-[16px] p-5 flex flex-col items-center text-center"
          style={{
            background: "linear-gradient(135deg, #FFD531 0%, #FFE066 50%, #FFD531 100%)",
            boxShadow: "0 4px 20px rgba(255,213,49,0.35)",
          }}
        >
          <div className="w-14 h-14 rounded-full bg-[#272424]/15 flex items-center justify-center mb-3">
            <CheckCircle className="w-8 h-8 text-[#272424]" />
          </div>
          <div className="text-[18px] font-bold text-[#272424]">{t("pdf.generated")}</div>
          <div className="flex items-center gap-2 mt-2 text-[12px] text-[#272424]/75">
            <FileText className="w-3.5 h-3.5" />
            <span>{fileName}</span>
            <span className="w-[3px] h-[3px] rounded-full bg-white/50" />
            <span>{fileSize}</span>
          </div>
        </div>

        {/* ── PDF preview mockup ── */}
        <div className="mn-card overflow-hidden">
          <div className="aspect-[210/297] relative bg-white p-5 flex flex-col">
            {/* PDF mockup header — neutral branding */}
            <div className="flex items-center gap-3 pb-3 border-b border-[#E2E8F0]">
              <div className="w-10 h-10 rounded-lg bg-[#FFD531] flex items-center justify-center">
                <span className="text-[#272424] font-bold text-[14px]">M</span>
              </div>
              <div>
                <div className="text-[13px] font-bold text-[#0F172A]">
                  Minerva
                </div>
                <div className="text-[9px] text-[#64748B]">
                  Коммерческое предложение
                </div>
              </div>
            </div>

            {/* Client line */}
            <div className="flex items-center gap-2 mt-3">
              <Monogram text={initials} size={24} />
              <span className="text-[11px] font-semibold text-[#0F172A]">
                {client.fullName}
              </span>
            </div>

            {/* Placeholder paragraph lines */}
            <div className="mt-3 space-y-1.5">
              <div className="h-[6px] w-full bg-[#F1F5F9] rounded-sm" />
              <div className="h-[6px] w-[90%] bg-[#F1F5F9] rounded-sm" />
              <div className="h-[6px] w-[75%] bg-[#F1F5F9] rounded-sm" />
            </div>

            {/* Product blocks */}
            <div className="mt-4 space-y-2 flex-1">
              <div className="h-12 rounded-lg bg-[#FFF7D6] border border-[#FCE588] flex items-center px-3 gap-2">
                <div className="w-6 h-6 rounded bg-[#FFD531]/40" />
                <div className="flex-1 space-y-1">
                  <div className="h-[5px] w-[60%] bg-[#FFD531]/50 rounded-sm" />
                  <div className="h-[4px] w-[40%] bg-[#FFD531]/30 rounded-sm" />
                </div>
              </div>
              <div className="h-12 rounded-lg bg-[#EFF6FF] border border-[#DBEAFE] flex items-center px-3 gap-2">
                <div className="w-6 h-6 rounded bg-[#3B82F6]/20" />
                <div className="flex-1 space-y-1">
                  <div className="h-[5px] w-[55%] bg-[#3B82F6]/20 rounded-sm" />
                  <div className="h-[4px] w-[35%] bg-[#3B82F6]/10 rounded-sm" />
                </div>
              </div>

              {/* Schedule bar chart */}
              <div className="mt-3">
                <div className="text-[8px] text-[#64748B] mb-1.5">График платежей</div>
                <div className="flex items-end gap-[3px] h-10">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-t-sm"
                      style={{
                        height: `${30 + Math.sin(i * 0.5) * 15 + Math.random() * 10}%`,
                        background:
                          i < 6
                            ? "linear-gradient(180deg, #FFD531 0%, #FFE066 100%)"
                            : "linear-gradient(180deg, #3B82F6 0%, #60A5FA 100%)",
                        opacity: 0.7,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-[#E2E8F0] pt-2 mt-3 flex items-center justify-between">
              <div className="text-[7px] text-[#94A3B8]">
                minerva
              </div>
              <div className="text-[7px] text-[#94A3B8]">
                Стр. 1 из {pagesCount}
              </div>
            </div>
          </div>
        </div>

        {/* ── Page indicator dots ── */}
        <div className="flex items-center justify-center gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all ${
                i === 0
                  ? "w-6 h-2 bg-[#FFD531]"
                  : "w-2 h-2 bg-[#CBD5E1]"
              }`}
            />
          ))}
        </div>

        {/* ── Share actions (2x2 grid) ── */}
        <div className="grid grid-cols-2 gap-3">
          {shareActions.map((action, idx) => {
            const Icon = action.Icon;
            return (
              <button
                key={idx}
                onClick={action.onClick}
                disabled={action.disabled}
                className={`flex flex-col items-center justify-center gap-2 py-5 rounded-[14px] text-[13px] font-semibold transition-all active:scale-[0.97] disabled:opacity-60 ${
                  action.primary
                    ? "bg-[#FFD531] text-[#272424] shadow-[0_4px_12px_rgba(255,213,49,0.4)]"
                    : "bg-white text-[#0F172A] shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
                }`}
              >
                <Icon className={`w-6 h-6 ${action.disabled ? "animate-spin" : ""}`} />
                {action.label}
              </button>
            );
          })}
        </div>

        {/* ── Metadata card ── */}
        <div className="mn-card p-4 space-y-3">
          <div className="text-[11px] text-[#64748B] uppercase tracking-wide font-semibold">
            {t("pdfShare.info")}
          </div>

          <div className="flex items-center gap-3 py-2 border-b border-[#F1F5F9]">
            <div className="w-8 h-8 rounded-lg bg-[#F4F4F5] flex items-center justify-center">
              <User className="w-4 h-4 text-[#64748B]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-[#64748B]">{t("pdfShare.client")}</div>
              <div className="text-[14px] font-semibold text-[#0F172A] truncate">
                {client.fullName || "---"}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-[11px] text-[#64748B]">{t("pdfShare.products")}</div>
              <div className="text-[15px] font-bold text-[#0F172A] mt-0.5">
                {productsCount}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[#64748B]">{t("pdfShare.pages")}</div>
              <div className="text-[15px] font-bold text-[#0F172A] mt-0.5">
                {pagesCount}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[#64748B]">{t("pdfShare.author")}</div>
              <div className="text-[14px] font-bold text-[#0F172A] mt-0.5 truncate">
                {user?.name || "---"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
