import { AsyncLocalStorage } from "node:async_hooks";
export type Invalidation = [string, ("page" | "layout")?];
export const invalidations = new AsyncLocalStorage<Invalidation[]>();
export function revalidatePath(path: string, type?: "page" | "layout") {
  invalidations.getStore()?.push([path, type]);
}
