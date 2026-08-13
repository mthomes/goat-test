/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";

/**
 * The guardrail suite, kept in its own config because it asserts against
 * `dist/` and therefore needs a build to have happened first. Folding it into
 * the unit config would make `npm run test:unit` depend on a build for no
 * reason, and coverage thresholds mean nothing here.
 */
export default defineConfig({
	test: {
		include: ["tests/guardrails/**/*.test.ts"],
	},
});
