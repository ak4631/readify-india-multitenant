import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CategoryFormDialog } from "@/components/vendor-categories/category-form-dialog";
import { CategoryTable } from "@/components/vendor-categories/category-table";
import { ListPagination } from "@/components/layout/list-pagination";
import { parsePage } from "@/lib/pagination";
import { listVendorCategoriesPage } from "@/server/actions/vendor-categories.actions";

export default async function VendorCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const categories = await listVendorCategoriesPage(parsePage(params.page));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Catalog"
        title="Listing categories"
        description={`${categories.total} marketplace categories. Keep Library, Gym, Co-working Space, and Exam Hub here.`}
        actions={<CategoryFormDialog trigger={<Button>Add category</Button>} />}
      />
      <Card>
        <CardContent>
          <CategoryTable categories={categories.items} />
          <ListPagination
            page={categories}
            path="/vendor-categories"
            params={params}
            noun="categories"
          />
        </CardContent>
      </Card>
    </div>
  );
}
