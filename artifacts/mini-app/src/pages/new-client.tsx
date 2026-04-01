import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { ArrowLeft, UserPlus } from "lucide-react";

export default function NewClientPage() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  const createMutation = useMutation({
    mutationFn: () => api.post("/mini-app/clients", { fullName: fullName || null, phone: phone || null }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["mini-clients"] });
      navigate(`/clients/${data.id}`);
    },
  });

  return (
    <div className="space-y-4 pb-4">
      <button onClick={() => navigate("/clients")} className="flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="w-4 h-4" />
        {t("common.back")}
      </button>

      <Card>
        <CardHeader>
          <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-2">
            <UserPlus className="w-6 h-6 text-primary" />
          </div>
          <CardTitle>{t("newClient.title")}</CardTitle>
          <CardDescription>{t("newClient.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">{t("newClient.fullName")}</label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={t("newClient.fullNamePlaceholder")}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">{t("newClient.phone")}</label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t("newClient.phonePlaceholder")}
              className="mt-1"
            />
          </div>
          <Button
            className="w-full"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? t("newClient.creating") : t("newClient.create")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
