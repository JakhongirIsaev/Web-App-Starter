import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useLocation } from "wouter";
import { ArrowLeft, UserPlus, Save, Check } from "lucide-react";
import { SignaturePad } from "@/components/signature-pad";

/* ─────────────────────────────────────────────────────────────
 * Fixed new-client form (Phase B3.2).
 * Captures everything the rule-engine needs in one screen:
 *   1. Identity (name, gender, phone, business name, business type)
 *   2. Lead source (radio chips)
 *   3. Referrer (conditional on lead_source === referral_existing_client)
 *   4. Loan intent (purpose, amount UZS, term months, currency)
 *   5. Self-check (4 yes/no checkboxes)
 * Branch comes from the authed user; GPS is Phase C.
 * ──────────────────────────────────────────────────────────── */

const LEAD_SOURCES = [
  "direct_visit",
  "referral_existing_client",
  "mass_media_tv",
  "mass_media_radio",
  "mass_media_print",
  "mahalla_booklet",
  "walk_in",
  "other",
] as const;
type LeadSource = (typeof LEAD_SOURCES)[number];

const CURRENCIES = ["UZS", "USD", "EUR", "RUB"] as const;
type Currency = (typeof CURRENCIES)[number];

const PURPOSES = ["working_capital", "fixed_assets", "untargeted", "not_sure"] as const;

const BUSINESS_TYPES = ["trade", "services", "production", "agriculture", "other"] as const;

interface ReferrerCandidate {
  id: number;
  fullName: string | null;
  phone: string | null;
}

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
              border: active ? "1.5px solid #16A34A" : "1.5px solid #E2E8F0",
              background: active ? "#ECFDF3" : "#FFFFFF",
              color: active ? "#15803D" : "#334155",
            }}
          >
            {getLabel(option)}
          </button>
        );
      })}
    </div>
  );
}

function CheckboxRow({
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
      className="flex w-full items-center gap-3 rounded-xl text-left transition-colors active:scale-[0.99]"
      style={{
        padding: "12px",
        border: checked ? "1.5px solid #16A34A" : "1.5px solid #E2E8F0",
        background: checked ? "#ECFDF3" : "#FFFFFF",
      }}
    >
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
        style={{
          background: checked ? "#16A34A" : "#FFFFFF",
          border: checked ? "1.5px solid #16A34A" : "1.5px solid #CBD5E1",
        }}
      >
        {checked && <Check className="h-3.5 w-3.5 text-white" />}
      </span>
      <span className="text-[14px] font-medium text-[#0F172A]">{label}</span>
    </button>
  );
}

export default function NewClientPage() {
  const { t, i18n } = useTranslation();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  /* Identity */
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  // Phase C4: optional Telegram username so the leave-behind PDF can ship
  // directly to the client. Stored without the leading "@" — the input
  // accepts either form for convenience.
  const [telegramUsername, setTelegramUsername] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "">("");
  // Phase D2: per-client language preference. Default to the hunter's current
  // mini-app UI language, so the leave-behind PDF defaults to whatever the
  // hunter is already reading in front of the lead.
  const [preferredLanguage, setPreferredLanguage] = useState<"ru" | "uz">(
    i18n.language === "uz" ? "uz" : "ru",
  );
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState<(typeof BUSINESS_TYPES)[number] | "">("");

  /* Lead source */
  const [leadSource, setLeadSource] = useState<LeadSource | "">("");

  /* Referrer */
  const [referrerSearch, setReferrerSearch] = useState("");
  const [referrerClientId, setReferrerClientId] = useState<number | null>(null);
  const [referrerLabel, setReferrerLabel] = useState<string>("");

  /* Loan intent */
  const [purpose, setPurpose] = useState<(typeof PURPOSES)[number] | "">("");
  const [desiredAmountUzs, setDesiredAmountUzs] = useState<string>(""); // formatted with spaces
  const [desiredTermMonths, setDesiredTermMonths] = useState<string>("");
  const [preferredCurrency, setPreferredCurrency] = useState<Currency>("UZS");

  /* Self-check */
  const [scCitizenship, setScCitizenship] = useState(false);
  const [scSixMonths, setScSixMonths] = useState(false);
  const [scPrivate, setScPrivate] = useState(false);
  const [scBranch, setScBranch] = useState(false);

  /* Phase D3: personal-data consent signature. Bank-required before
     launch with real users. We capture as PNG data URL and persist
     after the client row is created (best-effort upload). */
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);

  /* Referrer search — only fired when the lead source needs it. We rely on
     the existing GET /mini-app/clients endpoint and filter client-side; the
     candidate list is already scoped by branch/role on the server. */
  const { data: referrerCandidates = [] } = useQuery<ReferrerCandidate[]>({
    queryKey: ["referrer-candidates"],
    queryFn: () => api.get("/mini-app/clients"),
    enabled: leadSource === "referral_existing_client",
    staleTime: 60_000,
  });

  const filteredReferrers = useMemo(() => {
    const q = referrerSearch.trim().toLowerCase();
    if (!q) return referrerCandidates.slice(0, 6);
    return referrerCandidates
      .filter((candidate) => {
        const name = (candidate.fullName ?? "").toLowerCase();
        const phoneStr = (candidate.phone ?? "").toLowerCase();
        return name.includes(q) || phoneStr.includes(q);
      })
      .slice(0, 6);
  }, [referrerCandidates, referrerSearch]);

  const desiredAmountDigits = desiredAmountUzs.replace(/\D/g, "");
  const desiredAmountNum = desiredAmountDigits ? Number(desiredAmountDigits) : null;
  const desiredTermNum = desiredTermMonths.trim() ? Number(desiredTermMonths.trim()) : null;

  /* The form is "save-able" with anything filled in — only fully-populated
     leads get auto-promoted to status="lead" by the server. This keeps the
     hunter from being blocked when they want to capture a draft.
     Phase D3: a personal-data consent signature is required before save —
     bank policy. Without it the green button stays disabled. */
  const hasAnyField =
    fullName.trim().length > 0 ||
    phone.trim().length > 0 ||
    !!leadSource;
  const canSubmit = hasAnyField && signatureDataUrl != null;

  const createMutation = useMutation({
    mutationFn: async () => {
      const client = (await api.post("/mini-app/clients", {
        fullName: fullName.trim() || null,
        phone: phone.trim() || null,
        telegramUsername: telegramUsername.trim().replace(/^@+/, "") || undefined,
        gender: gender || undefined,
        businessName: businessName.trim() || undefined,
        businessType: businessType || undefined,
        leadSource: leadSource || undefined,
        referrerClientId:
          leadSource === "referral_existing_client" && referrerClientId
            ? referrerClientId
            : undefined,
        selfCheckCitizenshipUz: scCitizenship,
        selfCheckSixMonthsOperation: scSixMonths,
        selfCheckPredominantlyPrivate: scPrivate,
        selfCheckBranchServiceArea: scBranch,
        purpose: purpose || undefined,
        desiredAmountUzs:
          desiredAmountNum !== null && Number.isFinite(desiredAmountNum)
            ? desiredAmountNum
            : undefined,
        desiredTermMonths:
          desiredTermNum !== null && Number.isFinite(desiredTermNum) && desiredTermNum > 0
            ? desiredTermNum
            : undefined,
        preferredCurrency,
        preferredLanguage,
      })) as { id: number };

      // Phase D3: persist the consent signature as a client_documents row.
      // Pattern mirrors quick-lead.tsx photo upload (commit 6b3dc04):
      // best-effort — the client row is already saved, so a failed
      // upload should not roll back the lead. Hunter can re-capture the
      // signature from client-detail later if this fails.
      if (signatureDataUrl) {
        try {
          const upload = (await api.post("/storage/uploads/direct", {
            name: `clients/${client.id}/consent-signature.png`,
            dataUrl: signatureDataUrl,
          })) as { objectPath: string; metadata?: { name?: string } };
          await api.post(`/mini-app/clients/${client.id}/documents`, {
            docType: "consent_signature",
            fileName: upload.metadata?.name ?? `consent-${client.id}.png`,
            storagePath: upload.objectPath,
          });
        } catch (err) {
          // Non-fatal; client was saved.
          // eslint-disable-next-line no-console
          console.warn("signature upload failed:", err);
        }
      }

      return client;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["mini-clients"] });
      queryClient.invalidateQueries({ queryKey: ["mini-todo"] });
      navigate(`/clients/${data.id}`);
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

      {/* ═══════════════ FORM SECTIONS ═══════════════ */}
      <div className="flex-1 px-4 pt-4 pb-32 space-y-3">
        {/* ── 1. IDENTITY ── */}
        <SectionCard title={t("newClient.fullName")}>
          <div>
            <FieldLabel>{t("newClient.fullName")}</FieldLabel>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={t("newClient.fullNamePlaceholder")}
              className="w-full outline-none transition-colors"
              style={inputBaseStyle}
              onFocus={(e) => (e.target.style.borderColor = "#16A34A")}
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
              onFocus={(e) => (e.target.style.borderColor = "#16A34A")}
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
              onFocus={(e) => (e.target.style.borderColor = "#16A34A")}
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

          {/* Phase D2: per-client preferred language for the leave-behind PDF. */}
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

          <div>
            <FieldLabel>{t("newClient.identity.businessName")}</FieldLabel>
            <input
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder={t("newClient.identity.businessNamePlaceholder")}
              className="w-full outline-none transition-colors"
              style={inputBaseStyle}
              onFocus={(e) => (e.target.style.borderColor = "#16A34A")}
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
        </SectionCard>

        {/* ── 2. LEAD SOURCE ── */}
        <SectionCard title={t("newClient.section.leadSource")}>
          <ChipGroup
            options={LEAD_SOURCES}
            value={leadSource}
            onChange={(v) => {
              setLeadSource(v);
              if (v !== "referral_existing_client") {
                setReferrerClientId(null);
                setReferrerLabel("");
                setReferrerSearch("");
              }
            }}
            getLabel={(v) => t(`newClient.leadSource.${v}`)}
          />
        </SectionCard>

        {/* ── 3. REFERRER (conditional) ── */}
        {leadSource === "referral_existing_client" && (
          <SectionCard title={t("newClient.section.referrer")}>
            {referrerClientId ? (
              <div
                className="flex items-center justify-between rounded-xl p-3"
                style={{ background: "#ECFDF3", border: "1.5px solid #16A34A" }}
              >
                <span className="text-[14px] font-semibold text-[#15803D]">
                  {referrerLabel || `#${referrerClientId}`}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setReferrerClientId(null);
                    setReferrerLabel("");
                  }}
                  className="text-[12px] font-semibold text-[#15803D] underline"
                >
                  {t("common.cancel")}
                </button>
              </div>
            ) : (
              <>
                <input
                  value={referrerSearch}
                  onChange={(e) => setReferrerSearch(e.target.value)}
                  placeholder={t("newClient.referrer.searchPlaceholder")}
                  className="w-full outline-none transition-colors"
                  style={inputBaseStyle}
                  onFocus={(e) => (e.target.style.borderColor = "#16A34A")}
                  onBlur={(e) => (e.target.style.borderColor = "#E2E8F0")}
                />
                <div className="space-y-1.5 mt-2">
                  {filteredReferrers.length === 0 ? (
                    <div className="text-[13px] text-[#94A3B8] py-2">
                      {t("newClient.referrer.empty")}
                    </div>
                  ) : (
                    filteredReferrers.map((candidate) => (
                      <button
                        key={candidate.id}
                        type="button"
                        onClick={() => {
                          setReferrerClientId(candidate.id);
                          setReferrerLabel(
                            candidate.fullName ||
                              candidate.phone ||
                              `#${candidate.id}`,
                          );
                        }}
                        className="flex w-full items-center justify-between rounded-xl border border-[#E2E8F0] p-3 text-left active:scale-[0.99]"
                      >
                        <div className="min-w-0">
                          <div className="text-[14px] font-semibold text-[#0F172A] truncate">
                            {candidate.fullName || t("clients.anonymous")}
                          </div>
                          {candidate.phone && (
                            <div className="text-[12px] text-[#64748B] truncate">
                              {candidate.phone}
                            </div>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </SectionCard>
        )}

        {/* ── 4. LOAN INTENT ── */}
        <SectionCard title={t("newClient.section.loanIntent")}>
          <div>
            <FieldLabel>{t("newClient.intent.purposeLabel")}</FieldLabel>
            <ChipGroup
              options={PURPOSES}
              value={purpose}
              onChange={(v) => setPurpose(v)}
              getLabel={(v) => t(`questionnaire.loanPurposeOptions.${v}`)}
            />
          </div>

          <div>
            <FieldLabel>{t("newClient.intent.amountLabel")}</FieldLabel>
            <input
              value={desiredAmountUzs}
              onChange={(e) => {
                const raw = e.target.value.replace(/\D/g, "");
                setDesiredAmountUzs(
                  raw ? Number(raw).toLocaleString().replace(/,/g, " ") : "",
                );
              }}
              placeholder={t("questionnaire.desiredAmountPlaceholder")}
              inputMode="numeric"
              className="w-full outline-none transition-colors"
              style={inputBaseStyle}
              onFocus={(e) => (e.target.style.borderColor = "#16A34A")}
              onBlur={(e) => (e.target.style.borderColor = "#E2E8F0")}
            />
          </div>

          <div>
            <FieldLabel>{t("newClient.intent.termLabel")}</FieldLabel>
            <input
              value={desiredTermMonths}
              onChange={(e) =>
                setDesiredTermMonths(e.target.value.replace(/\D/g, ""))
              }
              placeholder={t("questionnaire.desiredTermPlaceholder")}
              inputMode="numeric"
              className="w-full outline-none transition-colors"
              style={inputBaseStyle}
              onFocus={(e) => (e.target.style.borderColor = "#16A34A")}
              onBlur={(e) => (e.target.style.borderColor = "#E2E8F0")}
            />
          </div>

          <div>
            <FieldLabel>{t("newClient.intent.currencyLabel")}</FieldLabel>
            <ChipGroup
              options={CURRENCIES}
              value={preferredCurrency}
              onChange={(v) => setPreferredCurrency(v)}
              getLabel={(v) => t(`newClient.currency.${v}`)}
            />
          </div>
        </SectionCard>

        {/* ── 5. SELF-CHECK ── */}
        <SectionCard title={t("newClient.section.selfCheck")}>
          <CheckboxRow
            checked={scCitizenship}
            onChange={setScCitizenship}
            label={t("newClient.selfCheck.citizenshipUz")}
          />
          <CheckboxRow
            checked={scSixMonths}
            onChange={setScSixMonths}
            label={t("newClient.selfCheck.sixMonths")}
          />
          <CheckboxRow
            checked={scPrivate}
            onChange={setScPrivate}
            label={t("newClient.selfCheck.private")}
          />
          <CheckboxRow
            checked={scBranch}
            onChange={setScBranch}
            label={t("newClient.selfCheck.branchService")}
          />
        </SectionCard>

        {/* ── 6. CONSENT (Phase D3) ── */}
        <SectionCard title={t("newClient.section.consent")}>
          <p className="text-[12px] text-[#64748B] leading-relaxed">
            {t("newClient.consentText")}
          </p>
          <SignaturePad value={signatureDataUrl} onChange={setSignatureDataUrl} />
          {hasAnyField && !signatureDataUrl && (
            <p className="text-[12px] text-[#DC2626] font-medium">
              {t("newClient.signatureRequired")}
            </p>
          )}
        </SectionCard>
      </div>

      {/* ═══════════════ FOOTER (sticky) ═══════════════ */}
      <div
        className="fixed bottom-0 left-0 right-0 px-4 pt-3 pb-5 border-t"
        style={{
          background: "rgba(255,255,255,0.96)",
          backdropFilter: "blur(8px)",
          borderColor: "#E2E8F0",
        }}
      >
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
          ) : (
            <Save className="w-4 h-4" />
          )}
          {createMutation.isPending ? t("newClient.creating") : t("newClient.create")}
        </button>
      </div>
    </div>
  );
}
