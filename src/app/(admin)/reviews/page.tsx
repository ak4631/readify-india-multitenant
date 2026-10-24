import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ReviewTable } from "@/components/reviews/review-table";
import { ListPagination } from "@/components/layout/list-pagination";
import { parsePage } from "@/lib/pagination";
import { listReviews } from "@/server/actions/reviews.actions";

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const reviews = await listReviews({ page: parsePage(params.page) });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Moderation"
        title="Reviews"
        description={`${reviews.total} reviews. Hide, restore, or remove without deleting history.`}
      />
      <Card>
        <CardContent>
          <ReviewTable reviews={reviews.items} showVendor />
          <ListPagination
            page={reviews}
            path="/reviews"
            params={params}
            noun="reviews"
          />
        </CardContent>
      </Card>
    </div>
  );
}
