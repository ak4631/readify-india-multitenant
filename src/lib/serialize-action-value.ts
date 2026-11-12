import { Prisma } from "@/generated/prisma/client";

// Preserve React-supported dates while removing Prisma Decimal class instances
// before the response leaves the catchable action boundary.
export function serializeActionValue<T>(value: T): T {
  if (Prisma.Decimal.isDecimal(value)) return Number(value) as T;
  if (Array.isArray(value)) return value.map(serializeActionValue) as T;
  if (
    value &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  )
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        serializeActionValue(item),
      ]),
    ) as T;
  return value;
}
