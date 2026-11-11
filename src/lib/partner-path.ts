export function partnerPath(partnerId: string | undefined, module: string) {
  return partnerId
    ? `/partners/${encodeURIComponent(partnerId)}/${module}`
    : `/${module}`;
}
