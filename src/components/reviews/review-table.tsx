"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useSession } from "next-auth/react";
import { Textarea } from "@/components/ui/textarea";
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
import type { Review } from "@/generated/prisma/client";
import { usePermission } from "@/hooks/use-permission";
import {
  deleteReview,
  hideReview,
  restoreReview,
  replyToReview,
  type ReviewRow,
} from "@/server/actions/reviews.actions";

const STATUS_VARIANTS: Record<
  Review["status"],
  "default" | "secondary" | "destructive"
> = {
  PUBLISHED: "default",
  HIDDEN: "secondary",
  DELETED: "destructive",
  FLAGGED: "secondary",
};

export function ReviewTable({
  reviews,
  showVendor = false,
}: {
  reviews: ReviewRow[];
  showVendor?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const canHide = usePermission("review.hide");
  const canDelete = usePermission("review.delete");
  const canRestore = usePermission("review.restore");
  const { data: session } = useSession();
  const canReply = session?.user.roles.includes("PARTNER_ADMIN") ?? false;
  const [replyId, setReplyId] = useState<string | null>(null);
  const [reply, setReply] = useState("");

  function run(action: () => Promise<void>, message: string) {
    startTransition(async () => {
      try {
        await action();
        toast.success(message);
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
          {showVendor && <TableHead>Partner listing</TableHead>}
          <TableHead>User</TableHead>
          <TableHead>Rating</TableHead>
          <TableHead>Review</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {reviews.map((review) => (
          <TableRow key={review.id}>
            {showVendor && <TableCell>{review.vendor?.name}</TableCell>}
            <TableCell>{review.userName ?? "Guest"}</TableCell>
            <TableCell>{"⭐".repeat(review.rating)}</TableCell>
            <TableCell className="max-w-xs truncate">
              {review.reviewText ?? "—"}
              {review.ownerReply && (
                <p className="mt-2 whitespace-normal text-sm text-muted-foreground">
                  Owner: {review.ownerReply}
                </p>
              )}
              {replyId === review.id && (
                <div className="mt-2 space-y-2">
                  <Textarea
                    aria-label="Reply to customer"
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    maxLength={2000}
                  />
                  <Button
                    disabled={isPending || !reply.trim()}
                    onClick={() =>
                      run(async () => {
                        await replyToReview(review.id, reply);
                        setReplyId(null);
                        setReply("");
                      }, "Reply saved")
                    }
                  >
                    Save reply
                  </Button>
                </div>
              )}
            </TableCell>
            <TableCell>
              <Badge variant={STATUS_VARIANTS[review.status]}>
                {review.status}
              </Badge>
            </TableCell>
            <TableCell className="flex justify-end gap-2">
              {canReply && review.status === "PUBLISHED" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setReplyId(review.id);
                    setReply(review.ownerReply ?? "");
                  }}
                >
                  Reply
                </Button>
              )}
              {canHide && review.status === "PUBLISHED" && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  aria-busy={isPending}
                  onClick={() =>
                    run(() => hideReview(review.id), "Review hidden")
                  }
                >
                  Hide
                </Button>
              )}
              {canDelete && review.status !== "DELETED" && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  aria-busy={isPending}
                  onClick={() =>
                    run(() => deleteReview(review.id), "Review deleted")
                  }
                >
                  Delete
                </Button>
              )}
              {canRestore && review.status !== "PUBLISHED" && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  aria-busy={isPending}
                  onClick={() =>
                    run(() => restoreReview(review.id), "Review restored")
                  }
                >
                  Restore
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
        {reviews.length === 0 && (
          <TableRow>
            <TableCell
              colSpan={showVendor ? 6 : 5}
              className="text-muted-foreground text-center"
            >
              No reviews yet.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
