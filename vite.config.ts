import { defineConfig, loadEnv, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { readFile } from "node:fs/promises";

async function readJsonBody(req: NodeJS.ReadableStream) {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) return undefined;

  const rawBody = Buffer.concat(chunks).toString("utf8");
  if (!rawBody) return undefined;

  try {
    return JSON.parse(rawBody);
  } catch {
    return rawBody;
  }
}

function attachJsonHelpers(res: any) {
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };

  res.json = (payload: unknown) => {
    if (!res.getHeader("Content-Type")) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
    }

    res.end(JSON.stringify(payload));
    return res;
  };

  return res;
}

function geminiApiDevMiddleware() {
  return {
    name: "gemini-api-dev-middleware",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/gemini-generate", async (req, res, next) => {
        try {
          const { default: handler } = await import("./api/gemini-generate.ts");
          const request = req as any;
          request.body = await readJsonBody(req);
          await handler(request, attachJsonHelpers(res));
        } catch (error) {
          next(error);
        }
      });
    },
  };
}

// Serve the Razorpay serverless endpoints during `vite dev`. In production
// these run as Vercel functions; this middleware mirrors that contract locally.
function razorpayApiDevMiddleware() {
  const routes: Record<string, () => Promise<{ default: Function }>> = {
    "/api/create-order": () => import("./api/create-order.ts"),
    "/api/verify-payment": () => import("./api/verify-payment.ts"),
    // Media uploads / deletes / storage usage (Cloudflare R2).
    "/api/media": () => import("./api/media.ts"),
  };

  return {
    name: "razorpay-api-dev-middleware",
    configureServer(server: ViteDevServer) {
      for (const [route, load] of Object.entries(routes)) {
        server.middlewares.use(route, async (req, res, next) => {
          try {
            const { default: handler } = await load();
            const request = req as any;
            request.body = await readJsonBody(req);
            await handler(request, attachJsonHelpers(res));
          } catch (error) {
            next(error);
          }
        });
      }
    },
  };
}

// Mirrors the vercel.json rewrite that serves the catalog snapshot same-origin.
// CATALOG_DEV_FILE=<path> serves a local JSON file instead, for testing offline.
function catalogDevProxy() {
  return {
    name: "catalog-dev-proxy",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/catalog/products.json", async (_req, res, next) => {
        try {
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          if (process.env.CATALOG_DEV_FILE) {
            res.end(await readFile(process.env.CATALOG_DEV_FILE));
            return;
          }
          const base = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");
          const upstream = base ? await fetch(`${base}/catalog/products.json`) : null;
          res.statusCode = upstream?.status ?? 404;
          res.end(upstream?.ok ? Buffer.from(await upstream.arrayBuffer()) : "");
        } catch (error) {
          next(error);
        }
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  for (const [key, value] of Object.entries(env)) {
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }

  return {
    server: {
      host: "localhost",
      port: 5173,
    },
    plugins: [react(), geminiApiDevMiddleware(), razorpayApiDevMiddleware(), catalogDevProxy()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      rollupOptions: {
        output: {
          /**
           * Only group dependencies that genuinely load on first paint, so a
           * code change doesn't bust their cache.
           *
           * Do NOT list route-specific libraries (jspdf, html2canvas, leaflet)
           * here. Naming a module in manualChunks promotes it into the entry
           * graph, and Vite then emits a <link rel="modulepreload"> for it - so
           * declaring a "vendor-pdf" chunk made every visitor download 609 KB of
           * PDF tooling on the homepage. Left alone, Rollup folds them into the
           * lazy route chunk that actually imports them.
           */
          manualChunks: {
            "vendor-react": ["react", "react-dom", "react-router-dom"],
            "vendor-firebase": ["firebase/app", "firebase/auth", "firebase/firestore"],
            "vendor-motion": ["framer-motion"],
          },
        },
      },
      // Chunks are split now; warn only if something genuinely large reappears.
      chunkSizeWarningLimit: 900,
    },
  };
});
