import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import * as path from "path";

export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths({
      root: "../../",
    }),
  ],
  resolve: {
    alias: [
      {
        find: /^@mirror-ball\/shared-schemas\/(.*)$/,
        replacement: path.resolve(__dirname, "../../libs/shared-schemas/src/$1"),
      },
      {
        find: "@mirror-ball/shared-schemas",
        replacement: path.resolve(__dirname, "../../libs/shared-schemas/src"),
      },
    ],
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".json"],
  },
  optimizeDeps: {
    exclude: ["@mirror-ball/shared-schemas"],
  },
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
