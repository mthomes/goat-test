import { expect, test } from "@playwright/test";

import { builtCss, layerBody } from "../helpers/built-css.ts";

/** The persistent chrome: a manual's running head and its colophon. */
test.describe("site chrome", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await page.evaluate(() => document.fonts.ready);
	});

	test("prints the wordmark and a section marker as a running head", { tag: ["@issue-11"] }, async ({ page }) => {
		const header = page.getByRole("banner");

		await expect(header.locator(".site-header__wordmark")).toHaveText("HUMAN/1");
		await expect(header.locator(".site-header__marker")).not.toBeEmpty();

		const [wordmark, marker] = await Promise.all([
			header.locator(".site-header__wordmark").boundingBox(),
			header.locator(".site-header__marker").boundingBox(),
		]);
		const viewport = page.viewportSize()!.width;

		if (viewport >= 480) {
			// Wordmark left, marker right, on one line — a running head.
			expect(marker!.x).toBeGreaterThan(wordmark!.x);
			expect(Math.abs(marker!.y - wordmark!.y)).toBeLessThan(marker!.height);
		} else {
			// Too narrow for two columns: `.repel` wraps rather than overflows,
			// which is the whole reason the header uses it.
			expect(marker!.y).toBeGreaterThanOrEqual(wordmark!.y + wordmark!.height - 1);
			expect(marker!.x + marker!.width).toBeLessThanOrEqual(viewport);
		}

		// And a rule beneath it.
		expect(
			await header.evaluate((el) => Number.parseFloat(getComputedStyle(el).borderBlockEndWidth)),
		).toBeGreaterThan(0);
	});

	test("carries the four primary nav links", { tag: ["@issue-11"] }, async ({ page }) => {
		const nav = page.getByRole("navigation", { name: "Primary" });

		await expect(nav.getByRole("link")).toHaveText(["Releases", "Tags", "Known Issues", "Stats"]);
		for (const link of await nav.getByRole("link").all()) {
			await expect(link).toHaveAttribute("href", /^\/[a-z-]+$/);
		}
	});

	test("marks no nav item current on the home page", { tag: ["@issue-11"] }, async ({ page }) => {
		// The home page is not in a section, so nothing should claim to be.
		await expect(page.locator("[aria-current]")).toHaveCount(0);
	});

	test("carries a colophon: typefaces, build date and source", { tag: ["@issue-11"] }, async ({ page }) => {
		const footer = page.getByRole("contentinfo");

		await expect(footer).toContainText("Charis SIL");
		await expect(footer).toContainText("IBM Plex Mono");
		await expect(footer.locator("[data-build-date]")).toHaveAttribute(
			"datetime",
			/^\d{4}-\d{2}-\d{2}$/,
		);
		await expect(footer.getByRole("link", { name: "Source" })).toHaveAttribute(
			"href",
			/github\.com/,
		);
	});

	test("keeps the navigation usable at 320px with no menu toggle", { tag: ["@issue-11"] }, async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 720 });
		await page.goto("/");

		const links = page.getByRole("navigation", { name: "Primary" }).getByRole("link");
		await expect(links).toHaveCount(4);

		// Every link visible and reachable — no collapse behind a control.
		for (const link of await links.all()) await expect(link).toBeVisible();
		await expect(page.getByRole("button")).toHaveCount(0);

		// Wrapped, not overflowing.
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth > document.documentElement.clientWidth,
			),
		).toBe(false);

		// And each link is a big enough target to actually hit.
		for (const link of await links.all()) {
			const box = await link.boundingBox();
			expect(box!.height).toBeGreaterThanOrEqual(20);
		}
	});

	test("ships the chrome from the block layer", { tag: ["@issue-11"] }, async ({ page }) => {
		const block = layerBody(await builtCss(page), "block");

		expect({
			header: block.includes(".site-header"),
			footer: block.includes(".site-footer"),
		}).toEqual({ header: true, footer: true });
	});
});
