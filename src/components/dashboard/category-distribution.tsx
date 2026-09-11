import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function CategoryDistribution({
  data,
}: {
  data: { category: string; count: number }[];
}) {
  const max = Math.max(1, ...data.map((row) => row.count));

  return (
    <Card>
      <CardHeader className="border-b border-border">
        <p className="text-xs font-semibold tracking-[0.08em] text-primary uppercase">
          Marketplace mix
        </p>
        <CardTitle className="text-xl">Partner listing distribution</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-2">
        {data.map((row) => (
          <div key={row.category} className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="font-medium">{row.category}</span>
              <span className="font-mono text-muted-foreground">
                {row.count}
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted ring-1 ring-border/60">
              <div
                className="h-2 rounded-full bg-primary transition-[width]"
                style={{ width: `${(row.count / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
        {data.length === 0 && (
          <div className="rounded-lg border border-dashed border-border bg-muted/40 p-6 text-center">
            <p className="text-sm font-semibold">No partner listings yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Category mix will appear after the first partner listing is
              onboarded.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
