// Inlines <!--INC:parts/x.svg--> placeholders from src/*.tpl.html into
// finished artboards at the directory root. Usage: node assemble.mjs
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
for (const f of readdirSync("src")) {
  if (!f.endsWith(".tpl.html")) continue;
  let html = readFileSync(`src/${f}`, "utf8");
  html = html.replace(/<!--INC:([\w./-]+)-->/g, (_, p) => readFileSync(p, "utf8"));
  const out = f.replace(".tpl.html", ".dc.html");
  writeFileSync(out, html);
  console.log(out, html.length);
}
