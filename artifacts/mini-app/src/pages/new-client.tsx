import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useLocation } from "wouter";
import { ArrowLeft, UserPlus, Save } from "lucide-react";

export default function NewClientPage() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  const createMutation = useMutation({
    mutationFn: () => api.post("/mini-app/clients", { fullName: fullName || null, phone: phone || null }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["mini-clients"] });
      navigate(`/clients/${data.id}`);
    },
  });

  const canSubmit = fullName.trim().length > 0 || phone.trim().length > 0;

  return (
    <div style={{ background: "#fff" }} className="min-h-screen flex flex-col">
      {/* ═══════════════ TOP BAR ═══════════════ */}
      <div className="px-5 pt-4 pb-3">
        {/* Step indicator */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => navigate("/clients")}
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: "#F1F5F9" }}
          >
            <ArrowLeft className="w-[18px] h-[18px]" style={{ color: "#0F172A" }} />
          </button>
          <span
            className="text-[13px] font-semibold"
            style={{ color: "#64748B" }}
          >
            Шаг 1 из 1
          </span>
          <div className="w-9" />
        </div>

        {/* Progress bar — 4 segments, first filled */}
        <div className="flex gap-1.5">
          <div className="h-[3px] flex-1 rounded-full" style={{ background: "#16A34A" }} />
          <div className="h-[3px] flex-1 rounded-full" style={{ background: "#E2E8F0" }} />
          <div className="h-[3px] flex-1 rounded-full" style={{ background: "#E2E8F0" }} />
          <div className="h-[3px] flex-1 rounded-full" style={{ background: "#E2E8F0" }} />
        </div>
      </div>

      {/* ═══════════════ HEADER ═══════════════ */}
      <div className="px-5 pt-4 pb-2">
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "#ECFDF3", color: "#16A34A" }}
          >
            <UserPlus className="w-5 h-5" />
          </div>
          <div>
            <h1
              className="text-[20px] font-bold tracking-tight leading-tight"
              style={{ color: "#0F172A" }}
            >
              {t("newClient.title")}
            </h1>
            <p className="text-[13px] mt-0.5" style={{ color: "#64748B" }}>
              {t("newClient.subtitle")}
            </p>
          </div>
        </div>
      </div>

      {/* ═══════════════ FORM ═══════════════ */}
      <div className="flex-1 px-5 pt-2">
        <div className="space-y-5">
          {/* Full name field */}
          <div>
            <label
              className="block mb-[6px]"
              style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}
            >
              {t("newClient.fullName")}
            </label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={t("newClient.fullNamePlaceholder")}
              className="w-full outline-none transition-colors"
              style={{
                borderRadius: 10,
                border: "1.5px solid #E2E8F0",
                fontSize: 16,
                padding: 14,
                color: "#0F172A",
                background: "#fff",
              }}
              onFocus={(e) => (e.target.style.borderColor = "#16A34A")}
              onBlur={(e) => (e.target.style.borderColor = "#E2E8F0")}
            />
          </div>

          {/* Phone field */}
          <div>
            <label
              className="block mb-[6px]"
              style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}
            >
              {t("newClient.phone")}
            </label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t("newClient.phonePlaceholder")}
              inputMode="tel"
              className="w-full outline-none transition-colors"
              style={{
                borderRadius: 10,
                border: "1.5px solid #E2E8F0",
                fontSize: 16,
                padding: 14,
                color: "#0F172A",
                background: "#fff",
              }}
              onFocus={(e) => (e.target.style.borderColor = "#16A34A")}
              onBlur={(e) => (e.target.style.borderColor = "#E2E8F0")}
            />
          </div>
        </div>
      </div>

      {/* ═══════════════ FOOTER BUTTONS ═══════════════ */}
      <div className="px-5 pb-6 pt-4 space-y-3" style={{ marginTop: "auto" }}>
        {/* Primary create button */}
        <button
          onClick={() => createMutation.mutate()}
          disabled={!canSubmit || createMutation.isPending}
          className="w-full flex items-center justify-center gap-2 transition-opacity"
          style={{
            height: 52,
            borderRadius: 12,
            background: canSubmit && !createMutation.isPending ? "#16A34A" : "#A7F3D0",
            color: "#fff",
            fontSize: 16,
            fontWeight: 600,
          }}
        >
          {createMutation.isPending ? (
            <div
              className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"
            />
          ) : null}
          {createMutation.isPending ? t("newClient.creating") : t("newClient.create")}
        </button>

        {/* Secondary row: back + save draft */}
        <div className="flex gap-3">
          <button
            onClick={() => navigate("/clients")}
            className="flex-1 flex items-center justify-center gap-1.5"
            style={{
              height: 44,
              borderRadius: 10,
              border: "1.5px solid #E2E8F0",
              background: "#fff",
              color: "#64748B",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            <ArrowLeft className="w-4 h-4" />
            {t("common.back")}
          </button>
          <button
            onClick={() => {
              if (canSubmit) createMutation.mutate();
            }}
            disabled={!canSubmit}
            className="flex-1 flex items-center justify-center gap-1.5 transition-opacity"
            style={{
              height: 44,
              borderRadius: 10,
              border: "1.5px solid #E2E8F0",
              background: "#fff",
              color: canSubmit ? "#0F172A" : "#CBD5E1",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            <Save className="w-4 h-4" />
            Сохранить черновик
          </button>
        </div>
      </div>
    </div>
  );
}
