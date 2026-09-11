"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CategoryFormDialog } from "@/components/vendor-categories/category-form-dialog";
import type { VendorCategory } from "@/generated/prisma/client";
import { usePermission } from "@/hooks/use-permission";
import { deactivateVendorCategory } from "@/server/actions/vendor-categories.actions";

type CategoryRow = VendorCategory & { _count: { vendors: number } };

export function CategoryTable({ categories }: { categories: CategoryRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const canUpdate = usePermission("vendorCategory.update");
  const canDelete = usePermission("vendorCategory.delete");

  function handleDeactivate(category: CategoryRow) {
    startTransition(async () => {
      try {
        await deactivateVendorCategory(category.id);
        toast.success(`${category.name} deactivated`);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Action failed");
      }
    });
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Slug</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Listings</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {categories.map((category) => (
          <TableRow key={category.id}>
            <TableCell className="font-medium">{category.name}</TableCell>
            <TableCell className="text-muted-foreground">
              {category.slug}
            </TableCell>
            <TableCell>
              <Badge
                variant={category.status === "ACTIVE" ? "default" : "secondary"}
              >
                {category.status}
              </Badge>
            </TableCell>
            <TableCell>{category._count.vendors}</TableCell>
            <TableCell className="flex justify-end gap-2">
              {canUpdate && (
                <CategoryFormDialog
                  category={category}
                  trigger={
                    <Button variant="outline" size="sm">
                      Edit
                    </Button>
                  }
                />
              )}
              {canDelete && category.status === "ACTIVE" && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={() => handleDeactivate(category)}
                >
                  Deactivate
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
