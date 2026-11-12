"use client";
import { RequestErrorPanel } from "@/components/request-error-panel";
export default function ListingError(props: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <RequestErrorPanel {...props} title="This listing could not be loaded" />
  );
}
