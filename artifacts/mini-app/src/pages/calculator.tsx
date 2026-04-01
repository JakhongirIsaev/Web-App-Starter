import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtNum } from "@/lib/format";
import { Calculator as CalcIcon, ChevronDown, ChevronUp } from "lucide-react";

export default function CalculatorPage() {
  const { t } = useTranslation();
  const urlParams = new URLSearchParams(window.location.search);
  const clientId = urlParams.get("clientId");

  const [productName, setProductName] = useState("");
  const [loanAmount, setLoanAmount] = useState("");
  const [initialPayment, setInitialPayment] = useState("0");
  const [interestRate, setInterestRate] = useState("");
  const [termMonths, setTermMonths] = useState("");
  const [repaymentType, setRepaymentType] = useState("annuity");
  const [gracePeriod, setGracePeriod] = useState("0");
  const [currency, setCurrency] = useState("UZS");
  const [result, setResult] = useState<any>(null);
  const [showFullSchedule, setShowFullSchedule] = useState(false);

  const calcMutation = useMutation({
    mutationFn: () =>
      api.post("/mini-app/calculate", {
        clientId: clientId ? parseInt(clientId) : null,
        productName: productName || "Расчёт",
        loanAmount: parseFloat(loanAmount),
        initialPayment: parseFloat(initialPayment) || 0,
        interestRate: parseFloat(interestRate),
        termMonths: parseInt(termMonths),
        repaymentType,
        gracePeriodMonths: parseInt(gracePeriod) || 0,
        currency,
      }),
    onSuccess: (data) => setResult(data),
  });

  const canCalc = loanAmount && interestRate && termMonths;
  const schedulePreview = result?.schedule?.slice(0, showFullSchedule ? undefined : 6) || [];

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
            <label className="text-xs font-medium text-muted-foreground">{t("calculator.productName")}</label>
            <Input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder={t("calculator.productNamePlaceholder")} className="mt-1" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">{t("calculator.loanAmount")}</label>
              <Input type="number" value={loanAmount} onChange={(e) => setLoanAmount(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">{t("calculator.initialPayment")}</label>
              <Input type="number" value={initialPayment} onChange={(e) => setInitialPayment(e.target.value)} className="mt-1" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">{t("calculator.interestRate")}</label>
              <Input type="number" step="0.1" value={interestRate} onChange={(e) => setInterestRate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">{t("calculator.termMonths")}</label>
              <Input type="number" value={termMonths} onChange={(e) => setTermMonths(e.target.value)} className="mt-1" />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">{t("calculator.repaymentType")}</label>
            <div className="flex gap-2 mt-1">
              <button
                onClick={() => setRepaymentType("annuity")}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${repaymentType === "annuity" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
              >
                {t("calculator.annuity")}
              </button>
              <button
                onClick={() => setRepaymentType("differentiated")}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${repaymentType === "differentiated" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
              >
                {t("calculator.differentiated")}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">{t("calculator.gracePeriod")}</label>
              <Input type="number" value={gracePeriod} onChange={(e) => setGracePeriod(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">{t("calculator.currency")}</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full mt-1 p-2 border rounded-lg text-sm bg-background">
                <option value="UZS">UZS</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>

          <Button className="w-full" onClick={() => calcMutation.mutate()} disabled={!canCalc || calcMutation.isPending}>
            {calcMutation.isPending ? t("calculator.calculating") : t("calculator.calculate")}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <>
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("calculator.results")}</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="grid grid-cols-2 gap-3">
                <ResultBox label={t("calculator.monthlyPayment")} value={`${fmtNum(result.summary.monthlyPayment)} ${currency}`} primary />
                <ResultBox label={t("calculator.totalPayment")} value={`${fmtNum(result.summary.totalPayment)} ${currency}`} />
                <ResultBox label={t("calculator.totalInterest")} value={`${fmtNum(result.summary.totalInterest)} ${currency}`} />
                <ResultBox label={t("calculator.principal")} value={`${fmtNum(result.summary.principal)} ${currency}`} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("calculator.schedule")}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-2 text-left">{t("calculator.month")}</th>
                      <th className="p-2 text-right">{t("calculator.principalPart")}</th>
                      <th className="p-2 text-right">{t("calculator.interestPart")}</th>
                      <th className="p-2 text-right">{t("calculator.payment")}</th>
                      <th className="p-2 text-right">{t("calculator.remaining")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedulePreview.map((row: any) => (
                      <tr key={row.month} className="border-b">
                        <td className="p-2">{row.month}</td>
                        <td className="p-2 text-right">{fmtNum(row.principal)}</td>
                        <td className="p-2 text-right">{fmtNum(row.interest)}</td>
                        <td className="p-2 text-right font-medium">{fmtNum(row.payment)}</td>
                        <td className="p-2 text-right text-muted-foreground">{fmtNum(row.remaining)}</td>
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
                      <ChevronDown className="w-3 h-3" /> {t("calculator.schedule")} ({result.schedule.length} {t("calculator.month")})
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

function ResultBox({ label, value, primary }: { label: string; value: string; primary?: boolean }) {
  return (
    <div className={`p-3 rounded-xl ${primary ? "bg-primary text-primary-foreground" : "bg-card border"}`}>
      <p className={`text-[10px] ${primary ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{label}</p>
      <p className={`text-sm font-bold mt-0.5 ${primary ? "" : "text-foreground"}`}>{value}</p>
    </div>
  );
}
