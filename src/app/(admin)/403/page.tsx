export default function ForbiddenPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
      <p className="text-sm font-semibold text-primary">Access restricted</p>
      <h1 className="text-2xl font-bold tracking-tight">403 — Access denied</h1>
      <p className="max-w-md text-sm leading-6 text-muted-foreground">
        You don&apos;t have permission to view this page. Contact an administrator if you believe
        this is a mistake.
      </p>
    </div>
  );
}
