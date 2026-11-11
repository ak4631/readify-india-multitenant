// Copy approved assets and generate namespaced CSS to avoid semantic-token collisions.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const kit = path.resolve(root, process.argv[2] || "../brand-kit");
const copy = (from, to) => {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
};
const tokens = JSON.parse(
  fs.readFileSync(path.join(kit, "tokens.json"), "utf8"),
);
for (const name of ["zerotham-logo.png", "zerotham-symbol.png"])
  copy(path.join(kit, "assets", name), path.join(root, "public/brand", name));
for (const name of fs.readdirSync(path.join(kit, "fonts")))
  if (name.endsWith(".ttf") || name.endsWith("LICENSE.txt"))
    copy(
      path.join(kit, "fonts", name),
      path.join(root, "src/assets/fonts", name),
    );
fs.mkdirSync(path.join(root, "src/styles"), { recursive: true });
fs.writeFileSync(
  path.join(root, "src/styles/brand-tokens.css"),
  "/* Generated from brand-kit/tokens.json by scripts/sync-brand-kit.js. */\n:root {\n" +
    Object.entries(tokens.colors)
      .map(([name, value]) => `  --brand-${name}: ${value};`)
      .join("\n") +
    `\n  --brand-easing: ${tokens.motion.easing};\n  --brand-duration: ${tokens.motion.interactionMs}ms;\n}\n`,
);
console.log("Synced ZEROTHAM palette, original artwork, licensed local fonts.");
