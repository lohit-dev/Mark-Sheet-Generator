import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dir, "..");
const source = resolve(projectRoot, "src");
const output = resolve(projectRoot, "dist");

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const entry of new Bun.Glob("**/*").scanSync({ cwd: source, onlyFiles: false })) {
  const from = resolve(source, entry);
  const to = resolve(output, entry);
  if (entry.includes("/")) await mkdir(resolve(to, ".."), { recursive: true });
  await cp(from, to, { recursive: true, force: true });
}

console.log(`Static site built in ${output}`);
