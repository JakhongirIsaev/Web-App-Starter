import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { Switch, Route, Redirect, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import "@/lib/api";
import Layout from "@/components/layout";
import { useTranslation } from "react-i18next";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";

const Dashboard = lazy(() => import("@/pages/dashboard"));
const Clients = lazy(() => import("@/pages/clients"));
const ClientDetail = lazy(() => import("@/pages/client-detail"));
const Articles = lazy(() => import("@/pages/articles"));
const Users = lazy(() => import("@/pages/users"));
const Branches = lazy(() => import("@/pages/branches"));
// Credit Products page hidden 2026-05-09 — to restore: uncomment this lazy
// import and the matching <Route path="/credit-products"> below.
// const CreditProducts = lazy(() => import("@/pages/credit-products"));
const SapCodes = lazy(() => import("@/pages/sap-codes"));
const CollateralAdmin = lazy(() => import("@/pages/collateral"));
const RecommendationsAdmin = lazy(() => import("@/pages/recommendations"));
const ActivityLog = lazy(() => import("@/pages/activity-log"));
// Credit Lines page hidden 2026-05-18 - to restore: uncomment this lazy
// import and the matching <Route path="/credit-lines"> below.
// const CreditLines = lazy(() => import("@/pages/credit-lines"));
const EspoSync = lazy(() => import("@/pages/espo-sync"));
const CreditPolicy = lazy(() => import("@/pages/credit-policy"));
const NotFound = lazy(() => import("@/pages/not-found"));

const queryClient = new QueryClient();

const adminRoles = ["superadmin", "head_office_admin"];

function FullScreenLoader() {
  const { t } = useTranslation();
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </div>
    </div>
  );
}

function PageFallback() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-40 w-full rounded-[28px]" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
      </div>
      <Skeleton className="h-32 w-full rounded-2xl" />
      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <Skeleton className="h-80 w-full rounded-2xl" />
        <Skeleton className="h-80 w-full rounded-2xl" />
      </div>
    </div>
  );
}

function PageSuspense({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageFallback />}>{children}</Suspense>;
}

interface ProtectedRouteProps {
  component: ComponentType<any>;
  params?: Record<string, string | undefined>;
  requiredRoles?: string[];
}

const GUEST_USER = {
  id: 0,
  telegramId: "",
  name: "Guest",
  role: "branch_head",
  branchId: null,
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as const;

function ProtectedRoute({ component: Component, params, requiredRoles, ...rest }: ProtectedRouteProps) {
  const { t } = useTranslation();
  const { data, isLoading } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      retry: 2,
    },
  });

  if (isLoading) {
    return <FullScreenLoader />;
  }

  const user = data ?? GUEST_USER;

  if (requiredRoles && !requiredRoles.includes(user.role)) {
    return (
      <Layout user={user}>
        <div className="flex h-64 flex-col items-center justify-center space-y-4">
          <h2 className="text-2xl font-bold text-foreground">{t("common.accessDenied")}</h2>
          <p className="text-muted-foreground">{t("common.noPermission")}</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout user={user}>
      <PageSuspense>
        <Component params={params} user={user} {...rest} />
      </PageSuspense>
    </Layout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/">
        {() => <ProtectedRoute component={Dashboard} />}
      </Route>
      <Route path="/clients">
        {() => <ProtectedRoute component={Clients} />}
      </Route>
      <Route path="/clients/:id">
        {(params) => <ProtectedRoute component={ClientDetail} params={params} />}
      </Route>
      <Route path="/articles">
        {() => <ProtectedRoute component={Articles} />}
      </Route>
      <Route path="/users">
        {() => <ProtectedRoute component={Users} requiredRoles={adminRoles} />}
      </Route>
      <Route path="/branches">
        {() => <ProtectedRoute component={Branches} requiredRoles={adminRoles} />}
      </Route>
      <Route path="/accesses">
        {() => <Redirect to="/users" />}
      </Route>
      {/* Credit Products page hidden 2026-05-09; route kept for direct access only by clearing the comment. */}
      {/* <Route path="/credit-products">
        {() => <ProtectedRoute component={CreditProducts} />}
      </Route> */}
      <Route path="/sap-codes">
        {() => <ProtectedRoute component={SapCodes} />}
      </Route>
      {/* Credit Lines page hidden 2026-05-18; route kept on disk only. */}
      {/* <Route path="/credit-lines">
        {() => <ProtectedRoute component={CreditLines} />}
      </Route> */}
      <Route path="/collateral">
        {() => <ProtectedRoute component={CollateralAdmin} requiredRoles={adminRoles} />}
      </Route>
      <Route path="/recommendations">
        {() => <ProtectedRoute component={RecommendationsAdmin} requiredRoles={adminRoles} />}
      </Route>
      <Route path="/activity">
        {() => <ProtectedRoute component={ActivityLog} requiredRoles={adminRoles} />}
      </Route>
      <Route path="/espo-sync">
        {() => <ProtectedRoute component={EspoSync} requiredRoles={["superadmin", "head_office_admin", "editor", "branch_head"]} />}
      </Route>
      <Route path="/credit-policy">
        {() => <ProtectedRoute component={CreditPolicy} requiredRoles={["superadmin", "head_office_admin", "editor", "branch_head", "hunter"]} />}
      </Route>
      <Route path="/funnel">
        {() => <Redirect to="/" />}
      </Route>
      <Route>
        {() => (
          <PageSuspense>
            <NotFound />
          </PageSuspense>
        )}
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
