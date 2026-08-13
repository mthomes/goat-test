import { expect, test } from "@playwright/test";

/**
 * Proves the harness itself works end to end: build, preview, navigate, assert.
 * Tagged per the traceability convention (#43).
 */
test.describe("harness smoke", () => {
	test("the home page returns 200 and renders a heading", { tag: ["@issue-42", "@issue-8"] }, async ({ page }) => {
		const response = await page.goto("/");

		expect(response?.status()).toBe(200);
		await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
	});
});
