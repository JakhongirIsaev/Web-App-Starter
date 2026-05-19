import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { AlertCircle, Home } from "lucide-react";

export default function NotFound() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: "var(--tg-bg, #F4F4F5)" }}
    >
      <div className="mn-card w-full max-w-md p-6 text-center">
        <div className="flex justify-center mb-4">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: "#FEF2F2" }}
          >
            <AlertCircle className="w-7 h-7" style={{ color: "#EF4444" }} />
          </div>
        </div>

        <h1 className="text-[20px] font-bold" style={{ color: "#0F172A" }}>
          {t("notFound.title")}
        </h1>

        <p className="text-[14px] mt-2" style={{ color: "#64748B" }}>
          {t("notFound.description")}
        </p>

        <button
          onClick={() => navigate("/")}
          className="mt-6 w-full h-11 rounded-xl text-[14px] font-bold text-[#272424] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          style={{ background: "#FFD531" }}
        >
          <Home className="w-4 h-4" />
          {t("common.goHome")}
        </button>
      </div>
    </div>
  );
}
