import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { getTelegramInitData } from "@/lib/telegram";
import {
  Monogram,
  StatusChip,
  getInitials,
  fmtShort,
} from "@/components/ui-primitives";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  FileText,
  ShoppingBag,
  Briefcase,
  Home,
  Landmark,
  Car,
  Lightbulb,
  ChevronRight,
} from "lucide-react";

/* ── product-type visual mapping ── */
const TYPE_THEME: Record<string, { bg: string; fg: string; Icon: typeof Briefcase }> = {
  business: { bg: "#ECFDF3", fg: "#15803D", Icon: Briefcase },
  mortgage: { bg: "#EFF6FF", fg: "#1D4ED8", Icon: Home },
  micro:    { bg: "#FFFBEB", fg: "#B45309", Icon: Landmark },
  auto:     { bg: "#FAF5FF", fg: "#7E22CE", Icon: Car },
};

function resolveTypeTheme(productType: string | undefined) {
  if (!productType) return TYPE_THEME.business;
  const key = productType.toLowerCase();
  return TYPE_THEME[key] ?? TYPE_THEME.business;
}

/* ── mock calculation helpers (would come from backend) ── */
function mockAmount(id: number) {
  return ((id * 137 + 42) % 9 + 1) * 100_000_000;
}
function mockMonthly(amount: number) {
  return Math.round(amount / 36);
}
function mockRate(productType: string) {
  const rates: Record<string, string> = {
    business: "22%",
    mortgage: "16%",
    micro: "24%",
    auto: "20%",
  };
  return rates[productType?.toLowerCase()] ?? "22%";
}
function mockTerm(productType: string) {
  const terms: Record<string, string> = {
    business: "36 мес",
    mortgage: "120 мес",
    micro: "24 мес",
    auto: "60 мес",
  };
  return terms[productType?.toLowerCase()] ?? "36 мес";
}

export default function BasketPage() {
  const { t, i18n } = useTranslation();
  const params = useParams<{ clientId: string }>();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [pdfLoading, setPdfLoading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["mini-client", params.clientId],
    queryFn: () => api.get(`/mini-app/clients/${params.clientId}`),
  });

  const removeItemMutation = useMutation({
    mutationFn: (itemId: number) =>
      api.delete(`/mini-app/basket/${itemId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mini-client", params.clientId] });
    },
  });

  const generatePdfMutation = useMutation({
    mutationFn: () => {
      setPdfLoading(true);
      const initData = getTelegramInitData();
      const body: Record<string, unknown> = {
        sendViaTelegram: Boolean(initData),
        language: i18n.language === "ru" ? "ru" : "uz",
      };
      if (initData) body.telegramInitData = initData;
      return api.post(`/mini-app/clients/${params.clientId}/generate-pdf`, body);
    },
    onSuccess: () => {
      setPdfLoading(false);
      queryClient.invalidateQueries({ queryKey: ["mini-client", params.clientId] });
      navigate(`/pdf-share/${params.clientId}`);
    },
    onError: () => {
      setPdfLoading(false);
    },
  });

  /* ── loading / error states ── */
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

  /* ── derived totals ── */
  const enrichedItems = basketItems.map((item: any) => {
    const amount = mockAmount(item.id);
    const monthly = mockMonthly(amount);
    return { ...item, amount, monthly };
  });

  const totalAmount = enrichedItems.reduce((s: number, i: any) => s + i.amount, 0);
  const totalMonthly = enrichedItems.reduce((s: number, i: any) => s + i.monthly, 0);

  return (
    <div className="min-h-screen bg-[#F4F4F5]">
      {/* ── White header ── */}
      <div className="bg-white px-5 pt-3 pb-4">
        <button
          onClick={() => navigate(`/clients/${params.clientId}`)}
          className="flex items-center gap-1 text-[13px] text-[#64748B] font-medium mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("common.back")}
        </button>

        <div className="flex items-center gap-3">
          <Monogram text={initials} size={48} />
          <div className="flex-1 min-w-0">
            <div className="text-[17px] font-bold text-[#0F172A] truncate">
              {client.fullName || "---"}
            </div>
            <div className="mt-1">
              <StatusChip status={client.status} />
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 pt-4 pb-32 space-y-3">
        {/* ── Count + Add button ── */}
        <div className="flex items-center justify-between">
          <div className="text-[15px] font-bold text-[#0F172A]">
            В корзине{" "}
            <span className="text-[#64748B] font-normal">
              · {enrichedItems.length} продуктов
            </span>
          </div>
          <button
            onClick={() => navigate(`/recommendation/${params.clientId}`)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#ECFDF3] text-[#15803D] text-[13px] font-semibold active:scale-95 transition-transform"
          >
            <Plus className="w-3.5 h-3.5" />
            Ещё
          </button>
        </div>

        {/* ── Empty state ── */}
        {enrichedItems.length === 0 && (
          <div className="mn-card p-8 flex flex-col items-center gap-3 text-center">
            <div className="w-14 h-14 rounded-2xl bg-[#F4F4F5] flex items-center justify-center">
              <ShoppingBag className="w-7 h-7 text-[#64748B]" />
            </div>
            <p className="text-[15px] font-semibold text-[#0F172A]">Корзина пуста</p>
            <p className="text-[13px] text-[#64748B] max-w-[240px]">
              Добавьте продукты из рекомендаций или каталога
            </p>
            <button
              onClick={() => navigate(`/recommendation/${params.clientId}`)}
              className="mt-1 px-5 py-2.5 rounded-xl bg-[#16A34A] text-white text-[14px] font-semibold active:scale-95 transition-transform"
            >
              Подобрать продукты
            </button>
          </div>
        )}

        {/* ── Product cards ── */}
        {enrichedItems.map((item: any) => {
          const theme = resolveTypeTheme(item.productType);
          const Icon = theme.Icon;
          const amount = item.amount;
          const monthly = item.monthly;

          return (
            <div key={item.id} className="mn-card overflow-hidden">
              <div className="p-4">
                <div className="flex items-start gap-3">
                  {/* Type icon */}
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: theme.bg, color: theme.fg }}
                  >
                    <Icon className="w-5 h-5" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-bold text-[#0F172A] leading-snug">
                      {item.productName}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 text-[12px] text-[#64748B]">
                      <span className="capitalize">{item.productType || "credit"}</span>
                      <span className="w-[3px] h-[3px] rounded-full bg-[#CBD5E1]" />
                      <span>{mockRate(item.productType)}</span>
                      <span className="w-[3px] h-[3px] rounded-full bg-[#CBD5E1]" />
                      <span>{mockTerm(item.productType)}</span>
                    </div>
                  </div>

                  {/* Delete */}
                  <button
                    onClick={() => removeItemMutation.mutate(item.id)}
                    className="w-9 h-9 rounded-lg flex items-center justify-center bg-[#FEF2F2] text-[#EF4444] shrink-0 active:scale-90 transition-transform"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Amount / monthly row */}
              <div className="bg-[#F8FAFC] px-4 py-3 flex">
                <div className="flex-1">
                  <div className="text-[11px] text-[#64748B] uppercase tracking-wide font-medium">
                    Сумма
                  </div>
                  <div className="text-[15px] font-bold text-[#0F172A] mt-0.5">
                    {fmtShort(amount)}
                  </div>
                </div>
                <div className="w-px bg-[#E2E8F0]" />
                <div className="flex-1 pl-4">
                  <div className="text-[11px] text-[#64748B] uppercase tracking-wide font-medium">
                    Ежемес.
                  </div>
                  <div className="text-[15px] font-bold text-[#0F172A] mt-0.5">
                    {fmtShort(monthly)}
                  </div>
                </div>
              </div>

              {/* Ghost button */}
              <button className="w-full flex items-center justify-center gap-1.5 py-3 text-[13px] font-semibold text-[#16A34A] border-t border-[#F1F5F9] active:bg-[#F8FAFC] transition-colors">
                Изменить параметры
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}

        {/* ── Summary card ── */}
        {enrichedItems.length > 0 && (
          <>
            <div className="mn-card p-4">
              <div className="text-[11px] text-[#64748B] uppercase tracking-wide font-semibold mb-3">
                Итого
              </div>
              <div className="flex">
                <div className="flex-1">
                  <div className="text-[11px] text-[#64748B]">Общая сумма</div>
                  <div className="text-[18px] font-bold text-[#0F172A] mt-0.5">
                    {fmtShort(totalAmount)}
                  </div>
                </div>
                <div className="w-px bg-[#E2E8F0]" />
                <div className="flex-1 pl-4">
                  <div className="text-[11px] text-[#64748B]">Ежемес. платёж</div>
                  <div className="text-[18px] font-bold text-[#0F172A] mt-0.5">
                    {fmtShort(totalMonthly)}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Hint card ── */}
            <div
              className="rounded-[14px] p-4 flex items-start gap-3"
              style={{ background: "linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)" }}
            >
              <div className="w-9 h-9 rounded-xl bg-[#16A34A]/10 flex items-center justify-center shrink-0">
                <Lightbulb className="w-[18px] h-[18px] text-[#16A34A]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-[#15803D] leading-snug">
                  {t("basket.nextStep")}
                </div>
                <div className="text-[12px] text-[#16A34A]/80 mt-1 leading-relaxed">
                  {t("basket.nextStepHint")}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Fixed bottom CTA ── */}
      {enrichedItems.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-[#F1F5F9] px-5 py-4 safe-bottom">
          <button
            onClick={() => generatePdfMutation.mutate()}
            disabled={pdfLoading}
            className="w-full flex items-center justify-center gap-2.5 h-[52px] rounded-[14px] bg-[#16A34A] text-white text-[15px] font-bold shadow-[0_4px_12px_rgba(22,163,74,0.3)] active:scale-[0.98] transition-transform disabled:opacity-60"
          >
            {pdfLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <FileText className="w-5 h-5" />
            )}
            {pdfLoading ? t("pdf.generating") : t("pdf.generate")}
          </button>
        </div>
      )}
    </div>
  );
}
