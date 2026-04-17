import { useLocation } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import Logo from "@/components/logo";
import { buildApiUrl } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";

function StripePattern() {
  return (
    <svg
      className="absolute inset-0 w-full h-full opacity-[0.15]"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none"
    >
      <defs>
        <pattern
          id="login-stripes"
          x="0"
          y="0"
          width="20"
          height="100%"
          patternUnits="userSpaceOnUse"
        >
          <rect x="0" y="0" width="6" height="100%" fill="white" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#login-stripes)" />
    </svg>
  );
}

export default function Login() {
  const [_, setLocation] = useLocation();
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();

  const loginSchema = z.object({
    telegramId: z.string().min(1, t("login.telegramId")),
    password: z.string().min(1, t("login.password")),
  });

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      telegramId: "",
      password: "",
    },
  });

  const toggleLanguage = () => {
    const newLang = i18n.language === "ru" ? "uz" : "ru";
    i18n.changeLanguage(newLang);
    localStorage.setItem("minerva_lang", newLang);
  };

  async function onSubmit(values: z.infer<typeof loginSchema>) {
    const telegramId = values.telegramId.replace(/\s+/g, "").trim();

    // Make the first login request stateless so a stale token can never poison it.
    localStorage.removeItem("auth_token");

    try {
      const response = await fetch(buildApiUrl("/api/auth/login"), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          telegramId,
          password: values.password,
        }),
      });

      const rawBody = await response.text();
      const data = rawBody ? JSON.parse(rawBody) : null;

      if (!response.ok) {
        const message =
          typeof data?.error === "string" && data.error.trim()
            ? `HTTP ${response.status}: ${data.error}`
            : t("login.invalidCredentials");

        throw new Error(message);
      }

      localStorage.setItem("auth_token", data.token);
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      toast({
        title: t("login.welcomeBack"),
        description: t("login.loggedInAs", { name: data.user.name }),
      });
      setLocation("/");
    } catch (error) {
      toast({
        variant: "destructive",
        title: t("login.authFailed"),
        description:
          error instanceof Error && error.message
            ? error.message
            : t("login.invalidCredentials"),
      });
    }
  }

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row">
      {/* Hero — left 55% on desktop, compact header on mobile */}
      <div
        className="relative overflow-hidden lg:w-[55%] flex-shrink-0"
        style={{
          background:
            "linear-gradient(135deg, #0D3D1A 0%, #155D27 50%, #1A7A32 100%)",
        }}
      >
        <StripePattern />

        {/* Desktop hero content */}
        <div className="hidden lg:flex relative z-10 flex-col justify-center h-full p-16">
          <Logo size={48} textColor="text-white" className="mb-8" />
          <p className="text-white/60 max-w-sm" style={{ fontSize: 15 }}>
            {t("login.tagline")}
          </p>
        </div>

        {/* Mobile compact header */}
        <div className="flex lg:hidden relative z-10 items-center justify-center py-8">
          <Logo size={36} textColor="text-white" />
        </div>
      </div>

      {/* Right panel — white, form */}
      <div className="flex-1 flex items-center justify-center bg-white p-8">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900">
              {t("login.title")}
            </h2>
            <p className="text-sm text-gray-500">{t("login.subtitle")}</p>
          </div>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-5"
            >
              <FormField
                control={form.control}
                name="telegramId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-700">
                      {t("login.telegramId")}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("login.telegramPlaceholder")}
                        {...field}
                        className="h-10"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-700">
                      {t("login.password")}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="********"
                        {...field}
                        className="h-10"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full h-10 text-sm font-medium"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("login.authenticating")}
                  </>
                ) : (
                  t("login.signIn")
                )}
              </Button>
            </form>
          </Form>

          {/* Language switcher */}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={toggleLanguage}
              className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              <Globe className="w-3.5 h-3.5" />
              {i18n.language === "ru" ? "O'zbekcha" : "Русский"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
