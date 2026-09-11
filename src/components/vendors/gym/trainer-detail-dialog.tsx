"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  Trainer,
  TrainerAvailability,
  TrainerPricing,
  TrainerSpecialization,
  TrainerSpecializationMap,
} from "@/generated/prisma/client";
import { TRAINER_DAYS_OF_WEEK } from "@/lib/validations/trainer.schema";
import {
  addTrainerPricing,
  deleteTrainerPricing,
  setTrainerAvailability,
  setTrainerSpecializations,
} from "@/server/actions/trainers.actions";

type TrainerWithRelations = Trainer & {
  specializations: (TrainerSpecializationMap & { specialization: TrainerSpecialization })[];
  pricing: TrainerPricing[];
  availability: TrainerAvailability[];
};

function toHHMM(date: Date): string {
  return date.toISOString().slice(11, 16);
}

export function TrainerDetailDialog({
  trainer,
  allSpecializations,
  trigger,
}: {
  trainer: TrainerWithRelations;
  allSpecializations: TrainerSpecialization[];
  trigger: React.ReactElement;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [selectedSpecs, setSelectedSpecs] = useState(
    new Set(trainer.specializations.map((s) => s.specializationId)),
  );

  const [priceForm, setPriceForm] = useState({
    price: "",
    durationValue: "1",
    durationUnit: "MONTHS" as "DAYS" | "MONTHS" | "YEARS" | "SESSIONS",
  });

  const [slots, setSlots] = useState(
    trainer.availability.map((a) => ({
      dayOfWeek: a.dayOfWeek,
      startTime: toHHMM(a.startTime),
      endTime: toHHMM(a.endTime),
    })),
  );

  function toggleSpec(id: string) {
    setSelectedSpecs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function saveSpecs() {
    startTransition(async () => {
      try {
        await setTrainerSpecializations(trainer.id, Array.from(selectedSpecs));
        toast.success("Specializations updated");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Update failed");
      }
    });
  }

  function handleAddPricing() {
    startTransition(async () => {
      try {
        await addTrainerPricing(trainer.id, {
          price: Number(priceForm.price),
          durationValue: Number(priceForm.durationValue),
          durationUnit: priceForm.durationUnit,
        });
        toast.success("Pricing added");
        setPriceForm({ price: "", durationValue: "1", durationUnit: "MONTHS" });
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Action failed");
      }
    });
  }

  function handleDeletePricing(pricingId: string) {
    startTransition(async () => {
      try {
        await deleteTrainerPricing(pricingId);
        toast.success("Pricing removed");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Action failed");
      }
    });
  }

  function addSlot() {
    setSlots((prev) => [...prev, { dayOfWeek: "MONDAY", startTime: "06:00", endTime: "10:00" }]);
  }

  function removeSlot(index: number) {
    setSlots((prev) => prev.filter((_, i) => i !== index));
  }

  function updateSlot(index: number, patch: Partial<(typeof slots)[number]>) {
    setSlots((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function saveAvailability() {
    startTransition(async () => {
      try {
        await setTrainerAvailability(trainer.id, slots);
        toast.success("Availability updated");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Update failed");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{trainer.name}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="specializations">
          <TabsList>
            <TabsTrigger value="specializations">Specializations</TabsTrigger>
            <TabsTrigger value="pricing">Pricing</TabsTrigger>
            <TabsTrigger value="availability">Availability</TabsTrigger>
          </TabsList>

          <TabsContent value="specializations" className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {allSpecializations.map((spec) => (
                <Label key={spec.id} className="flex items-center gap-2 font-normal">
                  <Checkbox
                    checked={selectedSpecs.has(spec.id)}
                    onCheckedChange={() => toggleSpec(spec.id)}
                  />
                  {spec.name}
                </Label>
              ))}
            </div>
            <Button size="sm" onClick={saveSpecs} disabled={isPending}>
              Save Specializations
            </Button>
          </TabsContent>

          <TabsContent value="pricing" className="space-y-4">
            <div className="space-y-2">
              {trainer.pricing.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                  <span>
                    ₹{Number(p.price).toLocaleString()} / {p.durationValue}{" "}
                    {p.durationUnit.toLowerCase()}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onClick={() => handleDeletePricing(p.id)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              {trainer.pricing.length === 0 && (
                <p className="text-muted-foreground text-sm">No pricing set yet.</p>
              )}
            </div>
            <div className="flex items-end gap-2">
              <div className="space-y-1">
                <Label>Price (₹)</Label>
                <Input
                  type="number"
                  className="w-28"
                  value={priceForm.price}
                  onChange={(e) => setPriceForm((f) => ({ ...f, price: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Duration</Label>
                <Input
                  type="number"
                  className="w-20"
                  value={priceForm.durationValue}
                  onChange={(e) => setPriceForm((f) => ({ ...f, durationValue: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Unit</Label>
                <Select
                  value={priceForm.durationUnit}
                  onValueChange={(v) =>
                    setPriceForm((f) => ({
                      ...f,
                      durationUnit: v as typeof f.durationUnit,
                    }))
                  }
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SESSIONS">Sessions</SelectItem>
                    <SelectItem value="DAYS">Days</SelectItem>
                    <SelectItem value="MONTHS">Months</SelectItem>
                    <SelectItem value="YEARS">Years</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" onClick={handleAddPricing} disabled={isPending || !priceForm.price}>
                Add
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="availability" className="space-y-4">
            <div className="space-y-2">
              {slots.map((slot, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Select
                    value={slot.dayOfWeek}
                    onValueChange={(v) => updateSlot(index, { dayOfWeek: v as typeof slot.dayOfWeek })}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRAINER_DAYS_OF_WEEK.map((day) => (
                        <SelectItem key={day} value={day}>
                          {day[0] + day.slice(1).toLowerCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="time"
                    className="w-28"
                    value={slot.startTime}
                    onChange={(e) => updateSlot(index, { startTime: e.target.value })}
                  />
                  <span className="text-muted-foreground text-sm">to</span>
                  <Input
                    type="time"
                    className="w-28"
                    value={slot.endTime}
                    onChange={(e) => updateSlot(index, { endTime: e.target.value })}
                  />
                  <Button variant="ghost" size="sm" onClick={() => removeSlot(index)}>
                    Remove
                  </Button>
                </div>
              ))}
              {slots.length === 0 && (
                <p className="text-muted-foreground text-sm">No availability set yet.</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={addSlot}>
                + Add Slot
              </Button>
              <Button size="sm" onClick={saveAvailability} disabled={isPending}>
                Save Availability
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
