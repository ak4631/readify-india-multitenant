"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import type { VendorCategory } from "@/generated/prisma/client";
import { VendorStatus } from "@/generated/prisma/enums";

const ALL = "__all__";

function formatStatusLabel(status: VendorStatus) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function VendorFilters({
  categories,
}: {
  categories: VendorCategory[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedCategoryId = searchParams.get("categoryId") ?? ALL;
  const selectedStatus = (searchParams.get("status") ?? ALL) as
    VendorStatus | typeof ALL;
  const selectedCategoryLabel =
    selectedCategoryId === ALL
      ? "All categories"
      : (categories.find((category) => category.id === selectedCategoryId)
          ?.name ?? "All categories");
  const selectedStatusLabel =
    selectedStatus === ALL ? "All statuses" : formatStatusLabel(selectedStatus);

  function updateParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === ALL || !value) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-3 rounded-lg border border-border bg-muted/40 p-3">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          updateParam(
            "q",
            new FormData(event.currentTarget).get("q") as string,
          );
        }}
        className="flex gap-2"
      >
        <Input
          key={searchParams.get("q") ?? ""}
          name="q"
          aria-label="Search listings"
          placeholder="Search listings…"
          defaultValue={searchParams.get("q") ?? ""}
        />
        <button className="rounded-md border px-3 text-sm whitespace-nowrap">
          Search
        </button>
      </form>
      <Select
        value={selectedCategoryId}
        onValueChange={(value) => updateParam("categoryId", value)}
      >
        <SelectTrigger aria-label="Filter by category" className="w-48">
          <SelectValue>{selectedCategoryLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All categories</SelectItem>
          {categories.map((category) => (
            <SelectItem key={category.id} value={category.id}>
              {category.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={selectedStatus}
        onValueChange={(value) => updateParam("status", value)}
      >
        <SelectTrigger aria-label="Filter by status" className="w-48">
          <SelectValue>{selectedStatusLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All statuses</SelectItem>
          {Object.values(VendorStatus).map((status) => (
            <SelectItem key={status} value={status}>
              {formatStatusLabel(status)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        key={searchParams.get("city") ?? ""}
        aria-label="Filter by city"
        placeholder="City"
        className="w-48"
        defaultValue={searchParams.get("city") ?? ""}
        onBlur={(event) => updateParam("city", event.target.value)}
      />
      <Link
        className="self-center text-sm text-primary underline whitespace-nowrap"
        href={
          searchParams.get("partnerId")
            ? `${pathname}?partnerId=${encodeURIComponent(searchParams.get("partnerId")!)}`
            : pathname
        }
      >
        Clear filters
      </Link>
    </div>
  );
}
