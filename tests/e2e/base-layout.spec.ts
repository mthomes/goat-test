import { expect, test } from "@playwright/test";

/**
 * The document shell every page renders through. Asserted against the built
 * site, so what is checked is what ships.
 */
test.describe("base layout", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
	});

	test("declares language, charset and viewport", { tag: ["@issue-10"] }, async ({ page }) => {
		await expect(page.locator("html")).toHaveAttribute("lang", "en");
		await expect(page.locator("head meta[charset]")).toHaveAttribute("charset", /utf-8/i);
		await expect(page.locator('head meta[name="viewport"]')).toHaveAttribute(
			"content",
			/width=device-width/,
		);
	});

	test("titles the page from its own name plus the site name", { tag: ["@issue-10"] }, async ({ page }) => {
		// The site's own front page would otherwise read "HUMAN/1 · HUMAN/1".
		await expect(page).toHaveTitle("HUMAN/1 · Maintenance Release Notes");
		await expect(page.locator('head meta[name="description"]')).toHaveAttribute(
			"content",
			/.{40,}/,
		);
	});

	test("sets a favicon and a theme colour", { tag: ["@issue-10"] }, async ({ page }) => {
		await expect(page.locator('head link[rel="icon"]')).toHaveAttribute("href", "/favicon.svg");
		await expect(page.locator('head meta[name="theme-color"]')).toHaveAttribute(
			"content",
			/^#[0-9a-f]{6}$/,
		);
		expect((await page.request.get("/favicon.svg")).status()).toBe(200);
	});

	test("imports the stylesheet exactly once", { tag: ["@issue-10", "@issue-9"] }, async ({ page }) => {
		await expect(page.locator('head link[rel="stylesheet"]')).toHaveCount(1);
	});

	test("lays out header, main and footer landmarks", { tag: ["@issue-10"] }, async ({ page }) => {
		await expect(page.getByRole("banner")).toBeVisible();
		await expect(page.getByRole("main")).toBeVisible();
		await expect(page.getByRole("contentinfo")).toBeVisible();
		await expect(page.getByRole("main")).toHaveAttribute("id", "main");
	});

	test(
		"makes the skip link the first focusable element, and it moves focus to main",
		{ tag: ["@issue-10"] },
		async ({ page }) => {
			const firstFocusable = await page.evaluate(() => {
				const selector = "a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])";
				return document.querySelector(selector)?.className ?? null;
			});
			expect(firstFocusable).toBe("skip-link");

			const skipLink = page.getByRole("link", { name: /skip to content/i });
			await skipLink.focus();
			// Hidden until focused, visible once it is.
			await expect(skipLink).toBeVisible();

			await page.keyboard.press("Enter");
			await expect(page.getByRole("main")).toBeFocused();
		},
	);

	test(
		"reaches the skip link on the first Tab press",
		{ tag: ["@issue-10"] },
		async ({ page, browserName }) => {
			// WebKit on macOS only tabs between form controls unless the system's
			// full keyboard access is on, so Tab traversal is unassertable there.
			// The browser-independent invariant — first focusable element — is
			// covered above.
			test.skip(browserName === "webkit", "macOS WebKit does not tab to links by default");

			await page.keyboard.press("Tab");
			await expect(page.getByRole("link", { name: /skip to content/i })).toBeFocused();
		},
	);
});
