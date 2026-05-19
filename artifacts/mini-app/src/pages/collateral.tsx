import { useState, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import {
  ArrowLeft,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Camera,
  X,
  Building2,
  Car,
  Gem,
  Wrench,
  ChevronDown,
  Info,
} from "lucide-react";
import { api } from "@/lib/api";
import { fmtNum } from "@/lib/format";

type View = "deal" | "add";

interface CollateralType {
  id: number;
  code: string;
  nameRu: string;
  nameUz: string | null;
  isActive: boolean;
}

interface CollateralItem {
  id: number;
  clientId: number;
  collateralTypeId: number;
  title: string;
  marketValue: string;
  acceptedValue: string;
  discountApplied: string | null;
  isThirdParty: boolean;
  thirdPartyOwnerName: string | null;
  metadata: Record<string, unknown>;
}

interface CreditProduct {
  id: number;
  name: string;
  rateUZS: string | null;
}

interface EstimateResult {
  id: number;
  totalMarketValue: string;
  totalAcceptedValue: string;
  coverageRatioApplied: string;
  requiredCollateralValue: string;
  coveragePercent: string;
  maxLoanAmount: string;
  annualRateApplied: string | null;
  annualRateAppliedRaw: string | null;
  resultStatus: "enough" | "not_enough";
  hasEquipmentOnly: boolean;
  disclaimer: string | null;
}

interface CollateralSettings {
  coverageRatio: number;
}

interface CollateralPhotoDraft {
  id: string;
  dataUrl: string;
  name: string;
}

interface UploadedCollateralPhoto {
  storagePath: string;
  name?: string;
  size?: number;
  contentType?: string;
}

const TG_BG = "var(--tg-bg, #F4F4F5)";

function fmtMoney(value: string | number, currency = "UZS"): string {
  const num = typeof value === "string" ? Number.parseFloat(value) : value;
  if (!Number.isFinite(num)) return `${value} ${currency}`;
  return `${fmtNum(num, "ru-RU")} ${currency}`;
}

function parseAmountInput(value: string): number {
  const digits = value.replace(/\D/g, "");
  if (!digits) return 0;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatAmountInput(value: string): string {
  const digits = value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("ru-RU").replace(/\u00A0/g, " ");
}

function AmountReadout({ value, currency = "UZS" }: { value: number; currency?: string }) {
  if (!Number.isFinite(value) || value <= 0) return null;

  return (
    <div className="mt-2 rounded-xl border border-[#FCE588] bg-[#FFF7D6] px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#6B5C00]">
        {currency}
      </div>
      <div className="mt-0.5 text-[22px] font-black leading-none tracking-[-0.03em] text-[#0F172A]">
        {fmtNum(value, "ru-RU")}
      </div>
    </div>
  );
}

const TYPE_ICONS: Record<string, typeof Building2> = {
  real_estate: Building2,
  transport: Car,
  jewelry: Gem,
  land_plot: Building2,
  equipment: Wrench,
};

const TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  real_estate: { bg: "#EFF6FF", text: "#2563EB", border: "#BFDBFE" },
  transport: { bg: "#FFF7D6", text: "#6B5C00", border: "#FCE588" },
  jewelry: { bg: "#FFFBEB", text: "#D97706", border: "#FDE68A" },
  land_plot: { bg: "#EFF6FF", text: "#2563EB", border: "#BFDBFE" },
  equipment: { bg: "#F5F3FF", text: "#7C3AED", border: "#DDD6FE" },
};

function getTransportDiscount(age: number): number {
  if (age <= 3) return 0.70;
  if (age <= 5) return 0.60;
  if (age <= 7) return 0.50;
  return 0.30;
}

const REAL_ESTATE_DISCOUNT = 0.60;

function getMetadataPhotos(metadata: Record<string, unknown> | null | undefined): unknown[] {
  const photos = metadata?.photos;
  return Array.isArray(photos) ? photos : [];
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(String(event.target?.result || ""));
    reader.onerror = () => reject(new Error("Rasmni o'qib bo'lmadi"));
    reader.readAsDataURL(file);
  });
}

function optimizeDataUrl(dataUrl: string, maxWidth = 1280, quality = 0.78): Promise<string> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      if (!image.naturalWidth || image.naturalWidth <= maxWidth) {
        resolve(dataUrl);
        return;
      }

      const scale = maxWidth / image.naturalWidth;
      const canvas = document.createElement("canvas");
      canvas.width = maxWidth;
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        resolve(dataUrl);
        return;
      }

      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });
}

async function fileToPhotoDraft(file: File, index: number): Promise<CollateralPhotoDraft> {
  const dataUrl = await readFileAsDataUrl(file);
  const optimizedDataUrl = await optimizeDataUrl(dataUrl);
  return {
    id: `${Date.now()}-${index}`,
    dataUrl: optimizedDataUrl,
    name: file.name || `photo-${index + 1}.jpg`,
  };
}

async function uploadCollateralPhoto(
  clientId: number,
  photo: CollateralPhotoDraft,
  index: number,
): Promise<UploadedCollateralPhoto> {
  const response = await api.post("/storage/uploads/direct", {
    name: `collateral/${clientId}/${index + 1}-${photo.name}`,
    dataUrl: photo.dataUrl,
  }) as { objectPath: string; metadata?: { name?: string; size?: number; contentType?: string } };

  return {
    storagePath: response.objectPath,
    name: response.metadata?.name,
    size: response.metadata?.size,
    contentType: response.metadata?.contentType,
  };
}

export default function CollateralPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const clientId = Number(params.id);

  const [view, setView] = useState<View>("deal");

  const typesQuery = useQuery<CollateralType[]>({
    queryKey: ["collateral-types"],
    queryFn: () => api.get("/collateral-types"),
  });
  const itemsQuery = useQuery<CollateralItem[]>({
    queryKey: ["collateral-items", clientId],
    queryFn: () => api.get(`/clients/${clientId}/collateral-items`),
    enabled: Number.isFinite(clientId),
  });
  const productsQuery = useQuery<CreditProduct[]>({
    queryKey: ["credit-products-for-collateral"],
    queryFn: () => api.get("/mini-app/products"),
  });
  const settingsQuery = useQuery<CollateralSettings>({
    queryKey: ["collateral-settings"],
    queryFn: () => api.get("/collateral-settings"),
  });
  const coverageRatio = settingsQuery.data?.coverageRatio ?? 1.25;

  const clientQuery = useQuery<{ client?: { desiredAmountUzs?: string | number | null } }>({
    queryKey: ["mini-client", String(clientId)],
    queryFn: () => api.get(`/mini-app/clients/${clientId}`),
    enabled: Number.isFinite(clientId),
  });
  const clientDesiredAmount = (() => {
    const raw = clientQuery.data?.client?.desiredAmountUzs;
    if (raw === null || raw === undefined || raw === "") return 0;
    const n = Number(String(raw).replace(/\D/g, ""));
    return Number.isFinite(n) ? n : 0;
  })();

  const typeById = useMemo(
    () => new Map((typesQuery.data ?? []).map((tp) => [tp.id, tp])),
    [typesQuery.data],
  );

  return (
    <div className="min-h-screen pb-28" style={{ background: TG_BG }}>
      <div className="px-4 pt-3 pb-2">
        <button
          onClick={() => (view === "deal" ? navigate(`/clients/${clientId}`) : setView("deal"))}
          className="flex items-center gap-1 text-[13px] font-semibold text-[#64748B]"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("common.back")}
        </button>
      </div>

      {view === "deal" && (
        <DealSheetView
          clientId={clientId}
          items={itemsQuery.data ?? []}
          types={typeById}
          products={productsQuery.data ?? []}
          coverageRatio={coverageRatio}
          clientDesiredAmount={clientDesiredAmount}
          loading={itemsQuery.isLoading}
          onAdd={() => setView("add")}
          onArchive={async (id) => {
            await api.delete(`/collateral-items/${id}`);
            qc.invalidateQueries({ queryKey: ["collateral-items", clientId] });
          }}
          onEstimateSaved={() => {
            qc.invalidateQueries({ queryKey: ["collateral-estimates", clientId] });
          }}
        />
      )}

      {view === "add" && (
        <AddItemView
          types={typesQuery.data ?? []}
          onCancel={() => setView("deal")}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["collateral-items", clientId] });
            setView("deal");
          }}
          clientId={clientId}
        />
      )}
    </div>
  );
}

// ─── List view ────────────────────────────────────────────────────────────

function CoverageGauge({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(percent, 200));
  // Gauge maxes visually at 200% so a healthy 150% still feels comfortable
  // and a barely-covered 95% still reads as nearly-full.
  const ratio = clamped / 200;
  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * ratio;
  const tone =
    percent >= 125 ? { stroke: "#16A34A", fg: "#15803D" }
      : percent >= 100 ? { stroke: "#22C55E", fg: "#15803D" }
        : percent >= 80 ? { stroke: "#F59E0B", fg: "#B45309" }
          : { stroke: "#EF4444", fg: "#B91C1C" };

  return (
    <div className="relative w-[170px] h-[170px] mx-auto">
      <svg width="170" height="170" viewBox="0 0 170 170">
        <circle cx="85" cy="85" r={radius} stroke="#E2E8F0" strokeWidth="14" fill="none" />
        <circle
          cx="85"
          cy="85"
          r={radius}
          stroke={tone.stroke}
          strokeWidth="14"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          transform="rotate(-90 85 85)"
          style={{ transition: "stroke-dasharray 350ms ease, stroke 250ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-[32px] font-black leading-none tracking-[-0.02em]" style={{ color: tone.fg }}>
          {Math.round(percent)}%
        </div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#64748B] mt-1">
          покрытие
        </div>
      </div>
    </div>
  );
}

function DealSheetView({
  clientId,
  items,
  types,
  products,
  coverageRatio,
  clientDesiredAmount,
  loading,
  onAdd,
  onArchive,
  onEstimateSaved,
}: {
  clientId: number;
  items: CollateralItem[];
  types: Map<number, CollateralType>;
  products: CreditProduct[];
  coverageRatio: number;
  clientDesiredAmount: number;
  loading: boolean;
  onAdd: () => void;
  onArchive: (id: number) => void;
  onEstimateSaved: () => void;
}) {
  const { t } = useTranslation();
  const creditProductId: number | "" = products[0]?.id ?? "";

  const [requestedLoanAmount, setRequestedLoanAmount] = useState(
    clientDesiredAmount > 0 ? formatAmountInput(String(clientDesiredAmount)) : "",
  );
  const [excludedIds, setExcludedIds] = useState<Set<number>>(new Set());
  const [savedFlash, setSavedFlash] = useState(false);

  // Auto-fill once the client query resolves and we still have no draft.
  if (requestedLoanAmount === "" && clientDesiredAmount > 0) {
    // safe: parent re-renders carry the prefill into the input on next mount
  }

  const requestedLoanAmountValue = parseAmountInput(requestedLoanAmount);
  const includedItems = useMemo(
    () => items.filter((it) => !excludedIds.has(it.id)),
    [items, excludedIds],
  );

  const live = useMemo(() => {
    const market = includedItems.reduce((s, it) => s + (Number.parseFloat(it.marketValue) || 0), 0);
    const accepted = includedItems.reduce((s, it) => s + (Number.parseFloat(it.acceptedValue) || 0), 0);
    const required = requestedLoanAmountValue * coverageRatio;
    const coverage = requestedLoanAmountValue > 0 ? (accepted / requestedLoanAmountValue) * 100 : 0;
    const shortfall = Math.max(0, required - accepted);
    const surplus = Math.max(0, accepted - required);
    const maxLoan = accepted / coverageRatio;
    return { market, accepted, required, coverage, shortfall, surplus, maxLoan };
  }, [includedItems, requestedLoanAmountValue, coverageRatio]);

  const equipmentOnly =
    includedItems.length > 0 &&
    includedItems.every((it) => types.get(it.collateralTypeId)?.code === "equipment");

  const saveEstimate = useMutation({
    mutationFn: () =>
      api.post(`/clients/${clientId}/collateral-estimates`, {
        creditProductId,
        requestedLoanAmount: requestedLoanAmountValue,
        collateralItemIds: includedItems.map((it) => it.id),
      }),
    onSuccess: () => {
      setSavedFlash(true);
      onEstimateSaved();
      window.setTimeout(() => setSavedFlash(false), 2400);
    },
  });

  const canSave =
    typeof creditProductId === "number" &&
    requestedLoanAmountValue > 0 &&
    includedItems.length > 0 &&
    !saveEstimate.isPending;

  const verdict = (() => {
    if (requestedLoanAmountValue <= 0) {
      return { label: t("collateral.enterAmount", { defaultValue: "Укажите сумму" }), tone: "neutral" as const };
    }
    if (includedItems.length === 0) {
      return { label: t("collateral.selectSomething", { defaultValue: "Выберите залог" }), tone: "neutral" as const };
    }
    if (live.coverage >= 100) return { label: t("collateral.enough", { defaultValue: "Хватает" }), tone: "good" as const };
    return { label: t("collateral.notEnough", { defaultValue: "Не хватает" }), tone: "bad" as const };
  })();

  return (
    <div className="px-4 space-y-4">
      <div className="mn-card p-5">
        <h1 className="text-[18px] font-bold text-[#0F172A]">{t("collateral.title")}</h1>
        <p className="text-[13px] text-[#64748B] mt-1">
          {t("collateral.dealSheetHint", {
            defaultValue: "Покрытие пересчитывается в реальном времени по мере правки",
          })}
        </p>
      </div>

      <div className="mn-card p-5 space-y-4">
        <CoverageGauge percent={live.coverage} />

        <div className="flex items-center justify-center gap-2">
          {verdict.tone === "good" && <CheckCircle2 className="w-4 h-4 text-[#16A34A]" />}
          {verdict.tone === "bad" && <AlertTriangle className="w-4 h-4 text-[#D97706]" />}
          <span
            className="text-[14px] font-bold"
            style={{
              color:
                verdict.tone === "good" ? "#15803D" : verdict.tone === "bad" ? "#B45309" : "#475569",
            }}
          >
            {verdict.label}
            {verdict.tone === "good" && live.surplus > 0
              ? ` · +${fmtMoney(live.surplus)}`
              : verdict.tone === "bad" && live.shortfall > 0
                ? ` · −${fmtMoney(live.shortfall)}`
                : ""}
          </span>
        </div>

        <div>
          <div className="text-[11px] font-semibold text-[#64748B] uppercase mb-1.5">
            {t("collateral.requestedLoanAmount")}
          </div>
          <input
            type="text"
            value={requestedLoanAmount}
            onChange={(e) => setRequestedLoanAmount(formatAmountInput(e.target.value))}
            placeholder="100 000 000"
            className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-[15px] font-semibold focus:border-[#3B82F6] focus:ring-2 focus:ring-[#3B82F6]/20 outline-none"
            inputMode="numeric"
            autoComplete="off"
          />
          {clientDesiredAmount > 0 && (
            <p className="mt-1 text-[11px] text-[#64748B]">
              {t("collateral.amountFromClient", {
                defaultValue: "Сумма взята из кредитной заявки клиента — можно изменить",
              })}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
            <div className="text-[10px] uppercase tracking-wide text-[#64748B] font-semibold">
              {t("collateral.totalAccepted")}
            </div>
            <div className="text-[15px] font-bold text-[#0F172A] mt-0.5">
              {fmtMoney(live.accepted)}
            </div>
          </div>
          <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
            <div className="text-[10px] uppercase tracking-wide text-[#64748B] font-semibold">
              {t("collateral.maxLoan")}
            </div>
            <div className="text-[15px] font-bold text-[#0F172A] mt-0.5">
              {fmtMoney(live.maxLoan)}
            </div>
          </div>
        </div>
      </div>

      {equipmentOnly && (
        <div className="mn-card p-3 bg-[#FEF3C7] border-[#F59E0B] flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-[#D97706] mt-0.5 flex-shrink-0" />
          <p className="text-[12px] text-[#78350F]">{t("collateral.equipmentOnlyWarning")}</p>
        </div>
      )}

      <div className="mn-card p-3 space-y-2">
        <div className="flex items-center justify-between px-1">
          <div className="text-[12px] font-semibold text-[#64748B] uppercase tracking-wide">
            {t("collateral.items", { defaultValue: "Залог" })}
          </div>
          <div className="text-[10px] text-[#94A3B8]">
            {includedItems.length}/{items.length}
          </div>
        </div>
        {loading && <div className="text-[13px] text-[#64748B] py-4 text-center">…</div>}
        {!loading && items.length === 0 && (
          <div className="text-center py-8">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#F1F5F9] flex items-center justify-center">
              <Building2 className="w-6 h-6 text-[#94A3B8]" />
            </div>
            <p className="text-[14px] font-semibold text-[#64748B]">{t("collateral.empty")}</p>
            <p className="text-[12px] text-[#94A3B8] mt-1">{t("collateral.emptyHint")}</p>
          </div>
        )}
        {items.map((item) => {
          const type = types.get(item.collateralTypeId);
          const typeCode = type?.code ?? "equipment";
          const Icon = TYPE_ICONS[typeCode] ?? Wrench;
          const colors = TYPE_COLORS[typeCode] ?? TYPE_COLORS.equipment;
          const included = !excludedIds.has(item.id);
          const discountPct = item.discountApplied
            ? Math.round(Number(item.discountApplied) * 100)
            : null;

          return (
            <div
              key={item.id}
              className={`flex items-center gap-3 py-2.5 px-3 rounded-xl border-2 transition-all ${
                included ? "border-[#BFDBFE] bg-[#F0F9FF]" : "border-[#E2E8F0] bg-white opacity-60"
              }`}
            >
              <button
                onClick={() => {
                  setExcludedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(item.id)) next.delete(item.id);
                    else next.add(item.id);
                    return next;
                  });
                }}
                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                  included ? "bg-[#3B82F6] border-[#3B82F6]" : "border-[#CBD5E1] bg-white"
                }`}
                aria-label={t("collateral.toggleInclude", { defaultValue: "Включить в расчёт" })}
              >
                {included && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: colors.bg }}
              >
                <Icon className="w-5 h-5" style={{ color: colors.text }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-semibold text-[#0F172A] truncate">{item.title}</div>
                <div className="text-[11px] text-[#64748B] mt-0.5 flex items-baseline gap-1 flex-wrap">
                  <span>{fmtMoney(item.marketValue)}</span>
                  <span className="text-[#94A3B8]">→</span>
                  <span className="font-semibold text-[#0F172A]">{fmtMoney(item.acceptedValue)}</span>
                  {discountPct !== null && (
                    <span className="text-[#94A3B8]">· ×{discountPct}%</span>
                  )}
                </div>
              </div>
              {item.isThirdParty && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#FEF3C7] text-[#92400E] flex-shrink-0">
                  {t("collateral.thirdPartyShort")}
                </span>
              )}
              <button onClick={() => onArchive(item.id)} className="text-[#EF4444] p-2 flex-shrink-0">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>

      <SavedEstimatesPanel clientId={clientId} />

      {saveEstimate.error && (
        <div className="mn-card p-3 bg-[#FEE2E2] border-[#EF4444]">
          <p className="text-[12px] text-[#991B1B]">{(saveEstimate.error as Error).message}</p>
        </div>
      )}
      {savedFlash && (
        <div className="mn-card p-3 bg-[#ECFDF5] border-[#16A34A] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-[#16A34A] flex-shrink-0" />
          <p className="text-[12px] font-semibold text-[#065F46]">
            {t("collateral.savedToast", { defaultValue: "Расчёт сохранён" })}
          </p>
        </div>
      )}

      <div className="space-y-2">
        <button
          onClick={onAdd}
          className="w-full h-12 rounded-xl bg-white border-2 border-dashed border-[#CBD5E1] text-[14px] font-bold text-[#475569] flex items-center justify-center gap-2 active:bg-[#F8FAFC]"
        >
          <Plus className="w-5 h-5" />
          {t("collateral.addItem")}
        </button>
        <button
          onClick={() => canSave && saveEstimate.mutate()}
          disabled={!canSave}
          className="w-full h-12 rounded-xl text-[14px] font-bold text-[#272424] disabled:opacity-40 active:opacity-80"
          style={{ background: "#FFD531" }}
        >
          {saveEstimate.isPending
            ? t("common.saving")
            : t("collateral.saveEstimate", { defaultValue: "Сохранить расчёт" })}
        </button>
      </div>
    </div>
  );
}

interface SavedEstimateRow {
  id: number;
  createdAt: string;
  requestedLoanAmount: string;
  totalAcceptedValue: string;
  coveragePercent: string;
  resultStatus: "enough" | "not_enough";
}

function SavedEstimatesPanel({ clientId }: { clientId: number }) {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery<SavedEstimateRow[]>({
    queryKey: ["collateral-estimates", clientId],
    queryFn: () => api.get(`/clients/${clientId}/collateral-estimates`),
    enabled: Number.isFinite(clientId),
  });

  if (isLoading) return null;
  const rows = (data ?? []).slice(0, 5);
  if (rows.length === 0) return null;

  return (
    <div className="mn-card p-3 space-y-2">
      <div className="text-[12px] font-semibold text-[#64748B] uppercase">
        {t("collateral.savedEstimates")}
      </div>
      {rows.map((row) => {
        const enough = row.resultStatus === "enough";
        return (
          <div
            key={row.id}
            className="flex items-center gap-2 py-2 px-2 rounded-lg border border-[#E2E8F0]"
          >
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-[#0F172A]">
                {fmtMoney(row.requestedLoanAmount)} → {Number(row.coveragePercent).toFixed(0)}%
              </div>
              <div className="text-[11px] text-[#64748B]">
                {new Date(row.createdAt).toLocaleDateString("ru-RU")}
              </div>
            </div>
            <span
              className="text-[10px] font-bold px-2 py-1 rounded-full"
              style={{
                color: enough ? "#16A34A" : "#D97706",
                background: enough ? "#ECFDF5" : "#FEF3C7",
              }}
            >
              {enough ? t("collateral.enoughShort") : t("collateral.notEnoughShort")}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Add item view ────────────────────────────────────────────────────────

function AddItemView({
  types,
  clientId,
  onCancel,
  onSaved,
}: {
  types: CollateralType[];
  clientId: number;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [collateralTypeId, setCollateralTypeId] = useState<number | "">("");
  const [title, setTitle] = useState("");
  const [marketValue, setMarketValue] = useState("");
  const [year, setYear] = useState("");
  const [isThirdParty, setIsThirdParty] = useState(false);
  const [thirdPartyOwnerName, setThirdPartyOwnerName] = useState("");
  const [photos, setPhotos] = useState<CollateralPhotoDraft[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedType = types.find((tp) => tp.id === collateralTypeId);
  const typeCode = selectedType?.code ?? "";
  const isTransport = typeCode === "transport";
  const isRealEstate = typeCode === "real_estate" || typeCode === "land_plot";
  const marketValueAmount = parseAmountInput(marketValue);

  const create = useMutation({
    mutationFn: async (body: {
      collateralTypeId: number;
      title: string;
      marketValue: number;
      isThirdParty: boolean;
      thirdPartyOwnerName?: string;
      metadata: Record<string, unknown>;
      photos: CollateralPhotoDraft[];
    }) => {
      const uploadedPhotos = await Promise.all(
        body.photos.map((photo, index) => uploadCollateralPhoto(clientId, photo, index)),
      );
      const metadata = { ...body.metadata };
      if (uploadedPhotos.length > 0) {
        metadata.photos = uploadedPhotos;
      }

      return api.post(`/clients/${clientId}/collateral-items`, {
        collateralTypeId: body.collateralTypeId,
        title: body.title,
        marketValue: body.marketValue,
        isThirdParty: body.isThirdParty,
        thirdPartyOwnerName: body.thirdPartyOwnerName,
        metadata,
      });
    },
    onSuccess: () => onSaved(),
  });

  const previewInfo = useMemo(() => {
    const mv = marketValueAmount;
    if (!Number.isFinite(mv) || mv <= 0) return null;

    if (isRealEstate) {
      return {
        accepted: mv * REAL_ESTATE_DISCOUNT,
        discount: REAL_ESTATE_DISCOUNT,
        tierLabel: t("collateral.discountRealEstate"),
      };
    }

    if (isTransport && year) {
      const age = new Date().getFullYear() - Number(year);
      if (age >= 0) {
        const discount = getTransportDiscount(age);
        let tierKey: string;
        if (age <= 3) tierKey = "collateral.discountTier03";
        else if (age <= 5) tierKey = "collateral.discountTier35";
        else if (age <= 7) tierKey = "collateral.discountTier57";
        else tierKey = "collateral.discountTier7plus";
        return {
          accepted: mv * discount,
          discount,
          tierLabel: t(tierKey),
        };
      }
    }

    return { accepted: mv, discount: null, tierLabel: null };
  }, [marketValueAmount, isTransport, isRealEstate, year, t]);

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const remainingSlots = Math.max(0, 5 - photos.length);
    const selected = Array.from(files)
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, remainingSlots);

    const photoDrafts = await Promise.all(
      selected.map((file, index) => fileToPhotoDraft(file, photos.length + index)),
    );

    setPhotos((prev) => [...prev, ...photoDrafts].slice(0, 5));

    e.target.value = "";
  };

  const removePhoto = (idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (typeof collateralTypeId !== "number" || !title || marketValueAmount <= 0) return;

    const metadata: Record<string, unknown> = {};
    if (isTransport && year) metadata.year = Number(year);

    create.mutate({
      collateralTypeId,
      title,
      marketValue: marketValueAmount,
      isThirdParty,
      thirdPartyOwnerName: isThirdParty ? thirdPartyOwnerName : undefined,
      metadata,
      photos,
    });
  };

  return (
    <form onSubmit={onSubmit} className="px-4 space-y-3">
      <div className="mn-card p-5">
        <h2 className="text-[16px] font-bold text-[#0F172A]">{t("collateral.addItem")}</h2>
        <p className="text-[12px] text-[#64748B] mt-1">{t("collateral.addItemHint")}</p>
      </div>

      {/* Type selection as cards */}
      <div className="mn-card p-3">
        <div className="text-[11px] font-semibold text-[#64748B] uppercase mb-2">{t("collateral.type")}</div>
        <div className="grid grid-cols-2 gap-2">
          {types.map((tp) => {
            const Icon = TYPE_ICONS[tp.code] ?? Wrench;
            const colors = TYPE_COLORS[tp.code] ?? TYPE_COLORS.equipment;
            const selected = collateralTypeId === tp.id;
            return (
              <button
                key={tp.id}
                type="button"
                onClick={() => setCollateralTypeId(tp.id)}
                className="flex items-center gap-2.5 p-3 rounded-xl border-2 text-left transition-all"
                style={{
                  borderColor: selected ? colors.text : "#E2E8F0",
                  background: selected ? colors.bg : "white",
                }}
              >
                <Icon className="w-5 h-5 flex-shrink-0" style={{ color: colors.text }} />
                <span className="text-[13px] font-semibold text-[#0F172A] leading-tight">{tp.nameRu}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Discount info banner */}
      {typeCode && (
        <div className="mn-card p-3 flex items-start gap-2" style={{ background: "#F0F9FF", borderColor: "#BAE6FD" }}>
          <Info className="w-4 h-4 text-[#0284C7] mt-0.5 flex-shrink-0" />
          <p className="text-[12px] text-[#0369A1] leading-relaxed">
            {isRealEstate && t("collateral.discountInfoRealEstate")}
            {isTransport && t("collateral.discountInfoTransport")}
            {!isRealEstate && !isTransport && t("collateral.discountInfoFull")}
          </p>
        </div>
      )}

      {/* Item details */}
      <div className="mn-card p-4 space-y-3">
        <Field label={t("collateral.itemTitle")}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("collateral.itemTitlePlaceholder")}
            className="w-full h-10 rounded-lg border border-[#E2E8F0] px-3 text-[14px] focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6] outline-none"
            required
          />
        </Field>

        <Field label={t("collateral.marketValue")}>
          <input
            type="text"
            value={marketValue}
            onChange={(e) => setMarketValue(formatAmountInput(e.target.value))}
            placeholder="100 000 000"
            className="w-full h-10 rounded-lg border border-[#E2E8F0] px-3 text-[14px] focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6] outline-none"
            inputMode="numeric"
            autoComplete="off"
            required
          />
          <AmountReadout value={marketValueAmount} />
        </Field>

        {isTransport && (
          <Field label={t("collateral.year")}>
            <input
              type="number"
              min="1980"
              max={new Date().getFullYear()}
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder={`${new Date().getFullYear()}`}
              className="w-full h-10 rounded-lg border border-[#E2E8F0] px-3 text-[14px] focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6] outline-none"
              inputMode="numeric"
            />
          </Field>
        )}

        <div className="flex items-center gap-3 pt-1">
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={isThirdParty}
              onChange={(e) => setIsThirdParty(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-[#CBD5E1] rounded-full peer-checked:bg-[#3B82F6] transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-transform peer-checked:after:translate-x-4" />
          </label>
          <span className="text-[13px] text-[#0F172A]">
            {t("collateral.thirdParty")}
          </span>
        </div>

        {isThirdParty && (
          <Field label={t("collateral.ownerName")}>
            <input
              value={thirdPartyOwnerName}
              onChange={(e) => setThirdPartyOwnerName(e.target.value)}
              className="w-full h-10 rounded-lg border border-[#E2E8F0] px-3 text-[14px] focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6] outline-none"
              required={isThirdParty}
            />
          </Field>
        )}
      </div>

      {/* Photos */}
      <div className="mn-card p-4">
        <div className="text-[11px] font-semibold text-[#64748B] uppercase mb-2">
          {t("collateral.photos")} ({photos.length}/5)
        </div>
        <div className="flex gap-2 flex-wrap">
          {photos.map((photo, idx) => (
            <div key={idx} className="relative w-16 h-16 rounded-lg overflow-hidden border border-[#E2E8F0]">
              <img src={photo.dataUrl} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removePhoto(idx)}
                className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center"
              >
                <X className="w-3 h-3 text-white" />
              </button>
            </div>
          ))}
          {photos.length < 5 && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-16 h-16 rounded-lg border-2 border-dashed border-[#CBD5E1] flex flex-col items-center justify-center gap-1 active:bg-[#F8FAFC]"
            >
              <Camera className="w-5 h-5 text-[#94A3B8]" />
              <span className="text-[9px] text-[#94A3B8] font-semibold">{t("collateral.addPhoto")}</span>
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={handlePhotoCapture}
          className="hidden"
        />
      </div>

      {/* Preview */}
      {previewInfo && (
        <div className="mn-card p-4 space-y-2">
          <div className="text-[11px] font-semibold text-[#64748B] uppercase mb-1">
            {t("collateral.preview")}
          </div>
          <SummaryRow
            label={t("collateral.marketValue")}
            value={fmtMoney(marketValueAmount)}
          />
          {previewInfo.discount !== null && previewInfo.tierLabel && (
            <div className="flex justify-between items-center text-[12px]">
              <span className="text-[#D97706]">{previewInfo.tierLabel}</span>
              <span className="font-semibold text-[#D97706]">{Math.round(previewInfo.discount * 100)}%</span>
            </div>
          )}
          <div className="border-t border-[#E2E8F0] pt-2">
            <SummaryRow
              label={t("collateral.acceptedValue")}
              value={fmtMoney(previewInfo.accepted)}
              bold
            />
          </div>
        </div>
      )}

      {create.error && (
        <div className="mn-card p-3 bg-[#FEE2E2] border-[#EF4444]">
          <p className="text-[12px] text-[#991B1B]">{(create.error as Error).message}</p>
        </div>
      )}

      <div className="space-y-2">
        <button
          type="submit"
          disabled={create.isPending || !collateralTypeId || !title || marketValueAmount <= 0}
          className="w-full h-12 rounded-xl text-[14px] font-bold text-[#272424] disabled:opacity-40 active:opacity-80"
          style={{ background: "#FFD531" }}
        >
          {create.isPending ? t("common.saving") : t("common.save")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="w-full h-12 rounded-xl border border-[#E2E8F0] text-[14px] font-semibold text-[#64748B]"
        >
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}


// ─── Shared components ─────────────────────────────────────────────────────

function SummaryRow({ label, value, bold, highlight }: { label: string; value: string; bold?: boolean; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center text-[13px]">
      <span className="text-[#64748B]">{label}</span>
      <span
        className={`${bold ? "font-bold text-[14px]" : "font-semibold"}`}
        style={{ color: highlight ? "#D97706" : "#0F172A" }}
      >
        {value}
      </span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-[#64748B] uppercase mb-1">{label}</div>
      {children}
    </div>
  );
}
