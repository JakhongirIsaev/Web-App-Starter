import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, postOrQueue } from "@/lib/api";
import { useLocation } from "wouter";
import { ArrowLeft, UserPlus, Save, Check, MapPin } from "lucide-react";

/* ─────────────────────────────────────────────────────────────
 * New-client form (Phase E — simplified lead capture).
 *
 * Captures the minimum info a credit expert needs to register a lead
 * during a marketing visit. Credit application (sum/purpose/term/currency),
 * collateral, and product selection happen on the client-detail screen
 * AFTER the lead is saved. Self-check booleans, lead source, referrer,
 * and the consent signature pad were removed in Phase E — consent is
 * now a single checkbox.
 * ──────────────────────────────────────────────────────────── */

const BUSINESS_TYPES = ["trade", "services", "production", "agriculture", "other"] as const;

const inputBaseStyle: React.CSSProperties = {
  borderRadius: 10,
  border: "1.5px solid #E2E8F0",
  fontSize: 16,
  padding: 14,
  color: "#0F172A",
  background: "#fff",
};

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mn-card p-4">
      <div className="text-[14px] font-bold text-[#0F172A] tracking-tight">{title}</div>
      {subtitle && (
        <div className="text-[12px] text-[#64748B] mt-0.5">{subtitle}</div>
      )}
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      className="block mb-[6px]"
      style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}
    >
      {children}
    </label>
  );
}

function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  getLabel,
}: {
  options: readonly T[];
  value: T | "";
  onChange: (next: T) => void;
  getLabel: (option: T) => string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className="rounded-full text-[13px] font-semibold transition-colors active:scale-[0.97]"
            style={{
              padding: "8px 14px",
              border: active ? "1.5px solid #FFD531" : "1.5px solid #E2E8F0",
              background: active ? "#FFF7D6" : "#FFFFFF",
              color: active ? "#6B5C00" : "#334155",
            }}
          >
            {getLabel(option)}
          </button>
        );
      })}
    </div>
  );
}

function ConsentCheckbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-start gap-3 rounded-xl text-left transition-colors active:scale-[0.99]"
      style={{
        padding: "12px",
        border: checked ? "1.5px solid #FFD531" : "1.5px solid #E2E8F0",
        background: checked ? "#FFF7D6" : "#FFFFFF",
      }}
    >
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md mt-0.5"
        style={{
          background: checked ? "#FFD531" : "#FFFFFF",
          border: checked ? "1.5px solid #FFD531" : "1.5px solid #CBD5E1",
        }}
      >
        {checked && <Check className="h-3.5 w-3.5 text-[#272424]" />}
      </span>
      <span className="text-[13px] leading-relaxed text-[#0F172A]">{label}</span>
    </button>
  );
}

function optionalTrimmed(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalTelegramUsername(value: string) {
  const trimmed = value.trim().replace(/^@+/, "");
  return trimmed.length > 0 ? trimmed : undefined;
}

export default function NewClientPage() {
  const { t, i18n } = useTranslation();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  /* Identity */
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [telegramUsername, setTelegramUsername] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "">("");
  const [preferredLanguage, setPreferredLanguage] = useState<"ru" | "uz">(
    i18n.language === "uz" ? "uz" : "ru",
  );
  const [legalName, setLegalName] = useState("");
  const [businessType, setBusinessType] = useState<(typeof BUSINESS_TYPES)[number] | "">("");

  /* Geolocation — captured client-side, attached after create via PUT :id
     (POST /mini-app/clients schema doesn't accept lat/lon). Same pattern as
     quick-lead.tsx. */
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const captureLocation = () => {
    if (!navigator.geolocation) {
      setGpsError(t("newClient.gpsUnavailable", { defaultValue: "GPS недоступен" }));
      return;
    }
    setGpsLoading(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsLoading(false);
      },
      (err) => {
        setGpsError(err.message || "GPS error");
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  /* Consent — replaces signature pad. PDN consent is captured as a
     checkbox per Phase E simplification. The legal text is the same as
     before; only the canvas is gone. */
  const [consentAccepted, setConsentAccepted] = useState(false);

  const hasAnyField =
    fullName.trim().length > 0 || phone.trim().length > 0 || legalName.trim().length > 0;
  const canSubmit = hasAnyField && consentAccepted;

  const createMutation = useMutation({
    mutationFn: async () => {
      const result = await postOrQueue<{ id: number }>("/mini-app/clients", {
        fullName: optionalTrimmed(fullName),
        phone: optionalTrimmed(phone),
        telegramUsername: optionalTelegramUsername(telegramUsername),
        gender: gender || undefined,
        legalName: optionalTrimmed(legalName),
        businessType: businessType || undefined,
        preferredLanguage,
      });

      if ("_queued" in result) {
        return result;
      }

      const client = result;

      // Best-effort: attach coordinates after create. Same pattern as quick-lead.
      if (coords) {
        try {
          await api.put(`/mini-app/clients/${client.id}`, {
            latitude: coords.lat,
            longitude: coords.lng,
          });
        } catch (err) {
          // Non-fatal; client was saved.
          // eslint-disable-next-line no-console
          console.warn("location update failed:", err);
        }
      }

      return client;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["mini-clients"] });
      queryClient.invalidateQueries({ queryKey: ["mini-todo"] });
      queryClient.invalidateQueries({ queryKey: ["offline-queue-size"] });
      if (data && "_queued" in data) {
        alert(t("newClient.savedOffline"));
        navigate("/clients");
        return;
      }
      navigate(`/clients/${data.id}`);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      alert(`${t("newClient.saveFailed", { defaultValue: "Не удалось сохранить клиента" })}: ${message}`);
    },
  });

  return (
    <div style={{ background: "#F4F4F5" }} className="min-h-screen flex flex-col">
      {/* ═══════════════ TOP BAR ═══════════════ */}
      <div className="px-5 pt-4 pb-3" style={{ background: "#fff" }}>
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
            {t("newClient.step")}
          </span>
          <div className="w-9" />
        </div>

        {/* ═══════════════ HEADER ═══════════════ */}
        <div className="flex items-center gap-3 mt-1">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "#FFF7D6", color: "#6B5C00" }}
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

      {/* ═══════════════ FORM SECTIONS ═══════════════ */}
      <div className="flex-1 px-4 pt-4 pb-56 space-y-3">
        {/* ── IDENTITY ── */}
        <SectionCard title={t("newClient.section.identity", { defaultValue: "Контактные данные" })}>
          <div>
            <FieldLabel>{t("newClient.fullName")}</FieldLabel>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={t("newClient.fullNamePlaceholder")}
              className="w-full outline-none transition-colors"
              style={inputBaseStyle}
              onFocus={(e) => (e.target.style.borderColor = "#FFD531")}
              onBlur={(e) => (e.target.style.borderColor = "#E2E8F0")}
            />
          </div>

          <div>
            <FieldLabel>{t("newClient.phone")}</FieldLabel>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t("newClient.phonePlaceholder")}
              inputMode="tel"
              className="w-full outline-none transition-colors"
              style={inputBaseStyle}
              onFocus={(e) => (e.target.style.borderColor = "#FFD531")}
              onBlur={(e) => (e.target.style.borderColor = "#E2E8F0")}
            />
          </div>

          <div>
            <FieldLabel>{t("newClient.telegramUsername")}</FieldLabel>
            <input
              value={telegramUsername}
              onChange={(e) => setTelegramUsername(e.target.value)}
              placeholder={t("newClient.telegramUsernamePlaceholder")}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="w-full outline-none transition-colors"
              style={inputBaseStyle}
              onFocus={(e) => (e.target.style.borderColor = "#FFD531")}
              onBlur={(e) => (e.target.style.borderColor = "#E2E8F0")}
            />
          </div>

          <div>
            <FieldLabel>{t("clientDetail.gender")}</FieldLabel>
            <ChipGroup
              options={["male", "female"] as const}
              value={gender}
              onChange={(v) => setGender(v)}
              getLabel={(v) =>
                v === "male"
                  ? t("clientDetail.genderMale")
                  : t("clientDetail.genderFemale")
              }
            />
          </div>

          <div>
            <FieldLabel>
              {t("newClient.preferredLanguage", { defaultValue: "Язык клиента" })}
            </FieldLabel>
            <div className="flex gap-2 mt-1">
              {(["ru", "uz"] as const).map((l) => {
                const active = preferredLanguage === l;
                return (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setPreferredLanguage(l)}
                    className="px-4 py-2 rounded-full text-[13px] font-semibold"
                    style={{
                      background: active ? "#0F172A" : "#FFFFFF",
                      color: active ? "#FFFFFF" : "#0F172A",
                      border: active ? "none" : "1px solid #E2E8F0",
                    }}
                  >
                    {l.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>
        </SectionCard>

        {/* ── BUSINESS ── */}
        <SectionCard title={t("newClient.section.business", { defaultValue: "Бизнес" })}>
          <div>
            <FieldLabel>
              {t("newClient.identity.legalName", { defaultValue: "Юридическое название" })}
            </FieldLabel>
            <input
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              placeholder={t("newClient.identity.legalNamePlaceholder", {
                defaultValue: "напр. ООО «Текстиль-Инвест»",
              })}
              className="w-full outline-none transition-colors"
              style={inputBaseStyle}
              onFocus={(e) => (e.target.style.borderColor = "#FFD531")}
              onBlur={(e) => (e.target.style.borderColor = "#E2E8F0")}
            />
          </div>

          <div>
            <FieldLabel>{t("newClient.identity.businessType")}</FieldLabel>
            <ChipGroup
              options={BUSINESS_TYPES}
              value={businessType}
              onChange={(v) => setBusinessType(v)}
              getLabel={(v) => t(`questionnaire.businessTypeOptions.${v}`)}
            />
          </div>

          <div>
            <FieldLabel>
              {t("newClient.identity.location", { defaultValue: "Координаты бизнеса" })}
            </FieldLabel>
            <button
              type="button"
              onClick={captureLocation}
              disabled={gpsLoading}
              className="flex w-full items-center justify-center gap-2 rounded-xl text-[14px] font-semibold transition-colors active:scale-[0.99]"
              style={{
                padding: "12px",
                border: coords ? "1.5px solid #FFD531" : "1.5px solid #E2E8F0",
                background: coords ? "#FFF7D6" : "#FFFFFF",
                color: coords ? "#6B5C00" : "#334155",
                opacity: gpsLoading ? 0.6 : 1,
              }}
            >
              <MapPin className="h-4 w-4" />
              {coords
                ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`
                : gpsLoading
                  ? t("newClient.identity.locationCapturing", { defaultValue: "Получаем GPS..." })
                  : t("newClient.identity.locationCapture", { defaultValue: "Захватить координаты" })}
            </button>
            {gpsError && (
              <p className="text-[12px] text-[#DC2626] mt-1.5">{gpsError}</p>
            )}
          </div>
        </SectionCard>

        {/* ── CONSENT (inline, no card chrome — Phase E design pass) ── */}
        <div className="px-1 pt-1 space-y-1.5">
          <ConsentCheckbox
            checked={consentAccepted}
            onChange={setConsentAccepted}
            label={t("newClient.consentText")}
          />
          {hasAnyField && !consentAccepted && (
            <p className="text-[12px] text-[#DC2626] font-medium px-1">
              {t("newClient.consentRequired", {
                defaultValue: "Согласие клиента обязательно",
              })}
            </p>
          )}
        </div>
      </div>

      {/* ═══════════════ FOOTER (sticky) ═══════════════ */}
      <div
        className="fixed left-0 right-0 z-40 border-t"
        style={{
          bottom: "calc(76px + env(safe-area-inset-bottom, 0px))",
          background: "rgba(255,255,255,0.96)",
          backdropFilter: "blur(8px)",
          borderColor: "#E2E8F0",
        }}
      >
        <div className="mx-auto max-w-md px-4 pt-2.5 pb-3">
          <button
            onClick={() => createMutation.mutate()}
            disabled={!canSubmit || createMutation.isPending}
            className="w-full flex items-center justify-center gap-2 transition-opacity"
            style={{
              height: 52,
              borderRadius: 12,
              background: canSubmit && !createMutation.isPending ? "#FFD531" : "#FCE588",
              color: "#272424",
              fontSize: 16,
              fontWeight: 600,
              boxShadow: canSubmit ? "0 10px 24px rgba(255,213,49,0.35)" : "none",
            }}
          >
            {createMutation.isPending ? (
              <div
                className="w-5 h-5 border-2 border-[#272424]/30 border-t-[#272424] rounded-full animate-spin"
              />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {createMutation.isPending ? t("newClient.creating") : t("newClient.create")}
          </button>
        </div>
      </div>
    </div>
  );
}
