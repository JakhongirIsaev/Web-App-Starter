import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import "@/i18n";
import LoginPage from "@/pages/login";
import MiniAppLayout from "@/components/mini-app-layout";
import HomePage from "@/pages/home";
import ClientsPage from "@/pages/clients";
import NewClientPage from "@/pages/new-client";
import ClientDetailPage from "@/pages/client-detail";
import QuestionnairePage from "@/pages/questionnaire";
import RecommendationPage from "@/pages/recommendation";
import CalculatorPage from "@/pages/calculator";
import KnowledgePage from "@/pages/knowledge";
import CatalogPage from "@/pages/catalog";
import BasketPage from "@/pages/basket";
import PdfSharePage from "@/pages/pdf-share";
import ProfilePage from "@/pages/profile";
import ProductsPage from "@/pages/products";
import ScanDocumentPage from "@/pages/scan-document";
import CreditLinesPage from "@/pages/credit-lines";
import NotFound from "@/pages/not-found";
import { ErrorBoundary } from "@/components/error-boundary";

const queryClient = new QueryClient();

function AuthGate() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center animate-pulse">
          <span className="text-primary-foreground font-bold text-xl">M</span>
        </div>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  return (
    <MiniAppLayout>
      <ErrorBoundary>
        <Switch>
          <Route path="/" component={HomePage} />
          <Route path="/clients" component={ClientsPage} />
          <Route path="/new-client" component={NewClientPage} />
          <Route path="/clients/:id" component={ClientDetailPage} />
          <Route path="/questionnaire/:clientId" component={QuestionnairePage} />
          <Route path="/recommendation/:clientId" component={RecommendationPage} />
          <Route path="/calculator" component={CalculatorPage} />
          <Route path="/knowledge" component={KnowledgePage} />
          <Route path="/catalog" component={CatalogPage} />
          <Route path="/basket/:clientId" component={BasketPage} />
          <Route path="/pdf-share/:clientId" component={PdfSharePage} />
          <Route path="/profile" component={ProfilePage} />
          <Route path="/products" component={ProductsPage} />
          <Route path="/credit-lines" component={CreditLinesPage} />
          <Route path="/scan/:clientId" component={ScanDocumentPage} />
          <Route component={NotFound} />
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
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
