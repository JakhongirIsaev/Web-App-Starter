import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Home, Users, Calculator, BookOpen, User } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface NavItem {
  path: string;
  label: string;
  icon: typeof Home;
  matches: string[];
}

export default function MiniAppLayout({ children }: Props) {
  const { t } = useTranslation();
  const [location, navigate] = useLocation();

  const navItems: NavItem[] = [
    { path: "/", icon: Home, label: t("nav.home"), matches: ["/"] },
    {
      path: "/clients",
      icon: Users,
      label: t("nav.clients"),
      matches: ["/clients", "/new-client", "/questionnaire", "/recommendation", "/basket", "/pdf-share", "/scan"],
    },
    { path: "/calculator", icon: Calculator, label: t("nav.calculator"), matches: ["/calculator"] },
    { path: "/knowledge", icon: BookOpen, label: t("nav.knowledge"), matches: ["/knowledge"] },
    { path: "/profile", icon: User, label: t("nav.profile"), matches: ["/profile"] },
  ];

  const isActive = (item: NavItem) => {
    if (item.path === "/") return location === "/";

    return item.matches.some((prefix) => {
      if (location === prefix) return true;
      if (location.startsWith(`${prefix}/`)) return true;
      return location.startsWith(`${prefix}?`);
    });
  };

  return (
    <div
      className="mx-auto flex min-h-screen w-full max-w-md flex-col"
      style={{ background: "radial-gradient(circle at top, rgba(22,163,74,0.08), transparent 28%), var(--tg-bg, #F4F4F5)" }}
    >
      <main className="min-h-0 flex-1 overflow-y-auto pb-28">
        {children}
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-50"
        style={{
          background: "#FFFFFF",
          boxShadow: "0 -1px 0 rgba(15,23,42,0.06), 0 -8px 24px rgba(15,23,42,0.04)",
          padding: "4px 0 calc(4px + env(safe-area-inset-bottom))",
        }}
      >
        <div className="mx-auto flex max-w-md justify-around">
          {navItems.map((item) => {
            const active = isActive(item);

            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="flex flex-1 flex-col items-center justify-center gap-[2px] transition-colors"
                style={{
                  padding: "8px 4px",
                  color: active ? "#16A34A" : "#64748B",
                }}
              >
                <item.icon size={22} strokeWidth={active ? 2 : 1.8} />
                <span
                  className="text-[11px] leading-none"
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
