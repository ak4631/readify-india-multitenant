// Transport failures can happen before a Server Action runs (for example 413).
export function getActionErrorMessage(
  error: unknown,
  fallback = "Could not complete this request. Please try again.",
) {
  const value =
    error && typeof error === "object"
      ? (error as {
          message?: unknown;
          digest?: unknown;
          status?: unknown;
          statusCode?: unknown;
        })
      : {};
  const message =
    typeof value.message === "string"
      ? value.message
      : typeof error === "string"
        ? error
        : "";
  const digest = typeof value.digest === "string" ? value.digest : "";
  if (
    value.status === 413 ||
    value.statusCode === 413 ||
    /body exceeded|payload too large|FUNCTION_PAYLOAD_TOO_LARGE|\b413\b/i.test(
      message + " " + digest,
    )
  )
    return "The upload is too large. Choose a file of 4 MB or less.";
  if (
    /failed to fetch|networkerror|load failed|network request failed/i.test(
      message,
    )
  )
    return "Could not reach the server. Check your connection and try again.";
  if (/failed to find server action|older or newer deployment/i.test(message))
    return "This page is out of date. Refresh it and try again.";
  if (
    !message ||
    /minified react error|server components render|omitted in production/i.test(
      message,
    )
  )
    return (
      fallback +
      (digest
        ? ` Error reference: ${digest}`
        : " Refresh the page before retrying.")
    );
  return message;
}
