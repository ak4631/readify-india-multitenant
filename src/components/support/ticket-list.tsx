"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createSupportTicket,
  resolveSupportTicket,
  type listSupportTickets,
} from "@/server/actions/support.actions";

export function TicketList({
  tickets,
  canRespond,
}: {
  tickets: Awaited<ReturnType<typeof listSupportTickets>>["items"];
  canRespond: boolean;
}) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [response, setResponse] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  function run(action: () => Promise<void>) {
    startTransition(async () => {
      try {
        await action();
        toast.success("Ticket updated");
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not update ticket",
        );
      }
    });
  }
  return (
    <div className="space-y-6">
      <form
        className="space-y-3 rounded-xl border p-5"
        onSubmit={(event) => {
          event.preventDefault();
          run(async () => {
            await createSupportTicket({ subject, message });
            setSubject("");
            setMessage("");
          });
        }}
      >
        <h2 className="font-semibold">Report a problem</h2>
        <Input
          aria-label="Subject"
          placeholder="Subject"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          maxLength={150}
          required
          minLength={3}
        />
        <Textarea
          aria-label="Problem details"
          placeholder="What happened? Include the booking reference, but no passwords or payment card details."
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={5000}
          required
          minLength={10}
        />
        <Button type="submit" disabled={pending}>
          Submit ticket
        </Button>
      </form>
      {tickets.map((ticket) => (
        <section key={ticket.id} className="space-y-3 rounded-xl border p-5">
          <h2 className="font-semibold">
            {ticket.subject} · {ticket.status}
          </h2>
          <p className="whitespace-pre-wrap">{ticket.message}</p>
          {ticket.response && (
            <p className="whitespace-pre-wrap text-muted-foreground">
              Support: {ticket.response}
            </p>
          )}
          {canRespond && ticket.status === "OPEN" && (
            <div className="space-y-2">
              <Textarea
                aria-label={`Response to ${ticket.subject}`}
                value={response[ticket.id] ?? ""}
                onChange={(event) =>
                  setResponse({ ...response, [ticket.id]: event.target.value })
                }
              />
              <Button
                disabled={pending || !response[ticket.id]?.trim()}
                onClick={() =>
                  run(() =>
                    resolveSupportTicket(ticket.id, response[ticket.id]),
                  )
                }
              >
                Respond and resolve
              </Button>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
