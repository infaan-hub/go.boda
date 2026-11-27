import { readdir, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("src");
const roles = ["admin", "partner"];
const methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"];

async function files(directory) {
  const out = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) out.push(...await files(absolute));
    else out.push(absolute);
  }
  return out;
}

for (const role of roles) {
  const appRoot = path.join(root, "roles", role, "src", "app");
  for (const source of await files(appRoot)) {
    const relative = path.relative(appRoot, source).split(path.sep).join("/");
    if (relative === "layout.tsx" || relative === "globals.css" || relative === "not-found.tsx") continue;
    if (relative.startsWith("[locale]/")) continue;
    if (role === "admin" && !(relative.startsWith("admin/") || relative.startsWith("api/"))) continue;
    if (role === "partner" && !(relative.startsWith("partner/") || relative.startsWith("api/") || relative === "safety/page.tsx" || relative === "offline/page.tsx")) continue;
    if (role === "partner" && relative.startsWith("partner/safety/")) continue;

    let destination;
    if (role === "partner" && relative === "safety/page.tsx") destination = path.join(root, "app", "partner", "safety", "page.tsx");
    else if (role === "partner" && relative === "offline/page.tsx") destination = path.join(root, "app", "partner", "offline", "page.tsx");
    else destination = path.join(root, "app", relative);
    await mkdir(path.dirname(destination), { recursive: true });
    const specifier = `@${role}/app/${relative.replace(/\.tsx?$/, "")}`;
    if (relative.endsWith("route.ts")) {
      const lines = [`import * as handlers from "${specifier}";`];
      const sourceText = await readFile(source, "utf8");
      for (const method of methods) {
        if (new RegExp(`export\\s+(?:async\\s+)?(?:function|const)\\s+${method}\\b`).test(sourceText)) {
          lines.push(`export const ${method} = handlers.${method};`);
        }
      }
      const dynamicValue = sourceText.match(/export\s+const\s+dynamic\s*=\s*(["'][^"']+["'])/);
      if (dynamicValue) lines.push(`export const dynamic = ${dynamicValue[1]};`);
      await writeFile(destination, `${lines.join("\n")}\n`);
    } else {
      await writeFile(destination, `export { default } from "${specifier}";\n`);
    }
  }
}
