import { resolve, sep } from "node:path";

const siteRoot = resolve(import.meta.dir, "..", process.argv[2] || "src");
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.PORT || 5173),
  async fetch(request) {
    try {
      const pathname = decodeURIComponent(new URL(request.url).pathname);
      const requestedPath = pathname === "/" ? "/index.html" : pathname;
      const filePath = resolve(siteRoot, `.${requestedPath}`);
      if (filePath !== siteRoot && !filePath.startsWith(siteRoot + sep)) {
        return new Response("Forbidden", { status: 403 });
      }

      const file = Bun.file(filePath);
      if (!(await file.exists())) return new Response("Not found", { status: 404 });

      return new Response(file, {
        headers: {
          "content-type": contentTypes[filePath.slice(filePath.lastIndexOf("."))] || "application/octet-stream",
        },
      });
    } catch {
      return new Response("Bad request", { status: 400 });
    }
  },
});

console.log(`CNR Marks Sheet Generator running at ${server.url}`);
