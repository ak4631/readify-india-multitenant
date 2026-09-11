"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
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
import {
  partnerUserSchema,
  type PartnerUserInput,
} from "@/lib/validations/partner.schema";
import { createPartnerUser } from "@/server/actions/partners.actions";

const ROLE_LABELS = {
  PARTNER_ADMIN: "Partner Admin",
  PARTNER_EMPLOYEE: "Partner Employee",
} as const;

export function PartnerUserDialog({
  partnerId,
  allowAdmin,
  trigger,
}: {
  partnerId: string;
  allowAdmin: boolean;
  trigger: React.ReactElement;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const form = useForm<PartnerUserInput>({
    resolver: zodResolver(partnerUserSchema),
    defaultValues: {
      partnerId,
      name: "",
      email: "",
      password: "",
      role: allowAdmin ? "PARTNER_ADMIN" : "PARTNER_EMPLOYEE",
    },
  });
  const role = useWatch({ control: form.control, name: "role" });

  async function onSubmit(values: PartnerUserInput) {
    setPending(true);
    try {
      await createPartnerUser(values);
      toast.success("Partner account created");
      setOpen(false);
      form.reset();
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not create account",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add partner team member</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue>{ROLE_LABELS[role]}</SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {allowAdmin && (
                        <SelectItem value="PARTNER_ADMIN">
                          Partner Admin
                        </SelectItem>
                      )}
                      <SelectItem value="PARTNER_EMPLOYEE">
                        Partner Employee
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Login email</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} />
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
                  <FormLabel>Initial password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    At least 10 characters with uppercase, lowercase, and a
                    number.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? "Creating..." : "Create account"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
