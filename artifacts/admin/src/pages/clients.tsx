import { useState } from "react";
import { useListClients, getListClientsQueryKey, useListBranches, getListBranchesQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Search, Download, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "wouter";

export function getStatusBadge(status: string) {
  switch (status) {
    case "draft": return <Badge variant="outline" className="bg-gray-500/10 text-gray-600 border-gray-500/20">Draft</Badge>;
    case "questionnaire": return <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20">Questionnaire</Badge>;
    case "recommendation": return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">Recommendation</Badge>;
    case "basket": return <Badge variant="outline" className="bg-purple-500/10 text-purple-600 border-purple-500/20">Basket</Badge>;
    case "pdf_generated": return <Badge variant="outline" className="bg-indigo-500/10 text-indigo-600 border-indigo-500/20">PDF Generated</Badge>;
    case "completed": return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">Completed</Badge>;
    case "rejected": return <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20">Rejected</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}

export default function Clients() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [branchId, setBranchId] = useState<string>("all");
  const [page, setPage] = useState(1);

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

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Clients</h2>
          <p className="text-muted-foreground mt-1">Manage and track all client applications across branches.</p>
        </div>
        <Button variant="outline" className="gap-2">
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      <div className="bg-card border border-border/50 rounded-lg shadow-sm">
        <div className="p-4 border-b border-border/50 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search clients by name or phone..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 max-w-md"
            />
          </div>
          <div className="flex gap-4">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="questionnaire">Questionnaire</SelectItem>
                <SelectItem value="recommendation">Recommendation</SelectItem>
                <SelectItem value="basket">Basket</SelectItem>
                <SelectItem value="pdf_generated">PDF Generated</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
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
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Action</TableHead>
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
                    No clients found matching your filters.
                  </TableCell>
                </TableRow>
              ) : (
                clientsData?.data.map((client) => (
                  <TableRow key={client.id} className="group">
                    <TableCell>
                      <div className="font-medium text-foreground">
                        {client.fullName || "Anonymous"}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {client.phone || "No phone"} • ID: {client.sessionId.substring(0,8)}...
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(client.status)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {client.branch?.name || "Unknown Branch"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {client.assignedTo?.name || "Unassigned"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(new Date(client.createdAt), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/clients/${client.id}`}>View</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination stub */}
        <div className="p-4 border-t border-border/50 flex items-center justify-between text-sm text-muted-foreground">
          <div>
            Showing {clientsData?.data.length || 0} of {clientsData?.total || 0} results
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
            >
              Previous
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              disabled={!clientsData || page * 20 >= clientsData.total}
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}