import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
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
} from "lucide-react";

export default function PdfSharePage() {
  const { t, i18n } = useTranslation();
  const params = useParams<{ clientId: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["mini-client", params.clientId],
    queryFn: () => api.get(`/mini-app/clients/${params.clientId}`),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F4F4F5] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[#16A34A]" />
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

  /* ── Action grid items ── */
  const shareActions = [
    {
      label: t("pdfShare.chat"),
      Icon: MessageCircle,
      primary: true,
      onClick: () => {
        /* placeholder: send via Telegram */
      },
    },
    {
      label: t("pdfShare.forward"),
      Icon: Forward,
      primary: false,
      onClick: () => {
        /* placeholder: forward */
      },
    },
    {
      label: t("pdfShare.download"),
      Icon: Download,
      primary: false,
      onClick: () => {
        /* placeholder: download PDF */
      },
    },
    {
      label: t("pdfShare.copyLink"),
      Icon: Link2,
      primary: false,
      onClick: () => {
        /* placeholder: copy link */
      },
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
            background: "linear-gradient(135deg, #15803D 0%, #16A34A 50%, #22C55E 100%)",
            boxShadow: "0 4px 20px rgba(22,163,74,0.25)",
          }}
        >
          <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center mb-3">
            <CheckCircle className="w-8 h-8 text-white" />
          </div>
          <div className="text-[18px] font-bold text-white">{t("pdf.generated")}</div>
          <div className="flex items-center gap-2 mt-2 text-[12px] text-white/80">
            <FileText className="w-3.5 h-3.5" />
            <span>{fileName}</span>
            <span className="w-[3px] h-[3px] rounded-full bg-white/50" />
            <span>{fileSize}</span>
          </div>
        </div>

        {/* ── PDF preview mockup ── */}
        <div className="mn-card overflow-hidden">
          <div className="aspect-[210/297] relative bg-white p-5 flex flex-col">
            {/* Fake Ipak Yuli header */}
            <div className="flex items-center gap-3 pb-3 border-b border-[#E2E8F0]">
              <div className="w-10 h-10 rounded-lg bg-[#16A34A] flex items-center justify-center">
                <span className="text-white font-bold text-[14px]">IY</span>
              </div>
              <div>
                <div className="text-[13px] font-bold text-[#0F172A]">
                  Ipak Yo'li Bank
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
              <div className="h-12 rounded-lg bg-[#ECFDF3] border border-[#D1FAE5] flex items-center px-3 gap-2">
                <div className="w-6 h-6 rounded bg-[#16A34A]/20" />
                <div className="flex-1 space-y-1">
                  <div className="h-[5px] w-[60%] bg-[#16A34A]/20 rounded-sm" />
                  <div className="h-[4px] w-[40%] bg-[#16A34A]/10 rounded-sm" />
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
                            ? "linear-gradient(180deg, #16A34A 0%, #22C55E 100%)"
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
                ipak-yuli.uz
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
                  ? "w-6 h-2 bg-[#16A34A]"
                  : "w-2 h-2 bg-[#CBD5E1]"
              }`}
            />
          ))}
        </div>

        {/* ── Share actions (2x2 grid) ── */}
        <div className="grid grid-cols-2 gap-3">
          {shareActions.map((action) => {
            const Icon = action.Icon;
            return (
              <button
                key={action.label}
                onClick={action.onClick}
                className={`flex flex-col items-center justify-center gap-2 py-5 rounded-[14px] text-[13px] font-semibold transition-all active:scale-[0.97] ${
                  action.primary
                    ? "bg-[#16A34A] text-white shadow-[0_4px_12px_rgba(22,163,74,0.3)]"
                    : "bg-white text-[#0F172A] shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
                }`}
              >
                <Icon className="w-6 h-6" />
                {action.label}
              </button>
            );
          })}
        </div>

        {/* ── Metadata card ── */}
        <div className="mn-card p-4 space-y-3">
          <div className="text-[11px] text-[#64748B] uppercase tracking-wide font-semibold">
            Информация
          </div>

          <div className="flex items-center gap-3 py-2 border-b border-[#F1F5F9]">
            <div className="w-8 h-8 rounded-lg bg-[#F4F4F5] flex items-center justify-center">
              <User className="w-4 h-4 text-[#64748B]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-[#64748B]">Клиент</div>
              <div className="text-[14px] font-semibold text-[#0F172A] truncate">
                {client.fullName || "---"}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-[11px] text-[#64748B]">Продуктов</div>
              <div className="text-[15px] font-bold text-[#0F172A] mt-0.5">
                {productsCount}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[#64748B]">Страниц</div>
              <div className="text-[15px] font-bold text-[#0F172A] mt-0.5">
                {pagesCount}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[#64748B]">Автор</div>
              <div className="text-[14px] font-bold text-[#0F172A] mt-0.5 truncate">
                {user?.name?.split(" ")[0] || "---"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
