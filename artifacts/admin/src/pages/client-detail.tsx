import { useState } from "react";
import { useGetClient, getGetClientQueryKey, useUpdateClient, useListUsers, getListUsersQueryKey } from "@workspace/api-client-react";
import type { User } from "@workspace/api-client-react";
import { useRoute } from "wouter";
import { format } from "date-fns";
import { ArrowLeft, User as UserIcon, Phone, MapPin, Calendar, Activity, CheckCircle, FileText, Upload, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getStatusBadge } from "./clients";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

const adminRoles = ["superadmin", "head_office_admin", "editor"];

export default function ClientDetail({ params, user: currentUser }: { params: { id: string }; user?: { role: string } }) {
  const clientId = parseInt(params.id, 10);
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [reassignOpen, setReassignOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  const canManage = currentUser && adminRoles.includes(currentUser.role);
  
  const { data: client, isLoading } = useGetClient(clientId, {
    query: { queryKey: getGetClientQueryKey(clientId) }
  });

  const { data: allUsers } = useListUsers(
    {},
    { query: { queryKey: getListUsersQueryKey({}), enabled: reassignOpen } }
  );

  const updateClient = useUpdateClient();

  const handleStatusChange = (newStatus: any) => {
    updateClient.mutate({
      id: clientId,
      data: { status: newStatus }
    }, {
      onSuccess: () => {
        toast({
          title: t("clientDetail.statusUpdated"),
          description: t("clientDetail.statusChangedTo", { status: t(`statuses.${newStatus}`) }),
        });
        queryClient.invalidateQueries({ queryKey: getGetClientQueryKey(clientId) });
      },
      onError: (error: any) => {
        toast({
          variant: "destructive",
          title: t("clientDetail.failedToUpdateStatus"),
          description: error.message || t("common.error")
        });
      }
    });
  };

  const handleReassign = () => {
    if (!selectedUserId) return;
    updateClient.mutate({
      id: clientId,
      data: { assignedToId: parseInt(selectedUserId, 10) }
    }, {
      onSuccess: () => {
        toast({ title: t("clientDetail.clientReassigned") });
        queryClient.invalidateQueries({ queryKey: getGetClientQueryKey(clientId) });
        setReassignOpen(false);
        setSelectedUserId("");
      },
      onError: (error: any) => {
        toast({ variant: "destructive", title: t("clientDetail.failedToReassign"), description: error.message || t("common.error") });
      }
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div><Skeleton className="h-8 w-48 mb-2" /><Skeleton className="h-4 w-32" /></div>
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
        <h2 className="text-2xl font-bold text-foreground">{t("clientDetail.clientNotFound")}</h2>
        <Button asChild variant="outline">
          <Link href="/clients">{t("clientDetail.backToClients")}</Link>
        </Button>
      </div>
    );
  }

  const hunters = (allUsers || []).filter((u: any) => u.isActive);

  const pipelineSteps = [
    { id: 'draft', label: t("statuses.draft") },
    { id: 'questionnaire', label: t("statuses.questionnaire") },
    { id: 'recommendation', label: t("statuses.recommendation") },
    { id: 'basket', label: t("statuses.basket") },
    { id: 'pdf_generated', label: t("statuses.pdf_generated") },
    { id: 'completed', label: t("statuses.completed") }
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild className="h-10 w-10 shrink-0 border border-border/50 bg-card hover:bg-accent hover:text-accent-foreground">
            <Link href="/clients"><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-bold tracking-tight text-foreground">
                {client.fullName || t("clients.anonymous")}
              </h2>
              {getStatusBadge(client.status, t)}
            </div>
            <p className="text-muted-foreground mt-1 font-mono text-sm">ID: {client.sessionId}</p>
          </div>
        </div>
        
        {canManage && (
          <div className="flex items-center gap-3">
            <Select value={client.status} onValueChange={handleStatusChange} disabled={updateClient.isPending}>
              <SelectTrigger className="w-[180px] bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">{t("statuses.draft")}</SelectItem>
                <SelectItem value="questionnaire">{t("statuses.questionnaire")}</SelectItem>
                <SelectItem value="recommendation">{t("statuses.recommendation")}</SelectItem>
                <SelectItem value="basket">{t("statuses.basket")}</SelectItem>
                <SelectItem value="pdf_generated">{t("statuses.pdf_generated")}</SelectItem>
                <SelectItem value="completed">{t("statuses.completed")}</SelectItem>
                <SelectItem value="rejected">{t("statuses.rejected")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <Card className="shadow-sm border-border/50">
            <CardHeader>
              <CardTitle>{t("clientDetail.clientDetails")}</CardTitle>
              <CardDescription>{t("clientDetail.clientDetailsDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                <div className="flex items-start gap-3">
                  <UserIcon className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground">{t("clientDetail.fullName")}</dt>
                    <dd className="text-base text-foreground mt-1">{client.fullName || t("clientDetail.notProvided")}</dd>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Phone className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground">{t("clientDetail.phone")}</dt>
                    <dd className="text-base text-foreground mt-1">{client.phone || t("clientDetail.notProvided")}</dd>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground">{t("clientDetail.branchLabel")}</dt>
                    <dd className="text-base text-foreground mt-1">{client.branch?.name || t("clients.unassigned")}</dd>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground">{t("clientDetail.createdDate")}</dt>
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
                  <CardTitle>{t("clientDetail.documents")}</CardTitle>
                  <CardDescription>{t("clientDetail.documentsDesc")}</CardDescription>
                </div>
                {canManage && (
                  <Button variant="outline" size="sm" className="gap-2">
                    <Upload className="h-4 w-4" />
                    {t("clientDetail.uploadDocument")}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="border border-dashed border-border rounded-lg p-8 text-center text-muted-foreground">
                <FileText className="mx-auto h-12 w-12 text-muted-foreground/50 mb-3" />
                <p>{t("clientDetail.noDocuments")}</p>
                <p className="text-sm mt-1">{t("clientDetail.noDocumentsHint")}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="shadow-sm border-border/50 bg-primary/5 border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                {t("clientDetail.assignment")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{t("clientDetail.assignedHunter")}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <div className="h-10 w-10 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold">
                      {client.assignedTo?.name?.substring(0, 2).toUpperCase() || "?"}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{client.assignedTo?.name || t("clients.unassigned")}</p>
                      <p className="text-xs text-muted-foreground">{client.assignedTo?.role ? t(`roles.${client.assignedTo.role}`) : ""}</p>
                    </div>
                  </div>
                </div>
                {canManage && (
                  <Button variant="outline" className="w-full gap-2" onClick={() => setReassignOpen(true)}>
                    <UserPlus className="h-4 w-4" />
                    {t("clientDetail.reassignClient")}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-border/50">
            <CardHeader>
              <CardTitle>{t("clientDetail.pipelineProgress")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {pipelineSteps.map((step) => {
                  const statuses = ['draft', 'questionnaire', 'recommendation', 'basket', 'pdf_generated', 'completed', 'rejected'];
                  const currentIndex = statuses.indexOf(client.status);
                  const stepIndex = statuses.indexOf(step.id);
                  const isCompleted = stepIndex <= currentIndex && client.status !== 'rejected';
                  const isCurrent = stepIndex === currentIndex && client.status !== 'rejected';
                  
                  return (
                    <div key={step.id} className="flex items-center gap-3">
                      <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 shrink-0 ${isCompleted ? 'border-primary text-primary bg-primary/10' : 'border-muted-foreground/30 text-muted-foreground/30'} ${isCurrent ? 'ring-2 ring-primary/20' : ''}`}>
                        {isCompleted ? <CheckCircle className="h-4 w-4" /> : <div className="h-2 w-2 rounded-full bg-current" />}
                      </div>
                      <span className={`text-sm ${isCurrent ? 'font-semibold text-foreground' : isCompleted ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {step.label}
                      </span>
                    </div>
                  );
                })}
                {client.status === 'rejected' && (
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full border-2 border-destructive text-destructive bg-destructive/10 ring-2 ring-destructive/20 shrink-0">
                      <div className="h-2 w-2 rounded-full bg-current" />
                    </div>
                    <span className="text-sm font-semibold text-destructive">{t("statuses.rejected")}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={reassignOpen} onOpenChange={setReassignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("clientDetail.reassignTitle")}</DialogTitle>
            <DialogDescription>{t("clientDetail.reassignDesc")}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger><SelectValue placeholder={t("clientDetail.selectHunter")} /></SelectTrigger>
              <SelectContent>
                {hunters.map((u: any) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.name} {u.branch ? `(${u.branch.name})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReassignOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleReassign} disabled={!selectedUserId || updateClient.isPending}>
              {updateClient.isPending ? t("clientDetail.reassigning") : t("clientDetail.reassign")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
