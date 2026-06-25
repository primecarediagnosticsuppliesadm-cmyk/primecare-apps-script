import path from "path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vite dev does not run Vercel serverless routes, so /api/primecare would fall
 * through and return non-JSON (e.g. text/javascript). Mirror api/primecare.js
 * by forwarding to the Apps Script web app URL (same target as Vercel
 * api/primecare.js). Supported env names are resolved in the middleware below.
 */
function primecareLocalApiProxy() {
  return {
    name: "primecare-local-api-proxy",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url?.split("#")[0] || "";
        if (!rawUrl.startsWith("/api/primecare")) {
          next();
          return;
        }

        // Load all keys from .env / .env.local (vite.config runs in Node only).
        const fileEnv = loadEnv(server.config.mode, server.config.root, "");

        const proxyUrl = fileEnv.VITE_PRIMECARE_PROXY_URL || "";
        const proxyLooksLikeAppsScript =
          typeof proxyUrl === "string" &&
          proxyUrl.startsWith("https://script.google.com/macros/");

        const APPS_SCRIPT_URL =
          process.env.PRIMECARE_APPS_SCRIPT_URL ||
          fileEnv.PRIMECARE_APPS_SCRIPT_URL ||
          process.env.VITE_PRIMECARE_APPS_SCRIPT_URL ||
          fileEnv.VITE_PRIMECARE_APPS_SCRIPT_URL ||
          process.env.VITE_APPS_SCRIPT_URL ||
          fileEnv.VITE_APPS_SCRIPT_URL ||
          (proxyLooksLikeAppsScript ? proxyUrl : "") ||
          "";

        if (!APPS_SCRIPT_URL) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(
            JSON.stringify({
              success: false,
              error:
                "Local /api/primecare proxy: set your Apps Script web app URL. " +
                "Add one of these to primecare-portal/.env or .env.local (then restart vite): " +
                "PRIMECARE_APPS_SCRIPT_URL (same as Vercel), or VITE_PRIMECARE_APPS_SCRIPT_URL, " +
                "or VITE_APPS_SCRIPT_URL, or point VITE_PRIMECARE_PROXY_URL at the full …/macros/s/…/exec URL. " +
                "You can also export PRIMECARE_APPS_SCRIPT_URL in your shell before npm run dev.",
            })
          );
          return;
        }

        try {
          if (req.method === "GET") {
            const target = new URL(APPS_SCRIPT_URL);
            const incoming = new URL(rawUrl, "http://localhost");
            incoming.searchParams.forEach((value, key) => {
              target.searchParams.set(key, value);
            });

            const upstream = await fetch(target.toString(), { method: "GET" });
            const text = await upstream.text();
            res.statusCode = upstream.status;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(text);
            return;
          }

          if (req.method === "POST") {
            const body = await new Promise((resolve, reject) => {
              const chunks = [];
              req.on("data", (chunk) => chunks.push(chunk));
              req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
              req.on("error", reject);
            });

            const upstream = await fetch(APPS_SCRIPT_URL, {
              method: "POST",
              headers: { "Content-Type": "text/plain;charset=utf-8" },
              body: body || "{}",
            });
            const text = await upstream.text();
            res.statusCode = upstream.status;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(text);
            return;
          }

          res.statusCode = 405;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ success: false, error: "Method not allowed" }));
        } catch (err) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(
            JSON.stringify({
              success: false,
              error: err?.message || "Local /api/primecare proxy failed",
            })
          );
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [primecareLocalApiProxy(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("@supabase")) return "supabase-vendor";
          // Only core React packages — broad `id.includes("react")` pulled
          // react-router, radix-ui, motion, lucide-react, etc. into react-vendor
          // while their deps stayed in vendor, creating a circular chunk import.
          if (/node_modules[/\\](react-dom|react|scheduler)[/\\]/.test(id)) {
            return "react-vendor";
          }
          if (id.includes("recharts") || id.includes("d3-")) return "charts-vendor";
          if (id.includes("lucide-react")) return "icons-vendor";
          return "vendor";
        },
      },
    },
  },
});
