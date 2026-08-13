import { expect, test } from "@playwright/test";

/** The canonical view of a single release, at `/releases/[version]`. */
test.describe("release detail", () => {
	test("generates a page per release", { tag: ["@issue-25"] }, async ({ page }) => {
		// Spot-checked at both ends and across a major boundary; the exhaustive
		// walk lives in the prev/next test below.
		for (const version of ["31.0.0", "32.0.0", "33.2.1", "34.2.1"]) {
			const response = await page.goto(`/releases/${version}`);
			expect(response?.status(), version).toBe(200);
			await expect(page.getByRole("heading", { level: 1 })).toHaveText(`v${version}`);
		}
	});

	test("sets the version as the hero, metadata beneath", { tag: ["@issue-25"] }, async ({ page }) => {
		await page.goto("/releases/32.0.0");
		await page.evaluate(() => document.fonts.ready);

		const hero = page.locator(".release-hero__version");
		const table = page.locator(".metadata-table");

		// The hero is set larger than any heading on the page.
		const [heroSize, headingSize] = await Promise.all([
			hero.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize)),
			page.locator("h2").first().evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize)),
		]);
		expect(heroSize).toBeGreaterThan(headingSize);

		// And the metadata sits under it.
		const [heroBox, tableBox] = await Promise.all([hero.boundingBox(), table.boundingBox()]);
		expect(tableBox!.y).toBeGreaterThan(heroBox!.y);

		await expect(table).toContainText("Released");
		await expect(table).toContainText("Type");
		await expect(table).toContainText("Changes");
	});

	test("renders the prose summary and commentary when present", { tag: ["@issue-25"] }, async ({ page }) => {
		await page.goto("/releases/32.0.0");
		await expect(page.locator(".release-summary")).not.toBeEmpty();
		await expect(page.locator(".release-body")).toContainText(/eleven months/i);

		// And omits them cleanly when there are none.
		await page.goto("/releases/31.0.1");
		await expect(page.locator(".release-summary")).toHaveCount(0);
		await expect(page.locator(".release-body")).toHaveCount(0);
	});

	test("groups changes by type in a stable order under small-caps labels", { tag: ["@issue-25"] }, async ({ page }) => {
		await page.goto("/releases/32.0.0");
		await page.evaluate(() => document.fonts.ready);

		const labels = await page.locator(".change-list__label").allInnerTexts();
		expect(labels.length).toBeGreaterThan(1);

		// The declared order, filtered to the groups this release has.
		const ORDER = ["Added", "Fixed", "Changed", "Removed", "Deprecated"];
		const positions = labels.map((label) => ORDER.indexOf(label.trim()));
		expect(positions).toEqual([...positions].sort((a, b) => a - b));

		expect(
			await page.locator(".change-list__label").first()
				.evaluate((el) => getComputedStyle(el).fontVariantCaps),
		).toBe("all-small-caps");
	});

	test("shows known issues with their state and age", { tag: ["@issue-25", "@issue-21"] }, async ({ page }) => {
		// 31.0.0 opens the issue that is still open in the last release.
		await page.goto("/releases/31.0.0");

		const issue = page.locator(".known-issue").first();
		await expect(issue).toHaveAttribute("data-state", "open");
		await expect(issue.locator(".known-issue__span")).toContainText(/open for \d+ releases/);
		await expect(page.locator(".metadata-table")).toContainText("Known issues");
	});

	test("links a resolution back to where the issue opened", { tag: ["@issue-25", "@issue-21"] }, async ({ page }) => {
		// 32.1.0 fixes the damp patch opened in 31.1.1.
		await page.goto("/releases/32.1.0");

		const backlink = page.locator(".change-entry__resolves a").first();
		await expect(backlink).toContainText("opened in 31.1.1");
		await expect(backlink).toHaveAttribute("href", "/releases/31.1.1#damp-patch-bathroom");

		// And the link lands on the issue itself, not merely on the page.
		await backlink.click();
		await expect(page.locator("#damp-patch-bathroom")).toBeVisible();
		await expect(page.locator("#damp-patch-bathroom")).toHaveAttribute("data-state", "resolved");
	});

	test("navigates previous and next across the whole history", { tag: ["@issue-25"] }, async ({ page }) => {
		// Walked end to end rather than spot-checked: off-by-one at the
		// boundaries is the likely bug, and it only shows at the ends.
		await page.goto("/releases/31.0.0");
		await expect(page.locator(".release-nav__end")).toContainText("Earliest release");

		const visited: string[] = [];
		for (;;) {
			visited.push((await page.getByRole("heading", { level: 1 }).innerText()).trim());
			const next = page.locator('a[rel="next"]');
			if ((await next.count()) === 0) break;
			await next.click();
		}

		expect(visited).toHaveLength(30);
		expect(new Set(visited).size).toBe(30);
		expect(visited[0]).toBe("v31.0.0");
		expect(visited.at(-1)).toBe("v34.2.1");
		await expect(page.locator(".release-nav__end")).toContainText("Latest release");

		// And back down again.
		for (let i = 0; i < 29; i++) await page.locator('a[rel="prev"]').click();
		await expect(page.getByRole("heading", { level: 1 })).toHaveText("v31.0.0");
	});

	test("links tags through to their tag pages", { tag: ["@issue-25"] }, async ({ page }) => {
		await page.goto("/releases/31.0.0");

		const tags = page.locator(".tag-list__tag");
		expect(await tags.count()).toBeGreaterThan(0);
		for (const tag of await tags.all()) {
			await expect(tag).toHaveAttribute("href", /^\/tags\/[a-z0-9-]+$/);
		}
	});
});
