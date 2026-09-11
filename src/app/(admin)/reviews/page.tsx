import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ReviewTable } from "@/components/reviews/review-table";
import { listReviews } from "@/server/actions/reviews.actions";

export default async function ReviewsPage() {
  const reviews = await listReviews();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Moderation"
        title="Reviews"
        description={`${reviews.length} reviews. Hide, restore, or remove without deleting history.`}
      />
      <Card>
        <CardContent>
          <ReviewTable reviews={reviews} showVendor />
        </CardContent>
      </Card>
    </div>
  );
}
