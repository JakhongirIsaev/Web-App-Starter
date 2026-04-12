import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Landmark, Search, ChevronDown, ChevronUp } from "lucide-react";
import { api } from "@/lib/api";
import { fmtNum, fmtPercent } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type CreditLine = {
  id: number;
  number: number | null;
  name: string;
  department: string | null;
  agreementDate: string | null;
  agreementAmount: number | null;
  receivedAmount: number | null;
  currency: string | null;
  interestRate: string | null;
  disbursedAmount: number | null;
  remainingBalance: number | null;
  projectCount: number | null;
  specialConditions: string | null;
  notes: string | null;
  section: string | null;
};

type LineState = "active" | "stopped" | "neutral";

function getLineOperationalState(item: Pick<CreditLine, "remainingBalance" | "section" | "notes" | "specialConditions">): LineState {
  const source = `${item.section || ""} ${item.notes || ""} ${item.specialConditions || ""}`.toLowerCase();
  const remaining = item.remainingBalance;

  if (
    source.includes("стоп") ||
    source.includes("stop") ||
    source.includes("освоен") ||
    source.includes("closed") ||
    (remaining !== null && remaining !== undefined && Number.isFinite(remaining) && remaining <= 0)
  ) {
    return "stopped";
  }

  if (remaining !== null && remaining !== undefined && Number.isFinite(remaining) && remaining > 0) {
    return "active";
  }

  return "neutral";
}

function getCurrencyBadge(currency: string | null) {
  const code = currency?.toUpperCase();
  const classes: Record<string, string> = {
    USD: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
    EUR: "bg-blue-500/10 text-blue-700 border-blue-500/20",
    JPY: "bg-orange-500/10 text-orange-700 border-orange-500/20",
    UZS: "bg-violet-500/10 text-violet-700 border-violet-500/20",
  };

  return (
    <Badge variant="outline" className={classes[code || ""] || "bg-secondary text-secondary-foreground border-border"}>
      {code || "—"}
    </Badge>
  );
}

function stateBadgeClass(state: LineState) {
  if (state === "active") return "bg-emerald-500/10 text-emerald-700 border-emerald-500/20";
  if (state === "stopped") return "bg-red-500/10 text-red-700 border-red-500/20";
  return "bg-secondary text-secondary-foreground border-border";
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xs font-medium break-words text-foreground">{value}</p>
    </div>
  );
}

export default function CreditLinesPage() {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState("");
  const [currency, setCurrency] = useState("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: creditLines = [], isLoading } = useQuery({
    queryKey: ["mini-credit-lines"],
    queryFn: () => api.get("/mini-app/credit-lines"),
  });

  const currencyOptions = useMemo(() => {
    const preferredOrder = ["UZS", "USD", "EUR", "JPY"];
    const found = new Set<string>();

    (creditLines as CreditLine[]).forEach((line) => {
      const code = line.currency?.toUpperCase();
      if (code) found.add(code);
    });

    return [
      ...preferredOrder.filter((code) => found.has(code)),
      ...Array.from(found).filter((code) => !preferredOrder.includes(code)).sort(),
    ];
  }, [creditLines]);

  const filteredLines = useMemo(() => {
    const term = search.trim().toLowerCase();

    return (creditLines as CreditLine[]).filter((line) => {
      if (currency !== "all" && line.currency?.toUpperCase() !== currency) return false;
      if (!term) return true;

      const haystack = [
        line.number ?? "",
        line.name,
        line.department,
        line.section,
        line.agreementDate,
        line.specialConditions,
        line.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(term);
    });
  }, [creditLines, currency, search]);

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
          <Landmark className="w-5 h-5 text-emerald-600" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold leading-tight">{t("creditLines.title")}</h1>
          <p className="text-xs text-muted-foreground leading-snug">{t("creditLines.subtitle")}</p>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_132px] gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("creditLines.searchPlaceholder")}
            className="pl-9"
          />
        </div>

        <Select value={currency} onValueChange={setCurrency}>
          <SelectTrigger>
            <SelectValue placeholder={t("creditLines.allCurrencies")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("creditLines.allCurrencies")}</SelectItem>
            {currencyOptions.map((code) => (
              <SelectItem key={code} value={code}>
                {code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={index}>
              <CardContent className="p-3 space-y-3">
                <div className="flex items-start gap-3">
                  <Skeleton className="h-10 w-10 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <div className="flex gap-2">
                      <Skeleton className="h-5 w-16 rounded-full" />
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </div>
                  </div>
                </div>
                <Skeleton className="h-4 w-1/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredLines.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-sm text-muted-foreground">{t("creditLines.noLines")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredLines.map((line) => {
            const state = getLineOperationalState(line);
            const expanded = expandedId === line.id;

            return (
              <Card key={line.id} className="overflow-hidden shadow-sm">
                <CardContent className="p-0">
                  <button
                    type="button"
                    className="w-full text-left p-3 active:bg-muted/40 transition-colors"
                    onClick={() => setExpandedId(expanded ? null : line.id)}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${state === "active" ? "bg-emerald-500/10" : state === "stopped" ? "bg-red-500/10" : "bg-secondary"}`}>
                        <Landmark className={`w-5 h-5 ${state === "active" ? "text-emerald-600" : state === "stopped" ? "text-red-600" : "text-muted-foreground"}`} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            #{line.number ?? "—"}
                          </span>
                          <h2 className="text-sm font-medium truncate">{line.name}</h2>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground truncate">
                          {line.department || line.section || "—"}
                        </p>

                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {getCurrencyBadge(line.currency)}
                          <Badge variant="outline" className={stateBadgeClass(state)}>
                            {state === "active" ? t("creditLines.lineActive") : state === "stopped" ? t("creditLines.lineStopped") : "—"}
                          </Badge>
                        </div>
                      </div>

                      {expanded ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                      )}
                    </div>
                  </button>

                  {expanded && (
                    <div className="border-t bg-muted/20 p-3">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                        <DetailRow label={t("creditLines.agreementAmount")} value={fmtNum(line.agreementAmount, i18n.language)} />
                        <DetailRow label={t("creditLines.disbursedAmount")} value={fmtNum(line.disbursedAmount, i18n.language)} />
                        <DetailRow label={t("creditLines.remainingBalance")} value={fmtNum(line.remainingBalance, i18n.language)} />
                        <DetailRow label={t("creditLines.interestRate")} value={fmtPercent(line.interestRate, i18n.language)} />
                        <DetailRow label={t("creditLines.agreementDate")} value={line.agreementDate || "—"} />
                        <DetailRow label={t("creditLines.projectCount")} value={line.projectCount === null || line.projectCount === undefined ? "—" : fmtNum(line.projectCount, i18n.language)} />
                        <DetailRow label={t("creditLines.department")} value={line.department || "—"} />
                        <DetailRow label={t("creditLines.section")} value={line.section || "—"} />
                        {line.specialConditions && (
                          <div className="col-span-2">
                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("creditLines.specialConditions")}</p>
                            <p className="mt-1 text-xs text-foreground leading-relaxed whitespace-pre-wrap">{line.specialConditions}</p>
                          </div>
                        )}
                        {line.notes && (
                          <div className="col-span-2">
                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("creditLines.notes")}</p>
                            <p className="mt-1 text-xs text-foreground leading-relaxed whitespace-pre-wrap">{line.notes}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
