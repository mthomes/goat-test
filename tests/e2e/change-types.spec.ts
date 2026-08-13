import { expect, test } from "@playwright/test";

const DONE_TYPES = ["added", "fixed", "changed", "removed", "deprecated"] as const;

/** `/changes` and `/changes/[type]` — every fix, regression and deprecation. */
test.describe("change types", () => {
	test("indexes every type with its total", { tag: ["@issue-30"] }, async ({ page }) => {
		await page.goto("/changes");

		const rows = await page.locator(".tag-index__row").evaluateAll((items) =>
			items.map((item) => ({
				type: item.getAttribute("data-change-type"),
				href: item.querySelector("a")!.getAttribute("href")!,
				count: Number.parseInt(item.querySelector(".tag-index__count")!.textContent!, 10),
			})),
		);

		// All six types are represented, including known-issue.
		expect(rows.map((row) => row.type).sort()).toEqual(
			[...DONE_TYPES, "known-issue"].sort(),
		);
		for (const row of rows) expect(row.count, row.type!).toBeGreaterThan(0);
	});

	test("makes every type reachable from /changes", { tag: ["@issue-30"] }, async ({ page }) => {
		await page.goto("/changes");

		const hrefs = await page.locator(".tag-index__row a").evaluateAll((links) =>
			links.map((link) => link.getAttribute("href")!),
		);

		expect(hrefs).toHaveLength(6);
		for (const href of hrefs) {
			expect((await page.request.get(href)).status(), href).toBe(200);
		}
		// known-issue is reachable, but through the tracker rather than a
		// worse copy of it.
		expect(hrefs).toContain("/known-issues");
		expect(hrefs).not.toContain("/changes/known-issue");
	});

	test("defers known issues to the tracker, explicitly", { tag: ["@issue-30"] }, async ({ page }) => {
		expect((await page.goto("/changes/known-issue"))?.status()).toBe(404);

		await page.goto("/changes");
		await expect(page.locator(".changes-note")).toContainText(/tracked separately/i);
		await expect(page.locator(".changes-note").getByRole("link", { name: "tracker" }))
			.toHaveAttribute("href", "/known-issues");
	});

	test("lists every change of a type newest-first with its release", { tag: ["@issue-30"] }, async ({ page }) => {
		await page.goto("/changes");
		const expected = Object.fromEntries(
			await page.locator(".tag-index__row").evaluateAll((rows) =>
				rows.map((row) => [
					row.getAttribute("data-change-type"),
					Number.parseInt(row.querySelector(".tag-index__count")!.textContent!, 10),
				]),
			),
		);

		for (const type of DONE_TYPES) {
			await page.goto(`/changes/${type}`);

			// The total on the index matches the entries on the page.
			await expect(page.locator(".change-index .change-entry"), type).toHaveCount(expected[type]);

			const versions = await page.locator(".change-index__release a").allInnerTexts();
			const rank = (v: string) =>
				v.replace("v", "").split(".").map(Number).reduce((acc, part) => acc * 1000 + part, 0);
			const ranks = versions.map((v) => rank(v.trim()));
			expect(ranks, type).toEqual([...ranks].sort((a, b) => b - a));
		}
	});

	test("shows the count on each type page", { tag: ["@issue-30"] }, async ({ page }) => {
		for (const type of DONE_TYPES) {
			await page.goto(`/changes/${type}`);
			const entries = await page.locator(".change-index .change-entry").count();
			await expect(page.locator(".archive__count").first(), type)
				.toContainText(new RegExp(`^\\s*${entries} entr`));
		}
	});

	test("cross-links every other type, with counts", { tag: ["@issue-30"] }, async ({ page }) => {
		await page.goto("/changes/fixed");

		const cross = page.getByRole("navigation", { name: "Other change types" });
		const links = await cross.getByRole("link").evaluateAll((items) =>
			items.map((item) => ({
				href: item.getAttribute("href")!,
				text: item.textContent!.trim(),
			})),
		);

		// The four other done-types plus the tracker; never itself.
		expect(links).toHaveLength(5);
		expect(links.map((link) => link.href)).not.toContain("/changes/fixed");
		for (const link of links) {
			expect(link.text, link.href).toMatch(/\(\d+\)$/);
			expect((await page.request.get(link.href)).status(), link.href).toBe(200);
		}
	});

	test("prints the type's own sigil beside its name", { tag: ["@issue-30", "@issue-18"] }, async ({ page }) => {
		const sigils: Record<string, string> = {};

		for (const type of DONE_TYPES) {
			await page.goto(`/changes/${type}`);
			await page.evaluate(() => document.fonts.ready);
			sigils[type] = await page.locator(".change-type__title")
				.evaluate((el) => getComputedStyle(el, "::before").content);
		}

		expect(new Set(Object.values(sigils)).size).toBe(DONE_TYPES.length);
		for (const [type, sigil] of Object.entries(sigils)) {
			expect(sigil, type).toMatch(/^"..?"$/);
		}
	});
});
