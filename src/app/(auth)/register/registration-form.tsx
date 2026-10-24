"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function RegistrationForm({
  services,
}: {
  services: { id: string; name: string }[];
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        const form = new FormData(event.currentTarget);
        try {
          const response = await fetch("/api/registration", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(Object.fromEntries(form)),
          });
          const result = await response.json();
          setSubmitted(response.ok);
          setMessage(
            response.ok
              ? "Application submitted. Our team will review your organization before activating access."
              : result.error,
          );
        } catch {
          setMessage("Could not submit. Please try again.");
        } finally {
          setPending(false);
        }
      }}
    >
      {!submitted && (
        <>
          {[
            ["organization", "Organization name", "text"],
            ["name", "Owner name", "text"],
            ["email", "Email", "email"],
            ["phone", "Phone", "tel"],
            ["password", "Password (12–72 characters)", "password"],
          ].map(([name, label, type]) => (
            <label key={name} className="block space-y-2">
              <span>{label}</span>
              <Input
                name={name}
                type={type}
                required
                minLength={name === "password" ? 12 : undefined}
                autoComplete={name === "password" ? "new-password" : undefined}
              />
            </label>
          ))}
          <label className="block space-y-2">
            <span>First service</span>
            <select
              name="service"
              className="w-full rounded border p-3"
              defaultValue="library"
            >
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={pending}>
            {pending ? "Submitting…" : "Submit for approval"}
          </Button>
        </>
      )}
      <p role="status">{message}</p>
      <Link href="/login" className="block text-primary underline">
        Sign in
      </Link>
    </form>
  );
}
