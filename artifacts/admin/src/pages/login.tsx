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
      <div className="hidden md:flex flex-col flex-1 bg-sidebar p-12 justify-between relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-transparent pointer-events-none" />
        
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-primary-foreground rounded-sm" />
            </div>
            <span className="font-bold text-2xl text-sidebar-foreground tracking-tight">{t("login.branding")}</span>
          </div>
          
          <h1 className="text-4xl md:text-5xl font-bold text-sidebar-foreground leading-tight max-w-lg mb-6">
            {t("login.headline")}
          </h1>
          <p className="text-sidebar-foreground/70 text-lg max-w-md">
            {t("login.tagline")}
          </p>
        </div>
        
        <div className="relative z-10 flex items-center gap-2 text-sidebar-foreground/50 text-sm font-medium">
          <ShieldCheck className="w-4 h-4" />
          {t("login.encryption")}
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8 bg-background relative">
        <div className="w-full max-w-md space-y-8">
          <div className="space-y-2 text-center md:text-left">
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
