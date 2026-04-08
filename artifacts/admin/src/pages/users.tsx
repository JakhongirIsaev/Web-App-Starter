import { useState, useRef } from "react";
import {
  useListUsers, getListUsersQueryKey, useListBranches, getListBranchesQueryKey,
  useCreateUser, useUpdateUser, useActivateUser, useDeactivateUser
} from "@workspace/api-client-react";
import type { User } from "@workspace/api-client-react";
import { Plus, Search, UserCheck, UserX, Download, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Eye, Building2, ChevronRight, ChevronDown, List, LayoutGrid, Users2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { getRoleColor } from "@/components/layout";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { buildApiUrl } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import { formatAdminFileDate, formatAdminFileDateTime, formatAdminMonthYear } from "@/lib/time";
import * as XLSX from "xlsx";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

interface UserForm {
  telegramId: string;
  name: string;
  role: string;
  branchId: string;
  password: string;
}

const emptyForm: UserForm = { telegramId: "", name: "", role: "branch_head", branchId: "", password: "" };

interface ImportCreated {
  row: number;
  name: string;
  telegramId: string;
  role: string;
  branch: string;
  password: string;
}

interface ImportSkipped {
  row: number;
  reason: string;
  name?: string;
  telegramId?: string;
}

interface ImportResult {
  imported: number;
  skipped: ImportSkipped[];
  created: ImportCreated[];
}

interface PreviewRow {
  row: number;
  name: string;
  telegramId: string;
  role: string;
  branch: string;
  phone: string;
  password: string;
}

const COLUMN_MAP: Record<string, string> = {
  "фио": "name", "ф.и.о.": "name", "ф.и.о": "name", "имя": "name", "name": "name", "ism": "name", "ismi": "name", "fish": "name",
  "telegram id": "telegramId", "telegramid": "telegramId", "telegram": "telegramId", "тг id": "telegramId", "тг": "telegramId",
  "роль": "role", "role": "role", "rol": "role",
  "филиал": "branch", "branch": "branch", "filial": "branch",
  "телефон": "phone", "phone": "phone", "telefon": "phone", "тел": "phone",
  "пароль": "password", "password": "password", "parol": "password",
};

const ROLE_ALIASES: Record<string, string> = {
  "суперадмин": "superadmin", "superadmin": "superadmin",
  "админ главного офиса": "head_office_admin", "head_office_admin": "head_office_admin", "admin": "head_office_admin",
  "редактор": "editor", "editor": "editor", "muharrir": "editor",
  "начальник филиала": "branch_head", "branch_head": "branch_head", "filial boshlig'i": "branch_head", "нач. филиала": "branch_head",
  "охотник": "hunter", "hunter": "hunter", "хантер": "hunter",
};

function parseFileToPreview(buffer: ArrayBuffer, fileName: string): PreviewRow[] {
  let rows: Record<string, string>[] = [];

  if (fileName.endsWith(".csv")) {
    const text = new TextDecoder("utf-8").decode(buffer);
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(/[;,\t]/).map(h => h.trim().replace(/^["']|["']$/g, ""));
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(/[;,\t]/).map(v => v.trim().replace(/^["']|["']$/g, ""));
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => { row[h] = vals[idx] || ""; });
      rows.push(row);
    }
  } else {
    const wb = XLSX.read(buffer, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return [];
    rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "" });
  }

  const preview: PreviewRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const mapped: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) {
      const normalized = key.toLowerCase().trim();
      const field = COLUMN_MAP[normalized];
      if (field) mapped[field] = String(value).trim();
    }
    if (!mapped.name && !mapped.telegramId) continue;

    const roleLower = (mapped.role || "").toLowerCase().trim();
    const resolvedRole = ROLE_ALIASES[roleLower] || mapped.role || "";

    preview.push({
      row: i + 2,
      name: mapped.name || "",
      telegramId: mapped.telegramId || "",
      role: resolvedRole,
      branch: mapped.branch || "",
      phone: mapped.phone || "",
      password: mapped.password || "",
    });
  }
  return preview;
}

export default function Users() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [role, setRole] = useState<string>("all");
  const [branchId, setBranchId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "branch">("branch");
  const [expandedBranches, setExpandedBranches] = useState<Set<number>>(new Set());
  const importRef = useRef<HTMLInputElement>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [previewFile, setPreviewFile] = useState<File | null>(null);

  const [importResultOpen, setImportResultOpen] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);

  const { data: branches } = useListBranches({ query: { queryKey: getListBranchesQueryKey() } });
  const { data: users, isLoading } = useListUsers(
    { role: role !== "all" ? role : undefined, branchId: branchId !== "all" ? Number(branchId) : undefined },
    { query: { queryKey: getListUsersQueryKey({ role: role !== "all" ? role : undefined, branchId: branchId !== "all" ? Number(branchId) : undefined }) } }
  );

  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const activateUser = useActivateUser();
  const deactivateUser = useDeactivateUser();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListUsersQueryKey({ role: role !== "all" ? role : undefined, branchId: branchId !== "all" ? Number(branchId) : undefined }) });
  };

  const openCreate = () => { setEditUser(null); setForm(emptyForm); setDialogOpen(true); };

  const openEdit = (u: User) => {
    setEditUser(u);
    setForm({ telegramId: u.telegramId, name: u.name, role: u.role, branchId: u.branchId?.toString() || "", password: "" });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim() || !form.telegramId.trim()) return;
    if (editUser) {
      const data: any = { name: form.name, role: form.role };
      if (form.branchId) data.branchId = Number(form.branchId);
      else data.branchId = null;
      if (form.password) data.password = form.password;
      updateUser.mutate({ id: editUser.id, data }, {
        onSuccess: () => { toast({ title: t("users.userUpdated") }); setDialogOpen(false); invalidate(); },
        onError: (e: any) => toast({ variant: "destructive", title: t("common.error"), description: e.message }),
      });
    } else {
      if (!form.password) { toast({ variant: "destructive", title: t("users.passwordRequired") }); return; }
      const data: any = { telegramId: form.telegramId, name: form.name, role: form.role, password: form.password };
      if (form.branchId) data.branchId = Number(form.branchId);
      createUser.mutate({ data }, {
        onSuccess: () => { toast({ title: t("users.userCreated") }); setDialogOpen(false); invalidate(); },
        onError: (e: any) => toast({ variant: "destructive", title: t("common.error"), description: e.message }),
      });
    }
  };

  const toggleActive = (user: User) => {
    const mutation = user.isActive ? deactivateUser : activateUser;
    mutation.mutate({ id: user.id }, {
      onSuccess: () => { toast({ title: user.isActive ? t("users.userDeactivated") : t("users.userActivated") }); invalidate(); },
      onError: (e: any) => toast({ variant: "destructive", title: t("common.error"), description: e.message }),
    });
  };

  const handleExport = () => {
    if (!filteredUsers.length) return;
    const rows = filteredUsers.map(u => ({
      id: u.id, name: u.name, telegramId: u.telegramId, role: u.role,
      branch: u.branch?.name || "", isActive: u.isActive, createdAt: u.createdAt,
    }));
    downloadCsv(rows, `users_${formatAdminFileDate()}.xlsx`);
    toast({ title: t("common.exportSuccess") });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (importRef.current) importRef.current.value = "";

    try {
      const buffer = await file.arrayBuffer();
      const rows = parseFileToPreview(buffer, file.name.toLowerCase());
      if (rows.length === 0) {
        toast({ variant: "destructive", title: t("users.noValidRows") });
        return;
      }
      setPreviewRows(rows);
      setPreviewFile(file);
      setPreviewOpen(true);
    } catch (err: any) {
      toast({ variant: "destructive", title: t("users.parseError"), description: err.message });
    }
  };

  const handleConfirmImport = async () => {
    if (!previewFile) return;
    const formData = new FormData();
    formData.append("file", previewFile);
    setImporting(true);
    setPreviewOpen(false);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(buildApiUrl("/api/users/import"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error(await res.text());
      const result: ImportResult = await res.json();
      setImportResult(result);
      setImportResultOpen(true);
      invalidate();
    } catch (err: any) {
      toast({ variant: "destructive", title: t("common.importError"), description: err.message });
    } finally {
      setImporting(false);
      setPreviewFile(null);
      setPreviewRows([]);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(buildApiUrl("/api/users/import-template"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "users_import_template.xlsx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ variant: "destructive", title: t("common.error"), description: err.message });
    }
  };

  const handleDownloadCredentials = () => {
    if (!importResult?.created?.length) return;
    const rows = importResult.created.map(c => ({
      name: c.name,
      telegramId: c.telegramId,
      role: c.role,
      branch: c.branch,
      password: c.password,
    }));
    downloadCsv(rows, `credentials_${formatAdminFileDateTime()}.xlsx`);
    toast({ title: t("users.credentialsDownloaded") });
  };

  const getSkipReasonLabel = (reason: string) => {
    switch (reason) {
      case "duplicate_telegram_id": return t("users.skipDuplicate");
      case "missing_required_fields": return t("users.skipMissingFields");
      default: return reason;
    }
  };

  const isPending = createUser.isPending || updateUser.isPending;
  const filteredUsers = (users || []).filter(u => !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.telegramId.includes(search));

  const toggleBranch = (id: number) => {
    setExpandedBranches(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const branchGroups = (() => {
    if (!branches || !filteredUsers.length) return [];
    const hqUsers = filteredUsers.filter(u => !u.branchId);
    const groups: { id: number; name: string; users: typeof filteredUsers }[] = [];
    if (hqUsers.length > 0) {
      groups.push({ id: 0, name: t("users.hqAllBranches"), users: hqUsers });
    }
    for (const branch of branches) {
      const branchUsers = filteredUsers.filter(u => u.branchId === branch.id);
      if (branchUsers.length > 0 || (branchId !== "all" && Number(branchId) === branch.id)) {
        groups.push({ id: branch.id, name: branch.name, users: branchUsers });
      }
    }
    return groups;
  })();

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t("users.title")}</h2>
          <p className="text-muted-foreground mt-1">{t("users.subtitle")}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input type="file" ref={importRef} accept=".xlsx,.xls,.csv" onChange={handleFileSelect} className="hidden" />
          <div className="flex border rounded-lg overflow-hidden">
            <Button variant={viewMode === "branch" ? "default" : "ghost"} size="sm" className="rounded-none gap-1.5" onClick={() => setViewMode("branch")}>
              <Building2 className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === "list" ? "default" : "ghost"} size="sm" className="rounded-none gap-1.5" onClick={() => setViewMode("list")}>
              <List className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="outline" size="sm" className="gap-2" onClick={handleDownloadTemplate}>
            <FileSpreadsheet className="h-4 w-4" />
            {t("users.downloadTemplate")}
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => importRef.current?.click()} disabled={importing}>
            <Upload className="h-4 w-4" />
            {importing ? t("common.loading") : t("users.importExcel")}
          </Button>
          <Button variant="outline" className="gap-2" onClick={handleExport}>
            <Download className="h-4 w-4" />
            {t("common.export")}
          </Button>
          <Button className="gap-2" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            {t("users.addUser")}
          </Button>
        </div>
      </div>

      <div className="bg-card border border-border/50 rounded-lg shadow-sm">
        <div className="p-4 border-b border-border/50 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder={t("users.searchPlaceholder")} className="pl-9 max-w-md" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-4">
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("users.allRoles")}</SelectItem>
                <SelectItem value="superadmin">{t("users.superadmin")}</SelectItem>
                <SelectItem value="head_office_admin">{t("users.head_office_admin")}</SelectItem>
                <SelectItem value="editor">{t("users.editor")}</SelectItem>
                <SelectItem value="branch_head">{t("users.branch_head")}</SelectItem>
                <SelectItem value="hunter">{t("users.hunter")}</SelectItem>
              </SelectContent>
            </Select>
            {viewMode === "list" && (
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("users.allBranches")}</SelectItem>
                  {branches?.map(b => (<SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {viewMode === "branch" ? (
          <div className="divide-y divide-border/50">
            {isLoading ? (
              <div className="p-6 space-y-4">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : branchGroups.length === 0 ? (
              <div className="h-32 flex items-center justify-center text-muted-foreground">{t("users.noUsers")}</div>
            ) : (
              branchGroups.map((group) => {
                const isExpanded = expandedBranches.has(group.id);
                const activeCount = group.users.filter(u => u.isActive).length;
                return (
                  <div key={group.id}>
                    <button
                      onClick={() => toggleBranch(group.id)}
                      className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors text-left"
                    >
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Building2 className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-foreground">{group.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {group.users.length} {t("users.user").toLowerCase()} · {activeCount} {t("common.active").toLowerCase()}
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-xs">{group.users.length}</Badge>
                      {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </button>
                    {isExpanded && (
                      <div className="bg-muted/20 border-t border-border/30">
                        <Table>
                          <TableHeader>
                            <TableRow className="hover:bg-transparent">
                              <TableHead>{t("users.user")}</TableHead>
                              <TableHead>{t("users.telegramId")}</TableHead>
                              <TableHead>{t("users.role")}</TableHead>
                              <TableHead>{t("common.status")}</TableHead>
                              <TableHead className="text-right">{t("common.actions")}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.users.map((user) => (
                              <TableRow key={user.id}>
                                <TableCell>
                                  <div className="font-medium text-foreground">{user.name}</div>
                                  <div className="text-xs text-muted-foreground mt-0.5">{t("users.joined", { date: formatAdminMonthYear(user.createdAt) })}</div>
                                </TableCell>
                                <TableCell><code className="bg-muted px-2 py-1 rounded text-xs">{user.telegramId}</code></TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={getRoleColor(user.role)}>{t(`roles.${user.role}`)}</Badge>
                                </TableCell>
                                <TableCell>
                                  {user.isActive
                                    ? <div className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400"><UserCheck className="h-4 w-4" /> {t("common.active")}</div>
                                    : <div className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400"><UserX className="h-4 w-4" /> {t("common.inactive")}</div>}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <Button variant="outline" size="sm" onClick={() => openEdit(user)}>{t("common.edit")}</Button>
                                    <Button variant="ghost" size="sm" className={user.isActive ? "text-red-600 hover:text-red-700 hover:bg-red-50" : "text-green-600 hover:text-green-700 hover:bg-green-50"} onClick={() => toggleActive(user)}>
                                      {user.isActive ? t("users.deactivate") : t("users.activate")}
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <div className="relative w-full overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t("users.user")}</TableHead>
                  <TableHead>{t("users.telegramId")}</TableHead>
                  <TableHead>{t("users.role")}</TableHead>
                  <TableHead>{t("users.branch")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead className="text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-28 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-16 rounded-full" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-8 w-20 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">{t("users.noUsers")}</TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="font-medium text-foreground">{user.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{t("users.joined", { date: formatAdminMonthYear(user.createdAt) })}</div>
                      </TableCell>
                      <TableCell><code className="bg-muted px-2 py-1 rounded text-xs">{user.telegramId}</code></TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getRoleColor(user.role)}>{t(`roles.${user.role}`)}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {user.branch?.name || <span className="italic text-muted-foreground/50">{t("users.hqAllBranches")}</span>}
                      </TableCell>
                      <TableCell>
                        {user.isActive
                          ? <div className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400"><UserCheck className="h-4 w-4" /> {t("common.active")}</div>
                          : <div className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400"><UserX className="h-4 w-4" /> {t("common.inactive")}</div>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEdit(user)}>{t("common.edit")}</Button>
                          <Button variant="ghost" size="sm" className={user.isActive ? "text-red-600 hover:text-red-700 hover:bg-red-50" : "text-green-600 hover:text-green-700 hover:bg-green-50"} onClick={() => toggleActive(user)}>
                            {user.isActive ? t("users.deactivate") : t("users.activate")}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editUser ? t("users.editUserTitle") : t("users.addUserTitle")}</DialogTitle>
            <DialogDescription>{editUser ? t("users.editUserDesc") : t("users.addUserDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("users.fullName")}</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t("users.fullNamePlaceholder")} />
              </div>
              <div className="space-y-2">
                <Label>{t("users.telegramId")}</Label>
                <Input value={form.telegramId} onChange={e => setForm(f => ({ ...f, telegramId: e.target.value }))} placeholder={t("users.telegramIdPlaceholder")} disabled={!!editUser} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("users.roleLabel")}</Label>
                <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="superadmin">{t("users.superadmin")}</SelectItem>
                    <SelectItem value="head_office_admin">{t("users.head_office_admin")}</SelectItem>
                    <SelectItem value="editor">{t("users.editor")}</SelectItem>
                    <SelectItem value="branch_head">{t("users.branch_head")}</SelectItem>
                    <SelectItem value="hunter">{t("users.hunter")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("users.branchLabel")}</Label>
                <Select value={form.branchId || "none"} onValueChange={v => setForm(f => ({ ...f, branchId: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder={t("users.selectBranch")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("users.hqAllBranches")}</SelectItem>
                    {branches?.map(b => (<SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{editUser ? t("users.newPasswordLabel") : t("users.passwordLabel")}</Label>
              <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder={editUser ? t("users.passwordKeepPlaceholder") : t("users.passwordPlaceholder")} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleSubmit} disabled={isPending || !form.name.trim() || !form.telegramId.trim()}>
              {isPending ? t("common.saving") : editUser ? t("common.saveChanges") : t("users.addUser")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={(open) => { if (!open) { setPreviewOpen(false); setPreviewFile(null); setPreviewRows([]); } }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              {t("users.importPreviewTitle")}
            </DialogTitle>
            <DialogDescription>{t("users.importPreviewDesc", { count: previewRows.length })}</DialogDescription>
          </DialogHeader>

          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs w-12">#</TableHead>
                  <TableHead className="text-xs">{t("users.fullName")}</TableHead>
                  <TableHead className="text-xs">{t("users.telegramId")}</TableHead>
                  <TableHead className="text-xs">{t("users.role")}</TableHead>
                  <TableHead className="text-xs">{t("users.branch")}</TableHead>
                  <TableHead className="text-xs">{t("users.previewPhone")}</TableHead>
                  <TableHead className="text-xs">{t("users.previewPassword")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewRows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs text-muted-foreground font-mono">{r.row}</TableCell>
                    <TableCell className="text-sm">
                      {r.name || <span className="text-red-500 italic">—</span>}
                    </TableCell>
                    <TableCell className="text-sm font-mono">
                      {r.telegramId || <span className="text-red-500 italic">—</span>}
                    </TableCell>
                    <TableCell>
                      {r.role ? (
                        <Badge variant="outline" className={getRoleColor(r.role)}>{t(`roles.${r.role}`, { defaultValue: r.role })}</Badge>
                      ) : (
                        <span className="text-red-500 italic">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.branch || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.phone || "—"}</TableCell>
                    <TableCell className="text-sm">
                      {r.password ? (
                        <span className="font-mono text-xs">{r.password}</span>
                      ) : (
                        <Badge variant="secondary" className="text-xs">{t("users.autoGenerated")}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setPreviewOpen(false); setPreviewFile(null); setPreviewRows([]); }}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleConfirmImport} disabled={importing} className="gap-2">
              <Upload className="h-4 w-4" />
              {importing ? t("common.loading") : t("users.confirmImport")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importResultOpen} onOpenChange={setImportResultOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("users.importResultTitle")}</DialogTitle>
            <DialogDescription>{t("users.importResultDesc")}</DialogDescription>
          </DialogHeader>

          {importResult && (
            <div className="space-y-4 py-2">
            <div className="flex gap-4">
              <div className="flex items-center gap-2 px-4 py-3 bg-green-50 dark:bg-green-950/30 rounded-lg flex-1">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <div>
                  <div className="text-lg font-bold text-green-700 dark:text-green-400">{importResult.imported}</div>
                  <div className="text-xs text-green-600 dark:text-green-500">{t("users.importCreated")}</div>
                </div>
              </div>
              {importResult.skipped.length > 0 && (
                <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg flex-1">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  <div>
                    <div className="text-lg font-bold text-amber-700 dark:text-amber-400">{importResult.skipped.length}</div>
                    <div className="text-xs text-amber-600 dark:text-amber-500">{t("users.importSkipped")}</div>
                  </div>
                </div>
              )}
            </div>

              {importResult.created.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold">{t("users.createdUsers")}</h4>
                    <Button variant="outline" size="sm" className="gap-2" onClick={handleDownloadCredentials}>
                      <Download className="h-3.5 w-3.5" />
                      {t("users.downloadCredentials")}
                    </Button>
                  </div>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-xs">{t("users.fullName")}</TableHead>
                          <TableHead className="text-xs">{t("users.telegramId")}</TableHead>
                          <TableHead className="text-xs">{t("users.role")}</TableHead>
                          <TableHead className="text-xs">{t("users.branch")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importResult.created.map((c, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-sm">{c.name}</TableCell>
                            <TableCell className="text-sm font-mono">{c.telegramId}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={getRoleColor(c.role)}>{t(`roles.${c.role}`)}</Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{c.branch || "-"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {importResult.skipped.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">{t("users.skippedRows")}</h4>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-xs">{t("users.rowNumber")}</TableHead>
                          <TableHead className="text-xs">{t("users.fullName")}</TableHead>
                          <TableHead className="text-xs">{t("users.telegramId")}</TableHead>
                          <TableHead className="text-xs">{t("users.skipReason")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importResult.skipped.map((s, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-sm font-mono">{s.row}</TableCell>
                            <TableCell className="text-sm">{s.name || "-"}</TableCell>
                            <TableCell className="text-sm font-mono">{s.telegramId || "-"}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
                                {getSkipReasonLabel(s.reason)}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setImportResultOpen(false)}>{t("common.close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
