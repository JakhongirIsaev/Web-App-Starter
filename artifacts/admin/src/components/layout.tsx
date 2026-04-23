import { useState } from "react";
import { Link, useLocation } from "wouter";
import { User, useLogout } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import {
  Home,
  Users,
  Package,
  BookOpen,
  Building2,
  LogOut,
  Calculator,
  ChevronRight,
  Languages,
  Menu,
  Hash,
  ShieldCheck
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import Logo from "@/components/logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

interface LayoutProps {
  children: React.ReactNode;
  user: User;
}

const navItems = [
  { href: "/", labelKey: "nav.dashboard", icon: Home, roles: ["superadmin", "head_office_admin", "editor", "branch_head"], badge: false },
  { href: "/clients", labelKey: "nav.clients", icon: Users, roles: ["superadmin", "head_office_admin", "editor", "branch_head"], badge: false },
  // Excel catalogue tab order: Продуктовая линейка → Шифры продуктов → Остатки по линиям
  { href: "/credit-products", labelKey: "nav.creditProducts", icon: Package, roles: ["superadmin", "head_office_admin", "editor", "branch_head", "hunter"], badge: false },
  { href: "/sap-codes", labelKey: "nav.sapCodes", icon: Hash, roles: ["superadmin", "head_office_admin", "editor", "branch_head", "hunter"], badge: false },
  { href: "/credit-lines", labelKey: "nav.creditLines", icon: Calculator, roles: ["superadmin", "head_office_admin", "editor", "branch_head", "hunter"], badge: false },
  { href: "/articles", labelKey: "nav.articles", icon: BookOpen, roles: ["superadmin", "head_office_admin", "editor", "branch_head", "hunter"], badge: false },
  { href: "/branches", labelKey: "nav.branches", icon: Building2, roles: ["superadmin", "head_office_admin"], badge: false },
  { href: "/accesses", labelKey: "nav.accesses", icon: ShieldCheck, roles: ["superadmin", "head_office_admin"], badge: false },
];

export function getRoleColor(role: string) {
  switch (role) {
    case "superadmin": return "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20";
    case "head_office_admin": return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
    case "editor": return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
    case "branch_head": return "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20";
    default: return "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20";
  }
}

export function getRoleLabel(role: string) {
  return role.replace(/_/g, ' ').toUpperCase();
}

interface SidebarBodyProps {
  user: User;
  filteredNavItems: typeof navItems;
  location: string;
  t: (key: string) => string;
  onNavigate?: () => void;
}

function SidebarBody({ user, filteredNavItems, location, t, onNavigate }: SidebarBodyProps) {
  return (
    <div className="h-full flex flex-col p-[16px_12px]">
      {/* Brand block */}
      <div className="flex items-center gap-2 px-2.5 py-1.5 mb-[18px]">
        <Logo size={26} showText={false} />
        <span className="text-[15px] font-bold leading-tight text-sidebar-foreground">Minerva</span>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-0.5">
        {filteredNavItems.map((item) => {
          const isActive = location === item.href;
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href}>
              <div
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-[10px] px-3 py-[9px] rounded-[6px] text-[13px] cursor-pointer transition-colors",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground font-semibold"
                    : "text-sidebar-foreground/70 font-medium hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1">{t(item.labelKey)}</span>
                {item.badge && !isActive && (
                  <span className="bg-sidebar-accent text-sidebar-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                    0
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* User pod — logout lives in the top-right dropdown to avoid duplication */}
      <div className="flex items-center gap-2.5 bg-sidebar-accent border border-sidebar-border rounded-lg p-2.5">
        <div className="w-[30px] h-[30px] rounded-full bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center text-[11px] font-bold flex-shrink-0">
          {user.name.substring(0, 2).toUpperCase()}
        </div>
        <div className="flex flex-col flex-1 min-w-0">
          <span className="text-[12px] font-semibold text-sidebar-foreground truncate">{user.name}</span>
          <span className="text-[10px] text-sidebar-foreground/60 truncate">{t(`roles.${user.role}`)}</span>
        </div>
      </div>
    </div>
  );
}

export default function Layout({ children, user }: LayoutProps) {
  const [location, setLocation] = useLocation();
  const { t, i18n } = useTranslation();
  const logout = useLogout();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        localStorage.removeItem("auth_token");
        setLocation("/login");
      }
    });
  };

  const toggleLanguage = () => {
    const newLang = i18n.language === "ru" ? "uz" : "ru";
    i18n.changeLanguage(newLang);
    localStorage.setItem("minerva_lang", newLang);
  };

  const filteredNavItems = navItems.filter(item => item.roles.includes(user.role));

  return (
    <div className="min-h-screen w-full flex bg-background">
      {/* Desktop sidebar — hidden below md, shown from md up */}
      <aside className="hidden md:flex w-[232px] flex-shrink-0 bg-sidebar text-sidebar-foreground font-sans flex-col">
        <SidebarBody
          user={user}
          filteredNavItems={filteredNavItems}
          location={location}
          t={t}
        />
      </aside>

      {/* Mobile drawer — Sheet rendered alongside; trigger lives in the header */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          side="left"
          className="w-[260px] p-0 bg-sidebar text-sidebar-foreground border-r-sidebar-border"
        >
          <SheetTitle className="sr-only">{t("nav.dashboard")}</SheetTitle>
          <SidebarBody
            user={user}
            filteredNavItems={filteredNavItems}
            location={location}
            t={t}
            onNavigate={() => setDrawerOpen(false)}
          />
        </SheetContent>

        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <header className="h-16 bg-card border-b border-border flex items-center justify-between px-4 md:px-8 flex-shrink-0 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {/* Hamburger — mobile only */}
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden -ml-2 h-9 w-9"
                  aria-label="Open navigation menu"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>

              <span className="font-medium text-foreground text-sm truncate">
                {filteredNavItems.find(item => item.href === location)
                  ? t(filteredNavItems.find(item => item.href === location)!.labelKey)
                  : t("nav.dashboard")}
              </span>
            </div>

            <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
              <img
                src="/ipak-yuli-header.png"
                alt="Ipak Yuli Bank"
                className="hidden sm:block h-7 w-auto"
              />
              <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground px-2 md:px-3" onClick={toggleLanguage}>
                <Languages className="h-4 w-4" />
                <span className="hidden sm:inline">{i18n.language === "ru" ? "O'z" : "Ру"}</span>
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-9 gap-2 md:gap-3 pl-1 md:pl-2 pr-2 md:pr-3 rounded-full border border-border hover:bg-accent">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        {user.name.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="hidden md:flex flex-col items-start justify-center">
                      <span className="text-sm font-medium leading-none">{user.name}</span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground rotate-90" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{user.name}</p>
                      <p className="text-xs text-muted-foreground">@{user.telegramId}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <div className="p-2">
                    <Badge variant="outline" className={cn("w-full justify-center", getRoleColor(user.role))}>
                      {t(`roles.${user.role}`)}
                    </Badge>
                  </div>
                  {user.branch && (
                    <div className="p-2 pt-0">
                      <p className="text-xs text-muted-foreground text-center">{t("header.branchInfo", { name: user.branch.name })}</p>
                    </div>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:bg-destructive/10 cursor-pointer">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>{t("header.logOut")}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <div className="flex-1 overflow-auto bg-muted/30 p-4 md:p-8">
            {children}
          </div>
        </main>
      </Sheet>
    </div>
  );
}
