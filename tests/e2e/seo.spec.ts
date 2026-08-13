import { expect, test } from "@playwright/test";

import { url } from "../helpers/routes.ts";

const ROUTES = ["", "releases", "releases/32.0.0", "tags", "tags/housing", "changes", "known-issues", "stats"];

/** Canonical URLs, social cards, sitemap and robots. */
test.describe("discoverability metadata", () => {
	test("puts an absolute canonical on every route", { tag: ["@issue-35"] }, async ({ page }) => {
		for (const route of ROUTES) {
			await page.goto(route);

			const canonical = page.locator('head link[rel="canonical"]');
			await expect(canonical, route).toHaveCount(1);

			const href = (await canonical.getAttribute("href"))!;
			expect(href, route).toMatch(/^https:\/\//);
			// Carries the path the site is actually served from. A canonical
			// pointing at a URL nobody can reach is worse than none at all.
			expect(href, route).toContain(url("/"));
			expect(href, route).toContain(route === "" ? url("/") : `${url("/")}${route}`);
		}
	});

	test("gives every route its own Open Graph and Twitter tags", { tag: ["@issue-35"] }, async ({ page }) => {
		const seen = new Map<string, string>();

		for (const route of ROUTES) {
			await page.goto(route);

			const meta = async (selector: string) =>
				(await page.locator(`head meta[${selector}]`).getAttribute("content"))!;

			const title = await meta('property="og:title"');
			const description = await meta('property="og:description"');

			expect(title, route).toBeTruthy();
			expect(description.length, route).toBeGreaterThan(20);
			expect(await meta('property="og:url"'), route).toMatch(/^https:\/\//);
			expect(await meta('property="og:site_name"')).toBe("HUMAN/1");
			expect(await meta('name="twitter:card"')).toBe("summary");
			expect(await meta('name="twitter:title"'), route).toBe(title);
			expect(await meta('name="twitter:description"'), route).toBe(description);

			// Per-page, not one description copied across the site.
			expect(seen.has(description), `${route} reuses ${seen.get(description)}'s description`)
				.toBe(false);
			seen.set(description, route);
		}
	});

	test("marks release pages as articles, with the release date", { tag: ["@issue-35"] }, async ({ page }) => {
		await page.goto("releases/32.0.0");

		await expect(page.locator('head meta[property="og:type"]')).toHaveAttribute("content", "article");
		await expect(page.locator('head meta[property="article:published_time"]'))
			.toHaveAttribute("content", /^2022-03-14/);

		// Structured data as microdata, because this site ships no <script>.
		const article = page.locator('[itemtype="https://schema.org/Article"]');
		await expect(article).toHaveCount(1);
		await expect(article.locator('[itemprop="headline"]')).toHaveText("v32.0.0");
		await expect(article.locator('[itemprop="datePublished"]')).toHaveAttribute("content", "2022-03-14");
		await expect(article.locator('[itemprop="description"]')).toHaveAttribute("content", /.{20,}/);

		// Non-release pages are websites, not articles.
		await page.goto("stats");
		await expect(page.locator('head meta[property="og:type"]')).toHaveAttribute("content", "website");
		await expect(page.locator('[itemtype="https://schema.org/Article"]')).toHaveCount(0);
	});

	test("publishes a sitemap covering every route", { tag: ["@issue-35"] }, async ({ page }) => {
		const index = await page.request.get(url("/sitemap-index.xml"));
		expect(index.status()).toBe(200);

		const sitemaps = [...(await index.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
		expect(sitemaps.length).toBeGreaterThan(0);

		const urls: string[] = [];
		for (const sitemap of sitemaps) {
			const response = await page.request.get(new URL(sitemap).pathname);
			expect(response.status()).toBe(200);
			urls.push(...[...(await response.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
		}

		expect(urls.length).toBeGreaterThanOrEqual(50);
		for (const entry of urls) expect(entry).toContain(url("/"));

		// Every route the site actually has is in there.
		for (const route of ROUTES) {
			const expected = route === "" ? url("/") : `${url("/")}${route}`;
			expect(urls.some((entry) => new URL(entry).pathname.replace(/\/$/, "") === expected.replace(/\/$/, "")), route)
				.toBe(true);
		}
	});

	test("serves a robots.txt pointing at the sitemap", { tag: ["@issue-35"] }, async ({ page }) => {
		const response = await page.request.get(url("/robots.txt"));

		expect(response.status()).toBe(200);
		const body = await response.text();

		expect(body).toContain("User-agent: *");
		const sitemap = /Sitemap: (\S+)/.exec(body)![1];
		expect(sitemap).toBe(`https://mthomes.github.io${url("/sitemap-index.xml")}`);
		expect((await page.request.get(new URL(sitemap).pathname)).status()).toBe(200);
	});

	test("carries the base path on every internal link and asset", { tag: ["@issue-35"] }, async ({ page }) => {
		// The classic project-Pages failure: one template emits a root-relative
		// URL without the base and ships a dead link nobody notices locally.
		for (const route of ROUTES) {
			await page.goto(route);

			const rootRelative = await page.evaluate(() =>
				[...document.querySelectorAll<HTMLElement>("a[href], link[href], img[src]")]
					.map((node) => node.getAttribute("href") ?? node.getAttribute("src")!)
					.filter((value) => value.startsWith("/")),
			);

			expect(rootRelative.length, route).toBeGreaterThan(0);
			for (const value of rootRelative) {
				expect(value, `${route} links ${value} without the base`).toMatch(/^\/goat-test\//);
			}
		}
	});
});
