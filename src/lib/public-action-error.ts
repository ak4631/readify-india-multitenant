// Deliberate business-rule messages are safe to send to the signed-in caller.
// Unexpected library/database exceptions must not be exposed verbatim.
export class PublicActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicActionError";
  }
}
