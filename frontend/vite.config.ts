import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/auth": "http://127.0.0.1",
      "/users": "http://127.0.0.1",
      "/tables": "http://127.0.0.1",
      "/menu": "http://127.0.0.1",
      "/orders": "http://127.0.0.1",
      "/analytics": "http://127.0.0.1",
      "/peripherals": "http://127.0.0.1",
      "/health": "http://127.0.0.1",
      "/ws": {
        target: "ws://127.0.0.1",
        ws: true
      }
    }
  }
});
