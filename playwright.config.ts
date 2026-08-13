import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests, always against a real production build.
 *
 * Testing the dev server would prove nothing this project cares about: the
 * zero-JS budget and the `@layer` cascade order are guarantees about *build
 * output*, and the dev server injects its own client runtime. `webServer`
 * therefore builds and previews rather than running `astro dev`.
 */
const PORT = 4321;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
	testDir: "tests/e2e",
	fullyParallel: true,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 1 : 0,
	workers: process.env.CI ? "50%" : undefined,
	reporter: process.env.CI
		? [["github"], ["html", { open: "never" }], ["list"]]
		: [["list"], ["html", { open: "never" }]],

	use: {
		baseURL: BASE_URL,
		// Failure artefacts only — a green run should leave nothing behind.
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		video: "off",
	},

	projects: [
		{ name: "chromium", use: { ...devices["Desktop Chrome"] } },
		{ name: "firefox", use: { ...devices["Desktop Firefox"] } },
		{ name: "webkit", use: { ...devices["Desktop Safari"] } },
		{
			// The narrowest viewport the site promises to work at. Zero-JS means
			// no menu toggle, so 320px is where the navigation has to prove itself.
			name: "mobile-320",
			use: { ...devices["Desktop Chrome"], viewport: { width: 320, height: 720 } },
		},
		{
			// Dark mode is `prefers-color-scheme` only, so this is the entire
			// mechanism for exercising it — there is no toggle to click.
			name: "dark",
			use: { ...devices["Desktop Chrome"], colorScheme: "dark" },
		},
	],

	webServer: {
		command: `npm run build && npm run preview -- --port ${PORT}`,
		url: BASE_URL,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
		stdout: "pipe",
		stderr: "pipe",
	},
});
