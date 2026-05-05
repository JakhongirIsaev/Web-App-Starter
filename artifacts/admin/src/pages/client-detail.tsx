import { useState } from "react";
import { useGetClient, getGetClientQueryKey, useUpdateClient, useListUsers, getListUsersQueryKey } from "@workspace/api-client-react";
import type { User } from "@workspace/api-client-react";
import { useRoute } from "wouter";
import { ArrowLeft, User as UserIcon, Phone, MapPin, Calendar, Activity, CheckCircle, FileText, Upload, UserPlus, ClipboardList, Sparkles, FileImage, Calculator, CreditCard, Pencil, Briefcase, VenetianMask, Mars, Venus, Eye } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getStatusBadge, GenderBadge } from "./clients";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { buildApiUrl, getSignedImageUrl } from "@/lib/api";
import { Coins } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatAdminLongDate } from "@/lib/time";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { buildAuthHeaders } from "@/lib/auth-headers";

const adminRoles = ["superadmin", "head_office_admin", "editor"];

const QUESTION_LABEL_KEYS: Record<string, string> = {
  business_type: "clientDetail.questionBusinessType",
  business_size: "clientDetail.questionBusinessSize",
  need_type: "clientDetail.questionNeedType",
  loan_purpose: "clientDetail.questionLoanPurpose",
  desired_amount: "clientDetail.questionDesiredAmount",
  desired_term: "clientDetail.questionDesiredTerm",
  preferred_currency: "clientDetail.questionCurrency",
  monthly_payment_comfort: "clientDetail.questionComfortPayment",
  repayment_preference: "clientDetail.questionRepaymentType",
  service_goal: "clientDetail.questionServiceGoal",
  monthly_turnover_band: "clientDetail.questionMonthlyTurnover",
  has_pos_need: "clientDetail.questionPosNeeded",
  foreign_payments_need: "clientDetail.questionIntlPayments",
};

function fmtNum(val: string | number | null | undefined): string {
  if (!val) return "—";
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n)) return String(val);
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

export default function ClientDetail({ params, user: currentUser }: { params: { id: string }; user?: { role: string } }) {
  const clientId = parseInt(params.id, 10);
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [reassignOpen, setReassignOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [editClientOpen, setEditClientOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    fullName: "",
    phone: "",
    gender: "" as "" | "male" | "female",
    clientType: "" as "" | "individual" | "corporate",
    clientSegment: "",
  });
  const lang = i18n.language === "ru" ? "ru" : "uz";

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

  const openEditClient = () => {
    if (!client) return;
    setEditForm({
      fullName: client.fullName ?? "",
      phone: client.phone ?? "",
      gender: (client.gender as "male" | "female" | null) ?? "",
      clientType: (client.clientType as "individual" | "corporate" | null) ?? "",
      clientSegment: client.clientSegment ?? "",
    });
    setEditClientOpen(true);
  };

  const handleSaveClient = () => {
    updateClient.mutate(
      {
        id: clientId,
        data: {
          fullName: editForm.fullName.trim() || null,
          phone: editForm.phone.trim() || null,
          gender: editForm.gender || null,
          clientType: editForm.clientType || null,
          clientSegment: editForm.clientSegment.trim() || null,
        } as any,
      },
      {
        onSuccess: () => {
          toast({ title: t("clientDetail.clientUpdated") });
          setEditClientOpen(false);
          queryClient.invalidateQueries({ queryKey: getGetClientQueryKey(clientId) });
        },
        onError: (error: any) => {
          toast({
            variant: "destructive",
            title: t("clientDetail.failedToUpdate"),
            description: error.message || t("common.error"),
          });
        },
      },
    );
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
  const questionnaireAnswers: Array<{ questionKey: string; answer: string }> = (client as any).questionnaireAnswers || [];
  const documents: Array<any> = (client as any).documents || [];
  const calculations: Array<any> = (client as any).calculations || [];

  const pipelineSteps = [
    { id: 'draft', label: t("statuses.draft") },
    { id: 'lead', label: t("statuses.lead") },
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
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-3xl font-bold tracking-tight text-foreground">
                {client.fullName || t("clients.anonymous")}
              </h2>
              {getStatusBadge(client.status, t)}
              <GenderBadge gender={client.gender} t={t} />
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
                <SelectItem value="lead">{t("statuses.lead")}</SelectItem>
                <SelectItem value="recommendation">{t("statuses.recommendation")}</SelectItem>
                <SelectItem value="basket">{t("statuses.basket")}</SelectItem>
                <SelectItem value="pdf_generated">{t("statuses.pdf_generated")}</SelectItem>
                <SelectItem value="under_review">{t("statuses.under_review")}</SelectItem>
                <SelectItem value="approved">{t("statuses.approved")}</SelectItem>
                <SelectItem value="completed">{t("statuses.completed")}</SelectItem>
                <SelectItem value="rejected">{t("statuses.rejected")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          {/* Client details card */}
          <Card className="shadow-sm border-border/50">
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>{t("clientDetail.clientDetails")}</CardTitle>
                <CardDescription>{t("clientDetail.clientDetailsDesc")}</CardDescription>
              </div>
              {canManage && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={openEditClient}>
                  <Pencil className="h-3.5 w-3.5" />
                  {t("common.edit")}
                </Button>
              )}
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
                  {client.gender === "male" ? (
                    <Mars className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "#3B82F6" }} />
                  ) : client.gender === "female" ? (
                    <Venus className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "#EC4899" }} />
                  ) : (
                    <VenetianMask className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                  )}
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground">{t("clientDetail.gender")}</dt>
                    <dd className="text-base text-foreground mt-1">
                      {client.gender === "male"
                        ? t("clientDetail.genderMale")
                        : client.gender === "female"
                          ? t("clientDetail.genderFemale")
                          : t("clientDetail.notProvided")}
                    </dd>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Briefcase className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground">{t("clientDetail.clientType")}</dt>
                    <dd className="text-base text-foreground mt-1">
                      {client.clientType === "individual"
                        ? t("clientDetail.clientTypeIndividual")
                        : client.clientType === "corporate"
                          ? t("clientDetail.clientTypeCorporate")
                          : t("clientDetail.notProvided")}
                    </dd>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Sparkles className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground">{t("clientDetail.clientSegment")}</dt>
                    <dd className="text-base text-foreground mt-1">{client.clientSegment || t("clientDetail.notProvided")}</dd>
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
                    <dd className="text-base text-foreground mt-1">{formatAdminLongDate(client.createdAt)}</dd>
                  </div>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* Questionnaire Answers */}
          {questionnaireAnswers.length > 0 && (
            <Card className="shadow-sm border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-primary" />
                  {t("clientDetail.questionnaireTitle")}
                </CardTitle>
                <CardDescription>{t("clientDetail.questionnaireDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {questionnaireAnswers.map((qa) => (
                    <div key={qa.questionKey} className="flex flex-col p-3 rounded-lg bg-muted/50 border border-border/30">
                      <span className="text-xs font-medium text-muted-foreground">
                        {t(QUESTION_LABEL_KEYS[qa.questionKey] || qa.questionKey, qa.questionKey)}
                      </span>
                      <span className="text-sm font-semibold text-foreground mt-0.5">
                        {qa.answer}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Documents */}
          <Card className="shadow-sm border-border/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FileImage className="h-5 w-5" />
                    {t("clientDetail.documents")}
                  </CardTitle>
                  <CardDescription>{t("clientDetail.documentsDesc")}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {documents.length === 0 ? (
                <div className="border border-dashed border-border rounded-lg p-8 text-center text-muted-foreground">
                  <FileText className="mx-auto h-12 w-12 text-muted-foreground/50 mb-3" />
                  <p>{t("clientDetail.noDocuments")}</p>
                  <p className="text-sm mt-1">{t("clientDetail.noDocumentsHint")}</p>
                </div>
              ) : (
                <DocumentsList documents={documents} t={t} />
              )}
            </CardContent>
          </Card>

          {/* Calculations */}
          {calculations.length > 0 && (
            <Card className="shadow-sm border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="h-5 w-5 text-green-600" />
                  {t("clientDetail.calculationsTitle")}
                </CardTitle>
                <CardDescription>{t("clientDetail.calculationsDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {calculations.map((calc: any) => (
                    <div key={calc.id} className="p-4 rounded-lg border border-border/50 bg-card space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CreditCard className="h-4 w-4 text-primary" />
                          <span className="font-medium text-sm">{calc.productName}</span>
                        </div>
                        <Badge variant="outline">{calc.currency}</Badge>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div>
                          <span className="text-muted-foreground">{t("clientDetail.calcAmount")}</span>
                          <p className="font-semibold mt-0.5">{fmtNum(calc.loanAmount)} {calc.currency}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t("clientDetail.calcRate")}</span>
                          <p className="font-semibold mt-0.5">{calc.interestRate}%</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t("clientDetail.calcTerm")}</span>
                          <p className="font-semibold mt-0.5">{calc.termMonths} {t("clientDetail.calcMonths")}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t("clientDetail.calcPayment")}</span>
                          <p className="font-semibold mt-0.5">{fmtNum(calc.monthlyPayment)} {calc.currency}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <CollateralEstimatesCard clientId={client.id} />
        </div>

        {/* Right sidebar */}
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
                  const statuses = ['draft', 'lead', 'recommendation', 'basket', 'pdf_generated', 'completed', 'rejected'];
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

          {/* Quick stats */}
          <Card className="shadow-sm border-border/50">
            <CardHeader>
              <CardTitle className="text-sm">{t("clientDetail.quickStats")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{t("clientDetail.documents")}</span>
                  <Badge variant="secondary">{documents.length}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{t("clientDetail.questionnaireTitle")}</span>
                  <Badge variant={questionnaireAnswers.length > 0 ? "default" : "secondary"}>
                    {questionnaireAnswers.length > 0 ? t("clientDetail.completed") : t("clientDetail.notStarted")}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{t("clientDetail.calculationsTitle")}</span>
                  <Badge variant="secondary">{calculations.length}</Badge>
                </div>
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

      <Dialog open={editClientOpen} onOpenChange={setEditClientOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("clientDetail.editTitle")}</DialogTitle>
            <DialogDescription>{t("clientDetail.editDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>{t("clientDetail.fullName")}</Label>
                <Input
                  value={editForm.fullName}
                  onChange={(e) => setEditForm((f) => ({ ...f, fullName: e.target.value }))}
                />
              </div>
              <div>
                <Label>{t("clientDetail.phone")}</Label>
                <Input
                  value={editForm.phone}
                  onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div>
                <Label>{t("clientDetail.gender")}</Label>
                <Select
                  value={editForm.gender || "_unset"}
                  onValueChange={(v) =>
                    setEditForm((f) => ({ ...f, gender: v === "_unset" ? "" : (v as "male" | "female") }))
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_unset">—</SelectItem>
                    <SelectItem value="male">{t("clientDetail.genderMale")}</SelectItem>
                    <SelectItem value="female">{t("clientDetail.genderFemale")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("clientDetail.clientType")}</Label>
                <Select
                  value={editForm.clientType || "_unset"}
                  onValueChange={(v) =>
                    setEditForm((f) => ({
                      ...f,
                      clientType: v === "_unset" ? "" : (v as "individual" | "corporate"),
                    }))
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_unset">—</SelectItem>
                    <SelectItem value="individual">{t("clientDetail.clientTypeIndividual")}</SelectItem>
                    <SelectItem value="corporate">{t("clientDetail.clientTypeCorporate")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>{t("clientDetail.clientSegment")}</Label>
                <Input
                  value={editForm.clientSegment}
                  onChange={(e) => setEditForm((f) => ({ ...f, clientSegment: e.target.value }))}
                  placeholder={t("clientDetail.clientSegmentPlaceholder")}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditClientOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSaveClient} disabled={updateClient.isPending}>
              {updateClient.isPending ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// A document is a "photo" we want to render as a thumbnail when its mime
// type starts with "image/" -- or, for legacy rows that pre-date the
// `mime_type` column, when the canonical photo `doc_type` values are set
// (see lib/db/src/schema/mini-app.ts comment).
const PHOTO_DOC_TYPES = new Set(["photo_storefront", "photo_owner"]);
function isPhotoDoc(doc: { mimeType?: string | null; docType?: string | null }): boolean {
  if (typeof doc.mimeType === "string" && doc.mimeType.startsWith("image/")) return true;
  if (typeof doc.docType === "string" && PHOTO_DOC_TYPES.has(doc.docType)) return true;
  return false;
}

function DocumentsList({
  documents,
  t,
}: {
  documents: Array<any>;
  t: (key: string) => string;
}) {
  const photos = documents.filter(isPhotoDoc);
  const otherDocs = documents.filter((d) => !isPhotoDoc(d));

  return (
    <div className="space-y-4">
      {photos.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {photos.map((doc: any) => (
            <AdminPhotoTile key={doc.id} doc={doc} t={t} />
          ))}
        </div>
      )}
      {otherDocs.length > 0 && (
        <div className="space-y-3">
          {otherDocs.map((doc: any) => (
            <DocumentRow key={doc.id} doc={doc} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function AdminPhotoTile({ doc, t }: { doc: any; t: (key: string) => string }) {
  const isAbsolute =
    typeof doc.storagePath === "string" && doc.storagePath.startsWith("http");

  const { data: signedUrl } = useQuery({
    queryKey: ["admin/signed-image", doc.storagePath],
    queryFn: () => getSignedImageUrl(doc.storagePath),
    enabled: !!doc.storagePath && !isAbsolute,
    // R2 URLs default to a 15-minute TTL on the server; refresh just before
    // they expire so an open card doesn't break.
    staleTime: 13 * 60 * 1000,
    retry: 1,
  });

  const src = isAbsolute ? doc.storagePath : signedUrl;

  return (
    <div
      className="relative group aspect-square rounded-lg border border-border/50 bg-muted overflow-hidden cursor-pointer"
      onClick={() => {
        if (src) window.open(src, "_blank", "noopener,noreferrer");
      }}
    >
      {src ? (
        <img
          src={src}
          alt={doc.fileName ?? doc.docType ?? "photo"}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
            (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
          }}
        />
      ) : null}
      <div
        className={`${src ? "hidden" : ""} absolute inset-0 flex items-center justify-center text-muted-foreground`}
      >
        <FileImage className="h-6 w-6" />
      </div>
      {doc.docType && (
        <div className="absolute bottom-1 left-1 right-1">
          <Badge variant="secondary" className="text-[10px] truncate w-full justify-center">
            {doc.docType}
          </Badge>
        </div>
      )}
      {doc.extractedData && Object.keys(doc.extractedData).length > 0 && (
        <div className="absolute top-1 right-1">
          <Badge variant="secondary" className="gap-1 text-[10px] px-1.5 py-0.5">
            <Sparkles className="h-3 w-3" />
            {t("clientDetail.aiExtracted")}
          </Badge>
        </div>
      )}
    </div>
  );
}

function DocumentRow({ doc, t }: { doc: any; t: (key: string) => string }) {
  const [loading, setLoading] = useState(false);

  // Use the shared `getSignedImageUrl` helper so that legacy local-FS docs
  // (return `{exp, sig}`) and new R2 docs (return `{url}`) both work, and
  // the absolute presigned URL is never accidentally re-wrapped with the
  // API origin (which used to break the row click before this fix).
  const openDocument = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const url = await getSignedImageUrl(doc.storagePath);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      // Last-resort fallback: hit the unsigned endpoint with a bearer token.
      // Will only succeed on the legacy local-FS backend.
      window.open(
        buildApiUrl(`/api/storage/file?path=${encodeURIComponent(doc.storagePath)}`),
        "_blank",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-card hover:bg-accent/50 cursor-pointer transition-colors"
      onClick={openDocument}
    >
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <FileImage className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium">{doc.fileName}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant="outline" className="text-[10px]">{doc.docType}</Badge>
            <span className="text-xs text-muted-foreground">{formatAdminLongDate(doc.createdAt)}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {doc.extractedData && Object.keys(doc.extractedData).length > 0 && (
          <Badge variant="secondary" className="gap-1">
            <Sparkles className="h-3 w-3" />
            {t("clientDetail.aiExtracted")}
          </Badge>
        )}
        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={loading}>
          <Eye className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

interface CollateralEstimateRow {
  id: number;
  createdAt: string;
  creditProductId: number;
  requestedLoanAmount: string;
  totalAcceptedValue: string;
  coveragePercent: string;
  resultStatus: "enough" | "not_enough";
  hasEquipmentOnly: boolean;
  createdBy: number | null;
}

const moneyFmt = new Intl.NumberFormat("ru-RU");
function fmtMoney(value: string | number) {
  const n = typeof value === "string" ? Number.parseFloat(value) : value;
  if (!Number.isFinite(n)) return String(value);
  return moneyFmt.format(n);
}

function CollateralEstimatesCard({ clientId }: { clientId: number }) {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery<CollateralEstimateRow[]>({
    queryKey: ["admin/collateral-estimates", clientId],
    queryFn: async () => {
      const res = await fetch(buildApiUrl(`/api/clients/${clientId}/collateral-estimates`), {
        headers: buildAuthHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const rows = data ?? [];

  return (
    <Card className="shadow-sm border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Coins className="h-5 w-5 text-primary" />
          {t("collateralAdmin.estimatesOnClient")}
        </CardTitle>
        <CardDescription>{t("collateralAdmin.estimatesOnClientHint")}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">{t("collateralAdmin.noEstimates")}</p>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {fmtMoney(row.requestedLoanAmount)} UZS
                    <span className="ml-2 text-xs text-muted-foreground">
                      → {fmtMoney(row.totalAcceptedValue)}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatAdminLongDate(row.createdAt)} ·{" "}
                    {Number(row.coveragePercent).toFixed(0)}%
                    {row.hasEquipmentOnly ? ` · ${t("collateralAdmin.equipOnlyTag")}` : ""}
                  </div>
                </div>
                <Badge variant={row.resultStatus === "enough" ? "default" : "destructive"}>
                  {row.resultStatus === "enough"
                    ? t("collateralAdmin.statusEnough")
                    : t("collateralAdmin.statusNotEnough")}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
