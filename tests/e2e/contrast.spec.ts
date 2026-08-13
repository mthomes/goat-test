import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Colour contrast, in **both** schemes.
 *
 * Lighthouse (#38) audits contrast too, but only in whatever scheme the host
 * machine happens to prefer — Chrome exposes no flag that flips
 * `prefers-color-scheme`, so a Lighthouse run is not a deterministic answer
 * about dark. Playwright's `colorScheme` is, and the `dark` project makes this
 * file run against the carbon palette on every CI run.
 *
 * Dark is where these regressions hide: #17 re-tuned colours that already
 * passed in light.
 */
const ROUTES = [
	"",
	"releases",
	"releases/32.0.0",
	"tags",
	"tags/housing",
	"changes/fixed",
	"known-issues",
	"stats",
	"no-such-page",
];

test.describe("colour contrast", () => {
	for (const route of ROUTES) {
		test(`clears AA on /${route}`, { tag: ["@issue-38"] }, async ({ page }, testInfo) => {
			await page.goto(route);
			await page.evaluate(() => document.fonts.ready);

			const results = await new AxeBuilder({ page })
				.withRules(["color-contrast"])
				.analyze();

			const details = results.violations.flatMap((violation) =>
				violation.nodes.map((node) => `${node.target.join(" ")} — ${node.failureSummary}`),
			);

			expect(
				details,
				`${testInfo.project.name}: ${details.length} contrast failure(s) on /${route}`,
			).toEqual([]);
		});
	}
});
