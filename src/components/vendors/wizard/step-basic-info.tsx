"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { VendorCategory } from "@/generated/prisma/client";
import { createVendorDraft } from "@/server/actions/vendors.actions";
import {
  vendorBasicInfoSchema,
  type VendorBasicInfoInput,
} from "@/lib/validations/vendor.schema";
import { ArrowRight } from "lucide-react";

const COUNTRY_CODES = [
  { code: "+91", label: "India" },
  { code: "+1", label: "US/Canada" },
  { code: "+44", label: "UK" },
  { code: "+971", label: "UAE" },
];

export function StepBasicInfo({
  categories,
  partnerId,
}: {
  categories: VendorCategory[];
  partnerId?: string;
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [countryCode, setCountryCode] = useState("+91");

  const form = useForm<VendorBasicInfoInput>({
    resolver: zodResolver(vendorBasicInfoSchema),
    defaultValues: {
      partnerId,
      categoryId: "",
      name: "",
      description: "",
      phone: "",
      email: "",
      website: "",
    },
  });

  async function onSubmit(values: VendorBasicInfoInput) {
    setIsSubmitting(true);
    try {
      const phone = values.phone.trim().startsWith("+")
        ? values.phone.trim()
        : `${countryCode} ${values.phone.trim()}`;
      const vendor = await createVendorDraft({ ...values, phone });
      toast.success("Partner listing created");
      router.push(`/vendors/new?step=2&vendorId=${vendor.id}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create listing",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <section className="rounded-lg border border-border bg-card p-6 shadow-[0_18px_44px_oklch(0.26_0.03_170_/_0.06)] md:p-8">
          <div className="mb-6">
            <p className="text-xs font-semibold tracking-[0.08em] text-primary uppercase">
              Step 1
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">
              Basic information
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose a category and add the partner listing students and
              customers will see.
            </p>
          </div>
          <div className="grid gap-5">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <FormField
                control={form.control}
                name="categoryId"
                render={({ field }) => {
                  const selectedCategoryLabel =
                    categories.find((category) => category.id === field.value)
                      ?.name ?? "Select a category";

                  return (
                    <FormItem>
                      <FormLabel>Listing category</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue>{selectedCategoryLabel}</SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {categories.map((category) => (
                            <SelectItem key={category.id} value={category.id}>
                              {category.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Pick the marketplace vertical.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Listing name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Example: Prime Study Cafe"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Use the public-facing business name.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <div className="flex gap-2">
                      <Select
                        value={countryCode}
                        onValueChange={(value) => {
                          if (value) setCountryCode(value);
                        }}
                      >
                        <SelectTrigger className="w-28">
                          <SelectValue>{countryCode}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {COUNTRY_CODES.map((country) => (
                            <SelectItem key={country.code} value={country.code}>
                              {country.code} {country.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormControl>
                        <Input
                          inputMode="tel"
                          placeholder="98765 43210"
                          className="flex-1"
                          {...field}
                        />
                      </FormControl>
                    </div>
                    <FormDescription>
                      Stored with the selected country code.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="owner@example.com"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Optional, but useful for owner follow-up.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="website"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Website</FormLabel>
                  <FormControl>
                    <Input placeholder="https://example.com" {...field} />
                  </FormControl>
                  <FormDescription>
                    Optional. Include https:// when adding a website.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Add a short customer-facing summary of this listing."
                      className="min-h-32"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Optional. Keep it short; you can refine it after the draft
                    is created.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end border-t border-border pt-5">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Next: Address"}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </section>
      </form>
    </Form>
  );
}
