import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { ArrowLeft, Inbox } from "lucide-react";

interface EmptySectionProps {
  titleKey: string;
  subtitleKey?: string;
}

export default function EmptySection({ titleKey, subtitleKey }: EmptySectionProps) {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  return (
    <div className="space-y-5 pb-28">
      <button
        onClick={() => navigate("/")}
        className="flex items-center gap-1 text-sm text-muted-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        {t("common.back")}
      </button>

      <div>
        <h1 className="text-xl font-bold text-foreground">{t(titleKey)}</h1>
        {subtitleKey ? (
          <p className="text-sm text-muted-foreground mt-1">{t(subtitleKey)}</p>
        ) : null}
      </div>

      <div className="rounded-[24px] border border-dashed border-border bg-card/60 p-10">
        <div className="flex flex-col items-center justify-center text-center gap-3">
          <div className="rounded-full bg-muted p-4">
            <Inbox className="h-7 w-7 text-muted-foreground" />
          </div>
          <h2 className="text-base font-semibold text-foreground">
            {t("emptySection.title", { defaultValue: "Пока нет данных" })}
          </h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            {t("emptySection.body", {
              defaultValue: "Здесь появятся записи после первой загрузки.",
            })}
          </p>
        </div>
      </div>
    </div>
  );
}
