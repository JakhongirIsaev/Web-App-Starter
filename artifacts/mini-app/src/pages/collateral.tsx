import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import { fmtNum } from "@/lib/format";

type View = "list" | "add" | "estimate" | "result";

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

const TG_BG = "var(--tg-bg, #F4F4F5)";

function fmtMoney(value: string | number, currency = "UZS"): string {
  const num = typeof value === "string" ? Number.parseFloat(value) : value;
  if (!Number.isFinite(num)) return `${value} ${currency}`;
  return `${fmtNum(num, "ru-RU")} ${currency}`;
}

export default function CollateralPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const clientId = Number(params.id);

  const [view, setView] = useState<View>("list");
  const [estimate, setEstimate] = useState<EstimateResult | null>(null);

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

  const typeById = useMemo(
    () => new Map((typesQuery.data ?? []).map((tp) => [tp.id, tp])),
    [typesQuery.data],
  );

  return (
    <div className="min-h-screen pb-8" style={{ background: TG_BG }}>
      <div className="px-4 pt-3 pb-2">
        <button
          onClick={() => (view === "list" ? navigate(`/clients/${clientId}`) : setView("list"))}
          className="flex items-center gap-1 text-[13px] font-semibold text-[#64748B]"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("common.back")}
        </button>
      </div>

      {view === "list" && (
        <ListView
          clientId={clientId}
          items={itemsQuery.data ?? []}
          types={typeById}
          loading={itemsQuery.isLoading}
          onAdd={() => setView("add")}
          onEstimate={() => setView("estimate")}
          onArchive={async (id) => {
            await api.delete(`/collateral-items/${id}`);
            qc.invalidateQueries({ queryKey: ["collateral-items", clientId] });
          }}
        />
      )}

      {view === "add" && (
        <AddItemView
          types={typesQuery.data ?? []}
          onCancel={() => setView("list")}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["collateral-items", clientId] });
            setView("list");
          }}
          clientId={clientId}
        />
      )}

      {view === "estimate" && (
        <EstimateView
          items={itemsQuery.data ?? []}
          types={typeById}
          products={productsQuery.data ?? []}
          clientId={clientId}
          onCancel={() => setView("list")}
          onCreated={(result) => {
            setEstimate(result);
            setView("result");
          }}
        />
      )}

      {view === "result" && estimate && (
        <ResultView
          estimate={estimate}
          types={typeById}
          items={itemsQuery.data ?? []}
          onClose={() => setView("list")}
        />
      )}
    </div>
  );
}

// ─── List view ────────────────────────────────────────────────────────────

function ListView({
  clientId,
  items,
  types,
  loading,
  onAdd,
  onEstimate,
  onArchive,
}: {
  clientId: number;
  items: CollateralItem[];
  types: Map<number, CollateralType>;
  loading: boolean;
  onAdd: () => void;
  onEstimate: () => void;
  onArchive: (id: number) => void;
}) {
  const { t } = useTranslation();
  const totals = useMemo(() => {
    let market = 0;
    let accepted = 0;
    for (const it of items) {
      market += Number.parseFloat(it.marketValue) || 0;
      accepted += Number.parseFloat(it.acceptedValue) || 0;
    }
    return { market, accepted, maxLoan125: accepted / 1.25 };
  }, [items]);

  return (
    <div className="px-4 space-y-4">
      <div className="mn-card p-5">
        <h1 className="text-[18px] font-bold text-[#0F172A]">{t("collateral.title")}</h1>
        <p className="text-[13px] text-[#64748B] mt-1">{t("collateral.estimateTitle")}</p>
      </div>

      <div className="mn-card p-4 space-y-2">
        <Row label={t("collateral.totalMarket")} value={fmtMoney(totals.market)} />
        <Row label={t("collateral.totalAccepted")} value={fmtMoney(totals.accepted)} />
        <Row label={t("collateral.maxLoan")} value={fmtMoney(totals.maxLoan125)} />
      </div>

      <div className="mn-card p-3 space-y-2">
        {loading && <div className="text-[13px] text-[#64748B] py-4 text-center">…</div>}
        {!loading && items.length === 0 && (
          <div className="text-[13px] text-[#64748B] py-6 text-center">
            {t("collateral.empty")}
          </div>
        )}
        {items.map((item) => {
          const type = types.get(item.collateralTypeId);
          return (
            <div key={item.id} className="flex items-center gap-3 py-2 px-2 rounded-xl border border-[#E2E8F0]">
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-semibold text-[#0F172A] truncate">{item.title}</div>
                <div className="text-[11px] text-[#64748B]">
                  {type?.nameRu ?? `#${item.collateralTypeId}`} • {fmtMoney(item.acceptedValue)}
                  {item.discountApplied ? ` (${Math.round(Number(item.discountApplied) * 100)}%)` : ""}
                  {item.isThirdParty ? ` • ${t("collateral.thirdParty")}` : ""}
                </div>
              </div>
              <button onClick={() => onArchive(item.id)} className="text-[#EF4444] p-2">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>

      <SavedEstimatesPanel clientId={clientId} />

      <div className="space-y-2">
        <button
          onClick={onAdd}
          className="w-full h-11 rounded-xl bg-white border border-[#E2E8F0] text-[14px] font-bold text-[#0F172A] flex items-center justify-center gap-1"
        >
          <Plus className="w-4 h-4" />
          {t("collateral.addItem")}
        </button>
        <button
          onClick={onEstimate}
          disabled={items.length === 0}
          className="w-full h-11 rounded-xl text-[14px] font-bold text-white disabled:opacity-50"
          style={{ background: "#16A34A" }}
        >
          {t("collateral.createEstimate")}
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

  const selectedType = types.find((tp) => tp.id === collateralTypeId);
  const isTransport = selectedType?.code === "transport";

  const create = useMutation({
    mutationFn: (body: unknown) => api.post(`/clients/${clientId}/collateral-items`, body),
    onSuccess: () => onSaved(),
  });

  const previewAccepted = useMemo(() => {
    const mv = Number.parseFloat(marketValue);
    if (!Number.isFinite(mv) || mv <= 0) return null;
    if (isTransport && year) {
      const age = new Date().getFullYear() - Number(year);
      if (age > 7) return mv * 0.4;
    }
    return mv;
  }, [marketValue, isTransport, year]);

  const transportAgeWarning = useMemo(() => {
    if (!isTransport || !year) return false;
    return new Date().getFullYear() - Number(year) > 7;
  }, [isTransport, year]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (typeof collateralTypeId !== "number" || !title || !marketValue) return;

    const metadata: Record<string, unknown> = {};
    if (isTransport && year) metadata.year = Number(year);

    create.mutate({
      collateralTypeId,
      title,
      marketValue: Number(marketValue),
      isThirdParty,
      thirdPartyOwnerName: isThirdParty ? thirdPartyOwnerName : undefined,
      metadata,
    });
  };

  return (
    <form onSubmit={onSubmit} className="px-4 space-y-3">
      <div className="mn-card p-4 space-y-3">
        <Field label={t("collateral.type")}>
          <select
            value={collateralTypeId}
            onChange={(e) => setCollateralTypeId(Number(e.target.value))}
            className="w-full h-10 rounded-lg border border-[#E2E8F0] px-3 bg-white text-[14px]"
            required
          >
            <option value="">—</option>
            {types.map((tp) => (
              <option key={tp.id} value={tp.id}>
                {tp.nameRu}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t("collateral.itemTitle")}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full h-10 rounded-lg border border-[#E2E8F0] px-3 text-[14px]"
            required
          />
        </Field>

        <Field label={t("collateral.marketValue")}>
          <input
            type="number"
            step="1"
            min="1"
            value={marketValue}
            onChange={(e) => setMarketValue(e.target.value)}
            className="w-full h-10 rounded-lg border border-[#E2E8F0] px-3 text-[14px]"
            required
          />
        </Field>

        {isTransport && (
          <Field label={t("collateral.year")}>
            <input
              type="number"
              min="1980"
              max={new Date().getFullYear()}
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="w-full h-10 rounded-lg border border-[#E2E8F0] px-3 text-[14px]"
            />
          </Field>
        )}

        <div className="flex items-center gap-2">
          <input
            id="is3p"
            type="checkbox"
            checked={isThirdParty}
            onChange={(e) => setIsThirdParty(e.target.checked)}
          />
          <label htmlFor="is3p" className="text-[13px] text-[#0F172A]">
            {t("collateral.thirdParty")}
          </label>
        </div>

        {isThirdParty && (
          <Field label={t("collateral.ownerName")}>
            <input
              value={thirdPartyOwnerName}
              onChange={(e) => setThirdPartyOwnerName(e.target.value)}
              className="w-full h-10 rounded-lg border border-[#E2E8F0] px-3 text-[14px]"
              required={isThirdParty}
            />
          </Field>
        )}
      </div>

      {transportAgeWarning && (
        <div className="mn-card p-3 bg-[#FEF3C7] border-[#F59E0B] flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-[#D97706] mt-0.5 flex-shrink-0" />
          <p className="text-[12px] text-[#78350F]">{t("collateral.transportAgeWarning")}</p>
        </div>
      )}

      {previewAccepted !== null && (
        <div className="mn-card p-3">
          <Row
            label={t("collateral.acceptedValue")}
            value={fmtMoney(previewAccepted)}
          />
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
          disabled={create.isPending}
          className="w-full h-11 rounded-xl text-[14px] font-bold text-white disabled:opacity-50"
          style={{ background: "#16A34A" }}
        >
          {create.isPending ? t("common.saving") : t("common.save")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="w-full h-11 rounded-xl border border-[#E2E8F0] text-[14px] font-semibold text-[#64748B]"
        >
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}

// ─── Estimate view ────────────────────────────────────────────────────────

function EstimateView({
  items,
  types,
  products,
  clientId,
  onCancel,
  onCreated,
}: {
  items: CollateralItem[];
  types: Map<number, CollateralType>;
  products: CreditProduct[];
  clientId: number;
  onCancel: () => void;
  onCreated: (estimate: EstimateResult) => void;
}) {
  const { t } = useTranslation();
  const [creditProductId, setCreditProductId] = useState<number | "">("");
  const [requestedLoanAmount, setRequestedLoanAmount] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [notes, setNotes] = useState("");

  const create = useMutation({
    mutationFn: (body: unknown) => api.post(`/clients/${clientId}/collateral-estimates`, body),
    onSuccess: (data: any) => onCreated(data),
  });

  const selectedItems = items.filter((it) => selectedIds.has(it.id));
  const live = useMemo(() => {
    const accepted = selectedItems.reduce((s, it) => s + (Number.parseFloat(it.acceptedValue) || 0), 0);
    const market = selectedItems.reduce((s, it) => s + (Number.parseFloat(it.marketValue) || 0), 0);
    const requested = Number.parseFloat(requestedLoanAmount) || 0;
    const required = requested * 1.25;
    const coverage = requested > 0 ? (accepted / requested) * 100 : 0;
    const maxLoan = accepted / 1.25;
    return { accepted, market, requested, required, coverage, maxLoan };
  }, [selectedItems, requestedLoanAmount]);

  const equipmentOnly =
    selectedItems.length > 0 &&
    selectedItems.every((it) => types.get(it.collateralTypeId)?.code === "equipment");

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (typeof creditProductId !== "number" || !requestedLoanAmount || selectedIds.size === 0) return;
    create.mutate({
      creditProductId,
      requestedLoanAmount: Number(requestedLoanAmount),
      collateralItemIds: Array.from(selectedIds),
      notes: notes || undefined,
    });
  };

  return (
    <form onSubmit={onSubmit} className="px-4 space-y-3">
      <div className="mn-card p-4 space-y-3">
        <Field label={t("collateral.creditProduct")}>
          <select
            value={creditProductId}
            onChange={(e) => setCreditProductId(Number(e.target.value))}
            className="w-full h-10 rounded-lg border border-[#E2E8F0] px-3 bg-white text-[14px]"
            required
          >
            <option value="">—</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.rateUZS ? ` — ${p.rateUZS}` : ""}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t("collateral.requestedLoanAmount")}>
          <input
            type="number"
            step="1"
            min="1"
            value={requestedLoanAmount}
            onChange={(e) => setRequestedLoanAmount(e.target.value)}
            className="w-full h-10 rounded-lg border border-[#E2E8F0] px-3 text-[14px]"
            required
          />
        </Field>
      </div>

      <div className="mn-card p-3 space-y-2">
        <div className="text-[12px] font-semibold text-[#64748B] uppercase">
          {t("collateral.selectItems")}
        </div>
        {items.map((item) => {
          const type = types.get(item.collateralTypeId);
          const checked = selectedIds.has(item.id);
          return (
            <label key={item.id} className="flex items-center gap-2 py-2 cursor-pointer">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => {
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(item.id);
                    else next.delete(item.id);
                    return next;
                  });
                }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-semibold text-[#0F172A] truncate">{item.title}</div>
                <div className="text-[11px] text-[#64748B]">
                  {type?.nameRu} • {fmtMoney(item.acceptedValue)}
                </div>
              </div>
            </label>
          );
        })}
      </div>

      {selectedIds.size > 0 && (
        <div className="mn-card p-3 space-y-2">
          <Row label={t("collateral.totalMarket")} value={fmtMoney(live.market)} />
          <Row label={t("collateral.totalAccepted")} value={fmtMoney(live.accepted)} />
          <Row label={t("collateral.requiredCoverage")} value={fmtMoney(live.required)} />
          <Row
            label={t("collateral.coverage")}
            value={`${live.coverage.toFixed(0)}%`}
          />
          <Row label={t("collateral.maxLoan")} value={fmtMoney(live.maxLoan)} />
        </div>
      )}

      {equipmentOnly && (
        <div className="mn-card p-3 bg-[#FEF3C7] border-[#F59E0B] flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-[#D97706] mt-0.5 flex-shrink-0" />
          <p className="text-[12px] text-[#78350F]">{t("collateral.equipmentOnlyWarning")}</p>
        </div>
      )}

      <div className="mn-card p-3">
        <Field label={t("collateral.notes")}>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[13px]"
            rows={2}
          />
        </Field>
      </div>

      {create.error && (
        <div className="mn-card p-3 bg-[#FEE2E2] border-[#EF4444]">
          <p className="text-[12px] text-[#991B1B]">{(create.error as Error).message}</p>
        </div>
      )}

      <div className="space-y-2">
        <button
          type="submit"
          disabled={create.isPending || selectedIds.size === 0}
          className="w-full h-11 rounded-xl text-[14px] font-bold text-white disabled:opacity-50"
          style={{ background: "#16A34A" }}
        >
          {create.isPending ? t("common.saving") : t("collateral.calculate")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="w-full h-11 rounded-xl border border-[#E2E8F0] text-[14px] font-semibold text-[#64748B]"
        >
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}

// ─── Result view ──────────────────────────────────────────────────────────

function ResultView({
  estimate,
  types,
  items,
  onClose,
}: {
  estimate: EstimateResult;
  types: Map<number, CollateralType>;
  items: CollateralItem[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const enough = estimate.resultStatus === "enough";
  const ratePct = estimate.annualRateApplied
    ? `${Number(estimate.annualRateApplied).toFixed(1)}%`
    : (estimate.annualRateAppliedRaw ?? "—");

  return (
    <div className="px-4 space-y-3">
      <div
        className="mn-card p-5 flex items-start gap-3"
        style={{ background: enough ? "#ECFDF5" : "#FEF3C7", borderColor: enough ? "#16A34A" : "#F59E0B" }}
      >
        {enough ? (
          <CheckCircle2 className="w-6 h-6 text-[#16A34A] mt-0.5 flex-shrink-0" />
        ) : (
          <AlertTriangle className="w-6 h-6 text-[#D97706] mt-0.5 flex-shrink-0" />
        )}
        <div>
          <div className="text-[16px] font-bold text-[#0F172A]">
            {enough ? t("collateral.enough") : t("collateral.notEnough")}
          </div>
        </div>
      </div>

      <div className="mn-card p-4 space-y-2">
        <Row label={t("collateral.totalMarket")} value={fmtMoney(estimate.totalMarketValue)} />
        <Row label={t("collateral.totalAccepted")} value={fmtMoney(estimate.totalAcceptedValue)} />
        <Row
          label={t("collateral.requiredCoverage")}
          value={fmtMoney(estimate.requiredCollateralValue)}
        />
        <Row label={t("collateral.coverage")} value={`${Number(estimate.coveragePercent).toFixed(0)}%`} />
        <Row label={t("collateral.maxLoan")} value={fmtMoney(estimate.maxLoanAmount)} />
        <Row label={t("collateral.rate")} value={ratePct} />
      </div>

      <div className="mn-card p-3 space-y-2">
        <div className="text-[12px] font-semibold text-[#64748B] uppercase">
          {t("collateral.itemsTitle")}
        </div>
        {items
          .slice(0, 20)
          .map((item) => {
            const type = types.get(item.collateralTypeId);
            return (
              <div key={item.id} className="flex justify-between items-center py-1">
                <div className="text-[13px] text-[#0F172A] truncate flex-1">{item.title}</div>
                <div className="text-[12px] text-[#64748B] ml-2">
                  {type?.nameRu} • {fmtMoney(item.acceptedValue)}
                </div>
              </div>
            );
          })}
      </div>

      {estimate.disclaimer && (
        <div className="mn-card p-3 bg-[#F1F5F9]">
          <p className="text-[11px] text-[#64748B]">{estimate.disclaimer}</p>
        </div>
      )}

      <button
        onClick={onClose}
        className="w-full h-11 rounded-xl text-[14px] font-bold text-white"
        style={{ background: "#16A34A" }}
      >
        {t("common.done")}
      </button>
    </div>
  );
}

// ─── Tiny shared bits ─────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center text-[13px]">
      <span className="text-[#64748B]">{label}</span>
      <span className="font-semibold text-[#0F172A]">{value}</span>
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
