import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtNum } from "@/lib/format";
import { Calculator as CalcIcon, ChevronDown, ChevronUp, Printer } from "lucide-react";

export default function CalculatorPage() {
  const { t } = useTranslation();
  const urlParams = new URLSearchParams(window.location.search);
  const clientId = urlParams.get("clientId");

  const [creditType, setCreditType] = useState("consumer");
  const [productCost, setProductCost] = useState("");
  const [downPaymentPct, setDownPaymentPct] = useState("0");
  const [interestRate, setInterestRate] = useState("");
  const [rateType, setRateType] = useState("annual");
  const [termMonths, setTermMonths] = useState("");
  const [repaymentType, setRepaymentType] = useState("annuity");
  const [gracePeriod, setGracePeriod] = useState("0");
  const [currency, setCurrency] = useState("UZS");
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
    const today = new Date();
    const d = new Date(today.getFullYear(), today.getMonth() + monthIndex, today.getDate());
    return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
          <CalcIcon className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-bold">{t("calculator.title")}</h1>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">{t("calculator.creditType")}</label>
            <select
              value={creditType}
              onChange={(e) => setCreditType(e.target.value)}
              className="w-full mt-1 p-2 border rounded-lg text-sm bg-background"
            >
              <option value="consumer">{t("calculator.creditTypes.consumer")}</option>
              <option value="business">{t("calculator.creditTypes.business")}</option>
              <option value="micro">{t("calculator.creditTypes.micro")}</option>
              <option value="mortgage">{t("calculator.creditTypes.mortgage")}</option>
              <option value="auto">{t("calculator.creditTypes.auto")}</option>
            </select>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground">{t("calculator.productCost")}</label>
              <Input
                type="number"
                value={productCost}
                onChange={(e) => setProductCost(e.target.value)}
                placeholder="50 000 000"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">{t("calculator.currency")}</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full mt-1 p-2 border rounded-lg text-sm bg-background">
                <option value="UZS">{t("calculator.currencyUZS")}</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">{t("calculator.downPaymentPct")}</label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  type="number"
                  value={downPaymentPct}
                  onChange={(e) => setDownPaymentPct(e.target.value)}
                  min="0"
                  max="100"
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap">%</span>
              </div>
            </div>
            <div className="flex items-end pb-1.5">
              {cost > 0 && dpPct > 0 && (
                <span className="text-xs text-muted-foreground">
                  = {fmtNum(downPaymentAmount)} {currency === "UZS" ? t("calculator.currencyUZS") : currency}
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground">{t("calculator.loanAmount")}</label>
              <Input
                type="number"
                value={loanAmount > 0 ? loanAmount.toString() : ""}
                readOnly
                className="mt-1 bg-muted/30"
              />
            </div>
            <div className="flex items-end pb-1.5">
              <span className="text-xs text-muted-foreground">
                {currency === "UZS" ? t("calculator.currencyUZS") : currency}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">{t("calculator.gracePeriod")}</label>
              <div className="flex gap-1 mt-1">
                <Input type="number" value={gracePeriod} onChange={(e) => setGracePeriod(e.target.value)} min="0" />
                <span className="text-xs text-muted-foreground self-center whitespace-nowrap">{t("calculator.months")}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">{t("calculator.interestRate")}</label>
              <Input type="number" step="0.1" value={interestRate} onChange={(e) => setInterestRate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">&nbsp;</label>
              <select
                value={rateType}
                onChange={(e) => setRateType(e.target.value)}
                className="w-full mt-1 p-2 border rounded-lg text-sm bg-background"
              >
                <option value="annual">{t("calculator.rateAnnual")}</option>
                <option value="monthly">{t("calculator.rateMonthly")}</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">{t("calculator.repaymentType")}</label>
            <select
              value={repaymentType}
              onChange={(e) => setRepaymentType(e.target.value)}
              className="w-full mt-1 p-2 border rounded-lg text-sm bg-background"
            >
              <option value="annuity">{t("calculator.annuity")}</option>
              <option value="differentiated">{t("calculator.differentiated")}</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">{t("calculator.loanTerm")}</label>
              <Input type="number" value={termMonths} onChange={(e) => setTermMonths(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">&nbsp;</label>
              <div className="mt-1 p-2 text-sm text-muted-foreground">{t("calculator.months")}</div>
            </div>
          </div>

          <Button
            className="w-full h-12 text-base font-semibold bg-amber-500 hover:bg-amber-600 text-white rounded-full"
            onClick={() => calcMutation.mutate()}
            disabled={!canCalc || calcMutation.isPending}
          >
            {calcMutation.isPending ? t("calculator.calculating") : t("calculator.calculate")}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <>
          <Card className="border-primary/30">
            <CardContent className="p-4">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <h3 className="text-sm font-semibold mb-2">{t("calculator.loanParams")}</h3>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p>{t("calculator.productCost")}: <span className="text-foreground font-medium">{formatWithSpaces(cost)} {currency === "UZS" ? t("calculator.currencyUZS") : currency}</span></p>
                    <p>{t("calculator.downPaymentPct")}: <span className="text-foreground font-medium">{dpPct} %</span></p>
                    <p>{t("calculator.loanAmount")}: <span className="text-foreground font-medium">{formatWithSpaces(loanAmount)} {currency === "UZS" ? t("calculator.currencyUZS") : currency}</span></p>
                    <p>{t("calculator.loanTerm")}: <span className="text-foreground font-medium">{termMonths} {t("calculator.months")}</span></p>
                    <p>{t("calculator.interestRate")}: <span className="text-foreground font-medium">{interestRate}% {rateType === "annual" ? t("calculator.rateAnnual") : t("calculator.rateMonthly")}</span></p>
                    <p>{t("calculator.repaymentType")}: <span className="text-foreground font-medium">{repaymentType === "annuity" ? t("calculator.annuity") : t("calculator.differentiated")}</span></p>
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold mb-2">{t("calculator.calcResults")}</h3>
                  <div className="space-y-1 text-xs">
                    <p className="text-muted-foreground">{t("calculator.totalPayment")}: <span className="text-foreground font-bold">{formatWithSpaces(result.summary.totalPayment)} {currency === "UZS" ? t("calculator.currencyUZS") : currency}</span></p>
                    <p className="text-muted-foreground">{t("calculator.totalInterest")}: <span className="text-foreground font-bold">{formatWithSpaces(result.summary.totalInterest)} {currency === "UZS" ? t("calculator.currencyUZS") : currency}</span></p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base">{t("calculator.schedule")}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-amber-500 text-white">
                      <th className="p-1.5 text-left">№</th>
                      <th className="p-1.5 text-left">{t("calculator.date")}</th>
                      <th className="p-1.5 text-right">{t("calculator.loanBalance")}</th>
                      <th className="p-1.5 text-right">{t("calculator.principalPart")}</th>
                      <th className="p-1.5 text-right">{t("calculator.interestPart")}</th>
                      <th className="p-1.5 text-right">{t("calculator.totalDue")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedulePreview.map((row: any) => (
                      <tr key={row.month} className="border-b even:bg-muted/30">
                        <td className="p-1.5">{row.month}</td>
                        <td className="p-1.5">{getPaymentDate(row.month)}</td>
                        <td className="p-1.5 text-right">{formatWithSpaces(row.remaining + row.principal)}</td>
                        <td className="p-1.5 text-right">{formatWithSpaces(row.principal)}</td>
                        <td className="p-1.5 text-right">{formatWithSpaces(row.interest)}</td>
                        <td className="p-1.5 text-right font-medium">{formatWithSpaces(row.payment)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result.schedule?.length > 6 && (
                <button
                  onClick={() => setShowFullSchedule(!showFullSchedule)}
                  className="w-full p-2 text-xs text-primary font-medium flex items-center justify-center gap-1"
                >
                  {showFullSchedule ? (
                    <>
                      <ChevronUp className="w-3 h-3" /> {t("common.close")}
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-3 h-3" /> {t("calculator.showAll")} ({result.schedule.length})
                    </>
                  )}
                </button>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
