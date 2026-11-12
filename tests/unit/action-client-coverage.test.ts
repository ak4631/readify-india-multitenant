import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? entry.name === "generated"
        ? []
        : sourceFiles(join(directory, entry.name))
      : /\.tsx?$/.test(entry.name)
        ? [join(directory, entry.name)]
        : [],
  );
}

it("routes every client-side Server Action import through the shared error transport", () => {
  const uncovered: string[] = [];
  let checked = 0;
  for (const file of sourceFiles("src")) {
    const text = readFileSync(file, "utf8");
    const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    if (
      !ast.statements.some(
        (node) =>
          ts.isExpressionStatement(node) &&
          ts.isStringLiteral(node.expression) &&
          node.expression.text === "use client",
      )
    )
      continue;
    for (const node of ast.statements) {
      if (
        !ts.isImportDeclaration(node) ||
        !ts.isStringLiteral(node.moduleSpecifier) ||
        !node.moduleSpecifier.text.startsWith("@/server/actions/") ||
        node.moduleSpecifier.text.endsWith("/invoke.actions")
      )
        continue;
      const clause = node.importClause;
      if (!clause || clause.isTypeOnly) continue;
      if (!clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) {
        uncovered.push(file);
        continue;
      }
      for (const item of clause.namedBindings.elements.filter(
        (element) => !element.isTypeOnly,
      )) {
        checked++;
        if (
          !item.name.text.startsWith("serverAction_") ||
          !text.includes(`actionClient(${item.name.text})`)
        )
          uncovered.push(`${file}: ${item.name.text}`);
      }
    }
  }
  expect(checked).toBeGreaterThan(49);
  expect(uncovered).toEqual([]);
});
