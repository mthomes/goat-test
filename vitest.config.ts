/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";

/**
 * Unit and integration tests for everything that isn't a rendered page.
 *
 * `getViteConfig` gives the tests the project's real Vite/TS resolution, so a
 * module that imports `astro:content` — the query layer in #22, for one — can
 * be tested directly rather than through a mock of it.
 *
 * Coverage is scoped to `src/lib/**` on purpose. Chasing statement coverage on
 * `.astro` templates is Playwright's job (#42); measuring it here would only
 * produce a number that goes up without anything being proved.
 */
export default getViteConfig({
	test: {
		include: ["src/**/*.test.ts", "tests/unit/**/*.test.ts"],
		coverage: {
			provider: "v8",
			reportsDirectory: "coverage",
			reporter: ["text", "html", "json-summary", "lcov"],
			include: ["src/lib/**"],
			thresholds: {
				statements: 90,
				branches: 85,
			},
		},
	},
});
