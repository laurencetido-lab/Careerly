import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30000,
    env: { DATABASE_URL: "postgresql://careerpilot:careerpilot@localhost:5432/careerpilot_test", STORAGE_DIR: "./storage-test" },
  },
});
