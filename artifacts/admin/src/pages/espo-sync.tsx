import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { buildApiUrl } from "@/lib/api";
import { buildAuthHeaders, buildJsonHeaders } from "@/lib/auth-headers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";

interface SyncJob {
  id: number;
  clientId: number;
  status: string;
  attempts: number;
  lastError: string | null;
  espoLeadId: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUSES = ["pending", "failed", "succeeded"] as const;

export default function EspoSyncPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [status, setStatus] = useState<typeof STATUSES[number]>("failed");

  const { data = [], isLoading } = useQuery<SyncJob[]>({
    queryKey: ["espo-sync-jobs", status],
    queryFn: async () => {
      const res = await fetch(
        buildApiUrl(`/api/admin/espo-sync/jobs?status=${status}`),
        { headers: buildAuthHeaders() },
      );
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
  });

  const retry = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(buildApiUrl(`/api/admin/espo-sync/retry/${id}`), {
        method: "POST",
        headers: buildJsonHeaders(),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("espoSync.retrySuccess", { defaultValue: "Job re-queued" }) });
      qc.invalidateQueries({ queryKey: ["espo-sync-jobs"] });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        title: t("espoSync.retryFailed", { defaultValue: "Retry failed" }),
        description: err instanceof Error ? err.message : String(err),
      });
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          {t("espoSync.title", { defaultValue: "Espo Sync" })}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t("espoSync.subtitle", { defaultValue: "Outbound lead sync to EspoCRM" })}
        </p>
      </div>

      <div className="flex gap-2">
        {STATUSES.map((s) => (
          <Button
            key={s}
            variant={status === s ? "default" : "outline"}
            size="sm"
            onClick={() => setStatus(s)}
          >
            {t(`espoSync.status.${s}`, { defaultValue: s })}
          </Button>
        ))}
      </div>

      <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">{t("espoSync.col.id", { defaultValue: "Job ID" })}</th>
              <th className="px-4 py-3 text-left">{t("espoSync.col.client", { defaultValue: "Client" })}</th>
              <th className="px-4 py-3 text-left">{t("espoSync.col.attempts", { defaultValue: "Attempts" })}</th>
              <th className="px-4 py-3 text-left">{t("espoSync.col.error", { defaultValue: "Error" })}</th>
              <th className="px-4 py-3 text-left">{t("espoSync.col.espoLead", { defaultValue: "Espo lead" })}</th>
              <th className="px-4 py-3 text-right">{t("espoSync.col.action", { defaultValue: "Action" })}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">{t("common.loading")}</td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">{t("espoSync.empty", { defaultValue: "No jobs in this state" })}</td></tr>
            ) : (
              data.map((job) => (
                <tr key={job.id} className="border-t">
                  <td className="px-4 py-3 font-mono text-xs">{job.id}</td>
                  <td className="px-4 py-3">{job.clientId}</td>
                  <td className="px-4 py-3"><Badge variant="outline">{job.attempts}</Badge></td>
                  <td className="px-4 py-3 max-w-md truncate text-red-600">{job.lastError ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{job.espoLeadId ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    {status === "failed" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => retry.mutate(job.id)}
                        disabled={retry.isPending}
                      >
                        {t("espoSync.retry", { defaultValue: "Retry" })}
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
