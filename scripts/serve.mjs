import { resolve, sep } from "node:path";

const projectRoot = resolve(import.meta.dir, "..");
const mode = process.argv[2] || "dev";
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".png": "image/png",
};

function findFile(pathname) {
  if (mode === "dist") {
    const root = resolve(projectRoot, "dist");
    return { root, filePath: resolve(root, `.${pathname}`) };
  }
  if (pathname === "/") {
    const root = resolve(projectRoot, "public");
    return { root, filePath: resolve(root, "index.html") };
  }
  if (pathname.startsWith("/assets/")) {
    const root = resolve(projectRoot, "public");
    return { root, filePath: resolve(root, `.${pathname}`) };
  }
  if (pathname.startsWith("/css/") || pathname.startsWith("/js/")) {
    const root = resolve(projectRoot, "src");
    return { root, filePath: resolve(root, `.${pathname}`) };
  }
  return null;
}

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.PORT || 5173),
  async fetch(request) {
    try {
      const pathname = decodeURIComponent(new URL(request.url).pathname);
      const match = findFile(pathname);
      if (!match) return new Response("Not found", { status: 404 });
      const { root, filePath } = match;
      if (!filePath.startsWith(root + sep)) return new Response("Forbidden", { status: 403 });

      const file = Bun.file(filePath);
      if (!(await file.exists())) return new Response("Not found", { status: 404 });

      const extension = filePath.slice(filePath.lastIndexOf("."));
      return new Response(file, {
        headers: { "content-type": contentTypes[extension] || "application/octet-stream" },
      });
    } catch {
      return new Response("Bad request", { status: 400 });
    }
  },
});

console.log(`Marks Sheet Generator running at ${server.url}`);
