import { expect, test } from "@playwright/test";

/**
 * Baselines for the six pages that carry the typographic treatment, in both
 * colour schemes and at three widths.
 *
 * These exist so a token change cannot quietly wreck the type. They are the
 * only tests in the project that assert on appearance rather than on
 * behaviour, which is exactly why they are worth having.
 */
const PAGES = [
	["home", ""],
	["release-detail", "releases/32.0.0"],
	["archive", "releases"],
	["tracker", "known-issues"],
	["stats", "stats"],
	["not-found", "no-such-page"],
] as const;

const WIDTHS = [320, 768, 1440] as const;

for (const [name, path] of PAGES) {
	for (const width of WIDTHS) {
		test(`${name} at ${width}`, { tag: ["@issue-50"] }, async ({ page }) => {
			await page.setViewportSize({ width, height: 900 });
			await page.goto(path);

			// The classic source of flake: capturing mid-swap, with the fallback
			// face still measured. Nothing below runs until the real faces are in.
			await page.evaluate(() => document.fonts.ready);
			await expect(page.locator("body")).toBeVisible();

			await expect(page).toHaveScreenshot(`${name}-${width}.png`, {
				fullPage: true,
				// The colophon prints the date this copy was built, so an
				// unmasked baseline would fail the next day for no reason.
				mask: [page.locator("[data-build-date]")],
			});
		});
	}
}
