/**
 * Lighthouse CI budgets.
 *
 * Run against a production build served by `astro preview` — the same artefact
 * the deploy publishes, because none of these numbers mean anything against a
 * dev server.
 *
 * The zero-JS assertion is the one with teeth: it turns the project's defining
 * constraint into something CI catches a regression against, in the shipped
 * bytes rather than in the source.
 */
const ROUTES = [
	"/goat-test/",
	"/goat-test/releases",
	"/goat-test/releases/32.0.0",
	"/goat-test/known-issues",
	"/goat-test/stats",
];

module.exports = {
	ci: {
		collect: {
			startServerCommand: "npm run preview -- --port 4321",
			startServerReadyPattern: "ready in|Local",
			url: ROUTES.map((route) => `http://localhost:4321${route}`),
			numberOfRuns: 1,
			settings: {
				preset: "desktop",
				// Nothing on this site is user-specific or cached, so a cold run
				// is the only honest one.
				disableStorageReset: false,
			},
		},

		assert: {
			assertions: {
				"categories:performance": ["error", { minScore: 0.98 }],
				"categories:accessibility": ["error", { minScore: 1 }],
				"categories:best-practices": ["error", { minScore: 0.95 }],
				"categories:seo": ["warn", { minScore: 0.95 }],

				// Zero bytes of JavaScript, asserted as a resource budget rather
				// than as a score. `total-byte-weight` would hide it in the noise.
				"resource-summary:script:size": ["error", { maxNumericValue: 0 }],
				"resource-summary:script:count": ["error", { maxNumericValue: 0 }],

				// Contrast is audited here in light and by axe in dark
				// (tests/e2e/contrast.spec.ts), because Chrome exposes no flag
				// that flips prefers-color-scheme for Lighthouse.
				"color-contrast": ["error", { minScore: 1 }],

				"unused-javascript": "off",
				"legacy-javascript": "off",
				"uses-long-cache-ttl": "off",
			},
		},

		upload: { target: "filesystem", outputDir: ".lighthouseci" },
	},
};
