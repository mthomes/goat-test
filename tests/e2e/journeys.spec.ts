import { expect, test } from "@playwright/test";

import { url } from "../helpers/routes.ts";

/**
 * The journeys a reader actually takes, walked end to end.
 *
 * The other specs assert page by page. These assert that the pages join up —
 * which is where a site made of independently-correct pages usually fails.
 * Every project runs them, so each journey is exercised at 320px, at desktop
 * width and in the dark palette.
 */
test.describe("core journeys", () => {
	test("home → tracker, following the open-issue count", { tag: ["@issue-46"] }, async ({ page }) => {
		await page.goto("");

		// The latest release renders in full on the front page.
		const hero = (await page.locator(".release-hero__version").innerText()).trim();
		expect(hero).toMatch(/^v\d+\.\d+\.\d+$/);
		expect(await page.locator(".change-entry").count()).toBeGreaterThan(0);

		const link = page.getByRole("link", { name: /known issues? still open/i });
		const claimed = Number.parseInt(/(\d+)/.exec(await link.innerText())![1], 10);

		await link.click();
		await expect(page).toHaveURL(new RegExp(`${url("/known-issues")}$`));
		await expect(page.locator('.known-issue[data-state="open"]')).toHaveCount(claimed);
	});

	test("home → archive → release → tag → release", { tag: ["@issue-46"] }, async ({ page }) => {
		await page.goto("");
		await page.getByRole("link", { name: /all \d+ releases/i }).click();
		await expect(page.getByRole("heading", { level: 1 })).toHaveText("Releases");

		// Into a release from a card.
		const version = (await page.locator(".release-card__version").first().innerText()).trim();
		await page.locator(".release-card__version a").first().click();
		await expect(page.getByRole("heading", { level: 1 })).toHaveText(version);

		// Out to a tag, and back into a release from there.
		const tag = (await page.locator(".tag-list__tag").first().innerText()).trim();
		await page.locator(".tag-list__tag").first().click();
		await expect(page.getByRole("heading", { level: 1 })).toContainText(tag);

		await page.locator(".change-index__release a").first().click();
		await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^v\d+\.\d+\.\d+$/);
	});

	test("release detail: metadata, grouping and prev/next across all 30", { tag: ["@issue-46", "@issue-25"] }, async ({ page }) => {
		await page.goto("releases/31.0.0");
		await expect(page.locator(".metadata-table")).toBeVisible();
		await expect(page.locator(".change-list__label").first()).toBeVisible();

		// Walked, not spot-checked: off-by-one at the boundaries is the bug.
		const visited: string[] = [];
		for (;;) {
			visited.push((await page.getByRole("heading", { level: 1 }).innerText()).trim());
			const next = page.locator('a[rel="next"]');
			if ((await next.count()) === 0) break;
			await next.click();
		}

		expect(visited).toHaveLength(30);
		expect(new Set(visited).size).toBe(30);
		expect(visited.at(-1)).toBe("v34.2.1");
	});

	test("a resolution links back to where the issue opened", { tag: ["@issue-46", "@issue-21"] }, async ({ page }) => {
		await page.goto("releases/32.1.0");

		const backlink = page.locator(".change-entry__resolves a").first();
		await expect(backlink).toContainText(/opened in \d+\.\d+\.\d+/);

		await backlink.click();
		const anchor = new URL(page.url()).hash.slice(1);
		expect(anchor).toBeTruthy();
		await expect(page.locator(`#${anchor}`)).toHaveAttribute("data-state", "resolved");
	});

	test("archive pagination walks all three pages and back", { tag: ["@issue-46", "@issue-26"] }, async ({ page }) => {
		await page.goto("releases");
		await expect(page.locator(".pagination__page[aria-current='page']")).toHaveText("1");

		let seen = await page.locator(".release-card").count();
		for (const expected of ["2", "3"]) {
			await page.getByRole("link", { name: "Next page" }).click();
			await expect(page.locator(".pagination__page[aria-current='page']")).toHaveText(expected);
			seen += await page.locator(".release-card").count();
		}
		expect(seen).toBe(30);

		await expect(page.getByRole("link", { name: "Next page" })).toHaveCount(0);

		for (const expected of ["2", "1"]) {
			await page.getByRole("link", { name: "Previous page" }).click();
			await expect(page.locator(".pagination__page[aria-current='page']")).toHaveText(expected);
		}
		await expect(page).toHaveURL(new RegExp(`${url("/releases")}$`));
	});

	test("an unknown route serves the custom 404", { tag: ["@issue-46", "@issue-28"] }, async ({ page }) => {
		const response = await page.goto("no/such/page");

		expect(response?.status()).toBe(404);
		await expect(page.getByRole("heading", { level: 1 })).toHaveText("404");
		await expect(page.getByRole("navigation", { name: "Recovery" })).toBeVisible();
	});

	test("the feed matches the site it describes", { tag: ["@issue-46", "@issue-34"] }, async ({ page }) => {
		await page.goto("");
		await expect(page.locator('head link[rel="alternate"][type="application/rss+xml"]'))
			.toHaveAttribute("href", url("/rss.xml"));

		const xml = await (await page.request.get(url("/rss.xml"))).text();
		const items = await page.evaluate((source) => {
			const doc = new DOMParser().parseFromString(source, "application/xml");
			return {
				error: doc.querySelector("parsererror")?.textContent ?? null,
				count: doc.querySelectorAll("item").length,
			};
		}, xml);

		expect(items.error).toBeNull();

		await page.goto("stats");
		const releases = Number.parseInt(
			await page.locator("section:has(#releases) .metadata-table__value").first().innerText(),
			10,
		);
		expect(items.count).toBe(releases);
	});

	test("every internal link on the site resolves", { tag: ["@issue-46"] }, async ({ page }) => {
		// A breadth-first crawl from the home page. Now that every route
		// exists, nothing should link anywhere that is not there.
		const queue = [url("/")];
		const visited = new Set<string>();
		const checked = new Set<string>();

		while (queue.length > 0 && visited.size < 200) {
			const path = queue.shift()!;
			if (visited.has(path)) continue;
			visited.add(path);

			const response = await page.goto(path);
			expect(response?.status(), `${path} did not resolve`).toBe(200);

			for (const href of await page.locator("a[href]").evaluateAll((links) =>
				links.map((link) => link.getAttribute("href")!),
			)) {
				if (!href.startsWith("/")) continue;
				const clean = href.split("#")[0];
				if (!checked.has(clean)) {
					checked.add(clean);
					queue.push(clean);
				}
			}
		}

		// The crawl reached the whole site, not just the front page.
		expect(visited.size).toBeGreaterThan(50);
		for (const path of [url("/releases"), url("/tags"), url("/changes"), url("/known-issues"), url("/stats")]) {
			expect(visited, `${path} was never reached`).toContain(path);
		}
	});
});
