import { useState, useRef } from "react";
import { useListClients, getListClientsQueryKey, useListBranches, getListBranchesQueryKey } from "@workspace/api-client-react";
import { Search, Download, Upload, Plus, AlertCircle, CheckCircle2, Mars, Venus } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ToolbarOverflow, type ToolbarOverflowAction } from "@/components/toolbar-overflow";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { buildApiUrl } from "@/lib/api";
import { buildAuthHeaders } from "@/lib/auth-headers";
import { downloadCsv } from "@/lib/csv";
import { formatAdminFileDate, formatAdminShortDate } from "@/lib/time";

const STATUS_CHIP_STYLES: Record<string, { bg: string; color: string }> = {
  draft:          { bg: "hsl(215 16% 52% / .12)",  color: "hsl(215 16% 42%)" },
  questionnaire:  { bg: "hsl(215 90% 52% / .12)",  color: "hsl(215 90% 42%)" },
  recommendation: { bg: "hsl(38 95% 52% / .15)",   color: "hsl(38 95% 40%)" },
  basket:         { bg: "hsl(270 80% 58% / .12)",  color: "hsl(270 70% 48%)" },
  pdf_generated:  { bg: "hsl(174 72% 40% / .13)",  color: "hsl(174 72% 32%)" },
  under_review:   { bg: "hsl(38 95% 52% / .12)",   color: "hsl(38 95% 40%)" },
  approved:       { bg: "hsl(142 65% 42% / .14)",  color: "hsl(142 65% 30%)" },
  completed:      { bg: "hsl(142 65% 42% / .14)",  color: "hsl(142 65% 30%)" },
  rejected:       { bg: "hsl(0 80% 58% / .12)",    color: "hsl(0 80% 48%)" },
};

export function GenderIcon({ gender }: { gender?: string | null }) {
  if (gender === "male") return <Mars className="w-3.5 h-3.5 shrink-0" style={{ color: "#3B82F6" }} aria-label="male" />;
  if (gender === "female") return <Venus className="w-3.5 h-3.5 shrink-0" style={{ color: "#EC4899" }} aria-label="female" />;
  return null;
}

export function GenderBadge({ gender, t }: { gender?: string | null; t: (key: string) => string }) {
  if (gender !== "male" && gender !== "female") return null;
  const isFemale = gender === "female";
  const Icon = isFemale ? Venus : Mars;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{
        background: isFemale ? "#FCE7F3" : "#DBEAFE",
        color: isFemale ? "#BE185D" : "#1D4ED8",
      }}
    >
      <Icon className="w-3 h-3" />
      {isFemale ? t("clientDetail.genderFemale") : t("clientDetail.genderMale")}
    </span>
  );
}

export function getStatusBadge(status: string, t: (key: string) => string) {
  const label = t(`statuses.${status}`);
  const style = STATUS_CHIP_STYLES[status];
  if (!style) {
    return <Badge variant="outline">{status}</Badge>;
  }
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold"
      style={{ background: style.bg, color: style.color }}
    >
      <span className="w-[5px] h-[5px] rounded-full" style={{ background: "currentColor" }} />
      {label}
    </span>
  );
}

/* ── Filter tab definitions ── */
const STATUS_TABS = [
  { key: "all", statuses: undefined },
  { key: "active", statuses: "draft,questionnaire,recommendation,basket,pdf_generated,under_review" },
  { key: "completed", statuses: "completed,approved" },
  { key: "rejected", statuses: "rejected" },
] as const;

export default function Clients({ user }: { user?: { role: string } }) {
  const isBranchHead = user?.role === "branch_head";
  const { t } = useTranslation();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [branchId, setBranchId] = useState<string>("all");
  const [page, setPage] = useState(1);
  const importRef = useRef<HTMLInputElement>(null);

  /* Derive the effective status filter from tab + dropdown */
  const tabDef = STATUS_TABS.find(t => t.key === activeTab) || STATUS_TABS[0];

  const { data: branches } = useListBranches({
    query: { queryKey: getListBranchesQueryKey() }
  });

  const { data: clientsData, isLoading } = useListClients(
    {
      search: search || undefined,
      status: status !== "all" ? status : (tabDef.statuses || undefined),
      branchId: branchId !== "all" ? Number(branchId) : undefined,
      page,
      pageSize: 20
    },
    {
      query: {
        queryKey: getListClientsQueryKey({
          search: search || undefined,
          status: status !== "all" ? status : (tabDef.statuses || undefined),
          branchId: branchId !== "all" ? Number(branchId) : undefined,
          page,
          pageSize: 20
        })
      }
    }
  );

  const handleExport = () => {
    if (!clientsData?.data.length) return;
    const rows = clientsData.data.map(c => ({
      id: c.id,
      fullName: c.fullName || "",
      phone: c.phone || "",
      status: c.status,
      branchId: c.branchId || "",
      branchName: c.branch?.name || "",
      assignedToId: c.assignedToId || "",
      assignedToName: c.assignedTo?.name || "",
      sessionId: c.sessionId,
      createdAt: c.createdAt,
    }));
    downloadCsv(rows, `mijozlar_${formatAdminFileDate()}.xlsx`);
    toast({ title: t("common.exportSuccess") });
  };

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewResult, setPreviewResult] = useState<{
    total: number;
    willImport: number;
    willSkip: number;
    rows: Array<{ rowNumber: number; ok: boolean; error?: string; fullName?: string | null; phone?: string | null; branchId?: number; status?: string }>;
  } | null>(null);
  const [committing, setCommitting] = useState(false);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreviewFile(file);
    setPreviewResult(null);
    setPreviewOpen(true);

    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(buildApiUrl("/api/clients/import?dryRun=1"), {
        method: "POST",
        headers: buildAuthHeaders(),
        body: formData,
      });
      if (!res.ok) throw new Error(await res.text());
      setPreviewResult(await res.json());
    } catch (err: any) {
      toast({ variant: "destructive", title: t("common.importError"), description: err.message });
      setPreviewOpen(false);
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  };

  const handleConfirmImport = async () => {
    if (!previewFile) return;
    setCommitting(true);
    const formData = new FormData();
    formData.append("file", previewFile);
    try {
      const res = await fetch(buildApiUrl("/api/clients/import"), {
        method: "POST",
        headers: buildAuthHeaders(),
        body: formData,
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      toast({ title: t("common.importSuccess"), description: `${result.imported} records` });
      setPreviewOpen(false);
      setPreviewFile(null);
      setPreviewResult(null);
    } catch (err: any) {
      toast({ variant: "destructive", title: t("common.importError"), description: err.message });
    } finally {
      setCommitting(false);
    }
  };

  const tabLabels: Record<string, string> = {
    all: t("clients.allStatuses"),
    active: t("clients.tabActive", { defaultValue: "В работе" }),
    completed: t("statuses.completed"),
    rejected: t("statuses.rejected"),
  };

  return (
    <div className="space-y-[14px] animate-in fade-in duration-500">
      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-[30px] font-bold tracking-tight">{t("clients.title")}</h2>
          <p className="text-[13px] text-muted-foreground mt-0.5">{t("clients.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          {!isBranchHead && (
            <input type="file" ref={importRef} accept=".csv" onChange={handleImport} className="hidden" />
          )}
          <Button size="sm" className="gap-1.5 h-9 text-xs" asChild>
            <Link href="/clients/new">
              <Plus className="h-3.5 w-3.5" />
              {t("clients.newClient", { defaultValue: "+ Новый клиент" })}
            </Link>
          </Button>
          <ToolbarOverflow
            triggerLabel={t("common.moreActions")}
            actions={[
              {
                label: t("common.import"),
                icon: Upload,
                hidden: isBranchHead,
                onClick: () => importRef.current?.click(),
              },
              {
                label: t("common.export"),
                icon: Download,
                onClick: handleExport,
              },
            ] as ToolbarOverflowAction[]}
          />
        </div>
      </div>

      {/* ── Underline tabs ── */}
      <div className="flex items-center justify-between border-b border-border/50">
        <div className="flex gap-0">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setStatus("all"); setPage(1); }}
              className={`relative px-4 pb-2.5 pt-1 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tabLabels[tab.key]}
              {activeTab === tab.key && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Search bar + action row ── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("clients.searchPlaceholder")}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9 h-9"
          />
        </div>
        <div className="flex gap-3 items-center">
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="w-[160px] h-9 text-xs">
              <SelectValue placeholder={t("common.status")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("clients.allStatuses")}</SelectItem>
              <SelectItem value="draft">{t("statuses.draft")}</SelectItem>
              <SelectItem value="lead">{t("statuses.lead")}</SelectItem>
              <SelectItem value="recommendation">{t("statuses.recommendation")}</SelectItem>
              <SelectItem value="basket">{t("statuses.basket")}</SelectItem>
              <SelectItem value="pdf_generated">{t("statuses.pdf_generated")}</SelectItem>
              <SelectItem value="completed">{t("statuses.completed")}</SelectItem>
              <SelectItem value="rejected">{t("statuses.rejected")}</SelectItem>
            </SelectContent>
          </Select>

          <Select value={branchId} onValueChange={(v) => { setBranchId(v); setPage(1); }}>
            <SelectTrigger className="w-[180px] h-9 text-xs">
              <SelectValue placeholder={t("clients.branch")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("clients.allBranches")}</SelectItem>
              {branches?.map(b => (
                <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Table card ── */}
      <div className="bg-card border border-border/50 rounded-xl shadow-sm">
        <div className="relative w-full overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10">
              <TableRow className="hover:bg-transparent bg-muted/50">
                <TableHead className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">
                  {t("clients.client")}
                </TableHead>
                <TableHead className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">
                  {t("common.status")}
                </TableHead>
                <TableHead className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">
                  {t("clients.branch")}
                </TableHead>
                <TableHead className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">
                  {t("clients.assignedTo")}
                </TableHead>
                <TableHead className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">
                  {t("clients.created")}
                </TableHead>
                <TableHead className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground text-right">
                  {t("clients.action")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="border-b border-border/50">
                    <TableCell className="py-[11px]"><Skeleton className="h-5 w-32" /><Skeleton className="h-3 w-24 mt-2" /></TableCell>
                    <TableCell className="py-[11px]"><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                    <TableCell className="py-[11px]"><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell className="py-[11px]"><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell className="py-[11px]"><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell className="py-[11px] text-right"><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : clientsData?.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    {t("clients.noClients")}
                  </TableCell>
                </TableRow>
              ) : (
                clientsData?.data.map((client) => (
                  <TableRow
                    key={client.id}
                    className="group border-b border-border/50 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => navigate(`/clients/${client.id}`)}
                  >
                    <TableCell className="py-[11px]">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-foreground">
                          {client.fullName || t("clients.anonymous")}
                        </span>
                        <GenderIcon gender={client.gender} />
                      </div>
                      <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                        ID: {client.sessionId.substring(0,8)}
                        {client.phone && <> &middot; {client.phone}</>}
                      </div>
                    </TableCell>
                    <TableCell className="py-[11px]">{getStatusBadge(client.status, t)}</TableCell>
                    <TableCell className="py-[11px] text-sm text-muted-foreground">
                      {client.branch?.name || t("clients.unknownBranch")}
                    </TableCell>
                    <TableCell className="py-[11px] text-sm text-muted-foreground">
                      {client.assignedTo?.name || t("clients.unassigned")}
                    </TableCell>
                    <TableCell className="py-[11px] text-sm text-muted-foreground">
                      {formatAdminShortDate(client.createdAt)}
                    </TableCell>
                    <TableCell className="py-[11px] text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7 opacity-0 group-hover:opacity-100 transition-opacity"
                        asChild
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                      >
                        <Link href={`/clients/${client.id}`}>{t("common.view")}</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* ── Pagination footer ── */}
        <div className="p-4 border-t border-border/50 flex items-center justify-between text-[11px] text-muted-foreground">
          <div>
            {t("common.showing", { count: clientsData?.data.length || 0, total: clientsData?.total || 0 })}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              {t("common.previous")}
            </Button>
            <span className="flex items-center px-2 text-xs font-medium text-foreground">{page}</span>
            <Button variant="outline" size="sm" className="h-7 text-xs" disabled={!clientsData || page * 20 >= clientsData.total} onClick={() => setPage(p => p + 1)}>
              {t("common.next")}
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={previewOpen} onOpenChange={(open) => { if (!open) { setPreviewOpen(false); setPreviewFile(null); setPreviewResult(null); } }}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{t("clientsImport.title")}</DialogTitle>
            <DialogDescription>
              {previewFile ? t("clientsImport.fileLabel", { name: previewFile.name }) : ""}
            </DialogDescription>
          </DialogHeader>

          {!previewResult ? (
            <div className="flex-1 flex items-center justify-center py-12">
              <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
            </div>
          ) : (
            <>
              <div className="flex gap-3 mb-3">
                <div className="flex-1 rounded-lg border border-border/60 p-3">
                  <div className="text-xs text-muted-foreground">{t("clientsImport.total")}</div>
                  <div className="text-2xl font-bold">{previewResult.total}</div>
                </div>
                <div className="flex-1 rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 p-3">
                  <div className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> {t("clientsImport.willImport")}
                  </div>
                  <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{previewResult.willImport}</div>
                </div>
                <div className="flex-1 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-3">
                  <div className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> {t("clientsImport.willSkip")}
                  </div>
                  <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">{previewResult.willSkip}</div>
                </div>
              </div>

              <div className="flex-1 overflow-auto border border-border/60 rounded-lg">
                <Table>
                  <TableHeader className="sticky top-0 bg-muted">
                    <TableRow>
                      <TableHead className="w-14">#</TableHead>
                      <TableHead>{t("clients.fullName")}</TableHead>
                      <TableHead>{t("clients.phone")}</TableHead>
                      <TableHead>{t("clientsImport.branchCol")}</TableHead>
                      <TableHead>{t("clientsImport.statusCol")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewResult.rows.map((row) => (
                      <TableRow key={row.rowNumber} className={row.ok ? "" : "bg-amber-50/40 dark:bg-amber-950/10"}>
                        <TableCell className="font-mono text-xs text-muted-foreground">{row.rowNumber}</TableCell>
                        <TableCell className="text-sm">{row.fullName ?? "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{row.phone ?? "—"}</TableCell>
                        <TableCell className="text-sm">{row.branchId ?? "—"}</TableCell>
                        <TableCell>
                          {row.ok ? (
                            <Badge variant="outline" className="border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> {t("clientsImport.ok")}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400">
                              <AlertCircle className="h-3 w-3 mr-1" /> {row.error ?? t("clientsImport.invalid")}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          <DialogFooter className="mt-3">
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleConfirmImport}
              disabled={!previewResult || previewResult.willImport === 0 || committing}
            >
              {committing
                ? t("common.saving")
                : t("clientsImport.confirm", { count: previewResult?.willImport ?? 0 })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
