// A global symbol survives independently compiled Server Action bundles. It
// cannot be supplied as an object property through the client request payload.
const PUBLIC_ACTION_ERROR = Symbol.for("zerotham.public-action-error");

export class PublicActionError extends Error {
  readonly [PUBLIC_ACTION_ERROR] = true;
  constructor(message: string) {
    super(message);
    this.name = "PublicActionError";
  }
}

export function isPublicActionError(
  error: unknown,
): error is PublicActionError {
  return (
    error instanceof Error && Reflect.get(error, PUBLIC_ACTION_ERROR) === true
  );
}
