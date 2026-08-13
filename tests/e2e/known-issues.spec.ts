import { expect, test } from "@playwright/test";

/** The tracker: everything still broken, and everything since fixed. */
test.describe("known issues tracker", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/known-issues");
	});

	test("lists open issues first, longest-open at the top", { tag: ["@issue-31"] }, async ({ page }) => {
		const open = page.locator('.known-issue[data-state="open"]');
		const resolved = page.locator('.known-issue[data-state="resolved"]');

		expect(await open.count()).toBeGreaterThan(0);
		expect(await resolved.count()).toBeGreaterThan(0);

		// Open section sits above resolved.
		const [firstOpen, firstResolved] = await Promise.all([
			open.first().boundingBox(),
			resolved.first().boundingBox(),
		]);
		expect(firstOpen!.y).toBeLessThan(firstResolved!.y);

		// Longest-open first.
		const ages = await open.locator(".known-issue__span").evaluateAll((spans) =>
			spans.map((span) => Number.parseInt(/open for (\d+)/.exec(span.textContent!)![1], 10)),
		);
		expect(ages).toEqual([...ages].sort((a, b) => b - a));
	});

	test("shows the version each issue opened in and its age", { tag: ["@issue-31"] }, async ({ page }) => {
		for (const issue of await page.locator('.known-issue[data-state="open"]').all()) {
			const span = issue.locator(".known-issue__span");
			await expect(span).toContainText(/Opened in v\d+\.\d+\.\d+/);
			await expect(span).toContainText(/open for \d+ releases?/);
		}
	});

	test("shows resolved issues as an opened → resolved span", { tag: ["@issue-31"] }, async ({ page }) => {
		for (const issue of await page.locator('.known-issue[data-state="resolved"]').all()) {
			const span = issue.locator(".known-issue__span");
			await expect(span).toContainText(/Opened in v\d+\.\d+\.\d+/);
			await expect(span).toContainText(/resolved in v\d+\.\d+\.\d+ after \d+ releases?/);
		}
	});

	test("links both endpoints to releases that exist", { tag: ["@issue-31"] }, async ({ page }) => {
		const hrefs = await page.locator(".known-issue__span a").evaluateAll((links) =>
			links.map((link) => link.getAttribute("href")!),
		);

		expect(hrefs.length).toBeGreaterThan(0);
		for (const href of hrefs) {
			expect(href).toMatch(/^\/releases\/\d+\.\d+\.\d+$/);
			expect((await page.request.get(href)).status(), href).toBe(200);
		}
	});

	test("resolves always point forwards in time", { tag: ["@issue-31", "@issue-21"] }, async ({ page }) => {
		const rank = (v: string) =>
			v.replace("v", "").split(".").map(Number).reduce((acc, part) => acc * 1000 + part, 0);

		for (const issue of await page.locator('.known-issue[data-state="resolved"]').all()) {
			const text = await issue.locator(".known-issue__span").innerText();
			const [, opened] = /Opened in (v[\d.]+)/.exec(text)!;
			const [, closed] = /resolved in (v[\d.]+)/.exec(text)!;
			expect(rank(closed), text).toBeGreaterThan(rank(opened));
		}
	});

	test("distinguishes open from resolved via the exception layer", { tag: ["@issue-31", "@issue-18"] }, async ({ page }) => {
		await page.evaluate(() => document.fonts.ready);

		const styles = await page.locator(".known-issue").evaluateAll((issues) =>
			issues.map((issue) => ({
				state: issue.getAttribute("data-state"),
				colour: getComputedStyle(issue).color,
				rule: getComputedStyle(issue).borderInlineStartWidth,
				sigil: getComputedStyle(issue).getPropertyValue("--sigil").trim(),
			})),
		);

		const open = styles.filter((s) => s.state === "open");
		const resolved = styles.filter((s) => s.state === "resolved");

		// The distinction is data-driven and consistent, not per-instance.
		expect(new Set(open.map((s) => s.colour)).size).toBe(1);
		expect(new Set(resolved.map((s) => s.colour)).size).toBe(1);
		expect(open[0].colour).not.toBe(resolved[0].colour);
		expect(open[0].sigil).not.toBe(resolved[0].sigil);
		expect(Number.parseFloat(open[0].rule)).toBeGreaterThan(Number.parseFloat(resolved[0].rule));
	});

	test("summarises open, resolved and the longest-open span", { tag: ["@issue-31"] }, async ({ page }) => {
		const table = page.locator(".metadata-table");
		const open = await page.locator('.known-issue[data-state="open"]').count();
		const resolved = await page.locator('.known-issue[data-state="resolved"]').count();

		await expect(table).toContainText(`Open`);
		await expect(table.locator(".metadata-table__value").nth(0)).toHaveText(String(open));
		await expect(table.locator(".metadata-table__value").nth(1)).toHaveText(String(resolved));
		await expect(table.locator(".metadata-table__value").nth(2)).toContainText(/\d+ releases?, since v/);
	});

	test("keeps Open and Resolved as separate sections", { tag: ["@issue-31"] }, async ({ page }) => {
		const headings = await page.locator(".change-list__label").allInnerTexts();
		expect(headings.map((h) => h.trim())).toEqual(["Open", "Resolved"]);

		// Every issue sits under the heading that matches its state.
		for (const heading of ["Open", "Resolved"]) {
			const section = page.locator("section", {
				has: page.locator(".change-list__label", { hasText: new RegExp(`^${heading}$`) }),
			});
			const states = await section.locator(".known-issue").evaluateAll((issues) =>
				issues.map((issue) => issue.getAttribute("data-state")),
			);
			expect(new Set(states)).toEqual(new Set([heading.toLowerCase()]));
		}

		// The empty-state branches cannot fire with the seed corpus, so they
		// were verified by building with every `resolves:` reference stripped:
		// the resolved section then rendered "Nothing has been resolved yet."
		// and contained zero issues.
		await expect(page.locator(".archive__empty")).toHaveCount(0);
	});
});
