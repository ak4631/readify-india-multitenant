import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CategoryFormDialog } from "@/components/vendor-categories/category-form-dialog";
import { CategoryTable } from "@/components/vendor-categories/category-table";
import { listVendorCategories } from "@/server/actions/vendor-categories.actions";

export default async function VendorCategoriesPage() {
  const categories = await listVendorCategories();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Catalog"
        title="Listing categories"
        description={`${categories.length} marketplace categories. Keep Library, Gym, Study Cafe, and Exam Hub here.`}
        actions={<CategoryFormDialog trigger={<Button>Add category</Button>} />}
      />
      <Card>
        <CardContent>
          <CategoryTable categories={categories} />
        </CardContent>
      </Card>
    </div>
  );
}
