import { copyFile, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const projectRoot = resolve(import.meta.dir, "..");
const output = resolve(projectRoot, "dist");
const sources = [
  resolve(projectRoot, "public"),
  resolve(projectRoot, "src"),
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const source of sources) {
  for (const entry of new Bun.Glob("**/*").scanSync({ cwd: source, onlyFiles: true })) {
    const destination = resolve(output, entry);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(resolve(source, entry), destination);
  }
}

console.log(`Static site built in ${output}`);
