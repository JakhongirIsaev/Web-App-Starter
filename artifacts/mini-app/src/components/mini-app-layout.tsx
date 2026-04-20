import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Home, Users, BookOpen, User } from "lucide-react";

interface Props {
  children: ReactNode;
}

export default function MiniAppLayout({ children }: Props) {
  const { t } = useTranslation();
  const [location, navigate] = useLocation();

  const navItems = [
    { path: "/", icon: Home, label: t("nav.home") },
    { path: "/clients", icon: Users, label: t("nav.clients") },
    { path: "/knowledge", icon: BookOpen, label: t("nav.knowledge") },
    { path: "/profile", icon: User, label: t("nav.profile") },
  ];

  const isActive = (path: string) => {
    if (path === "/") return location === "/";
    return location.startsWith(path);
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col" style={{ background: "var(--tg-bg, #F4F4F5)" }}>
      <main className="min-h-0 flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      <nav
        className="fixed bottom-0 left-0 right-0 z-50 bg-white pb-[env(safe-area-inset-bottom)]"
        style={{ boxShadow: "0 -1px 0 rgba(15,23,42,.06), 0 -8px 24px rgba(15,23,42,.04)" }}
      >
        <div className="mx-auto flex h-[56px] max-w-md">
          {navItems.map((item) => {
            const active = isActive(item.path);
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="flex-1 flex flex-col items-center justify-center gap-[2px] py-1"
                style={{ color: active ? "#16A34A" : "#64748B" }}
              >
                <item.icon
                  size={22}
                  strokeWidth={active ? 2.2 : 1.8}
                />
                <span
                  className="text-[11px]"
                  style={{ fontWeight: active ? 600 : 500 }}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
