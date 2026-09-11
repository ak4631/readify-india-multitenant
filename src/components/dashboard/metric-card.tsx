import { Card, CardContent } from "@/components/ui/card";

export function MetricCard({
  label,
  value,
  description,
}: {
  label: string;
  value: number;
  description: string;
}) {
  return (
    <Card className="bg-card/95 shadow-none transition-colors hover:border-primary/30">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <span
            className="h-2 w-8 rounded-full bg-primary/70"
            aria-hidden="true"
          />
        </div>
        <p className="mt-3 font-mono text-3xl font-semibold tracking-tight text-foreground">
          {value.toLocaleString()}
        </p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      </CardContent>
    </Card>
  );
}
