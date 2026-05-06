import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useListBranches, getListBranchesQueryKey } from "@workspace/api-client-react";
import { buildApiUrl } from "@/lib/api";
import { buildAuthHeaders } from "@/lib/auth-headers";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface FunnelData {
  byStatus: Record<string, number>;
}

const STAGES = [
  { key: "lead", labelKey: "funnel.stage.lead", color: "#3B82F6" },
  { key: "recommendation", labelKey: "funnel.stage.recommendation", color: "#8B5CF6" },
  { key: "basket", labelKey: "funnel.stage.basket", color: "#A855F7" },
  { key: "pdf_generated", labelKey: "funnel.stage.pdfGenerated", color: "#EC4899" },
  { key: "completed", labelKey: "funnel.stage.completed", color: "#16A34A" },
] as const;

const SOURCES = [
  "direct_visit",
  "referral_existing_client",
  "mass_media_tv",
  "mass_media_radio",
  "mass_media_print",
  "mahalla_booklet",
  "walk_in",
  "other",
] as const;

export default function FunnelReport({ embedded = false }: { embedded?: boolean }) {
  const { t } = useTranslation();
  const [branch, setBranch] = useState<string>("");
  const [source, setSource] = useState<string>("");
  const [from, setFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState<string>(() => new Date().toISOString().slice(0, 10));

  const { data: branches } = useListBranches({ query: { queryKey: getListBranchesQueryKey() } });

  const params = new URLSearchParams();
  if (branch) params.set("branch", branch);
  if (from) params.set("from", new Date(from).toISOString());
  // inclusive of `to` end-of-day
  if (to) params.set("to", new Date(to + "T23:59:59").toISOString());
  if (source) params.set("source", source);

  const { data, isLoading } = useQuery<FunnelData>({
    queryKey: ["funnel", params.toString()],
    queryFn: async () => {
      const res = await fetch(buildApiUrl(`/api/admin/reports/funnel?${params.toString()}`), {
        headers: buildAuthHeaders(),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
  });

  const max = data ? Math.max(...STAGES.map((s) => data.byStatus[s.key] ?? 0)) || 1 : 1;
  const total = data ? STAGES.reduce((sum, s) => sum + (data.byStatus[s.key] ?? 0), 0) : 0;

  return (
    <div className={`space-y-4 ${embedded ? "" : "max-w-4xl"}`}>
      {!embedded && (
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            {t("funnel.title", { defaultValue: "Воронка" })}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t("funnel.subtitle", { defaultValue: "Конверсия лидов по этапам" })}
          </p>
        </div>
      )}

      <div className="bg-card border rounded-xl p-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <Label className="text-xs">{t("funnel.from", { defaultValue: "С" })}</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">{t("funnel.to", { defaultValue: "По" })}</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">{t("funnel.branch", { defaultValue: "Филиал" })}</Label>
          <Select value={branch || "all"} onValueChange={(v) => setBranch(v === "all" ? "" : v)}>
            <SelectTrigger>
              <SelectValue placeholder={t("common.all", { defaultValue: "Все" })} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all", { defaultValue: "Все" })}</SelectItem>
              {(branches ?? []).map((b: any) => (
                <SelectItem key={b.id} value={String(b.id)}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">{t("funnel.source", { defaultValue: "Источник" })}</Label>
          <Select value={source || "all"} onValueChange={(v) => setSource(v === "all" ? "" : v)}>
            <SelectTrigger>
              <SelectValue placeholder={t("common.all", { defaultValue: "Все" })} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all", { defaultValue: "Все" })}</SelectItem>
              {SOURCES.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`funnel.sourceLabel.${s}`, { defaultValue: s })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="bg-card border rounded-xl p-5 space-y-3">
        {isLoading && <div className="text-muted-foreground">{t("common.loading")}</div>}
        {!isLoading && data && (
          <>
            <div className="text-sm text-muted-foreground mb-2">
              {t("funnel.total", { defaultValue: "Всего" })}: <strong>{total}</strong>
            </div>
            {STAGES.map((s, i) => {
              const n = data.byStatus[s.key] ?? 0;
              const pct = (n / max) * 100;
              const conversionFromPrev =
                i > 0
                  ? (() => {
                      const prev = data.byStatus[STAGES[i - 1].key] ?? 0;
                      return prev > 0 ? Math.round((n / prev) * 100) : null;
                    })()
                  : null;
              return (
                <div key={s.key} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{t(s.labelKey)}</span>
                    <span>
                      <strong>{n}</strong>
                      {conversionFromPrev !== null && (
                        <span className="text-xs text-muted-foreground ml-2">
                          {conversionFromPrev}%
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="h-6 bg-muted rounded-md overflow-hidden">
                    <div
                      className="h-full transition-all duration-300"
                      style={{ width: `${pct}%`, background: s.color }}
                    />
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
