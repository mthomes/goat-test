import { expect, test } from "@playwright/test";

import { url } from "../helpers/routes.ts";

/**
 * The feed at `/rss.xml`.
 *
 * Structural assertions live here; conformance is checked separately against
 * the W3C validator via `npm run validate:feed`, which is kept out of CI
 * because a green build should not depend on a third-party service being up.
 */
test.describe("RSS feed", () => {
	test("serves valid, well-formed XML", { tag: ["@issue-34"] }, async ({ page }) => {
		const response = await page.request.get(url("/rss.xml"));

		expect(response.status()).toBe(200);
		expect(response.headers()["content-type"]).toMatch(/xml/);

		const xml = await response.text();
		expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
		expect(xml).toContain('<rss version="2.0"');

		// Parsed by a real XML parser, not a regex: a feed that only looks
		// like XML is the failure mode worth catching.
		const parsed = await page.evaluate((source) => {
			const doc = new DOMParser().parseFromString(source, "application/xml");
			return {
				error: doc.querySelector("parsererror")?.textContent ?? null,
				root: doc.documentElement.nodeName,
				channelTitle: doc.querySelector("channel > title")?.textContent ?? null,
				channelLink: doc.querySelector("channel > link")?.textContent ?? null,
				items: doc.querySelectorAll("item").length,
			};
		}, xml);

		expect(parsed.error).toBeNull();
		expect(parsed.root).toBe("rss");
		expect(parsed.channelTitle).toContain("HUMAN/1");
		expect(parsed.channelLink).toMatch(/^https:\/\//);
	});

	test("carries every release, newest first", { tag: ["@issue-34"] }, async ({ page }) => {
		const xml = await (await page.request.get(url("/rss.xml"))).text();

		const items = await page.evaluate((source) => {
			const doc = new DOMParser().parseFromString(source, "application/xml");
			return [...doc.querySelectorAll("item")].map((item) => ({
				title: item.querySelector("title")?.textContent ?? "",
				link: item.querySelector("link")?.textContent ?? "",
				pubDate: item.querySelector("pubDate")?.textContent ?? "",
			}));
		}, xml);

		// Item count matches the release count on the archive.
		await page.goto("releases");
		const total = Number.parseInt(
			/(\d+) releases/.exec(await page.locator(".archive__count").first().innerText())![1],
			10,
		);
		expect(items).toHaveLength(total);

		const dates = items.map((item) => Date.parse(item.pubDate));
		expect(dates).toEqual([...dates].sort((a, b) => b - a));
		expect(items[0].title).toBe("v34.2.1");
	});

	test("titles include the version and links are absolute", { tag: ["@issue-34"] }, async ({ page }) => {
		const xml = await (await page.request.get(url("/rss.xml"))).text();

		const items = await page.evaluate((source) => {
			const doc = new DOMParser().parseFromString(source, "application/xml");
			return [...doc.querySelectorAll("item")].map((item) => ({
				title: item.querySelector("title")?.textContent ?? "",
				link: item.querySelector("link")?.textContent ?? "",
				description: item.querySelector("description")?.textContent ?? "",
			}));
		}, xml);

		for (const item of items) {
			expect(item.title).toMatch(/^v\d+\.\d+\.\d+$/);
			// Absolute, and carrying the path the site is published under —
			// a feed reader has nothing else to resolve a link against.
			expect(item.link).toMatch(
				new RegExp(`^https://[^/]+/goat-test/releases/${item.title.slice(1)}$`),
			);
			expect(item.description.length).toBeGreaterThan(20);
		}
	});

	test("renders changes as readable HTML, not raw frontmatter", { tag: ["@issue-34"] }, async ({ page }) => {
		const xml = await (await page.request.get(url("/rss.xml"))).text();

		const content = await page.evaluate((source) => {
			const doc = new DOMParser().parseFromString(source, "application/xml");
			const item = [...doc.querySelectorAll("item")].find(
				(node) => node.querySelector("title")?.textContent === "v32.0.0",
			)!;
			return item.getElementsByTagName("content:encoded")[0]?.textContent ?? "";
		}, xml);

		// Composed HTML using the same grouping as the detail page.
		expect(content).toContain("<h2>Added</h2>");
		expect(content).toContain("<ul>");
		expect(content).toContain("<li>");
		expect(content).toContain("Full release notes for v32.0.0");

		// And no YAML leaking through.
		expect(content).not.toMatch(/^---/m);
		expect(content).not.toContain("type: added");
		expect(content).not.toContain("tags: [");
	});

	test("advertises itself for autodiscovery on every page", { tag: ["@issue-34"] }, async ({ page }) => {
		for (const path of [url("/"), url("/releases"), url("/known-issues"), url("/tags")]) {
			await page.goto(path);

			const link = page.locator('head link[rel="alternate"][type="application/rss+xml"]');
			await expect(link, path).toHaveCount(1);
			await expect(link, path).toHaveAttribute("href", url("/rss.xml"));
			await expect(link, path).toHaveAttribute("title", /HUMAN\/1/);
		}
	});
});
