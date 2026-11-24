// Generate a fixed action allowlist. Action implementations remain the source of truth.
const ts = require("typescript");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = path.join(root, "src/server/actions");
const imports = [],
  entries = [];
for (const file of fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".ts") && f !== "invoke.actions.ts")) {
  const full = path.join(dir, file);
  let source = fs.readFileSync(full, "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const edits = [],
    wrappers = [],
    names = [];
  for (const node of ast.statements) {
    if (
      !ts.isFunctionDeclaration(node) ||
      !node.body ||
      !node.name ||
      !node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    )
      continue;
    const name = node.name.text;
    names.push(name);
    if (node.body.getText(ast).includes("callBackend<")) continue;
    const local = `local_${name}`;
    const signature = source
      .slice(node.getStart(ast), node.body.getStart(ast))
      .replace("export async function " + name, "async function " + local);
    edits.push([node.getStart(ast), node.body.getStart(ast), signature]);
    wrappers.push(
      `\nexport async function ${name}(...args: Parameters<typeof ${local}>): Promise<Awaited<ReturnType<typeof ${local}>>> {\n  if (process.env.BACKEND_URL) {\n    const { callBackend } = await import("@/lib/backend-client");\n    return callBackend<Awaited<ReturnType<typeof ${local}>>>("${file.replace(".ts", "")}.${name}", args);\n  }\n  return ${local}(...args);\n}\n`,
    );
  }
  if (!names.length) continue;
  for (const [start, end, code] of edits.reverse())
    source = source.slice(0, start) + code + source.slice(end);
  fs.writeFileSync(full, source + wrappers.join(""));
  const alias = `module${imports.length}`;
  imports.push(
    `import * as ${alias} from "@/server/actions/${file.replace(".ts", "")}";`,
  );
  for (const name of names)
    entries.push(`  "${file.replace(".ts", "")}.${name}": ${alias}.${name},`);
}
fs.writeFileSync(
  path.join(root, "backend/action-registry.ts"),
  `${imports.join("\n")}\nexport const actions: Record<string, (...args: never[]) => Promise<unknown>> = {\n${entries.join("\n")}\n};\n`,
);
