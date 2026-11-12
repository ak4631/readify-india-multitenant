"use client";
import { RequestErrorPanel } from "@/components/request-error-panel";
export default function AdminError(props: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <RequestErrorPanel {...props} />;
}
