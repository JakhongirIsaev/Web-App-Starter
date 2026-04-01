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

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  questionnaire: "bg-blue-100 text-blue-700",
  recommendation: "bg-amber-100 text-amber-700",
  basket: "bg-purple-100 text-purple-700",
  pdf_generated: "bg-teal-100 text-teal-700",
  completed: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
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

  const statuses = ["", "draft", "questionnaire", "recommendation", "basket", "pdf_generated", "completed", "rejected"];

  return (
    <div className="space-y-3 pb-4">
      <div className="flex items-center justify-between">
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
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColors[client.status] || ""}`}>
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
