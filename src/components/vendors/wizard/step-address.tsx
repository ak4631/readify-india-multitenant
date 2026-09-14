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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { updateVendorAddress } from "@/server/actions/vendors.actions";
import {
  vendorAddressSchema,
  type VendorAddressInput,
} from "@/lib/validations/vendor.schema";
import { AddressMapPicker } from "./address-map-picker";
import type { GeocodeResult } from "@/lib/geocoding";

export function StepAddress({ vendorId }: { vendorId: string }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<VendorAddressInput>({
    resolver: zodResolver(vendorAddressSchema),
    defaultValues: {
      addressLine1: "",
      addressLine2: "",
      city: "",
      state: "",
      pincode: "",
      latitude: undefined,
      longitude: undefined,
    },
  });

  function handleMapChange(lat: number, lng: number) {
    form.setValue("latitude", lat, { shouldValidate: true });
    form.setValue("longitude", lng, { shouldValidate: true });
  }

  function handleAddressSelect(result: GeocodeResult) {
    if (result.city && !form.getValues("city")) form.setValue("city", result.city);
    if (result.state && !form.getValues("state")) form.setValue("state", result.state);
    if (result.pincode && !form.getValues("pincode")) form.setValue("pincode", result.pincode);
  }

  async function onSubmit(values: VendorAddressInput) {
    setIsSubmitting(true);
    try {
      await updateVendorAddress(vendorId, values);
      toast.success("Address saved");
      router.push(`/vendors/new?step=3&vendorId=${vendorId}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save address",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8">
          <div className="mb-6">
            <h2 className="text-lg font-semibold">Location</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Store the address and city used later for nearby discovery.
            </p>
          </div>
          <div className="space-y-5">
            <div>
              <FormLabel>Pin location on map</FormLabel>
              <div className="mt-2">
                <AddressMapPicker
                  latitude={form.watch("latitude")}
                  longitude={form.watch("longitude")}
                  onChange={handleMapChange}
                  onAddressSelect={handleAddressSelect}
                />
              </div>
              {form.formState.errors.latitude && (
                <p className="mt-2 text-sm text-destructive">
                  {form.formState.errors.latitude.message}
                </p>
              )}
            </div>
            <FormField
              control={form.control}
              name="addressLine1"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address Line 1</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="addressLine2"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address Line 2</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="state"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>State</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="pincode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Pincode</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
            >
              {isSubmitting ? "Saving..." : "Next: Verification"}
            </Button>
          </div>
        </section>
      </form>
    </Form>
  );
}
