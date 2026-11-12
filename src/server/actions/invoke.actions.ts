"use server";

import { randomUUID } from "node:crypto";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { serializeActionValue } from "@/lib/serialize-action-value";
import { isPublicActionError } from "@/lib/public-action-error";

export type ActionResponse<T> =
  { success: true; value: T } | { success: false; message: string };

// React serializes the callback as a registered Server Function reference. The
// target action retains its own authorization and input validation checks.
export async function invokeAction<Args extends unknown[], T>(
  action: (...args: Args) => Promise<T>,
  args: Args,
): Promise<ActionResponse<T>> {
  try {
    return {
      success: true,
      value: serializeActionValue(await action(...args)),
    };
  } catch (error) {
    unstable_rethrow(error);
    if (isPublicActionError(error))
      return { success: false, message: error.message };
    if (
      error instanceof ZodError ||
      (error instanceof Error &&
        error.name === "ZodError" &&
        "issues" in error &&
        Array.isArray(error.issues) &&
        error.issues.every(
          (issue) => issue && typeof issue.message === "string",
        ))
    )
      return {
        success: false,
        message: (error.issues as { message: string }[])
          .map((issue) => issue.message)
          .join(" "),
      };
    const reference = randomUUID();
    console.error("Server action failed", { reference, error });
    return {
      success: false,
      message: `Could not complete this request. Please try again. Error reference: ${reference}`,
    };
  }
}
