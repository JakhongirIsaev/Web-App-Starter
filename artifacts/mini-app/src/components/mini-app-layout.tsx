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
          background: "rgba(255,255,255,0.95)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderTop: "1px solid hsl(140 15% 93%)",
          boxShadow: "0 -8px 24px rgba(15,23,42,0.06)",
          padding: "8px 6px calc(8px + env(safe-area-inset-bottom))",
        }}
      >
        <div className="mx-auto flex max-w-md">
          {navItems.map((item) => {
            const active = isActive(item);

            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="flex flex-1 flex-col items-center justify-center gap-[3px] py-[6px] transition-colors"
                style={{ color: active ? "hsl(142 71% 40%)" : "hsl(150 10% 45%)" }}
              >
                <item.icon size={22} strokeWidth={active ? 2.2 : 1.8} />
                <span
                  className="text-[10px] leading-none"
                  style={{ fontWeight: active ? 700 : 500, letterSpacing: "0.01em" }}
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
