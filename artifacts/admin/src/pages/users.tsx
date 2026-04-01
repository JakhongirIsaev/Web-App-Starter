import { useState } from "react";
import { useListUsers, getListUsersQueryKey, useListBranches, getListBranchesQueryKey } from "@workspace/api-client-react";
import { Plus, Search, ShieldAlert, UserCheck, UserX } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { getRoleColor } from "@/components/layout";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function Users() {
  const [role, setRole] = useState<string>("all");
  const [branchId, setBranchId] = useState<string>("all");

  const { data: branches } = useListBranches({
    query: { queryKey: getListBranchesQueryKey() }
  });

  const { data: users, isLoading } = useListUsers(
    { 
      role: role !== "all" ? role : undefined,
      branchId: branchId !== "all" ? Number(branchId) : undefined
    },
    { 
      query: { 
        queryKey: getListUsersQueryKey({ 
          role: role !== "all" ? role : undefined,
          branchId: branchId !== "all" ? Number(branchId) : undefined
        }) 
      } 
    }
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Access Management</h2>
          <p className="text-muted-foreground mt-1">Control system access, roles, and permissions.</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Add User
        </Button>
      </div>

      <div className="bg-card border border-border/50 rounded-lg shadow-sm">
        <div className="p-4 border-b border-border/50 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search users..." 
              className="pl-9 max-w-md"
            />
          </div>
          <div className="flex gap-4">
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
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
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Branch" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Branches</SelectItem>
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
              ) : users?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    No users found matching your filters.
                  </TableCell>
                </TableRow>
              ) : (
                users?.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="font-medium text-foreground">{user.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Joined {format(new Date(user.createdAt), "MMM yyyy")}
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="bg-muted px-2 py-1 rounded text-xs">
                        {user.telegramId}
                      </code>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getRoleColor(user.role)}>
                        {user.role.replace(/_/g, ' ').toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.branch?.name || <span className="italic text-muted-foreground/50">HQ / All Branches</span>}
                    </TableCell>
                    <TableCell>
                      {user.isActive ? (
                        <div className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
                          <UserCheck className="h-4 w-4" /> Active
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400">
                          <UserX className="h-4 w-4" /> Inactive
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm">
                        Edit Access
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}