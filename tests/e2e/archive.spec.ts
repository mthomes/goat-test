import { expect, test } from "@playwright/test";

/** The full release history at `/releases`, paginated 12 to a page. */
test.describe("release archive", () => {
	test("paginates 30 releases into 3 pages of 12", { tag: ["@issue-26"] }, async ({ page }) => {
		const counts: number[] = [];

		for (const path of ["/releases", "/releases/2", "/releases/3"]) {
			const response = await page.goto(path);
			expect(response?.status(), path).toBe(200);
			counts.push(await page.locator(".release-card").count());
		}

		expect(counts).toEqual([12, 12, 6]);
		expect(counts.reduce((a, b) => a + b, 0)).toBe(30);

		// And there is no fourth page.
		expect((await page.goto("/releases/4"))?.status()).toBe(404);
	});

	test("keeps page 1 canonical at /releases, not /releases/1", { tag: ["@issue-26"] }, async ({ page }) => {
		expect((await page.goto("/releases/1"))?.status()).toBe(404);

		await page.goto("/releases");
		await expect(page.getByRole("heading", { level: 1 })).toHaveText("Releases");

		// Nothing on the site links to /releases/1 either.
		const hrefs = await page.locator("a").evaluateAll((links) =>
			links.map((link) => link.getAttribute("href")),
		);
		expect(hrefs).not.toContain("/releases/1");
	});

	test("groups releases under major-version headings", { tag: ["@issue-26"] }, async ({ page }) => {
		await page.goto("/releases");

		const headings = await page.locator(".archive__major-heading").allInnerTexts();
		expect(headings.length).toBeGreaterThan(0);
		for (const heading of headings) expect(heading.trim()).toMatch(/^v3[1-4]\.x$/);

		// Newest major first, and every card under a heading belongs to it.
		expect(headings).toEqual([...headings].sort().reverse());
		for (const section of await page.locator(".archive__major").all()) {
			const major = (await section.locator(".archive__major-heading").innerText()).trim().slice(1, 3);
			for (const version of await section.locator(".release-card__version").allInnerTexts()) {
				expect(version.trim()).toMatch(new RegExp(`^v${major}\\.`));
			}
		}
	});

	test("renders each entry as a release-card", { tag: ["@issue-26", "@issue-24"] }, async ({ page }) => {
		await page.goto("/releases");

		const card = page.locator(".release-card").first();
		await expect(card).toHaveAttribute("data-release-type", /major|minor|patch/);
		await expect(card.locator(".release-card__version a")).toHaveAttribute(
			"href",
			/^\/releases\/\d+\.\d+\.\d+$/,
		);
	});

	test("paginates with real links, labelled, current page marked", { tag: ["@issue-26"] }, async ({ page }) => {
		await page.goto("/releases/2");

		const nav = page.getByRole("navigation", { name: "Release archive pages" });
		await expect(nav).toBeVisible();

		// Real anchors, not scripted controls.
		await expect(nav.getByRole("link", { name: "Previous page" })).toHaveAttribute("href", "/releases");
		await expect(nav.getByRole("link", { name: "Next page" })).toHaveAttribute("href", "/releases/3");
		await expect(page.getByRole("button")).toHaveCount(0);

		// Current page marked once, and not a link to itself.
		const current = nav.locator('[aria-current="page"]');
		await expect(current).toHaveCount(1);
		await expect(current).toHaveText("2");
		expect(await current.evaluate((el) => el.tagName)).not.toBe("A");

		// Every page has an accessible label.
		for (const link of await nav.locator(".pagination__page").all()) {
			await expect(link).toHaveAttribute("aria-label", /^Page \d+/);
		}
	});

	test("handles the final page: no next, previous still works", { tag: ["@issue-26"] }, async ({ page }) => {
		await page.goto("/releases/3");

		const nav = page.getByRole("navigation", { name: "Release archive pages" });
		await expect(nav.getByRole("link", { name: "Next page" })).toHaveCount(0);
		await expect(nav.getByRole("link", { name: "Previous page" })).toHaveAttribute("href", "/releases/2");
		await expect(nav.locator('[aria-current="page"]')).toHaveText("3");

		// The first page is the mirror image.
		await page.goto("/releases");
		await expect(nav.getByRole("link", { name: "Previous page" })).toHaveCount(0);
		await expect(nav.getByRole("link", { name: "Next page" })).toHaveAttribute("href", "/releases/2");
	});

	test("every link the archive itself renders resolves", { tag: ["@issue-26"] }, async ({ page }) => {
		// Scoped to `main`: the site navigation is #11's, and #46 checks the
		// whole site once every route exists.
		const seen = new Set<string>();

		for (const path of ["/releases", "/releases/2", "/releases/3"]) {
			await page.goto(path);
			const hrefs = await page.locator("main a").evaluateAll((links) =>
				links.map((link) => (link as HTMLAnchorElement).getAttribute("href")!),
			);
			for (const href of hrefs) if (href.startsWith("/")) seen.add(href);
		}

		expect(seen.size).toBeGreaterThan(30);
		for (const href of seen) {
			expect((await page.request.get(href)).status(), href).toBe(200);
		}
	});
});
