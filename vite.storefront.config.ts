import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

const BACKEND_PORT = process.env.PORT || 5100;

// Standalone dev server for the storefront (OnlineStore), served on its own
// port. API/SDK traffic is proxied to the main merchant-suite backend.
export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0",
    port: 5001,
    strictPort: true,
    proxy: {
      "/api": `http://localhost:${BACKEND_PORT}`,
      "/auth": `http://localhost:${BACKEND_PORT}`,
      "/health": `http://localhost:${BACKEND_PORT}`,
      "/db-setup": `http://localhost:${BACKEND_PORT}`,
    },
  },
  plugins: [
    react(),
    {
      name: "storefront-root-rewrite",
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url === "/" || req.url === "") req.url = "/online-store";
          next();
        });
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
