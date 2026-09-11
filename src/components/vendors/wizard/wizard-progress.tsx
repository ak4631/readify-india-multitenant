import { cn } from "@/lib/utils";

const STEPS = ["Basic Information", "Contact & Location", "Verification"];

export function WizardProgress({ currentStep }: { currentStep: number }) {
  return (
    <ol className="grid gap-3 sm:grid-cols-3">
      {STEPS.map((label, index) => {
        const step = index + 1;
        const isActive = step === currentStep;
        const isDone = step < currentStep;
        return (
          <li
            key={label}
            className={cn(
              "flex items-center gap-3 rounded-2xl border px-4 py-3",
              isActive && "border-primary/30 bg-secondary",
              isDone && "border-border bg-card",
              !isActive && !isDone && "border-border bg-card",
            )}
          >
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold",
                isActive && "bg-primary text-primary-foreground",
                isDone && "bg-secondary text-primary",
                !isActive && !isDone && "bg-muted text-muted-foreground",
              )}
            >
              {String(step).padStart(2, "0")}
            </span>
            <span className={cn("text-sm", isActive ? "font-semibold text-foreground" : "text-muted-foreground")}>
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
