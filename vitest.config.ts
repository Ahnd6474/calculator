import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@app": fileURLToPath(new URL("./src/app", import.meta.url)),
      "@core": fileURLToPath(new URL("./src/core", import.meta.url)),
      "@persistence": fileURLToPath(new URL("./src/persistence", import.meta.url))
    }
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"]
  }
});
