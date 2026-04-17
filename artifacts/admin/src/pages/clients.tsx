import { useState, useRef } from "react";
import { useListClients, getListClientsQueryKey, useListBranches, getListBranchesQueryKey } from "@workspace/api-client-react";
import { Search, Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { buildApiUrl } from "@/lib/api";
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

export default function Clients({ user }: { user?: { role: string } }) {
  const isBranchHead = user?.role === "branch_head";
  const { t } = useTranslation();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [branchId, setBranchId] = useState<string>("all");
  const [page, setPage] = useState(1);
  const importRef = useRef<HTMLInputElement>(null);

  const { data: branches } = useListBranches({
    query: { queryKey: getListBranchesQueryKey() }
  });

  const { data: clientsData, isLoading } = useListClients(
    { 
      search: search || undefined, 
      status: status !== "all" ? status : undefined,
      branchId: branchId !== "all" ? Number(branchId) : undefined,
      page,
      pageSize: 20
    },
    { 
      query: { 
        queryKey: getListClientsQueryKey({ 
          search: search || undefined, 
          status: status !== "all" ? status : undefined,
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
    downloadCsv(rows, `clients_${formatAdminFileDate()}.xlsx`);
    toast({ title: t("common.exportSuccess") });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(buildApiUrl("/api/clients/import"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      toast({ title: t("common.importSuccess"), description: `${result.imported} records` });
    } catch (err: any) {
      toast({ variant: "destructive", title: t("common.importError"), description: err.message });
    }
    if (importRef.current) importRef.current.value = "";
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t("clients.title")}</h2>
          <p className="text-muted-foreground mt-1">{t("clients.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          {!isBranchHead && (
            <>
              <input type="file" ref={importRef} accept=".csv" onChange={handleImport} className="hidden" />
              <Button variant="outline" className="gap-2" onClick={() => importRef.current?.click()}>
                <Upload className="h-4 w-4" />
                {t("common.import")}
              </Button>
            </>
          )}
          <Button variant="outline" className="gap-2" onClick={handleExport}>
            <Download className="h-4 w-4" />
            {t("common.export")}
          </Button>
        </div>
      </div>

      <div className="bg-card border border-border/50 rounded-lg shadow-sm">
        <div className="p-4 border-b border-border/50 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder={t("clients.searchPlaceholder")} 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 max-w-md"
            />
          </div>
          <div className="flex gap-4">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder={t("common.status")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("clients.allStatuses")}</SelectItem>
                <SelectItem value="draft">{t("statuses.draft")}</SelectItem>
                <SelectItem value="questionnaire">{t("statuses.questionnaire")}</SelectItem>
                <SelectItem value="recommendation">{t("statuses.recommendation")}</SelectItem>
                <SelectItem value="basket">{t("statuses.basket")}</SelectItem>
                <SelectItem value="pdf_generated">{t("statuses.pdf_generated")}</SelectItem>
                <SelectItem value="completed">{t("statuses.completed")}</SelectItem>
                <SelectItem value="rejected">{t("statuses.rejected")}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger className="w-[180px]">
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

        <div className="relative w-full overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("clients.client")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead>{t("clients.branch")}</TableHead>
                <TableHead>{t("clients.assignedTo")}</TableHead>
                <TableHead>{t("clients.created")}</TableHead>
                <TableHead className="text-right">{t("clients.action")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-32" /><Skeleton className="h-3 w-24 mt-2" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
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
                  <TableRow key={client.id} className="group">
                    <TableCell>
                      <div className="font-medium text-foreground">
                        {client.fullName || t("clients.anonymous")}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {client.phone || t("clients.noPhone")} • ID: {client.sessionId.substring(0,8)}...
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(client.status, t)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {client.branch?.name || t("clients.unknownBranch")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {client.assignedTo?.name || t("clients.unassigned")}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatAdminShortDate(client.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/clients/${client.id}`}>{t("common.view")}</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="p-4 border-t border-border/50 flex items-center justify-between text-sm text-muted-foreground">
          <div>
            {t("common.showing", { count: clientsData?.data.length || 0, total: clientsData?.total || 0 })}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              {t("common.previous")}
            </Button>
            <Button variant="outline" size="sm" disabled={!clientsData || page * 20 >= clientsData.total} onClick={() => setPage(p => p + 1)}>
              {t("common.next")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
