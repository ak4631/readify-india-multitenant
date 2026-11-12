"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  membershipPlanSchema,
  type MembershipPlanInput,
} from "@/lib/validations/membership-plan.schema";
import {
  createMembershipPlan,
  updateMembershipPlan,
  type PlanRow,
} from "@/server/actions/membership-plans.actions";

const subscriptionDurations = [
  {
    value: "MONTHS-1",
    label: "Monthly · 1 month",
    unit: "MONTHS",
    duration: 1,
  },
  {
    value: "MONTHS-3",
    label: "Quarterly · 3 months",
    unit: "MONTHS",
    duration: 3,
  },
  {
    value: "YEARS-1",
    label: "Yearly · 1 year (12 months)",
    unit: "YEARS",
    duration: 1,
  },
] as const;

export function PlanFormDialog({
  vendorId,
  plan,
  trigger,
}: {
  vendorId: string;
  plan?: PlanRow;
  trigger: React.ReactElement;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveError, setSaveError] = useState("");

  const form = useForm<MembershipPlanInput>({
    resolver: zodResolver(membershipPlanSchema),
    defaultValues: {
      name: plan?.name ?? "",
      description: plan?.description ?? "",
      price: plan ? Number(plan.price) : 0,
      durationValue: plan?.durationValue ?? 1,
      durationUnit: plan?.durationUnit ?? "MONTHS",
      dailyHours: plan?.dailyHours ?? null,
      dailyStart: plan?.dailyStart ?? null,
      isFlexible: plan?.isFlexible ?? false,
    },
  });
  const durationUnit = useWatch({
    control: form.control,
    name: "durationUnit",
  });
  const isFlexible = useWatch({ control: form.control, name: "isFlexible" });

  // Flexible plans are always "1 Hour" duration under the hood (price is a
  // per-hour rate, not tied to any fixed duration) -- lock those fields
  // instead of asking the partner to set them redundantly.
  useEffect(() => {
    if (isFlexible) {
      form.setValue("durationUnit", "HOURS");
      form.setValue("durationValue", 1);
    } else if (form.getValues("durationUnit") === "HOURS") {
      form.setValue("durationUnit", "MONTHS");
      form.setValue("durationValue", 1);
    }
  }, [isFlexible, form]);

  async function onSubmit(values: MembershipPlanInput) {
    setIsSubmitting(true);
    setSaveError("");
    try {
      const result = plan
        ? await updateMembershipPlan(plan.id, values)
        : await createMembershipPlan(vendorId, values);
      if (!result.ok) {
        setSaveError(result.message);
        toast.error(result.message);
        return;
      }
      toast.success(
        result.outcome === "queued"
          ? "Draft saved. Submit it from Changes for approval."
          : "Plan saved.",
      );
      setOpen(false);
      form.reset();
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not reach the server. Please try again.";
      setSaveError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        setSaveError("");
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 border-b p-4 pr-12">
          <DialogTitle>{plan ? "Edit Plan" : "Add Plan"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex min-h-0 flex-col"
          >
            <div className="space-y-4 overflow-y-auto p-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
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
                        {...field}
                        rows={2}
                        className="max-h-32 min-h-20"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="isFlexible"
                render={({ field }) => (
                  <FormItem>
                    <Label className="flex items-center gap-2 font-normal">
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(checked) =>
                          field.onChange(checked === true)
                        }
                      />
                      Flexible plan (customer picks 1-14 days at checkout)
                    </Label>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid items-start gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {isFlexible
                          ? "Rate per hour (₹)"
                          : "Total plan price (₹)"}
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={field.value}
                          onChange={(e) =>
                            field.onChange(e.target.valueAsNumber)
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {!isFlexible && (
                  <FormField
                    control={form.control}
                    name="durationValue"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Subscription duration</FormLabel>
                        <Select
                          value={`${durationUnit}-${field.value}`}
                          onValueChange={(value) => {
                            const duration = subscriptionDurations.find(
                              (item) => item.value === value,
                            );
                            if (!duration) return;
                            form.setValue("durationUnit", duration.unit, {
                              shouldDirty: true,
                            });
                            field.onChange(duration.duration);
                          }}
                        >
                          <FormControl>
                            <SelectTrigger
                              className="w-full"
                              onBlur={field.onBlur}
                              ref={field.ref}
                            >
                              <SelectValue>
                                {subscriptionDurations.find(
                                  (item) =>
                                    item.value ===
                                    `${durationUnit}-${field.value}`,
                                )?.label ?? "Choose a duration"}
                              </SelectValue>
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {subscriptionDurations.map((item) => (
                              <SelectItem key={item.value} value={item.value}>
                                {item.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
              {(isFlexible ||
                durationUnit === "DAYS" ||
                durationUnit === "MONTHS" ||
                durationUnit === "YEARS") && (
                <FormField
                  control={form.control}
                  name="dailyHours"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {isFlexible
                          ? "Hours per day"
                          : "Hours per day (library seat)"}
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={24}
                          placeholder="e.g. 4"
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value === ""
                                ? null
                                : e.target.valueAsNumber,
                            )
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              {!isFlexible && ["MONTHS", "YEARS"].includes(durationUnit) && (
                <FormField
                  control={form.control}
                  name="dailyStart"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Daily access starts at</FormLabel>
                      <FormControl>
                        <Input
                          type="time"
                          value={field.value ?? ""}
                          onChange={(event) =>
                            field.onChange(event.target.value || null)
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              {!isFlexible && (
                <p className="text-sm text-muted-foreground">
                  Daily access must fit within your library’s opening hours.
                </p>
              )}
            </div>
            <DialogFooter className="mx-0 mb-0 shrink-0 flex-wrap">
              {saveError && (
                <p
                  role="alert"
                  className="w-full break-words text-sm text-destructive"
                >
                  {saveError}
                </p>
              )}
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
