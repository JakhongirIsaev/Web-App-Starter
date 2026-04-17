import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { Plus, Search, ChevronRight, User } from "lucide-react";
import { fmtDate } from "@/lib/format";

const statusChipStyles: Record<string, { bg: string; color: string }> = {
  draft:          { bg: "hsl(215 16% 52% / .12)",  color: "hsl(215 16% 42%)" },
  questionnaire:  { bg: "hsl(215 90% 52% / .12)",  color: "hsl(215 90% 42%)" },
  recommendation: { bg: "hsl(38 95% 52% / .15)",   color: "hsl(38 95% 40%)" },
  basket:         { bg: "hsl(270 80% 58% / .12)",  color: "hsl(270 70% 48%)" },
  pdf_generated:  { bg: "hsl(174 72% 40% / .13)",  color: "hsl(174 72% 32%)" },
  under_review:   { bg: "hsl(38 95% 52% / .12)",   color: "hsl(38 95% 40%)" },
  approved:       { bg: "hsl(142 65% 42% / .14)",  color: "hsl(142 65% 30%)" },
  completed:      { bg: "hsl(142 65% 42% / .14)",  color: "hsl(142 65% 30%)" },
  rejected:       { bg: "hsl(0 80% 58% / .12)",    color: "hsl(0 80% 48%)" },
};

export default function ClientsPage() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["mini-clients", statusFilter],
    queryFn: () => api.get(`/mini-app/clients${statusFilter ? `?status=${statusFilter}` : ""}`),
  });

  const filtered = clients.filter((c: any) =>
    !search || (c.fullName || "").toLowerCase().includes(search.toLowerCase())
  );

  const statuses = ["", "draft", "questionnaire", "recommendation", "basket", "pdf_generated", "under_review", "approved", "completed", "rejected"];

  return (
    <div className="space-y-3 pb-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg font-bold">{t("clients.title")}</h1>
        <Button size="sm" onClick={() => navigate("/new-client")} className="gap-1">
          <Plus className="w-4 h-4" />
          {t("clients.newClient")}
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("clients.searchPlaceholder")}
          className="pl-9"
        />
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {statuses.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              statusFilter === s
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground"
            }`}
          >
            {s ? t(`statuses.${s}`) : t("clients.allStatuses")}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-center text-muted-foreground py-8">{t("common.loading")}</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <User className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">{t("clients.noClients")}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("clients.noClientsHint")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((client: any) => (
            <Card
              key={client.id}
              className="cursor-pointer active:scale-[0.98] transition-transform"
              onClick={() => navigate(`/clients/${client.id}`)}
            >
              <CardContent className="p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-primary font-semibold text-sm">
                    {(client.fullName || "?")[0].toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {client.fullName || t("clients.anonymous")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {client.phone || t("clients.noPhone")} · {fmtDate(client.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold"
                    style={{
                      background: statusChipStyles[client.status]?.bg ?? "",
                      color: statusChipStyles[client.status]?.color ?? "",
                    }}
                  >
                    <span className="w-[5px] h-[5px] rounded-full" style={{ background: "currentColor" }} />
                    {t(`statuses.${client.status}`)}
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
