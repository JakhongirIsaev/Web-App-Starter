import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { buildApiUrl } from "@/lib/api";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatAdminDateTime } from "@/lib/time";

const getToken = () => localStorage.getItem("auth_token");

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(buildApiUrl(`/api${url}`), {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

interface ActivityRow {
  id: number;
  type: string;
  description: string;
  entityId: number | null;
  entityType: string | null;
  userId: number | null;
  userName: string | null;
  branchName: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface PageResult {
  data: ActivityRow[];
  total: number;
  page: number;
  pageSize: number;
}

export default function ActivityLogPage() {
  const { t } = useTranslation();

  const [page, setPage] = useState(1);
  const [type, setType] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const params = new URLSearchParams({
    page: String(page),
    pageSize: "25",
  });
  if (type !== "all") params.set("type", type);
  if (from) params.set("from", from);
  if (to) params.set("to", to);

  const { data, isLoading, isFetching } = useQuery<PageResult>({
    queryKey: ["admin/activity-log", { type, from, to, page }],
    queryFn: () => apiFetch<PageResult>(`/admin/activity-log?${params.toString()}`),
  });

  const { data: types = [] } = useQuery<string[]>({
    queryKey: ["admin/activity-log/types"],
    queryFn: () => apiFetch<string[]>(`/admin/activity-log/types`),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            {t("activityLog.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t("activityLog.subtitle")}</p>
        </div>
      </div>

      {/* filters */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4 p-4 border rounded-lg bg-card">
        <div>
          <Label className="text-xs">{t("activityLog.filterType")}</Label>
          <Select value={type} onValueChange={(v) => { setType(v); setPage(1); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("activityLog.allTypes")}</SelectItem>
              {types.map((tp) => (
                <SelectItem key={tp} value={tp}>{tp}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">{t("activityLog.filterFrom")}</Label>
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        </div>
        <div>
          <Label className="text-xs">{t("activityLog.filterTo")}</Label>
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
        </div>
        <div className="flex items-end">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => { setType("all"); setFrom(""); setTo(""); setPage(1); }}
          >
            {t("activityLog.clearFilters")}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : !data || data.data.length === 0 ? (
        <div className="border-2 border-dashed border-border rounded-xl p-12 text-center text-muted-foreground">
          <Activity className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">{t("activityLog.empty")}</p>
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-44">{t("activityLog.colTime")}</TableHead>
                <TableHead className="w-56">{t("activityLog.colEvent")}</TableHead>
                <TableHead className="w-40">{t("activityLog.colUser")}</TableHead>
                <TableHead className="w-32">{t("activityLog.colBranch")}</TableHead>
                <TableHead>{t("activityLog.colDescription")}</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.flatMap((row) => {
                const hasMetadata = row.metadata && Object.keys(row.metadata).length > 0;
                const expanded = expandedId === row.id;
                const items = [
                  <TableRow
                    key={row.id}
                    className={hasMetadata ? "cursor-pointer hover:bg-muted/40" : ""}
                    onClick={() => hasMetadata && setExpandedId(expanded ? null : row.id)}
                  >
                    <TableCell className="text-xs text-muted-foreground tabular-nums">
                      {formatAdminDateTime(row.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-[10px]">{row.type}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{row.userName ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{row.branchName ?? "—"}</TableCell>
                    <TableCell className="text-sm">{row.description}</TableCell>
                    <TableCell>
                      {hasMetadata ? (
                        <ChevronDown
                          className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
                        />
                      ) : null}
                    </TableCell>
                  </TableRow>,
                ];
                if (expanded && hasMetadata) {
                  items.push(
                    <TableRow key={`${row.id}-meta`}>
                      <TableCell colSpan={6} className="bg-muted/30">
                        <pre className="text-xs font-mono whitespace-pre-wrap break-all p-3 max-h-64 overflow-auto">
                          {JSON.stringify(row.metadata, null, 2)}
                        </pre>
                      </TableCell>
                    </TableRow>,
                  );
                }
                return items;
              })}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between mt-4 px-1">
            <div className="text-xs text-muted-foreground">
              {t("activityLog.showing", {
                from: (data.page - 1) * data.pageSize + 1,
                to: Math.min(data.page * data.pageSize, data.total),
                total: data.total,
              })}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || isFetching}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs tabular-nums">
                {data.page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || isFetching}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
