import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import "@/lib/api";
import Layout from "@/components/layout";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";

import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Clients from "@/pages/clients";
import ClientDetail from "@/pages/client-detail";
import Articles from "@/pages/articles";
import Users from "@/pages/users";
import Branches from "@/pages/branches";
import CreditProducts from "@/pages/credit-products";
import SapCodes from "@/pages/sap-codes";
import CreditLines from "@/pages/credit-lines";

const queryClient = new QueryClient();

const adminRoles = ["superadmin", "head_office_admin"];

function ProtectedRoute({ component: Component, params, requiredRoles, ...rest }: any) {
  const [location, setLocation] = useLocation();
  const { t } = useTranslation();
  const { data: user, isLoading, error } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      retry: false,
    }
  });

  useEffect(() => {
    if (!isLoading && error) {
      setLocation("/login");
    }
  }, [isLoading, error, setLocation]);

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">{t("common.authenticating")}</p>
        </div>
      </div>
    );
  }

  if (error || !user) return null;

  if (requiredRoles && !requiredRoles.includes(user.role)) {
    return (
      <Layout user={user}>
        <div className="flex flex-col items-center justify-center h-64 space-y-4">
          <h2 className="text-2xl font-bold text-foreground">{t("common.accessDenied")}</h2>
          <p className="text-muted-foreground">{t("common.noPermission")}</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout user={user}>
      <Component params={params} user={user} {...rest} />
    </Layout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/">
        {(params) => <ProtectedRoute component={Dashboard} />}
      </Route>
      <Route path="/clients">
        {(params) => <ProtectedRoute component={Clients} />}
      </Route>
      <Route path="/clients/:id">
        {(params) => <ProtectedRoute component={ClientDetail} params={params} />}
      </Route>
      <Route path="/articles">
        {(params) => <ProtectedRoute component={Articles} />}
      </Route>
      <Route path="/users">
        {(params) => <ProtectedRoute component={Users} requiredRoles={adminRoles} />}
      </Route>
      <Route path="/branches">
        {(params) => <ProtectedRoute component={Branches} requiredRoles={adminRoles} />}
      </Route>
      <Route path="/credit-products">
        {(params) => <ProtectedRoute component={CreditProducts} />}
      </Route>
      <Route path="/sap-codes">
        {(params) => <ProtectedRoute component={SapCodes} />}
      </Route>
      <Route path="/credit-lines">
        {(params) => <ProtectedRoute component={CreditLines} />}
      </Route>
      <Route component={NotFound} />
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
