import { defineConfig } from "vite";

const ONPE = "https://resultadoelectoral.onpe.gob.pe";

export default defineConfig({
  server: {
    proxy: {
      "/api": {
        target: ONPE,
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api/, "/presentacion-backend"),
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.setHeader("Referer", `${ONPE}/main/resumen`);
            proxyReq.setHeader("Origin", ONPE);
            proxyReq.setHeader(
              "User-Agent",
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            );
            proxyReq.setHeader("Accept", "application/json, text/plain, */*");
          });
        },
      },
    },
  },
});
