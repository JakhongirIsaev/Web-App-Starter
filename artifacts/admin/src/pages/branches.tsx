import { useListBranches, getListBranchesQueryKey } from "@workspace/api-client-react";
import { Plus, Building2, MapPin, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Branches() {
  const { data: branches, isLoading } = useListBranches({
    query: { queryKey: getListBranchesQueryKey() }
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Branches</h2>
          <p className="text-muted-foreground mt-1">Manage physical locations and branch operations.</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Add Branch
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="shadow-sm border-border/50">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-6 w-3/4 mt-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-1/2 mb-4" />
                <div className="pt-4 border-t border-border/50 flex gap-4">
                  <Skeleton className="h-4 w-1/3" />
                </div>
              </CardContent>
            </Card>
          ))
        ) : branches?.length === 0 ? (
          <div className="col-span-full py-12 text-center text-muted-foreground border-2 border-dashed border-border rounded-lg">
            <Building2 className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium text-foreground">No branches found</h3>
            <p>Add your first branch to start operating.</p>
            <Button className="mt-4" variant="outline">Add Branch</Button>
          </div>
        ) : (
          branches?.map((branch) => (
            <Card key={branch.id} className="shadow-sm border-border/50 hover:border-primary/50 transition-colors group">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    <Building2 className="h-5 w-5" />
                  </div>
                  {branch.isActive ? (
                    <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">Active</Badge>
                  ) : (
                    <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20">Closed</Badge>
                  )}
                </div>
                <CardTitle className="mt-4 text-xl">{branch.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                  <MapPin className="h-4 w-4" />
                  {branch.city}
                </div>
                
                <div className="pt-4 border-t border-border/50 flex justify-between items-center">
                  <Button variant="ghost" size="sm" className="h-8 px-2 -ml-2 text-primary hover:text-primary hover:bg-primary/10">
                    Edit Details
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}