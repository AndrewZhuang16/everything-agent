import { formatter } from "@lingui/format-po";
import { defineConfig } from "@lingui/cli";

export default defineConfig({
  sourceLocale: "zh",
  locales: ["zh", "en"],
  catalogs: [{ path: "<rootDir>/web/src/locales/{locale}/messages", include: ["web/src"] }],
  format: formatter({ lineNumbers: false }),
});
