import { useGetClient, getGetClientQueryKey, useUpdateClient } from "@workspace/api-client-react";
import { useRoute } from "wouter";
import { format } from "date-fns";
import { ArrowLeft, User, Phone, MapPin, Calendar, Activity, CheckCircle, FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getStatusBadge } from "./clients";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function ClientDetail({ params }: { params: { id: string } }) {
  const clientId = parseInt(params.id, 10);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: client, isLoading } = useGetClient(clientId, {
    query: { queryKey: getGetClientQueryKey(clientId) }
  });

  const updateClient = useUpdateClient();

  const handleStatusChange = (newStatus: any) => {
    updateClient.mutate({
      id: clientId,
      data: { status: newStatus }
    }, {
      onSuccess: () => {
        toast({
          title: "Status updated",
          description: `Client status changed to ${newStatus.replace(/_/g, ' ')}`,
        });
        queryClient.invalidateQueries({ queryKey: getGetClientQueryKey(clientId) });
      },
      onError: (error: any) => {
        toast({
          variant: "destructive",
          title: "Failed to update status",
          description: error.message || "An error occurred"
        });
      }
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="md:col-span-2"><Skeleton className="h-64 w-full" /></Card>
          <Card><Skeleton className="h-64 w-full" /></Card>
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <h2 className="text-2xl font-bold text-foreground">Client not found</h2>
        <Button asChild variant="outline">
          <Link href="/clients">Back to Clients</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild className="h-10 w-10 shrink-0 border border-border/50 bg-card hover:bg-accent hover:text-accent-foreground">
            <Link href="/clients">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-bold tracking-tight text-foreground">
                {client.fullName || "Anonymous Client"}
              </h2>
              {getStatusBadge(client.status)}
            </div>
            <p className="text-muted-foreground mt-1 font-mono text-sm">
              ID: {client.sessionId}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Select 
            value={client.status} 
            onValueChange={handleStatusChange}
            disabled={updateClient.isPending}
          >
            <SelectTrigger className="w-[180px] bg-card">
              <SelectValue placeholder="Update Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="questionnaire">Questionnaire</SelectItem>
              <SelectItem value="recommendation">Recommendation</SelectItem>
              <SelectItem value="basket">Basket</SelectItem>
              <SelectItem value="pdf_generated">PDF Generated</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <Card className="shadow-sm border-border/50">
            <CardHeader>
              <CardTitle>Client Details</CardTitle>
              <CardDescription>Personal information and contact details.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                <div className="flex items-start gap-3">
                  <User className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground">Full Name</dt>
                    <dd className="text-base text-foreground mt-1">{client.fullName || "Not provided"}</dd>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Phone className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground">Phone Number</dt>
                    <dd className="text-base text-foreground mt-1">{client.phone || "Not provided"}</dd>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground">Branch</dt>
                    <dd className="text-base text-foreground mt-1">{client.branch?.name || "Unassigned"}</dd>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground">Created Date</dt>
                    <dd className="text-base text-foreground mt-1">{format(new Date(client.createdAt), 'MMMM d, yyyy')}</dd>
                  </div>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-border/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Documents</CardTitle>
                  <CardDescription>Generated proposals and related files.</CardDescription>
                </div>
                <Button variant="outline" size="sm" className="gap-2">
                  <Upload className="h-4 w-4" />
                  Upload Document
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="border border-dashed border-border rounded-lg p-8 text-center text-muted-foreground">
                <FileText className="mx-auto h-12 w-12 text-muted-foreground/50 mb-3" />
                <p>No documents generated yet.</p>
                <p className="text-sm mt-1">Status must be PDF Generated or higher to view the system proposal.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="shadow-sm border-border/50 bg-primary/5 border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Assignment
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Assigned Hunter</p>
                  <div className="flex items-center gap-3 mt-2">
                    <div className="h-10 w-10 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold">
                      {client.assignedTo?.name?.substring(0, 2).toUpperCase() || "?"}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{client.assignedTo?.name || "Unassigned"}</p>
                      <p className="text-xs text-muted-foreground">{client.assignedTo?.role.replace(/_/g, ' ') || ""}</p>
                    </div>
                  </div>
                </div>
                <Button variant="outline" className="w-full">Reassign Client</Button>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-border/50">
            <CardHeader>
              <CardTitle>Pipeline Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
                {[
                  { id: 'draft', label: 'Draft' },
                  { id: 'questionnaire', label: 'Questionnaire' },
                  { id: 'recommendation', label: 'Recommendation' },
                  { id: 'basket', label: 'Basket' },
                  { id: 'pdf_generated', label: 'PDF Generated' },
                  { id: 'completed', label: 'Completed' }
                ].map((step, index, array) => {
                  const statuses = ['draft', 'questionnaire', 'recommendation', 'basket', 'pdf_generated', 'completed', 'rejected'];
                  const currentIndex = statuses.indexOf(client.status);
                  const stepIndex = statuses.indexOf(step.id);
                  
                  const isCompleted = stepIndex <= currentIndex && client.status !== 'rejected';
                  const isCurrent = stepIndex === currentIndex && client.status !== 'rejected';
                  
                  return (
                    <div key={step.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full border-2 bg-card shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm relative z-10 
                        {isCompleted ? 'border-primary text-primary' : 'border-muted-foreground/30 text-muted-foreground/30'}
                        {isCurrent ? 'ring-4 ring-primary/20' : ''}"
                        style={{
                          borderColor: isCompleted ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground) / 0.3)',
                          color: isCompleted ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground) / 0.3)',
                        }}
                      >
                        {isCompleted ? <CheckCircle className="h-5 w-5" /> : <div className="h-2.5 w-2.5 rounded-full bg-current" />}
                      </div>
                      <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] px-4 py-3 rounded-lg border shadow-sm flex flex-col bg-card
                        {isCurrent ? 'border-primary/50 bg-primary/5' : 'border-border/50'}"
                        style={{
                          borderColor: isCurrent ? 'hsl(var(--primary) / 0.5)' : 'hsl(var(--border) / 0.5)',
                        }}
                      >
                        <h3 className="font-semibold text-sm">{step.label}</h3>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}