"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { VendorAddress } from "@/generated/prisma/client";
import {
  vendorAddressSchema,
  type VendorAddressInput,
} from "@/lib/validations/vendor.schema";
import { updateVendorAddress } from "@/server/actions/vendors.actions";
import { AddressMapPicker } from "./wizard/address-map-picker";
import type { GeocodeResult } from "@/lib/geocoding";

export function VendorAddressEditDialog({
  vendorId,
  address,
}: {
  vendorId: string;
  address: VendorAddress | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<VendorAddressInput>({
    resolver: zodResolver(vendorAddressSchema),
    defaultValues: {
      addressLine1: address?.addressLine1 ?? "",
      addressLine2: address?.addressLine2 ?? "",
      city: address?.city ?? "",
      state: address?.state ?? "",
      pincode: address?.pincode ?? "",
      latitude: address?.latitude != null ? Number(address.latitude) : undefined,
      longitude: address?.longitude != null ? Number(address.longitude) : undefined,
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
      toast.success("Address updated");
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            {address ? "Edit Address" : "Add Address"}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Listing Address</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
            <DialogFooter>
              <Button
                type="submit"
                disabled={isSubmitting}
                aria-busy={isSubmitting}
              >
                {isSubmitting ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
