import { expect, test } from "@playwright/test";

/** `/tags` and `/tags/[tag]` — every change ever made in one area of life. */
test.describe("tag index", () => {
	test("lists every tag with its count, most used first", { tag: ["@issue-29"] }, async ({ page }) => {
		await page.goto("/tags");

		const rows = page.locator(".tag-index__row");
		const count = await rows.count();
		expect(count).toBeGreaterThanOrEqual(12);
		expect(count).toBeLessThanOrEqual(18);

		const counts = await page.locator(".tag-index__count").evaluateAll((cells) =>
			cells.map((cell) => Number.parseInt(cell.textContent!, 10)),
		);
		expect(counts).toEqual([...counts].sort((a, b) => b - a));
		expect(counts.every((n) => n > 0)).toBe(true);
	});

	test("gives every tag a URL-safe link that resolves", { tag: ["@issue-29"] }, async ({ page }) => {
		await page.goto("/tags");

		const hrefs = await page.locator(".tag-index__tag").evaluateAll((links) =>
			links.map((link) => link.getAttribute("href")!),
		);

		for (const href of hrefs) {
			expect(href).toMatch(/^\/tags\/[a-z0-9]+(-[a-z0-9]+)*$/);
			expect(href).toBe(encodeURI(href));
			expect((await page.request.get(href)).status(), href).toBe(200);
		}
	});
});

test.describe("tag detail", () => {
	test("lists every change carrying the tag, newest first", { tag: ["@issue-29"] }, async ({ page }) => {
		await page.goto("/tags");
		const housingCount = await page
			.locator(".tag-index__row", { has: page.locator('a[href="/tags/housing"]') })
			.locator(".tag-index__count")
			.innerText();

		await page.goto("/tags/housing");
		const entries = page.locator(".change-index .change-entry");
		await expect(entries).toHaveCount(Number.parseInt(housingCount, 10));

		// Newest first, by the release each entry shipped in.
		const versions = await page.locator(".change-index__release a").allInnerTexts();
		const rank = (v: string) =>
			v.replace("v", "").split(".").map(Number).reduce((acc, part) => acc * 1000 + part, 0);
		const ranks = versions.map((v) => rank(v.trim()));
		expect(ranks).toEqual([...ranks].sort((a, b) => b - a));
	});

	test("shows which release each change shipped in, and links to it", { tag: ["@issue-29"] }, async ({ page }) => {
		await page.goto("/tags/housing");

		for (const entry of await page.locator(".change-index .change-entry").all()) {
			const release = entry.locator(".change-index__release");
			await expect(release.locator("a")).toHaveAttribute("href", /^\/releases\/\d+\.\d+\.\d+$/);
			await expect(release.locator("time")).toHaveAttribute("datetime", /^\d{4}-\d{2}-\d{2}$/);
		}

		// And the links actually go somewhere.
		const first = page.locator(".change-index__release a").first();
		const href = await first.getAttribute("href");
		await first.click();
		await expect(page).toHaveURL(new RegExp(`${href}$`));
	});

	test("marks change type with the same sigils used elsewhere", { tag: ["@issue-29", "@issue-16"] }, async ({ page }) => {
		// The sigil for a given type must be identical here and on a release
		// page — a reader should not have to learn two vocabularies.
		const sigilFor = async (path: string) =>
			Object.fromEntries(
				await page.locator(`${path === "/tags/housing" ? ".change-index" : ".change-list"} .change-entry`)
					.evaluateAll((entries) =>
						entries.map((entry) => [
							entry.getAttribute("data-change-type"),
							getComputedStyle(entry, "::before").content,
						]),
					),
			);

		await page.goto("/releases/32.1.0");
		const onRelease = await sigilFor("/releases/32.1.0");

		await page.goto("/tags/housing");
		const onTag = await sigilFor("/tags/housing");

		const shared = Object.keys(onRelease).filter((type) => type in onTag);
		expect(shared.length).toBeGreaterThan(0);
		for (const type of shared) expect(onTag[type], type).toBe(onRelease[type]);
	});

	test("counts on the index match the entries on each tag page", { tag: ["@issue-29"] }, async ({ page }) => {
		await page.goto("/tags");
		const index = await page.locator(".tag-index__row").evaluateAll((rows) =>
			rows.map((row) => ({
				href: row.querySelector("a")!.getAttribute("href")!,
				count: Number.parseInt(row.querySelector(".tag-index__count")!.textContent!, 10),
			})),
		);

		for (const { href, count } of index) {
			await page.goto(href);
			await expect(page.locator(".change-index .change-entry"), href).toHaveCount(count);
		}
	});
});
