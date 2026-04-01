import { useState } from "react";
import {
  useListUsers, getListUsersQueryKey, useListBranches, getListBranchesQueryKey,
  useCreateUser, useUpdateUser, useActivateUser, useDeactivateUser
} from "@workspace/api-client-react";
import type { User } from "@workspace/api-client-react";
import { Plus, Search, UserCheck, UserX } from "lucide-react";
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

const emptyForm: UserForm = { telegramId: "", name: "", role: "hunter", branchId: "", password: "" };

export default function Users() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [role, setRole] = useState<string>("all");
  const [branchId, setBranchId] = useState<string>("all");
  const [search, setSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);

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

  const openCreate = () => {
    setEditUser(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

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
        onSuccess: () => { toast({ title: "User updated" }); setDialogOpen(false); invalidate(); },
        onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
      });
    } else {
      if (!form.password) { toast({ variant: "destructive", title: "Password required" }); return; }
      const data: any = { telegramId: form.telegramId, name: form.name, role: form.role, password: form.password };
      if (form.branchId) data.branchId = Number(form.branchId);
      createUser.mutate({ data }, {
        onSuccess: () => { toast({ title: "User created" }); setDialogOpen(false); invalidate(); },
        onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
      });
    }
  };

  const toggleActive = (user: User) => {
    const mutation = user.isActive ? deactivateUser : activateUser;
    mutation.mutate({ id: user.id }, {
      onSuccess: () => { toast({ title: user.isActive ? "User deactivated" : "User activated" }); invalidate(); },
      onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
    });
  };

  const isPending = createUser.isPending || updateUser.isPending;
  const filteredUsers = (users || []).filter(u => !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.telegramId.includes(search));

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Access Management</h2>
          <p className="text-muted-foreground mt-1">Control system access, roles, and permissions.</p>
        </div>
        <Button className="gap-2" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Add User
        </Button>
      </div>

      <div className="bg-card border border-border/50 rounded-lg shadow-sm">
        <div className="p-4 border-b border-border/50 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search users..." className="pl-9 max-w-md" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-4">
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Role" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="superadmin">Super Admin</SelectItem>
                <SelectItem value="head_office_admin">Head Office Admin</SelectItem>
                <SelectItem value="editor">Editor</SelectItem>
                <SelectItem value="branch_head">Branch Head</SelectItem>
                <SelectItem value="hunter">Hunter</SelectItem>
              </SelectContent>
            </Select>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Branch" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Branches</SelectItem>
                {branches?.map(b => (<SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="relative w-full overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>User</TableHead>
                <TableHead>Telegram ID</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
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
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">No users found matching your filters.</TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="font-medium text-foreground">{user.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">Joined {format(new Date(user.createdAt), "MMM yyyy")}</div>
                    </TableCell>
                    <TableCell><code className="bg-muted px-2 py-1 rounded text-xs">{user.telegramId}</code></TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getRoleColor(user.role)}>{user.role.replace(/_/g, ' ').toUpperCase()}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.branch?.name || <span className="italic text-muted-foreground/50">HQ / All Branches</span>}
                    </TableCell>
                    <TableCell>
                      {user.isActive
                        ? <div className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400"><UserCheck className="h-4 w-4" /> Active</div>
                        : <div className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400"><UserX className="h-4 w-4" /> Inactive</div>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(user)}>Edit</Button>
                        <Button variant="ghost" size="sm" className={user.isActive ? "text-red-600 hover:text-red-700 hover:bg-red-50" : "text-green-600 hover:text-green-700 hover:bg-green-50"} onClick={() => toggleActive(user)}>
                          {user.isActive ? "Deactivate" : "Activate"}
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
            <DialogTitle>{editUser ? "Edit User" : "Add User"}</DialogTitle>
            <DialogDescription>{editUser ? "Update user details and access." : "Register a new user with their Telegram ID."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" />
              </div>
              <div className="space-y-2">
                <Label>Telegram ID</Label>
                <Input value={form.telegramId} onChange={e => setForm(f => ({ ...f, telegramId: e.target.value }))} placeholder="e.g. 100000001" disabled={!!editUser} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="superadmin">Super Admin</SelectItem>
                    <SelectItem value="head_office_admin">Head Office Admin</SelectItem>
                    <SelectItem value="editor">Editor</SelectItem>
                    <SelectItem value="branch_head">Branch Head</SelectItem>
                    <SelectItem value="hunter">Hunter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Branch</Label>
                <Select value={form.branchId || "none"} onValueChange={v => setForm(f => ({ ...f, branchId: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">HQ / All Branches</SelectItem>
                    {branches?.map(b => (<SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{editUser ? "New Password (leave blank to keep current)" : "Password"}</Label>
              <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder={editUser ? "Leave blank to keep current" : "Set password"} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={isPending || !form.name.trim() || !form.telegramId.trim()}>
              {isPending ? "Saving..." : editUser ? "Save Changes" : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
