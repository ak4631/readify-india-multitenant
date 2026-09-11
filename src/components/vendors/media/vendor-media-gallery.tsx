"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { VendorMedia } from "@/generated/prisma/client";
import { usePermission } from "@/hooks/use-permission";
import {
  deleteVendorMedia,
  setPrimaryVendorMedia,
  uploadVendorMedia,
} from "@/server/actions/vendor-media.actions";

export function VendorMediaGallery({
  vendorId,
  media,
}: {
  vendorId: string;
  media: VendorMedia[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [isUploading, setIsUploading] = useState(false);
  const canEdit = usePermission("vendor.update");

  async function handleUpload(formData: FormData) {
    setIsUploading(true);
    try {
      await uploadVendorMedia(formData);
      toast.success("Photo uploaded");
      formRef.current?.reset();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  }

  function handleDelete(mediaId: string) {
    startTransition(async () => {
      try {
        await deleteVendorMedia(mediaId);
        toast.success("Photo deleted");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Delete failed");
      }
    });
  }

  function handleSetPrimary(mediaId: string) {
    startTransition(async () => {
      try {
        await setPrimaryVendorMedia(mediaId);
        toast.success("Cover photo updated");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Action failed");
      }
    });
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <form ref={formRef} action={handleUpload} className="flex items-end gap-3">
          <input type="hidden" name="vendorId" value={vendorId} />
          <Input type="file" name="file" accept="image/jpeg,image/png,image/webp" required />
          <Button type="submit" disabled={isUploading}>
            {isUploading ? "Uploading..." : "Upload"}
          </Button>
        </form>
      )}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {media.map((item) => (
          <div key={item.id} className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.mediaUrl}
              alt=""
              className="aspect-square w-full rounded-md border object-cover"
            />
            <div className="flex items-center justify-between">
              {item.isPrimary ? (
                <Badge>Cover</Badge>
              ) : (
                canEdit && (
                  <Button variant="link" size="sm" onClick={() => handleSetPrimary(item.id)} disabled={isPending}>
                    Set as cover
                  </Button>
                )
              )}
              {canEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isPending}
                  onClick={() => handleDelete(item.id)}
                >
                  Delete
                </Button>
              )}
            </div>
          </div>
        ))}
        {media.length === 0 && (
          <p className="text-muted-foreground col-span-full text-sm">No photos uploaded yet.</p>
        )}
      </div>
    </div>
  );
}
