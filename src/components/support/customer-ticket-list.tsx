"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { actionClient } from "@/lib/action-client";
import { respondToCustomerTicket as serverAction_respondToCustomerTicket } from "@/server/actions/customer-support.actions";
const respond = actionClient(serverAction_respondToCustomerTicket);
type Ticket = {
  id: string;
  subject: string;
  message: string;
  status: string;
  response: string | null;
};
export function CustomerTicketList({ tickets }: { tickets: Ticket[] }) {
  const [pending, start] = useTransition();
  const [responses, setResponses] = useState<Record<string, string>>({});
  const router = useRouter();
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Customer support tickets</h2>
      {!tickets.length && <p>No customer tickets yet.</p>}
      {tickets.map((t) => (
        <article key={t.id} className="space-y-3 rounded-xl border p-5">
          <h3 className="font-semibold">
            {t.subject} · {t.status}
          </h3>
          <p className="whitespace-pre-wrap">{t.message}</p>
          {t.response ? (
            <p className="whitespace-pre-wrap">Reply: {t.response}</p>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  try {
                    await respond(t.id, responses[t.id] ?? "");
                    router.refresh();
                    toast.success("Reply sent");
                  } catch (e) {
                    toast.error(
                      e instanceof Error ? e.message : "Could not send reply",
                    );
                  }
                });
              }}
            >
              <textarea
                className="w-full rounded-lg border p-3"
                aria-label={`Response to ${t.subject}`}
                minLength={3}
                maxLength={5000}
                required
                value={responses[t.id] ?? ""}
                onChange={(e) =>
                  setResponses((v) => ({ ...v, [t.id]: e.target.value }))
                }
              />
              <button
                disabled={pending}
                className="rounded-lg bg-primary p-3 text-primary-foreground"
              >
                Reply and resolve
              </button>
            </form>
          )}
        </article>
      ))}
    </section>
  );
}
