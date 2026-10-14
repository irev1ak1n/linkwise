import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // The first jsdom test in a file pays for transforming its imports, which can pass 5s under full parallel load.
    testTimeout: 20000,
  },
});
