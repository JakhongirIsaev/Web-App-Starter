import { useState, useRef } from "react";
import {
  useListUsers, getListUsersQueryKey, useListBranches, getListBranchesQueryKey,
  useCreateUser, useUpdateUser, useActivateUser, useDeactivateUser
} from "@workspace/api-client-react";
import type { User } from "@workspace/api-client-react";
import { Plus, Search, UserCheck, UserX, Download, Upload, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react";
import { format } from "date-fns";
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
import { downloadCsv } from "@/lib/csv";
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

interface ImportResult {
  imported: number;
  skipped: { row: number; name: string; reason: string }[];
  created: { name: string; telegramId: string; role: string; branch: string; password: string }[];
}

const emptyForm: UserForm = { telegramId: "", name: "", role: "branch_head", branchId: "", password: "" };

export default function Users() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [role, setRole] = useState<string>("all");
  const [branchId, setBranchId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const importRef = useRef<HTMLInputElement>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);

  const [importResultOpen, setImportResultOpen] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importLoading, setImportLoading] = useState(false);

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
    downloadCsv(rows, `users_${format(new Date(), "yyyy-MM-dd")}.csv`);
    toast({ title: t("common.exportSuccess") });
  };

  const handleDownloadTemplate = async () => {
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`${import.meta.env.BASE_URL}api/users/import-template`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "import_template.xlsx";
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: t("users.templateDownloaded") });
    } catch (err: any) {
      toast({ variant: "destructive", title: t("common.error"), description: err.message });
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportLoading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`${import.meta.env.BASE_URL}api/users/import`, {
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
      setImportLoading(false);
      if (importRef.current) importRef.current.value = "";
    }
  };

  const downloadCredentials = () => {
    if (!importResult?.created?.length) return;
    const rows = importResult.created.map(c => ({
      name: c.name,
      telegramId: c.telegramId,
      role: c.role,
      branch: c.branch,
      password: c.password,
    }));
    downloadCsv(rows, `credentials_${format(new Date(), "yyyy-MM-dd_HH-mm")}.csv`);
    toast({ title: t("users.credentialsDownloaded") });
  };

  const isPending = createUser.isPending || updateUser.isPending;
  const filteredUsers = (users || []).filter(u => !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.telegramId.includes(search));

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t("users.title")}</h2>
          <p className="text-muted-foreground mt-1">{t("users.subtitle")}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input type="file" ref={importRef} accept=".xlsx,.xls,.csv" onChange={handleImport} className="hidden" />
          <Button variant="outline" className="gap-2" onClick={handleDownloadTemplate}>
            <FileSpreadsheet className="h-4 w-4" />
            {t("users.downloadTemplate")}
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => importRef.current?.click()} disabled={importLoading}>
            <Upload className="h-4 w-4" />
            {importLoading ? t("common.loading") : t("users.importExcel")}
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
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("users.allBranches")}</SelectItem>
                {branches?.map(b => (<SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
        </div>

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
                      <div className="text-xs text-muted-foreground mt-0.5">{t("users.joined", { date: format(new Date(user.createdAt), "MMM yyyy") })}</div>
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

      <Dialog open={importResultOpen} onOpenChange={setImportResultOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("users.importResults")}</DialogTitle>
            <DialogDescription>{t("users.importResultsDesc")}</DialogDescription>
          </DialogHeader>
          {importResult && (
            <div className="space-y-4 py-2">
              <div className="flex gap-4">
                <div className="flex items-center gap-2 bg-green-50 dark:bg-green-950/30 px-4 py-2 rounded-lg">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <div>
                    <div className="text-sm font-medium text-green-700 dark:text-green-400">{t("users.importCreated")}</div>
                    <div className="text-2xl font-bold text-green-700 dark:text-green-400">{importResult.imported}</div>
                  </div>
                </div>
                {importResult.skipped.length > 0 && (
                  <div className="flex items-center gap-2 bg-yellow-50 dark:bg-yellow-950/30 px-4 py-2 rounded-lg">
                    <AlertCircle className="h-5 w-5 text-yellow-600" />
                    <div>
                      <div className="text-sm font-medium text-yellow-700 dark:text-yellow-400">{t("users.importSkipped")}</div>
                      <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">{importResult.skipped.length}</div>
                    </div>
                  </div>
                )}
              </div>

              {importResult.created.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium">{t("users.createdUsers")}</h4>
                    <Button variant="outline" size="sm" className="gap-2" onClick={downloadCredentials}>
                      <Download className="h-3 w-3" />
                      {t("users.downloadCredentials")}
                    </Button>
                  </div>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("users.fullName")}</TableHead>
                          <TableHead>{t("users.telegramId")}</TableHead>
                          <TableHead>{t("users.role")}</TableHead>
                          <TableHead>{t("users.passwordLabel")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importResult.created.map((c, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium">{c.name}</TableCell>
                            <TableCell><code className="bg-muted px-1.5 py-0.5 rounded text-xs">{c.telegramId}</code></TableCell>
                            <TableCell>{c.role}</TableCell>
                            <TableCell><code className="bg-muted px-1.5 py-0.5 rounded text-xs">{c.password}</code></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {importResult.skipped.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">{t("users.skippedRows")}</h4>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("users.rowNumber")}</TableHead>
                          <TableHead>{t("users.fullName")}</TableHead>
                          <TableHead>{t("users.reason")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importResult.skipped.map((s, i) => (
                          <TableRow key={i}>
                            <TableCell>{s.row}</TableCell>
                            <TableCell>{s.name}</TableCell>
                            <TableCell className="text-yellow-600 dark:text-yellow-400">{s.reason}</TableCell>
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
