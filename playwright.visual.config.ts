/// <reference types="node" />
import { defineConfig, devices } from "@playwright/test";

/**
 * Visual regression, kept in its own config.
 *
 * Separate from the E2E config because these have different needs: no
 * retries (a flaky screenshot should be fixed, not re-rolled), one browser
 * (a second engine's antialiasing tells you nothing new), and a snapshot path
 * that carries the platform so macOS and Linux baselines can both be committed
 * — CI renders type differently from a developer's machine, and pretending
 * otherwise is how a visual suite ends up permanently red.
 */
const PORT = 4322;
const BASE_URL = `http://localhost:${PORT}/goat-test/`;

export default defineConfig({
	testDir: "tests/visual",
	fullyParallel: true,
	forbidOnly: Boolean(process.env.CI),
	retries: 0,
	reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report-visual" }]],

	// Platform in the path, so macOS and Linux baselines coexist. CI renders
	// type differently from a developer's machine — same fonts, different
	// rasteriser — and pretending otherwise is how a visual suite ends up
	// permanently red and then permanently ignored.
	snapshotPathTemplate: "{testDir}/__screenshots__/{platform}/{projectName}/{arg}{ext}",

	use: {
		baseURL: BASE_URL,
		trace: "retain-on-failure",
	},

	expect: {
		toHaveScreenshot: {
			// Per-pixel colour tolerance, to absorb subpixel antialiasing…
			threshold: 0.25,
			// …and a tight ratio, so a layout shift of even a few hundred
			// pixels fails while a slightly differently-hinted glyph does not.
			maxDiffPixelRatio: 0.01,
			animations: "disabled",
			caret: "hide",
			scale: "css",
		},
	},

	projects: [
		{ name: "light", use: { ...devices["Desktop Chrome"], colorScheme: "light" } },
		{ name: "dark", use: { ...devices["Desktop Chrome"], colorScheme: "dark" } },
	],

	webServer: {
		command: `npm run build && npm run preview -- --port ${PORT}`,
		url: BASE_URL,
		env: { ASTRO_PREVIEW_BACKGROUND: "0" },
		reuseExistingServer: false,
		timeout: 120_000,
	},
});
