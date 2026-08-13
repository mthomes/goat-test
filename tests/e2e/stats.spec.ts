import { expect, test } from "@playwright/test";

/**
 * The stats dashboard.
 *
 * Every figure is cross-checked against the same value recomputed from the
 * rendered site, because a query-layer regression that still prints
 * plausible-looking numbers is exactly what this page would hide.
 */

/**
 * `label → value` pairs from one section's table.
 *
 * Scoped per section on purpose: "Total" appears under both Releases and
 * Changes, and reading the whole page at once silently keeps whichever came
 * last.
 */
async function figures(page: import("@playwright/test").Page, section: string) {
	return Object.fromEntries(
		await page
			.locator(`section:has(#${section}) .metadata-table__row`)
			.evaluateAll((rows) =>
				rows.map((row) => [
					row.querySelector(".metadata-table__label")!.textContent!.trim(),
					row.querySelector(".metadata-table__value")!.textContent!.trim(),
				]),
			),
	) as Record<string, string>;
}

test.describe("stats dashboard", () => {
	test("totals releases and splits them by type", { tag: ["@issue-32"] }, async ({ page }) => {
		await page.goto("/stats");
		const stats = await figures(page, "releases");

		const total = Number.parseInt(stats.Total, 10);
		const [major, minor, patch] = [stats.Major, stats.Minor, stats.Patch].map((n) =>
			Number.parseInt(n, 10),
		);

		expect(major + minor + patch).toBe(total);
		expect(major).toBe(4);

		// Cross-checked against the archive, which counts them independently.
		await page.goto("/releases");
		const archive = Number.parseInt(
			/(\d+) releases/.exec(await page.locator(".archive__count").first().innerText())![1],
			10,
		);
		expect(total).toBe(archive);
	});

	test("totals changes by type, cross-checked against /changes", { tag: ["@issue-32"] }, async ({ page }) => {
		await page.goto("/changes");
		const byType = Object.fromEntries(
			await page.locator(".tag-index__row").evaluateAll((rows) =>
				rows.map((row) => [
					row.querySelector("a")!.textContent!.trim().replace(" →", ""),
					Number.parseInt(row.querySelector(".tag-index__count")!.textContent!, 10),
				]),
			),
		) as Record<string, number>;

		await page.goto("/stats");
		const stats = await figures(page, "changes");

		for (const [label, count] of Object.entries(byType)) {
			expect(Number.parseInt(stats[label], 10), label).toBe(count);
		}
		expect(Object.values(byType).reduce((a, b) => a + b, 0))
			.toBe(Number.parseInt(stats.Total, 10));
	});

	test("ranks the most-patched tags, cross-checked against /tags", { tag: ["@issue-32"] }, async ({ page }) => {
		await page.goto("/tags");
		const onTags = await page.locator(".tag-index__row").evaluateAll((rows) =>
			rows.map((row) => ({
				tag: row.querySelector("a")!.textContent!.trim(),
				count: Number.parseInt(row.querySelector(".tag-index__count")!.textContent!, 10),
			})),
		);

		await page.goto("/stats");
		const onStats = await page.locator(".stats__rank").evaluateAll((cells) =>
			cells.map((cell) => ({
				position: Number.parseInt(cell.querySelector(".stats__position")!.textContent!, 10),
				tag: cell.querySelector("a")!.textContent!.trim(),
			})),
		);

		expect(onStats.map((row) => row.tag)).toEqual(onTags.map((row) => row.tag));
		expect(onStats.map((row) => row.position)).toEqual(
			onTags.map((_, index) => index + 1),
		);
	});

	test("names the longest-open known issue with its age", { tag: ["@issue-32"] }, async ({ page }) => {
		await page.goto("/stats");
		const stats = await figures(page, "issues");

		expect(stats["Longest open"]).toMatch(/^\d+ releases?, since v\d+\.\d+\.\d+$/);
		const [, age, version] = /^(\d+) releases?, since (v[\d.]+)/.exec(stats["Longest open"])!;

		await page.goto("/known-issues");
		const top = page.locator('.known-issue[data-state="open"]').first();
		await expect(top.locator(".known-issue__span")).toContainText(`open for ${age} release`);
		await expect(top.locator(".known-issue__span")).toContainText(`Opened in ${version}`);
	});

	test("gives the ratio of things fixed to things still broken", { tag: ["@issue-32"] }, async ({ page }) => {
		await page.goto("/stats");
		const stats = await figures(page, "issues");

		const resolved = Number.parseInt(stats.Resolved, 10);
		const open = Number.parseInt(stats["Still open"], 10);
		const [, printed] = /^([\d.]+) : 1$/.exec(stats["Fixed : broken"])!;

		expect(Number.parseFloat(printed)).toBeCloseTo(resolved / open, 2);
		expect(resolved + open).toBe(Number.parseInt(stats.Opened, 10));
	});

	test("reports average and longest gap between releases", { tag: ["@issue-32"] }, async ({ page }) => {
		await page.goto("/stats");
		const stats = await figures(page, "cadence");

		const average = Number.parseFloat(stats["Average gap"]);
		const longest = Number.parseFloat(stats["Longest gap"]);

		expect(average).toBeGreaterThan(0);
		expect(longest).toBeGreaterThanOrEqual(average);
		expect(stats["Longest gap between"]).toMatch(/^v[\d.]+ → v[\d.]+$/);

		// Recomputed from the two release pages either side of the gap.
		const [, from, to] = /^v([\d.]+) → v([\d.]+)$/.exec(stats["Longest gap between"])!;
		const dateOf = async (version: string) => {
			await page.goto(`/releases/${version}`);
			return Date.parse((await page.locator(".metadata-table time").getAttribute("datetime"))!);
		};
		const days = ((await dateOf(to)) - (await dateOf(from))) / 86_400_000;
		expect(days).toBeCloseTo(longest, 0);
	});

	test("is typeset as a table, with no chart chrome", { tag: ["@issue-32"] }, async ({ page }) => {
		await page.goto("/stats");

		// Definition lists and ordered lists, not canvases or SVG plots.
		await expect(page.locator("main canvas")).toHaveCount(0);
		await expect(page.locator("main svg")).toHaveCount(0);
		expect(await page.locator(".metadata-table").count()).toBeGreaterThanOrEqual(4);

		// Figures set in the mono with tabular figures, so columns line up.
		const value = page.locator(".metadata-table__value").first();
		expect(await value.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/IBM Plex Mono/);
		expect(await value.evaluate((el) => getComputedStyle(el).fontVariantNumeric))
			.toContain("tabular-nums");
	});
});
