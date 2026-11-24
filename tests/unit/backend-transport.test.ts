import { describe, expect, it } from "vitest";
import {
  backendSignature,
  verifyBackendSignature,
} from "@/lib/backend-signature";
import { encodeWire, decodeWire } from "@/lib/backend-wire";

describe("separate backend transport", () => {
  it("binds signatures to the body and session cookie and rejects stale requests", () => {
    const secret = "a".repeat(32),
      time = String(Date.now());
    const signature = backendSignature(secret, time, "session=alice", "body");
    expect(
      verifyBackendSignature(secret, time, "session=alice", "body", signature),
    ).toBe(true);
    expect(
      verifyBackendSignature(secret, time, "session=bob", "body", signature),
    ).toBe(false);
    expect(
      verifyBackendSignature(
        secret,
        time,
        "session=alice",
        "changed",
        signature,
      ),
    ).toBe(false);
    expect(
      verifyBackendSignature(
        secret,
        time,
        "session=alice",
        "body",
        signature,
        Number(time) + 61_000,
      ),
    ).toBe(false);
    expect(
      verifyBackendSignature(secret, time, "session=alice", "body", "bad"),
    ).toBe(false);
    expect(() => backendSignature("short", time, "", "")).toThrow("32");
  });
  it("roundtrips dates, bigint, undefined and objects resembling wire tags", async () => {
    const input = {
      date: new Date("2026-11-24T00:00:00Z"),
      count: BigInt(123),
      missing: undefined,
      nested: ["date", { type: "date", value: "literal" }],
    };
    expect(decodeWire(await encodeWire(input))).toEqual(input);
  });
  it("preserves multipart uploads and duplicate form fields", async () => {
    const form = new FormData();
    form.append("tag", "one");
    form.append("tag", "two");
    form.append(
      "document",
      new File(["proof"], "proof.txt", { type: "text/plain" }),
    );
    const output = decodeWire(await encodeWire([form])) as FormData[];
    expect(output[0].getAll("tag")).toEqual(["one", "two"]);
    const file = output[0].get("document") as File;
    expect(file.name).toBe("proof.txt");
    expect(await file.text()).toBe("proof");
  });
});
