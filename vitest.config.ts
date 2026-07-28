import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // tsconfig paths("@/*")와 동일하게 — 라우트 핸들러를 직접 import해 테스트한다
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
});
