import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { fmtDate, fmtNum, getTashkentDateByMonthOffset } from "@/lib/format";
import { Calculator as CalcIcon, ChevronDown, ChevronUp, Download, Share2 } from "lucide-react";

export default function CalculatorPage() {
  const { t } = useTranslation();
  const urlParams = new URLSearchParams(window.location.search);
  const clientId = urlParams.get("clientId");
  const clientName = urlParams.get("clientName") || "";

  const [creditType, setCreditType] = useState("consumer");
  const [productCost, setProductCost] = useState("50000000");
  const [downPaymentPct, setDownPaymentPct] = useState("0");
  const [interestRate, setInterestRate] = useState("24");
  const [rateType, setRateType] = useState("annual");
  const [termMonths, setTermMonths] = useState("24");
  const [repaymentType, setRepaymentType] = useState("annuity");
  const [gracePeriod, setGracePeriod] = useState("0");
  const [currency, setCurrency] = useState("UZS");
  const [feeOnceAmount, setFeeOnceAmount] = useState("");
  const [feeMonthlyPct, setFeeMonthlyPct] = useState("");
  const [insuranceMonthlyPct, setInsuranceMonthlyPct] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [showFullSchedule, setShowFullSchedule] = useState(false);

  const cost = parseFloat(productCost) || 0;
  const dpPct = parseFloat(downPaymentPct) || 0;
  const downPaymentAmount = cost * (dpPct / 100);
  const loanAmount = cost - downPaymentAmount;

  const calcMutation = useMutation({
    mutationFn: () => {
      const effectiveRate = rateType === "monthly"
        ? (parseFloat(interestRate) * 12)
        : parseFloat(interestRate);
      return api.post("/mini-app/calculate", {
        clientId: clientId ? parseInt(clientId) : null,
        productName: t(`calculator.creditTypes.${creditType}`),
        loanAmount: loanAmount,
        initialPayment: downPaymentAmount,
        interestRate: effectiveRate,
        termMonths: parseInt(termMonths),
        repaymentType,
        gracePeriodMonths: parseInt(gracePeriod) || 0,
        currency,
        productCost: cost,
        downPaymentPct: dpPct,
        feeOnceAmount: parseFloat(feeOnceAmount) || 0,
        feeMonthlyPct: parseFloat(feeMonthlyPct) || 0,
        insuranceMonthlyPct: parseFloat(insuranceMonthlyPct) || 0,
      });
    },
    onSuccess: (data) => setResult(data),
  });

  const canCalc = cost > 0 && interestRate && termMonths && loanAmount > 0;
  const schedulePreview = result?.schedule?.slice(0, showFullSchedule ? undefined : 6) || [];

  const formatWithSpaces = (n: number) => {
    return n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  };

  const getPaymentDate = (monthIndex: number) => {
    return fmtDate(getTashkentDateByMonthOffset(monthIndex));
  };

  const handleDownload = () => {
    if (!result) return;
    const lines: string[] = [];
    lines.push(t("calculator.downloadTitle"));
    lines.push("");
    lines.push(t("calculator.loanParams"));
    lines.push(`${t("calculator.creditType")},${t(`calculator.creditTypes.${creditType}`)}`);
    lines.push(`${t("calculator.productCost")},${formatWithSpaces(cost)} ${currency}`);
    lines.push(`${t("calculator.downPaymentPct")},${dpPct}% (${formatWithSpaces(downPaymentAmount)} ${currency})`);
    lines.push(`${t("calculator.loanAmount")},${formatWithSpaces(loanAmount)} ${currency}`);
    lines.push(`${t("calculator.interestRate")},${interestRate}% ${rateType === "annual" ? t("calculator.rateAnnual") : t("calculator.rateMonthly")}`);
    lines.push(`${t("calculator.loanTerm")},${termMonths} ${t("calculator.months")}`);
    lines.push(`${t("calculator.repaymentType")},${repaymentType === "annuity" ? t("calculator.annuity") : t("calculator.differentiated")}`);
    lines.push("");
    lines.push(t("calculator.calcResults"));
    lines.push(`${t("calculator.monthlyPayment")},${formatWithSpaces(result.summary.totalPayment / parseInt(termMonths))} ${currency}`);
    lines.push(`${t("calculator.totalPayment")},${formatWithSpaces(result.summary.totalPayment)} ${currency}`);
    lines.push(`${t("calculator.totalInterest")},${formatWithSpaces(result.summary.totalInterest)} ${currency}`);
    lines.push("");
    lines.push(t("calculator.schedule"));
    lines.push([
      t("calculator.scheduleMonth"),
      t("calculator.date"),
      t("calculator.loanBalance"),
      t("calculator.principalPart"),
      t("calculator.interestPart"),
      t("calculator.totalDue"),
    ].join(","));
    result.schedule.forEach((row: any) => {
      lines.push(
        `${row.month},${getPaymentDate(row.month)},${formatWithSpaces(row.remaining + row.principal)},${formatWithSpaces(row.principal)},${formatWithSpaces(row.interest)},${formatWithSpaces(row.payment)}`
      );
    });
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${t("calculator.title")}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleShare = () => {
    if (!result) return;
    const monthlyPayment = result.summary.monthlyPayment ?? result.summary.totalPayment / parseInt(termMonths);
    const text = [
      `${t("calculator.title")}`,
      `${t("calculator.loanAmount")}: ${formatWithSpaces(loanAmount)} ${currency}`,
      `${t("calculator.interestRate")}: ${interestRate}%`,
      `${t("calculator.loanTerm")}: ${termMonths} ${t("calculator.months")}`,
      `${t("calculator.monthlyPayment")}: ${formatWithSpaces(monthlyPayment)} ${currency}`,
      `${t("calculator.totalPayment")}: ${formatWithSpaces(result.summary.totalPayment)} ${currency}`,
    ].join("\n");

    if (navigator.share) {
      navigator.share({ text }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(text);
    }
  };

  const monthlyPayment = result?.summary?.monthlyPayment ?? 0;
  // Prefer the server-computed effective rate (it accounts for fees/insurance).
  // Fall back to a rough average if older API responses are missing the field.
  const effectiveRateDisplay = result
    ? typeof result.summary.effectiveAnnualPct === "number"
      ? result.summary.effectiveAnnualPct.toFixed(1)
      : ((result.summary.totalInterest / loanAmount) * 100 / (parseInt(termMonths) / 12)).toFixed(1)
    : "0";
  const totalFees = result?.summary?.totalFees ?? 0;

  return (
    <div className="min-h-screen" style={{ background: "#F4F4F5" }}>
      {/* ── White header bar ── */}
      <div className="mn-card mx-4 mt-4 px-4 py-3 flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "#FFFBEB", color: "#D97706" }}
        >
          <CalcIcon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-[15px] font-bold" style={{ color: "#0F172A" }}>
            {t("calculator.title")}
          </h1>
          {clientName && (
            <p className="text-[13px] truncate" style={{ color: "#64748B" }}>
              {clientName}
            </p>
          )}
        </div>
      </div>

      {/* ── Form card ── */}
      <div className="mn-card mx-4 mt-3 p-4 space-y-4">
        {/* Credit type */}
        <div>
          <label className="mn-label">{t("calculator.creditType")}</label>
          <select
            value={creditType}
            onChange={(e) => setCreditType(e.target.value)}
            className="mn-select"
          >
            <option value="consumer">{t("calculator.creditTypes.consumer")}</option>
            <option value="business">{t("calculator.creditTypes.business")}</option>
            <option value="micro">{t("calculator.creditTypes.micro")}</option>
            <option value="mortgage">{t("calculator.creditTypes.mortgage")}</option>
            <option value="auto">{t("calculator.creditTypes.auto")}</option>
          </select>
        </div>

        {/* Product cost with currency suffix */}
        <div>
          <label className="mn-label">{t("calculator.productCost")}</label>
          <div className="relative">
            <input
              type="number"
              value={productCost}
              onChange={(e) => setProductCost(e.target.value)}
              placeholder="50 000 000"
              className="mn-input"
              style={{ paddingRight: 56 }}
            />
            <span
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[13px] font-semibold"
              style={{ color: "#64748B" }}
            >
              {currency}
            </span>
          </div>
        </div>

        {/* Down payment + Term — 2-col */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mn-label">{t("calculator.downPaymentPct")}</label>
            <div className="relative">
              <input
                type="number"
                value={downPaymentPct}
                onChange={(e) => setDownPaymentPct(e.target.value)}
                min="0"
                max="100"
                className="mn-input"
                style={{ paddingRight: 36 }}
              />
              <span
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[13px] font-semibold"
                style={{ color: "#64748B" }}
              >
                %
              </span>
            </div>
            {cost > 0 && dpPct > 0 && (
              <p className="text-[12px] mt-1" style={{ color: "#64748B" }}>
                = {fmtNum(downPaymentAmount)} {currency}
              </p>
            )}
          </div>
          <div>
            <label className="mn-label">{t("calculator.loanTerm")}</label>
            <div className="relative">
              <input
                type="number"
                value={termMonths}
                onChange={(e) => setTermMonths(e.target.value)}
                className="mn-input"
                style={{ paddingRight: 44 }}
              />
              <span
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[12px] font-medium"
                style={{ color: "#64748B" }}
              >
                {t("calculator.months")}
              </span>
            </div>
          </div>
        </div>

        {/* Rate + Repayment type — 2-col */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mn-label">{t("calculator.interestRate")}</label>
            <div className="relative">
              <input
                type="number"
                step="0.1"
                value={interestRate}
                onChange={(e) => setInterestRate(e.target.value)}
                className="mn-input"
                style={{ paddingRight: 36 }}
              />
              <span
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[13px] font-semibold"
                style={{ color: "#64748B" }}
              >
                %
              </span>
            </div>
            <select
              value={rateType}
              onChange={(e) => setRateType(e.target.value)}
              className="mt-1.5 w-full text-[12px] rounded-lg border border-[#E2E8F0] px-2 py-1.5 outline-none"
              style={{ color: "#64748B" }}
            >
              <option value="annual">{t("calculator.rateAnnual")}</option>
              <option value="monthly">{t("calculator.rateMonthly")}</option>
            </select>
          </div>
          <div>
            <label className="mn-label">{t("calculator.repaymentType")}</label>
            <select
              value={repaymentType}
              onChange={(e) => setRepaymentType(e.target.value)}
              className="mn-select"
            >
              <option value="annuity">{t("calculator.annuity")}</option>
              <option value="differentiated">{t("calculator.differentiated")}</option>
            </select>
          </div>
        </div>

        {/* Grace period (hidden row, small) */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mn-label">{t("calculator.gracePeriod")}</label>
            <div className="relative">
              <input
                type="number"
                value={gracePeriod}
                onChange={(e) => setGracePeriod(e.target.value)}
                min="0"
                className="mn-input"
                style={{ paddingRight: 44 }}
              />
              <span
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[12px] font-medium"
                style={{ color: "#64748B" }}
              >
                {t("calculator.months")}
              </span>
            </div>
          </div>
          <div>
            <label className="mn-label">{t("calculator.currency")}</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="mn-select"
            >
              <option value="UZS">{t("calculator.currencyUZS")}</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
        </div>

        {/* Advanced — fees and insurance (collapsible) */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex w-full items-center justify-between text-[13px] font-semibold"
            style={{ color: "#272424" }}
          >
            <span>{t("calculator.advancedToggle")}</span>
            {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showAdvanced && (
            <div className="mt-3 space-y-3">
              <div>
                <label className="mn-label">{t("calculator.feeOnceLabel")}</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    value={feeOnceAmount}
                    onChange={(e) => setFeeOnceAmount(e.target.value)}
                    placeholder="0"
                    className="mn-input"
                    style={{ paddingRight: 56 }}
                  />
                  <span
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[13px] font-semibold"
                    style={{ color: "#64748B" }}
                  >
                    {currency}
                  </span>
                </div>
                <p className="text-[12px] mt-1" style={{ color: "#94A3B8" }}>
                  {t("calculator.feeOnceHint")}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mn-label">{t("calculator.feeMonthlyLabel")}</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={feeMonthlyPct}
                      onChange={(e) => setFeeMonthlyPct(e.target.value)}
                      placeholder="0"
                      className="mn-input"
                      style={{ paddingRight: 36 }}
                    />
                    <span
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-[13px] font-semibold"
                      style={{ color: "#64748B" }}
                    >
                      %
                    </span>
                  </div>
                  <p className="text-[12px] mt-1" style={{ color: "#94A3B8" }}>
                    {t("calculator.feeMonthlyHint")}
                  </p>
                </div>
                <div>
                  <label className="mn-label">{t("calculator.insuranceMonthlyLabel")}</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={insuranceMonthlyPct}
                      onChange={(e) => setInsuranceMonthlyPct(e.target.value)}
                      placeholder="0"
                      className="mn-input"
                      style={{ paddingRight: 36 }}
                    />
                    <span
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-[13px] font-semibold"
                      style={{ color: "#64748B" }}
                    >
                      %
                    </span>
                  </div>
                  <p className="text-[12px] mt-1" style={{ color: "#94A3B8" }}>
                    {t("calculator.insuranceMonthlyHint")}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Calculate button */}
        <Button
          className="w-full h-12 text-[15px] font-semibold rounded-xl"
          style={{ background: "#FFD531", color: "#272424" }}
          onClick={() => calcMutation.mutate()}
          disabled={!canCalc || calcMutation.isPending}
        >
          {calcMutation.isPending ? t("calculator.calculating") : t("calculator.calculate")}
        </Button>
      </div>

      {/* ── Results section ── */}
      {result && (
        <>
          {/* 2x2 KPI grid */}
          <div className="mn-card mx-4 mt-3 p-4">
            <div className="grid grid-cols-2 gap-3">
              {/* Monthly payment — accent green */}
              <div
                className="rounded-xl p-3"
                style={{ background: "#FFF7D6" }}
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#64748B" }}>
                  {t("calculator.monthlyPayment")}
                </p>
                <p className="text-[20px] font-bold mt-1 leading-tight" style={{ color: "#6B5C00" }}>
                  {formatWithSpaces(monthlyPayment)}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: "#64748B" }}>{currency}</p>
                {repaymentType === "differentiated" && (
                  <p className="text-[10px] mt-1 leading-tight" style={{ color: "#92400E" }}>
                    {t("calculator.monthlyPaymentHintDifferentiated")}
                  </p>
                )}
              </div>

              {/* Total interest */}
              <div
                className="rounded-xl p-3"
                style={{ background: "#F8FAFC" }}
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#64748B" }}>
                  {t("calculator.totalInterest")}
                </p>
                <p className="text-[18px] font-bold mt-1 leading-tight" style={{ color: "#0F172A" }}>
                  {formatWithSpaces(result.summary.totalInterest)}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: "#64748B" }}>{currency}</p>
              </div>

              {/* Total payment */}
              <div
                className="rounded-xl p-3"
                style={{ background: "#F8FAFC" }}
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#64748B" }}>
                  {t("calculator.totalPayment")}
                </p>
                <p className="text-[18px] font-bold mt-1 leading-tight" style={{ color: "#0F172A" }}>
                  {formatWithSpaces(result.summary.totalPayment)}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: "#64748B" }}>{currency}</p>
              </div>

              {/* Effective rate */}
              <div
                className="rounded-xl p-3"
                style={{ background: "#F8FAFC" }}
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#64748B" }}>
                  {t("calculator.effectiveRate")}
                </p>
                <p className="text-[18px] font-bold mt-1 leading-tight" style={{ color: "#0F172A" }}>
                  {effectiveRateDisplay}%
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: "#64748B" }}>
                  {t("calculator.rateAnnual")}
                </p>
              </div>
            </div>

            {/* Total fees row — only when there is something to show. */}
            {totalFees > 0 && (
              <div
                className="mt-3 rounded-xl p-3 flex items-center justify-between"
                style={{ background: "#FEF3C7" }}
              >
                <p className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: "#92400E" }}>
                  {t("calculator.totalFees")}
                </p>
                <p className="text-[16px] font-bold" style={{ color: "#92400E" }}>
                  {formatWithSpaces(totalFees)} {currency}
                </p>
              </div>
            )}
          </div>

          {/* Schedule table */}
          <div className="mn-card mx-4 mt-3 overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between">
              <h2 className="text-[15px] font-bold" style={{ color: "#0F172A" }}>
                {t("calculator.schedule")}
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr style={{ background: "#F8FAFC" }}>
                    <th className="px-4 py-2.5 text-left font-semibold" style={{ color: "#64748B" }}>#</th>
                    <th className="px-3 py-2.5 text-left font-semibold" style={{ color: "#64748B" }}>{t("calculator.date")}</th>
                    <th className="px-3 py-2.5 text-right font-semibold" style={{ color: "#64748B" }}>{t("calculator.interestPart")}</th>
                    <th className="px-4 py-2.5 text-right font-semibold" style={{ color: "#64748B" }}>{t("calculator.totalDue")}</th>
                  </tr>
                </thead>
                <tbody>
                  {schedulePreview.map((row: any, idx: number) => (
                    <tr
                      key={row.month}
                      style={{
                        borderBottom: "1px solid #F1F5F9",
                        background: idx % 2 === 1 ? "#FAFAFA" : "#fff",
                      }}
                    >
                      <td className="px-4 py-2.5 font-mono" style={{ color: "#64748B" }}>{row.month}</td>
                      <td className="px-3 py-2.5" style={{ color: "#0F172A" }}>{getPaymentDate(row.month)}</td>
                      <td className="px-3 py-2.5 text-right font-mono" style={{ color: "#64748B" }}>
                        {formatWithSpaces(row.interest)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold" style={{ color: "#0F172A" }}>
                        {formatWithSpaces(row.payment)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result.schedule?.length > 6 && (
              <button
                onClick={() => setShowFullSchedule(!showFullSchedule)}
                className="w-full py-3 flex items-center justify-center gap-1 text-[13px] font-semibold"
                style={{ color: "#272424", borderTop: "1px solid #F1F5F9" }}
              >
                {showFullSchedule ? (
                  <>
                    <ChevronUp className="w-4 h-4" /> {t("common.close")}
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4" /> {t("calculator.showAll")} ({result.schedule.length})
                  </>
                )}
              </button>
            )}
          </div>

          {/* Action buttons */}
          <div className="mx-4 mt-3 mb-6 grid grid-cols-2 gap-3">
            <button
              onClick={handleDownload}
              className="mn-card flex items-center justify-center gap-2 py-3 text-[13px] font-semibold"
              style={{ color: "#0F172A" }}
            >
              <Download className="w-4 h-4" style={{ color: "#64748B" }} />
              {t("calculator.downloadFormat")}
            </button>
            <button
              onClick={handleShare}
              className="mn-card flex items-center justify-center gap-2 py-3 text-[13px] font-semibold"
              style={{ color: "#0F172A" }}
            >
              <Share2 className="w-4 h-4" style={{ color: "#64748B" }} />
              {t("calculator.share")}
            </button>
          </div>
        </>
      )}

      {/* Bottom spacer when no results */}
      {!result && <div className="h-6" />}
    </div>
  );
}
