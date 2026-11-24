// Tagged tuples preserve dates, undefined, bigint and uploads without object-key collisions.
export type Wire = [string, unknown];
export async function encodeWire(value: unknown): Promise<Wire> {
  if (value === undefined) return ["undefined", null];
  if (value instanceof Date) return ["date", value.toISOString()];
  if (typeof value === "bigint") return ["bigint", String(value)];
  if (typeof File !== "undefined" && value instanceof File) {
    if (value.size > 4 * 1024 * 1024) throw new Error("File exceeds 4 MB");
    return [
      "file",
      [
        value.name,
        value.type,
        Buffer.from(await value.arrayBuffer()).toString("base64"),
      ],
    ];
  }
  if (value instanceof FormData)
    return [
      "form",
      await Promise.all(
        Array.from(value.entries(), async ([key, item]) => [
          key,
          await encodeWire(item),
        ]),
      ),
    ];
  if (Array.isArray(value))
    return ["array", await Promise.all(value.map(encodeWire))];
  if (value && typeof value === "object")
    return [
      "object",
      await Promise.all(
        Object.entries(value).map(async ([key, item]) => [
          key,
          await encodeWire(item),
        ]),
      ),
    ];
  return ["value", value];
}
export function decodeWire(wire: Wire): unknown {
  const [kind, value] = wire;
  switch (kind) {
    case "undefined":
      return undefined;
    case "date":
      return new Date(value as string);
    case "bigint":
      return BigInt(value as string);
    case "file": {
      const [name, type, data] = value as string[];
      return new File([Buffer.from(data, "base64")], name, { type });
    }
    case "array":
      return (value as Wire[]).map(decodeWire);
    case "object":
      return Object.fromEntries(
        (value as [string, Wire][]).map(([key, item]) => [
          key,
          decodeWire(item),
        ]),
      );
    case "form": {
      const form = new FormData();
      for (const [key, item] of value as [string, Wire][])
        form.append(key, decodeWire(item) as string | File);
      return form;
    }
    case "value":
      return value;
    default:
      throw new Error("Invalid backend payload");
  }
}
