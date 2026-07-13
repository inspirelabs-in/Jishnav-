import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Allow ngrok tunnel hostnames — they change on every restart on the free
    // tier, so allowlist the whole ngrok domain space instead of one hostname.
    allowedHosts: [".ngrok-free.dev", ".ngrok-free.app"],
    proxy: {
      "/api": {
        target: "http://localhost:8743",
        changeOrigin: true,
      },
    },
  },
});
