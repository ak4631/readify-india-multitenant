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
import type { LibrarySeatType } from "@/generated/prisma/client";
import {
  librarySeatTypeSchema,
  type LibrarySeatTypeInput,
} from "@/lib/validations/library-seat-type.schema";
import {
  createLibrarySeatType,
  updateLibrarySeatType,
} from "@/server/actions/library-seat-types.actions";

export function SeatTypeFormDialog({
  vendorId,
  seatType,
  trigger,
}: {
  vendorId: string;
  seatType?: LibrarySeatType;
  trigger: React.ReactElement;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<LibrarySeatTypeInput>({
    resolver: zodResolver(librarySeatTypeSchema),
    defaultValues: {
      name: seatType?.name ?? "",
      totalCount: seatType?.totalCount ?? 1,
    },
  });

  async function onSubmit(values: LibrarySeatTypeInput) {
    setIsSubmitting(true);
    try {
      if (seatType) {
        await updateLibrarySeatType(seatType.id, values);
        toast.success("Seat type updated");
      } else {
        await createLibrarySeatType(vendorId, values);
        toast.success("Seat type added");
      }
      setOpen(false);
      form.reset();
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Something went wrong",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {seatType ? "Edit Seat Type" : "Add Seat Type"}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. General, Premium, Cabin"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="totalCount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Total Seats</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      value={field.value}
                      onChange={(e) => field.onChange(e.target.valueAsNumber)}
                    />
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
