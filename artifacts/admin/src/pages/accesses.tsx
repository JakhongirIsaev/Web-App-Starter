import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useListBranches,
  getListBranchesQueryKey,
  useListUsers,
  getListUsersQueryKey,
  type User,
  type Branch,
} from "@workspace/api-client-react";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  MapPin,
  UserCheck,
  UserX,
  ShieldCheck,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getRoleColor } from "@/components/layout";

interface BranchGroup {
  id: number | null; // null = no branch assignment (HQ-level staff without branch)
  name: string;
  city: string | null;
  isActive: boolean;
  users: User[];
}

function buildGroups(branches: Branch[] | undefined, users: User[] | undefined, t: (k: string) => string): BranchGroup[] {
  if (!branches || !users) return [];

  const groups: BranchGroup[] = branches.map((b) => ({
    id: b.id,
    name: b.name,
    city: b.city,
    isActive: b.isActive,
    users: users.filter((u) => u.branchId === b.id),
  }));

  const orphans = users.filter((u) => !u.branchId);
  if (orphans.length > 0) {
    groups.unshift({
      id: null,
      name: t("accesses.unassigned"),
      city: null,
      isActive: true,
      users: orphans,
    });
  }

  return groups;
}

export default function Accesses() {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<Set<number | string>>(new Set());
  const [search, setSearch] = useState("");

  const { data: branches, isLoading: branchesLoading } = useListBranches({ query: { queryKey: getListBranchesQueryKey() } });
  const { data: users, isLoading: usersLoading } = useListUsers({ query: { queryKey: getListUsersQueryKey() } });

  const isLoading = branchesLoading || usersLoading;

  const term = search.trim().toLowerCase();
  const matchesSearch = (user: User, branch: BranchGroup) => {
    if (!term) return true;
    return (
      user.name.toLowerCase().includes(term) ||
      user.telegramId.toLowerCase().includes(term) ||
      user.role.toLowerCase().includes(term) ||
      branch.name.toLowerCase().includes(term) ||
      (branch.city ?? "").toLowerCase().includes(term)
    );
  };

  const groups = buildGroups(branches, users, t)
    .map((group) => ({ ...group, users: group.users.filter((u) => matchesSearch(u, group)) }))
    .filter((group) => !term || group.users.length > 0);

  const toggle = (key: number | string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const totalStaff = users?.length ?? 0;
  const activeStaff = users?.filter((u) => u.isActive).length ?? 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t("accesses.title")}</h2>
          <p className="text-muted-foreground mt-1">{t("accesses.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4" />
          <span>
            {totalStaff} {t("accesses.staff")} · {activeStaff} {t("common.active").toLowerCase()}
          </span>
        </div>
      </div>

      <div className="bg-card border border-border/50 rounded-lg shadow-sm">
        <div className="p-4 border-b border-border/50">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("accesses.searchPlaceholder")}
              className="pl-9 max-w-md"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="p-6 space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <Card className="m-6 border-dashed">
            <CardContent className="py-12 text-center text-muted-foreground">
              <Building2 className="mx-auto h-12 w-12 text-muted-foreground/40 mb-4" />
              <p>{t("accesses.empty")}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="divide-y divide-border/50">
            {groups.map((group) => {
              const key = group.id ?? "orphans";
              const isExpanded = expanded.has(key);
              const activeCount = group.users.filter((u) => u.isActive).length;
              return (
                <div key={key}>
                  <button
                    type="button"
                    onClick={() => toggle(key)}
                    className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground">{group.name}</span>
                        {group.city && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3" />
                            {group.city}
                          </span>
                        )}
                        {group.id !== null && !group.isActive && (
                          <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20">
                            {t("branches.closed")}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {group.users.length} {t("accesses.staff")} · {activeCount} {t("common.active").toLowerCase()}
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {group.users.length}
                    </Badge>
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                  {isExpanded && (
                    <div className="bg-muted/20 border-t border-border/30">
                      {group.users.length === 0 ? (
                        <div className="px-6 py-8 text-center text-sm text-muted-foreground">
                          {t("accesses.noStaff")}
                        </div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow className="hover:bg-transparent">
                              <TableHead>{t("accesses.name")}</TableHead>
                              <TableHead>{t("accesses.contact")}</TableHead>
                              <TableHead>{t("accesses.role")}</TableHead>
                              <TableHead>{t("common.status")}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.users.map((user) => (
                              <TableRow key={user.id}>
                                <TableCell className="font-medium">{user.name}</TableCell>
                                <TableCell>
                                  <code className="bg-muted px-2 py-1 rounded text-xs">{user.telegramId}</code>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={getRoleColor(user.role)}>
                                    {t(`roles.${user.role}`)}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {user.isActive ? (
                                    <div className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
                                      <UserCheck className="h-4 w-4" /> {t("common.active")}
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400">
                                      <UserX className="h-4 w-4" /> {t("common.inactive")}
                                    </div>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
