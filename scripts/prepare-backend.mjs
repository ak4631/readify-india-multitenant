import { cp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const destination = path.join(root, "backend/src");
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const folder of ["lib", "server", "config", "generated", "types"]) {
  await cp(path.join(root, "src", folder), path.join(destination, folder), {
    recursive: true,
  });
}
await cp(path.join(root, "src/app/api"), path.join(destination, "app/api"), {
  recursive: true,
});
// Browser auth stays on the frontend. Backend sessions are read from forwarded cookies.
await rm(path.join(destination, "app/api/auth"), {
  recursive: true,
  force: true,
});
await cp(path.join(root, "backend/routes"), path.join(destination, "app"), {
  recursive: true,
});
await cp(
  path.join(root, "backend/action-registry.ts"),
  path.join(destination, "action-registry.ts"),
);
// Cache invalidations are returned to the frontend that owns the rendered pages.
const { readdir } = await import("node:fs/promises");
for (const file of await readdir(path.join(destination, "server/actions"))) {
  const full = path.join(destination, "server/actions", file);
  const source = await readFile(full, "utf8");
  await writeFile(
    full,
    source.replaceAll(
      'from "next/cache"',
      'from "@/lib/backend-invalidations"',
    ),
  );
}
const tsconfig = JSON.parse(
  await readFile(path.join(root, "tsconfig.json"), "utf8"),
);
tsconfig.exclude = ["node_modules"];
await writeFile(
  path.join(root, "backend/tsconfig.json"),
  JSON.stringify(tsconfig, null, 2) + "\n",
);
console.log("Prepared independent backend sources in backend/src");
