import { Link, useLocation } from "wouter";
import { User, useLogout } from "@workspace/api-client-react";
import { 
  LayoutDashboard, 
  Users, 
  Package, 
  FileText, 
  ShieldCheck, 
  Building2, 
  LogOut,
  ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface LayoutProps {
  children: React.ReactNode;
  user: User;
}

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/products", label: "Products", icon: Package },
  { href: "/articles", label: "Knowledge Base", icon: FileText },
  { href: "/users", label: "Access Management", icon: ShieldCheck },
  { href: "/branches", label: "Branches", icon: Building2 },
];

export function getRoleColor(role: string) {
  switch (role) {
    case "superadmin": return "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20";
    case "head_office_admin": return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
    case "editor": return "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20";
    case "branch_head": return "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20";
    case "hunter": return "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20";
    default: return "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20";
  }
}

export default function Layout({ children, user }: LayoutProps) {
  const [location, setLocation] = useLocation();
  const logout = useLogout();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        localStorage.removeItem("auth_token");
        setLocation("/login");
      }
    });
  };

  return (
    <div className="min-h-screen w-full flex bg-background">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center mr-3">
            <div className="w-4 h-4 border-2 border-primary-foreground rounded-sm" />
          </div>
          <span className="font-semibold text-lg text-sidebar-foreground tracking-tight">Minerva</span>
        </div>
        
        <div className="flex-1 py-6 px-3 flex flex-col gap-1 overflow-y-auto">
          <div className="px-3 mb-2 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">
            Overview
          </div>
          {navItems.map((item) => {
            const isActive = location === item.href;
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <Button
                  variant="ghost"
                  className={cn(
                    "w-full justify-start text-sm font-medium h-10 px-3",
                    isActive 
                      ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  )}
                >
                  <Icon className="mr-3 h-4 w-4" />
                  {item.label}
                </Button>
              </Link>
            );
          })}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-card border-b border-border flex items-center justify-between px-8 flex-shrink-0">
          <div className="flex items-center text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {navItems.find(item => item.href === location)?.label || "Dashboard"}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-9 gap-3 pl-2 pr-3 rounded-full border border-border hover:bg-accent">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {user.name.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col items-start justify-center">
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
                    {user.role.replace(/_/g, ' ').toUpperCase()}
                  </Badge>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:bg-destructive/10 cursor-pointer">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto bg-muted/30 p-8">
          {children}
        </div>
      </main>
    </div>
  );
}