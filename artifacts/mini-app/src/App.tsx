import { lazy, Suspense, type ReactNode } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { useTranslation } from "react-i18next";
import "@/i18n";
import MiniAppLayout from "@/components/mini-app-layout";
import { ErrorBoundary } from "@/components/error-boundary";

const HomePage = lazy(() => import("@/pages/home"));
const ClientsPage = lazy(() => import("@/pages/clients"));
const NewClientPage = lazy(() => import("@/pages/new-client"));
const ClientDetailPage = lazy(() => import("@/pages/client-detail"));
const QuestionnairePage = lazy(() => import("@/pages/questionnaire"));
const RecommendationPage = lazy(() => import("@/pages/recommendation"));
const CalculatorPage = lazy(() => import("@/pages/calculator"));
const KnowledgePage = lazy(() => import("@/pages/knowledge"));
const CatalogPage = lazy(() => import("@/pages/catalog"));
const BasketPage = lazy(() => import("@/pages/basket"));
const PdfSharePage = lazy(() => import("@/pages/pdf-share"));
const ProfilePage = lazy(() => import("@/pages/profile"));
const ProductsPage = lazy(() => import("@/pages/products"));
const ScanDocumentPage = lazy(() => import("@/pages/scan-document"));
const CollateralPage = lazy(() => import("@/pages/collateral"));
const CreditLinesPage = lazy(() => import("@/pages/credit-lines"));
const NotFound = lazy(() => import("@/pages/not-found"));

const queryClient = new QueryClient();

function FullScreenLoader() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--tg-bg,#F4F4F5)] px-6">
      <div className="flex w-full max-w-xs flex-col items-center gap-4 rounded-[28px] border border-white/80 bg-white/90 px-6 py-8 text-center shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-[linear-gradient(135deg,#15803D_0%,#16A34A_58%,#22C55E_100%)] text-xl font-bold text-white shadow-[0_18px_40px_rgba(22,163,74,0.28)]">
          M
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-[#0F172A]">Minerva</p>
          <p className="text-xs text-[#64748B]">{t("common.loading")}</p>
        </div>
      </div>
    </div>
  );
}

function MiniPageFallback() {
  return (
    <div className="space-y-4 px-4 pb-24 pt-4">
      <Skeleton className="h-36 w-full rounded-[28px]" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
      </div>
      <Skeleton className="h-28 w-full rounded-2xl" />
      <Skeleton className="h-56 w-full rounded-2xl" />
    </div>
  );
}

function PageSuspense({ children }: { children: ReactNode }) {
  return <Suspense fallback={<MiniPageFallback />}>{children}</Suspense>;
}

function AuthGate() {
  const { loading } = useAuth();

  if (loading) {
    return <FullScreenLoader />;
  }

  return (
    <MiniAppLayout>
      <ErrorBoundary>
        <Switch>
          <Route path="/">
            {() => (
              <PageSuspense>
                <HomePage />
              </PageSuspense>
            )}
          </Route>
          <Route path="/clients">
            {() => (
              <PageSuspense>
                <ClientsPage />
              </PageSuspense>
            )}
          </Route>
          <Route path="/new-client">
            {() => (
              <PageSuspense>
                <NewClientPage />
              </PageSuspense>
            )}
          </Route>
          <Route path="/clients/:id">
            {() => (
              <PageSuspense>
                <ClientDetailPage />
              </PageSuspense>
            )}
          </Route>
          <Route path="/clients/:id/collateral">
            {() => (
              <PageSuspense>
                <CollateralPage />
              </PageSuspense>
            )}
          </Route>
          <Route path="/questionnaire/:clientId">
            {() => (
              <PageSuspense>
                <QuestionnairePage />
              </PageSuspense>
            )}
          </Route>
          <Route path="/recommendation/:clientId">
            {() => (
              <PageSuspense>
                <RecommendationPage />
              </PageSuspense>
            )}
          </Route>
          <Route path="/calculator">
            {() => (
              <PageSuspense>
                <CalculatorPage />
              </PageSuspense>
            )}
          </Route>
          <Route path="/knowledge">
            {() => (
              <PageSuspense>
                <KnowledgePage />
              </PageSuspense>
            )}
          </Route>
          <Route path="/catalog">
            {() => (
              <PageSuspense>
                <CatalogPage />
              </PageSuspense>
            )}
          </Route>
          <Route path="/basket/:clientId">
            {() => (
              <PageSuspense>
                <BasketPage />
              </PageSuspense>
            )}
          </Route>
          <Route path="/pdf-share/:clientId">
            {() => (
              <PageSuspense>
                <PdfSharePage />
              </PageSuspense>
            )}
          </Route>
          <Route path="/profile">
            {() => (
              <PageSuspense>
                <ProfilePage />
              </PageSuspense>
            )}
          </Route>
          <Route path="/products">
            {() => (
              <PageSuspense>
                <ProductsPage />
              </PageSuspense>
            )}
          </Route>
          <Route path="/credit-lines">
            {() => (
              <PageSuspense>
                <CreditLinesPage />
              </PageSuspense>
            )}
          </Route>
          <Route path="/scan/:clientId">
            {() => (
              <PageSuspense>
                <ScanDocumentPage />
              </PageSuspense>
            )}
          </Route>
          <Route>
            {() => (
              <PageSuspense>
                <NotFound />
              </PageSuspense>
            )}
          </Route>
        </Switch>
      </ErrorBoundary>
    </MiniAppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AuthGate />
          </WouterRouter>
        </AuthProvider>
        <Toaster />
        <SonnerToaster position="top-center" richColors />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
