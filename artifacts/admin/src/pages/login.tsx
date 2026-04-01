import { useState } from "react";
import { useLocation } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ShieldCheck, Loader2 } from "lucide-react";
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

const STRIPES = Array.from({ length: 40 }).map((_, i) => {
  const seed = Math.sin(i * 9301 + 49297) * 49297;
  const r = seed - Math.floor(seed);
  return {
    width: `${2 + r * 3}%`,
    marginRight: `${0.5 + (Math.sin(i * 127 + 311) * 0.5 + 0.5)}%`,
    background: `linear-gradient(180deg, 
      hsl(142 71% ${35 + Math.sin(i * 0.5) * 20}%) 0%, 
      hsl(145 55% ${25 + Math.cos(i * 0.3) * 15}%) 50%,
      hsl(140 60% ${30 + Math.sin(i * 0.7) * 15}%) 100%)`,
  };
});

function StripeBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden opacity-[0.15]">
      <div className="absolute inset-0 flex">
        {STRIPES.map((s, i) => (
          <div
            key={i}
            className="flex-shrink-0"
            style={{ width: s.width, height: "100%", background: s.background, marginRight: s.marginRight }}
          />
        ))}
      </div>
    </div>
  );
}

export default function Login() {
  const [_, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation();
  const loginMutation = useLogin();

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

  function onSubmit(values: z.infer<typeof loginSchema>) {
    loginMutation.mutate({ data: values }, {
      onSuccess: (response) => {
        localStorage.setItem("auth_token", response.token);
        toast({
          title: t("login.welcomeBack"),
          description: t("login.loggedInAs", { name: response.user.name }),
        });
        setLocation("/");
      },
      onError: (error: any) => {
        toast({
          variant: "destructive",
          title: t("login.authFailed"),
          description: error?.message || t("login.invalidCredentials"),
        });
      }
    });
  }

  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row bg-background">
      <div className="hidden md:flex flex-col flex-1 relative overflow-hidden" style={{ background: "linear-gradient(160deg, #0d3d1a 0%, #155d27 40%, #1a7a32 100%)" }}>
        <StripeBackground />
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent pointer-events-none" />
        
        <div className="relative z-10 flex flex-col justify-between h-full p-12">
          <div>
            <Logo size={36} textColor="text-white" className="mb-16" />
            
            <h1 className="text-4xl md:text-5xl font-bold text-white leading-tight max-w-lg mb-6">
              {t("login.headline")}
            </h1>
            <p className="text-white/60 text-lg max-w-md">
              {t("login.tagline")}
            </p>
          </div>
          
          <div className="flex items-center gap-2 text-white/40 text-sm font-medium">
            <ShieldCheck className="w-4 h-4" />
            {t("login.encryption")}
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8 bg-background relative">
        <div className="w-full max-w-md space-y-8">
          <div className="space-y-2 text-center md:text-left">
            <div className="md:hidden flex justify-center mb-6">
              <Logo size={40} textColor="text-foreground" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">{t("login.title")}</h2>
            <p className="text-muted-foreground">
              {t("login.subtitle")}
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="telegramId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("login.telegramId")}</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder={t("login.telegramPlaceholder")} 
                        {...field} 
                        className="h-12"
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
                    <FormLabel>{t("login.password")}</FormLabel>
                    <FormControl>
                      <Input 
                        type="password" 
                        placeholder="••••••••" 
                        {...field} 
                        className="h-12"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button 
                type="submit" 
                className="w-full h-12 text-base font-medium"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    {t("login.authenticating")}
                  </>
                ) : (
                  t("login.signIn")
                )}
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
