import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useLocation } from "wouter";
import { Plus, Search, SlidersHorizontal, User, ArrowUpDown } from "lucide-react";
import { ClientRow, getInitials, timeAgo, fmtShort } from "@/components/ui-primitives";

const STATUS_KEYS = [
  "",
  "draft",
  "questionnaire",
  "recommendation",
  "basket",
  "pdf_generated",
  "under_review",
  "approved",
  "completed",
  "rejected",
];

export default function ClientsPage() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["mini-clients", statusFilter],
    queryFn: () =>
      api.get(`/mini-app/clients${statusFilter ? `?status=${statusFilter}` : ""}`),
  });

  const filtered = (clients as any[]).filter(
    (c: any) =>
      !search || (c.fullName || "").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div
      className="min-h-screen pb-24 flex flex-col"
      style={{ background: "var(--tg-bg, #F4F4F5)" }}
    >
      {/* ═══════════════ STICKY SEARCH BAR ═══════════════ */}
      <div
        className="sticky top-0 z-20 px-4 pt-3 pb-2"
        style={{ background: "var(--tg-bg, #F4F4F5)" }}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[#94A3B8]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("clients.searchPlaceholder")}
              className="w-full h-10 pl-10 pr-4 bg-white rounded-xl text-[14px] text-[#0F172A] placeholder:text-[#94A3B8] border-0 outline-none focus:ring-2 focus:ring-[#16A34A]/30"
              style={{ boxShadow: "var(--shadow-xs)" }}
            />
          </div>
          <button
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "#16A34A" }}
          >
            <SlidersHorizontal className="w-[18px] h-[18px] text-white" />
          </button>
        </div>
      </div>

      {/* ═══════════════ SEGMENTED PILL BAR ═══════════════ */}
      <div className="px-4 pt-1 pb-2">
        <div className="flex gap-2 overflow-x-auto mn-scroll pb-1">
          {STATUS_KEYS.map((s) => {
            const active = statusFilter === s;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className="flex items-center gap-1.5 px-3.5 py-[7px] rounded-full text-[12px] font-semibold whitespace-nowrap shrink-0 transition-colors"
                style={{
                  background: active ? "#0F172A" : "#FFFFFF",
                  color: active ? "#FFFFFF" : "#0F172A",
                  border: active ? "none" : "1px solid #E2E8F0",
                }}
              >
                {s ? t(`statuses.${s}`) : t("clients.allStatuses")}
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══════════════ SUMMARY STRIP ═══════════════ */}
      <div className="flex items-center justify-between px-5 pb-2">
        <span className="text-[13px] font-semibold text-[#64748B]">
          {filtered.length} {t("clients.title").toLowerCase()}
        </span>
        <button className="flex items-center gap-1 text-[12px] font-semibold text-[#64748B]">
          <ArrowUpDown className="w-3.5 h-3.5" />
          {t("clients.sortDate") || "\u041F\u043E \u0434\u0430\u0442\u0435"}
        </button>
      </div>

      {/* ═══════════════ CLIENT LIST ═══════════════ */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-[14px] text-[#64748B]">{t("common.loading")}</div>
        </div>
      ) : filtered.length === 0 ? (
        /* ── Empty state ── */
        <div className="flex-1 flex flex-col items-center justify-center px-8 py-16">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
            style={{ background: "#F1F5F9" }}
          >
            <User className="w-7 h-7 text-[#94A3B8]" />
          </div>
          <div className="text-[16px] font-bold text-[#0F172A] mb-1">
            {t("clients.noClients") || "\u041D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E"}
          </div>
          <div className="text-[13px] text-[#64748B] text-center">
            {t("clients.noClientsHint") || "\u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0438\u0437\u043C\u0435\u043D\u0438\u0442\u044C \u0444\u0438\u043B\u044C\u0442\u0440\u044B \u0438\u043B\u0438 \u043F\u043E\u0438\u0441\u043A"}
          </div>
        </div>
      ) : (
        <div className="mx-4 mn-card overflow-hidden">
          {filtered.map((client: any) => (
            <ClientRow
              key={client.id}
              client={{
                id: client.id,
                fullName: client.fullName,
                initials: getInitials(client.fullName),
                status: client.status,
                amount: client.amount,
                product: client.product,
                updatedAt: timeAgo(client.updatedAt),
              }}
              onClick={() => navigate(`/clients/${client.id}`)}
            />
          ))}
        </div>
      )}

      {/* ═══════════════ FAB ═══════════════ */}
      <button
        onClick={() => navigate("/new-client")}
        className="fixed bottom-24 right-5 z-30 w-14 h-14 rounded-full flex items-center justify-center active:scale-90 transition-transform"
        style={{
          background: "#16A34A",
          boxShadow: "0 6px 20px rgba(22,163,74,0.35)",
        }}
      >
        <Plus className="w-6 h-6 text-white" />
      </button>
    </div>
  );
}
