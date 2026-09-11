"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MenuItemFormDialog } from "@/components/vendors/study-cafe/menu-item-form-dialog";
import type { MenuCategory, MenuItem } from "@/generated/prisma/client";
import { usePermission } from "@/hooks/use-permission";
import {
  createMenuCategory,
  deleteMenuCategory,
  deleteMenuItem,
} from "@/server/actions/menu.actions";

type CategoryWithItems = MenuCategory & { items: MenuItem[] };

export function MenuEditor({
  vendorId,
  categories,
}: {
  vendorId: string;
  categories: CategoryWithItems[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newCategoryName, setNewCategoryName] = useState("");
  const canEdit = usePermission("vendor.update");

  function handleAddCategory() {
    if (!newCategoryName.trim()) return;
    startTransition(async () => {
      try {
        await createMenuCategory(vendorId, { name: newCategoryName.trim() });
        toast.success("Category added");
        setNewCategoryName("");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Action failed");
      }
    });
  }

  function handleDeleteCategory(categoryId: string) {
    startTransition(async () => {
      try {
        await deleteMenuCategory(categoryId);
        toast.success("Category removed");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Action failed");
      }
    });
  }

  function handleDeleteItem(itemId: string) {
    startTransition(async () => {
      try {
        await deleteMenuItem(vendorId, itemId);
        toast.success("Item removed");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Action failed");
      }
    });
  }

  return (
    <div className="space-y-6">
      {canEdit && (
        <div className="flex items-end gap-2">
          <Input
            placeholder="New category name (e.g. Coffee, Snacks)"
            className="w-64"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
          />
          <Button
            onClick={handleAddCategory}
            disabled={isPending || !newCategoryName.trim()}
            aria-busy={isPending}
          >
            + Add Category
          </Button>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {categories.map((category) => (
          <Card key={category.id}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{category.name}</CardTitle>
              {canEdit && (
                <div className="flex gap-2">
                  <MenuItemFormDialog
                    vendorId={vendorId}
                    categoryId={category.id}
                    trigger={
                      <Button variant="outline" size="sm">
                        + Item
                      </Button>
                    }
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    aria-busy={isPending}
                    onClick={() => handleDeleteCategory(category.id)}
                  >
                    Delete
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-2">
              {category.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                >
                  <div>
                    <span className="font-medium">{item.name}</span>{" "}
                    <span className="text-muted-foreground">
                      ₹{Number(item.price).toLocaleString()}
                    </span>
                    {!item.isAvailable && (
                      <Badge variant="secondary" className="ml-2">
                        Unavailable
                      </Badge>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex gap-1">
                      <MenuItemFormDialog
                        vendorId={vendorId}
                        categoryId={category.id}
                        item={item}
                        trigger={
                          <Button variant="ghost" size="sm">
                            Edit
                          </Button>
                        }
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isPending}
                        aria-busy={isPending}
                        onClick={() => handleDeleteItem(item.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              {category.items.length === 0 && (
                <p className="text-muted-foreground text-sm">No items yet.</p>
              )}
            </CardContent>
          </Card>
        ))}
        {categories.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No menu categories yet.
          </p>
        )}
      </div>
    </div>
  );
}
