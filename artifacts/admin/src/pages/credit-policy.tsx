import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { buildApiUrl } from "@/lib/api";
import { buildAuthHeaders, buildJsonHeaders } from "@/lib/auth-headers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";

interface PolicyParams {
  minCoverageRatio: number;
  collateralDiscounts: {
    governmentSecurities: number;
    realEstate: number;
    vehicles: number;
    corporateSecurities: number;
    inventoryCirculation: number;
    equipment: number;
  };
  transportAgeThresholdYears: number;
  transportAgeDiscount: number;
  dscrMax: number;
  dscrMaxFx: number;
  debtToEquityMax: number;
  loanToWorkingCapitalMax: number;
  minRatesUzs: { micro: { le12m: number; gt12m: number }; small: { le12m: number; gt12m: number }; medium: { any: number } };
  minRatesFx: { micro: number; small: number; medium: number };
  maxTermMonths: { workingCapital: number; fixedAssets: number };
  negativeIndustryKeywords: string[];
  graduatedLending: { loan1MaxMonths: number; loan1MaxMonthsTrade: number; loan2MaxMonths: number; loan3MaxMonths: number };
  creditCommitteeLimitsUsd: { singleBorrower: number; relatedGroup: number };
}

function setNestedNumber(obj: PolicyParams, path: (string | number)[], value: number): PolicyParams {
  const next = JSON.parse(JSON.stringify(obj)) as PolicyParams;
  let cur: any = next;
  for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]];
  cur[path[path.length - 1]] = value;
  return next;
}

export default function CreditPolicyPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<PolicyParams | null>(null);
  const [version, setVersion] = useState<string>("");
  const [effectiveFrom, setEffectiveFrom] = useState<string>("");

  const { data: active, isLoading } = useQuery<PolicyParams>({
    queryKey: ["policy-params", "active"],
    queryFn: async () => {
      const res = await fetch(buildApiUrl("/api/admin/policy-params/active"), { headers: buildAuthHeaders() });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
  });

  useEffect(() => {
    if (active && !draft) {
      setDraft(active);
      const now = new Date();
      setVersion(`${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}`);
      setEffectiveFrom(now.toISOString());
    }
  }, [active, draft]);

  const save = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error("no draft");
      const res = await fetch(buildApiUrl("/api/admin/policy-params/versions"), {
        method: "POST",
        headers: buildJsonHeaders(),
        body: JSON.stringify({ version, effectiveFrom, value: draft }),
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("policy.savedTitle", { defaultValue: "Saved" }) });
      qc.invalidateQueries({ queryKey: ["policy-params"] });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        title: t("policy.saveFailed", { defaultValue: "Save failed" }),
        description: err instanceof Error ? err.message : String(err),
      });
    },
  });

  if (isLoading || !draft) {
    return <div className="p-8 text-muted-foreground">{t("common.loading")}</div>;
  }

  const update = (path: (string | number)[]) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const n = Number(e.target.value);
    if (Number.isFinite(n)) setDraft(setNestedNumber(draft, path, n));
  };

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="bg-card border rounded-xl p-5 space-y-3 shadow-sm">
      <h3 className="text-base font-semibold">{title}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
    </div>
  );

  const Field = ({ label, value, onChange, step = "0.01" }: { label: string; value: number; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; step?: string }) => (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input type="number" step={step} value={value} onChange={onChange} />
    </div>
  );

  return (
    <div className="space-y-4 max-w-4xl pb-32">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t("policy.title", { defaultValue: "Credit Policy Parameters" })}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t("policy.subtitle", { defaultValue: "Editable rates, ratios, and term caps applied to new loan calculations." })}
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800 rounded-lg p-3 text-sm flex flex-wrap items-center gap-2">
        <strong>{t("policy.versionLabel", { defaultValue: "New version" })}:</strong>
        <Input className="inline-block w-32" value={version} onChange={(e) => setVersion(e.target.value)} />
        <strong className="ml-4">{t("policy.effectiveFromLabel", { defaultValue: "Effective from" })}:</strong>
        <Input
          type="datetime-local"
          className="inline-block w-56"
          value={effectiveFrom.slice(0, 16)}
          onChange={(e) => setEffectiveFrom(new Date(e.target.value).toISOString())}
        />
      </div>

      <Section title={t("policy.section.coverage", { defaultValue: "Coverage & Discounts" })}>
        <Field label={t("policy.minCoverageRatio", { defaultValue: "Min coverage ratio" })} value={draft.minCoverageRatio} onChange={update(["minCoverageRatio"])} />
        <Field label={t("policy.realEstate", { defaultValue: "Real estate %" })} value={draft.collateralDiscounts.realEstate} onChange={update(["collateralDiscounts", "realEstate"])} />
        <Field label={t("policy.vehicles", { defaultValue: "Vehicles %" })} value={draft.collateralDiscounts.vehicles} onChange={update(["collateralDiscounts", "vehicles"])} />
        <Field label={t("policy.equipment", { defaultValue: "Equipment %" })} value={draft.collateralDiscounts.equipment} onChange={update(["collateralDiscounts", "equipment"])} />
        <Field label={t("policy.govSecurities", { defaultValue: "Government securities %" })} value={draft.collateralDiscounts.governmentSecurities} onChange={update(["collateralDiscounts", "governmentSecurities"])} />
        <Field label={t("policy.corpSecurities", { defaultValue: "Corporate securities %" })} value={draft.collateralDiscounts.corporateSecurities} onChange={update(["collateralDiscounts", "corporateSecurities"])} />
        <Field label={t("policy.inventory", { defaultValue: "Inventory %" })} value={draft.collateralDiscounts.inventoryCirculation} onChange={update(["collateralDiscounts", "inventoryCirculation"])} />
        <Field label={t("policy.transportAge", { defaultValue: "Transport age threshold (years)" })} value={draft.transportAgeThresholdYears} onChange={update(["transportAgeThresholdYears"])} step="1" />
        <Field label={t("policy.transportAgeDisc", { defaultValue: "Transport age discount %" })} value={draft.transportAgeDiscount} onChange={update(["transportAgeDiscount"])} />
      </Section>

      <Section title={t("policy.section.ratios", { defaultValue: "Ratios" })}>
        <Field label={t("policy.dscrMax", { defaultValue: "DSCR max" })} value={draft.dscrMax} onChange={update(["dscrMax"])} />
        <Field label={t("policy.dscrMaxFx", { defaultValue: "DSCR max (FX)" })} value={draft.dscrMaxFx} onChange={update(["dscrMaxFx"])} />
        <Field label={t("policy.debtToEquity", { defaultValue: "Debt/equity max" })} value={draft.debtToEquityMax} onChange={update(["debtToEquityMax"])} />
        <Field label={t("policy.loanToWc", { defaultValue: "Loan/working-capital max" })} value={draft.loanToWorkingCapitalMax} onChange={update(["loanToWorkingCapitalMax"])} />
      </Section>

      <Section title={t("policy.section.ratesUzs", { defaultValue: "Min rates — UZS" })}>
        <Field label="Micro <=12m" value={draft.minRatesUzs.micro.le12m} onChange={update(["minRatesUzs", "micro", "le12m"])} />
        <Field label="Micro >12m" value={draft.minRatesUzs.micro.gt12m} onChange={update(["minRatesUzs", "micro", "gt12m"])} />
        <Field label="Small <=12m" value={draft.minRatesUzs.small.le12m} onChange={update(["minRatesUzs", "small", "le12m"])} />
        <Field label="Small >12m" value={draft.minRatesUzs.small.gt12m} onChange={update(["minRatesUzs", "small", "gt12m"])} />
        <Field label="Medium" value={draft.minRatesUzs.medium.any} onChange={update(["minRatesUzs", "medium", "any"])} />
      </Section>

      <Section title={t("policy.section.ratesFx", { defaultValue: "Min rates — FX" })}>
        <Field label="Micro" value={draft.minRatesFx.micro} onChange={update(["minRatesFx", "micro"])} />
        <Field label="Small" value={draft.minRatesFx.small} onChange={update(["minRatesFx", "small"])} />
        <Field label="Medium" value={draft.minRatesFx.medium} onChange={update(["minRatesFx", "medium"])} />
      </Section>

      <Section title={t("policy.section.terms", { defaultValue: "Terms" })}>
        <Field label={t("policy.maxTermWc", { defaultValue: "Max term (working capital, mo)" })} value={draft.maxTermMonths.workingCapital} onChange={update(["maxTermMonths", "workingCapital"])} step="1" />
        <Field label={t("policy.maxTermFa", { defaultValue: "Max term (fixed assets, mo)" })} value={draft.maxTermMonths.fixedAssets} onChange={update(["maxTermMonths", "fixedAssets"])} step="1" />
      </Section>

      <Section title={t("policy.section.industries", { defaultValue: "Negative industry keywords" })}>
        <div className="col-span-full">
          <Label className="text-xs text-muted-foreground">{t("policy.negKeywordsLabel", { defaultValue: "Comma-separated" })}</Label>
          <Input
            value={draft.negativeIndustryKeywords.join(", ")}
            onChange={(e) =>
              setDraft((d) => d ? { ...d, negativeIndustryKeywords: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } : d)
            }
          />
        </div>
      </Section>

      <Section title={t("policy.section.graduatedLending", { defaultValue: "Graduated lending caps (months)" })}>
        <Field label={t("policy.loan1Max", { defaultValue: "Loan #1 max" })} value={draft.graduatedLending.loan1MaxMonths} onChange={update(["graduatedLending", "loan1MaxMonths"])} step="1" />
        <Field label={t("policy.loan1MaxTrade", { defaultValue: "Loan #1 max (trade)" })} value={draft.graduatedLending.loan1MaxMonthsTrade} onChange={update(["graduatedLending", "loan1MaxMonthsTrade"])} step="1" />
        <Field label={t("policy.loan2Max", { defaultValue: "Loan #2 max" })} value={draft.graduatedLending.loan2MaxMonths} onChange={update(["graduatedLending", "loan2MaxMonths"])} step="1" />
        <Field label={t("policy.loan3Max", { defaultValue: "Loan #3 max" })} value={draft.graduatedLending.loan3MaxMonths} onChange={update(["graduatedLending", "loan3MaxMonths"])} step="1" />
      </Section>

      <Section title={t("policy.section.committee", { defaultValue: "Credit committee limits (USD)" })}>
        <Field label={t("policy.singleBorrower", { defaultValue: "Single borrower" })} value={draft.creditCommitteeLimitsUsd.singleBorrower} onChange={update(["creditCommitteeLimitsUsd", "singleBorrower"])} step="1" />
        <Field label={t("policy.relatedGroup", { defaultValue: "Related group" })} value={draft.creditCommitteeLimitsUsd.relatedGroup} onChange={update(["creditCommitteeLimitsUsd", "relatedGroup"])} step="1" />
      </Section>

      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex gap-2 bg-background border rounded-xl shadow-md p-3">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? t("common.saving") : t("policy.saveAsNewVersion", { defaultValue: "Save as new version" })}
        </Button>
        <Button variant="outline" onClick={() => setDraft(active ?? null)}>
          {t("policy.discardChanges", { defaultValue: "Discard" })}
        </Button>
      </div>
    </div>
  );
}
