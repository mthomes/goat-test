import { expect, test } from "@playwright/test";

/** The front door. */
test.describe("home page", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
	});

	test("renders the latest release in full, as the hero", { tag: ["@issue-27"] }, async ({ page }) => {
		// Same version the archive reports as newest.
		await page.goto("/releases");
		const newest = (await page.locator(".release-card__version").first().innerText()).trim();

		await page.goto("/");
		await expect(page.locator(".release-hero__version")).toContainText(newest);

		// In full: every change entry that release has, not a summary of them.
		const onHome = await page.locator(".change-entry").count();
		await page.goto(`/releases/${newest.slice(1)}`);
		const onDetail = await page.locator(".change-entry").count();
		expect(onHome).toBe(onDetail);
	});

	test("follows it with a condensed list of 5–8 more", { tag: ["@issue-27"] }, async ({ page }) => {
		const cards = page.locator(".release-card");
		const count = await cards.count();

		expect(count).toBeGreaterThanOrEqual(5);
		expect(count).toBeLessThanOrEqual(8);

		// Condensed: cards, not full change lists, and none of them the hero.
		const hero = (await page.locator(".release-hero__version").innerText()).trim();
		for (const version of await page.locator(".release-card__version").allInnerTexts()) {
			expect(version.trim()).not.toBe(hero);
		}
	});

	test("explains the premise without over-explaining it", { tag: ["@issue-27"] }, async ({ page }) => {
		const standfirst = page.locator(".masthead__standfirst");

		await expect(standfirst).toBeVisible();
		const words = (await standfirst.innerText()).split(/\s+/).length;
		expect(words).toBeGreaterThan(15);
		expect(words).toBeLessThan(60);
	});

	test("counts open known issues and links to the tracker", { tag: ["@issue-27"] }, async ({ page }) => {
		const link = page.getByRole("link", { name: /known issues? still open/i });
		await expect(link).toHaveAttribute("href", "/known-issues");

		const claimed = Number.parseInt(/(\d+)/.exec(await link.innerText())![1], 10);

		await page.goto("/known-issues");
		await expect(page.locator('.known-issue[data-state="open"]')).toHaveCount(claimed);
	});

	test("links through to the full archive", { tag: ["@issue-27"] }, async ({ page }) => {
		const link = page.getByRole("link", { name: /all \d+ releases/i });
		await expect(link).toHaveAttribute("href", "/releases");

		const claimed = Number.parseInt(/(\d+)/.exec(await link.innerText())![1], 10);
		expect(claimed).toBe(30);
	});

	test("reuses existing blocks and invents no home-page-only component", { tag: ["@issue-27"] }, async ({ page }) => {
		// Every block class used here also appears somewhere else on the site.
		const classesOn = async (path: string) => {
			await page.goto(path);
			return new Set(
				await page.locator("main [class]").evaluateAll((nodes) =>
					nodes.flatMap((node) => [...node.classList]),
				),
			);
		};

		const home = await classesOn("/");
		const elsewhere = new Set<string>();
		for (const path of ["/releases", "/releases/34.2.1", "/known-issues", "/tags"]) {
			for (const name of await classesOn(path)) elsewhere.add(name);
		}

		// `masthead` and `home-links` are the page's own furniture; every other
		// block class must be shared with a page that already proved it.
		const OWN = ["masthead", "masthead__title", "masthead__standfirst", "home-links"];
		const unique = [...home].filter((name) => !elsewhere.has(name) && !OWN.includes(name));

		expect(unique, `home-page-only classes: ${unique.join(", ")}`).toEqual([]);
	});
});
