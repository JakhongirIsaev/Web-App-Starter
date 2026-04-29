import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { buildApiUrl } from "@/lib/api";
import { buildAuthHeaders } from "@/lib/auth-headers";

export interface ImportPreviewRow {
  rowNumber: number;
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

interface ImportPreviewResult<TRow extends ImportPreviewRow> {
  total: number;
  willImport: number;
  willSkip: number;
  rows: TRow[];
}

interface ColumnDef<TRow extends ImportPreviewRow> {
  key: keyof TRow;
  label: string;
  render?: (row: TRow) => React.ReactNode;
}

interface Props<TRow extends ImportPreviewRow> {
  /** Path under /api, e.g. "/branches/import". */
  endpoint: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: File | null;
  columns: ColumnDef<TRow>[];
  /** Called after a successful commit. */
  onCommitted: (result: { imported: number; skipped: number[] }) => void;
}

export function ImportPreviewDialog<TRow extends ImportPreviewRow>({
  endpoint,
  open,
  onOpenChange,
  file,
  columns,
  onCommitted,
}: Props<TRow>) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [previewResult, setPreviewResult] = useState<ImportPreviewResult<TRow> | null>(null);
  const [committing, setCommitting] = useState(false);

  useEffect(() => {
    if (!open || !file) {
      setPreviewResult(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await fetch(buildApiUrl(`/api${endpoint}?dryRun=1`), {
          method: "POST",
          headers: buildAuthHeaders(),
          body: formData,
        });
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as ImportPreviewResult<TRow>;
        if (!cancelled) setPreviewResult(data);
      } catch (err) {
        if (!cancelled) {
          toast({
            variant: "destructive",
            title: t("common.importError"),
            description: err instanceof Error ? err.message : String(err),
          });
          onOpenChange(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, file, endpoint, t, toast, onOpenChange]);

  const handleConfirm = async () => {
    if (!file) return;
    setCommitting(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(buildApiUrl(`/api${endpoint}`), {
        method: "POST",
        headers: buildAuthHeaders(),
        body: formData,
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      onCommitted({
        imported: data.imported ?? 0,
        skipped: Array.isArray(data.skipped) ? data.skipped : [],
      });
      toast({
        title: t("common.importSuccess"),
        description: `${data.imported ?? 0} records`,
      });
      onOpenChange(false);
    } catch (err) {
      toast({
        variant: "destructive",
        title: t("common.importError"),
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setCommitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{t("clientsImport.title")}</DialogTitle>
          <DialogDescription>
            {file ? t("clientsImport.fileLabel", { name: file.name }) : ""}
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
                <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                  {previewResult.willImport}
                </div>
              </div>
              <div className="flex-1 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-3">
                <div className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> {t("clientsImport.willSkip")}
                </div>
                <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                  {previewResult.willSkip}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-auto border border-border/60 rounded-lg">
              <Table>
                <TableHeader className="sticky top-0 bg-muted">
                  <TableRow>
                    <TableHead className="w-14">#</TableHead>
                    {columns.map((c) => (
                      <TableHead key={String(c.key)}>{c.label}</TableHead>
                    ))}
                    <TableHead>{t("clientsImport.statusCol")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewResult.rows.map((row) => (
                    <TableRow
                      key={row.rowNumber}
                      className={row.ok ? "" : "bg-amber-50/40 dark:bg-amber-950/10"}
                    >
                      <TableCell className="font-mono text-xs text-muted-foreground">{row.rowNumber}</TableCell>
                      {columns.map((c) => (
                        <TableCell key={String(c.key)} className="text-sm">
                          {c.render ? c.render(row) : (row[c.key] as React.ReactNode) ?? "—"}
                        </TableCell>
                      ))}
                      <TableCell>
                        {row.ok ? (
                          <Badge variant="outline" className="border-emerald-300 text-emerald-700">
                            <CheckCircle2 className="h-3 w-3 mr-1" /> {t("clientsImport.ok")}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-amber-300 text-amber-700">
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button
            onClick={handleConfirm}
            disabled={!previewResult || previewResult.willImport === 0 || committing}
          >
            {committing
              ? t("common.saving")
              : t("clientsImport.confirm", { count: previewResult?.willImport ?? 0 })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
