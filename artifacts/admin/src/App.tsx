import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Layout from "@/components/layout";
import { useEffect, useState } from "react";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";

import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Clients from "@/pages/clients";
import ClientDetail from "@/pages/client-detail";
import Products from "@/pages/products";
import Articles from "@/pages/articles";
import Users from "@/pages/users";
import Branches from "@/pages/branches";

const queryClient = new QueryClient();

function ProtectedRoute({ component: Component, params, ...rest }: any) {
  const [location, setLocation] = useLocation();
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
          <p className="text-sm text-muted-foreground">Authenticating...</p>
        </div>
      </div>
    );
  }

  if (error || !user) return null;

  return (
    <Layout user={user}>
      <Component params={params} {...rest} />
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
      <Route path="/products">
        {(params) => <ProtectedRoute component={Products} />}
      </Route>
      <Route path="/articles">
        {(params) => <ProtectedRoute component={Articles} />}
      </Route>
      <Route path="/users">
        {(params) => <ProtectedRoute component={Users} />}
      </Route>
      <Route path="/branches">
        {(params) => <ProtectedRoute component={Branches} />}
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
