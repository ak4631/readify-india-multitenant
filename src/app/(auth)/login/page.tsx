"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
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
import { loginSchema, type LoginInput } from "@/lib/validations/auth.schema";
import { ArrowRight, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginInput) {
    setIsSubmitting(true);
    const result = await signIn("credentials", {
      ...values,
      redirect: false,
    });
    setIsSubmitting(false);

    if (result?.error) {
      toast.error("Invalid email or password");
      return;
    }

    router.push(searchParams.get("callbackUrl") ?? "/");
    router.refresh();
  }

  return (
    <main className="grid min-h-svh place-items-center bg-background px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8">
          <div className="mb-5 flex items-center gap-3">
            <Image
              src="/readify-logo.jpg"
              alt="Readify India"
              width={44}
              height={44}
              className="size-11 rounded-lg border border-border bg-white object-contain shadow-sm"
              priority
            />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Readify India
              </h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Management Portal
              </p>
            </div>
          </div>
          <div className="rounded-lg border border-primary/20 bg-secondary px-4 py-3 text-sm text-secondary-foreground">
            <div className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="size-4" aria-hidden="true" />
              Secure account access
            </div>
            <p className="mt-1 text-secondary-foreground/80">
              Sign in to continue to your authorized workspace.
            </p>
          </div>
        </div>

        <section className="rounded-lg border border-border bg-card p-7 shadow-[0_22px_60px_oklch(0.26_0.03_170_/_0.08)]">
          <div className="mb-7">
            <p className="text-xs font-semibold tracking-[0.08em] text-primary uppercase">
              Account Login
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              Welcome back
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Sign in to manage vendors, users, and bookings.
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email address</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        autoComplete="email"
                        placeholder="admin@example.com"
                        {...field}
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
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="current-password"
                        placeholder="Enter your password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting}
                aria-busy={isSubmitting}
              >
                {isSubmitting ? "Signing in..." : "Sign in"}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            </form>
          </Form>
        </section>
      </div>
    </main>
  );
}
