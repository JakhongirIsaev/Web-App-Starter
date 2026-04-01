import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { Home, Users, Package, Calculator, BookOpen, LogOut, Globe } from "lucide-react";

interface Props {
  children: ReactNode;
}

export default function MiniAppLayout({ children }: Props) {
  const { t, i18n } = useTranslation();
  const [location, navigate] = useLocation();
  const { user, logout } = useAuth();

  const toggleLang = () => {
    const next = i18n.language === "ru" ? "uz" : "ru";
    i18n.changeLanguage(next);
    localStorage.setItem("minerva_miniapp_lang", next);
  };

  const navItems = [
    { path: "/", icon: Home, label: t("nav.home") },
    { path: "/clients", icon: Users, label: t("nav.clients") },
    { path: "/products", icon: Package, label: t("nav.products") },
    { path: "/calculator", icon: Calculator, label: t("nav.calculator") },
    { path: "/knowledge", icon: BookOpen, label: t("nav.knowledge") },
  ];

  const isActive = (path: string) => {
    if (path === "/") return location === "/";
    return location.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-md mx-auto">
      <header className="flex items-center justify-between px-4 py-2 bg-card border-b border-border sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-xs">M</span>
          </div>
          <span className="font-semibold text-sm">{t("app.title")}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleLang}
            className="p-2 rounded-lg hover:bg-secondary text-xs font-semibold flex items-center gap-1"
          >
            <Globe className="w-3.5 h-3.5" />
            {i18n.language.toUpperCase()}
          </button>
          <button
            onClick={logout}
            className="p-2 rounded-lg hover:bg-secondary text-muted-foreground"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 pt-4 pb-20 overflow-y-auto">
        {children}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border safe-bottom z-50">
        <div className="max-w-md mx-auto flex">
          {navItems.map((item) => {
            const active = isActive(item.path);
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2 transition-colors ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <item.icon className={`w-5 h-5 ${active ? "text-primary" : ""}`} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
