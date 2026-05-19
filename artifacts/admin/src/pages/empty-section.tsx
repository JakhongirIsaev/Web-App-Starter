import { useTranslation } from "react-i18next";
import { Inbox } from "lucide-react";

interface EmptySectionProps {
  titleKey: string;
}

export default function EmptySection({ titleKey }: EmptySectionProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">{t(titleKey)}</h1>
        <p className="text-muted-foreground mt-1">{t("emptySection.subtitle")}</p>
      </div>
      <div className="rounded-2xl border border-dashed border-border bg-card/50 p-16">
        <div className="flex flex-col items-center justify-center text-center gap-3">
          <div className="rounded-full bg-muted p-4">
            <Inbox className="h-7 w-7 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">
            {t("emptySection.title")}
          </h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            {t("emptySection.body")}
          </p>
        </div>
      </div>
    </div>
  );
}
