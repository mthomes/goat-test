import { expect, test } from "@playwright/test";

/**
 * The 404, served the way a static host serves one: any unknown path returns
 * the custom page.
 */
test.describe("404", () => {
	test("serves the custom page for an unknown route", { tag: ["@issue-28"] }, async ({ page }) => {
		for (const path of ["/nope", "/releases/99.0.0", "/tags/not-a-tag", "/deep/nested/nonsense"]) {
			const response = await page.goto(path);

			expect(response?.status(), path).toBe(404);
			await expect(page.getByRole("heading", { level: 1 }), path).toHaveText("404");
		}
	});

	test("renders through the base layout, chrome and all", { tag: ["@issue-28"] }, async ({ page }) => {
		await page.goto("/nope");

		await expect(page.getByRole("banner")).toBeVisible();
		await expect(page.getByRole("main")).toBeVisible();
		await expect(page.getByRole("contentinfo")).toBeVisible();
		await expect(page.getByRole("link", { name: /skip to content/i })).toHaveCount(1);
		await expect(page).toHaveTitle(/404/);
	});

	test("frames the copy as a lookup that returned nothing", { tag: ["@issue-28"] }, async ({ page }) => {
		await page.goto("/nope");

		const table = page.locator(".metadata-table");
		await expect(table).toContainText("Status");
		await expect(table).toContainText("No such entry");
		await expect(table).toContainText("Found");

		// Reported in the same register as everything else, and briefly.
		const prose = await page.locator("main p.measure").innerText();
		expect(prose.split(/\s+/).length).toBeLessThan(70);
	});

	test("links back to home and the archive", { tag: ["@issue-28"] }, async ({ page }) => {
		await page.goto("/nope");

		const recovery = page.getByRole("navigation", { name: "Recovery" });
		const hrefs = await recovery.getByRole("link").evaluateAll((links) =>
			links.map((link) => link.getAttribute("href")!),
		);

		expect(hrefs).toContain("/");
		expect(hrefs).toContain("/releases");
		for (const href of hrefs) {
			expect((await page.request.get(href)).status(), href).toBe(200);
		}
	});
});
