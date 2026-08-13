import { expect, test } from "@playwright/test";

import { buildIndex } from "../../src/lib/release-index.ts";
import { url } from "../helpers/routes.ts";
import { loadSeedReleases } from "../helpers/seed.ts";

/**
 * The aggregate views, checked against the collection rather than against each
 * other.
 *
 * Every other spec compares one rendered page to another, which catches a page
 * that disagrees with its neighbours but not a query layer that is uniformly
 * wrong. Here the expected values are computed in Node straight from the
 * markdown on disk, so a regression that renders plausible-looking numbers
 * everywhere still fails.
 */
const index = buildIndex(loadSeedReleases());
const { stats } = index;

test.describe("aggregate views against the collection", () => {
	test("tag index counts match the collection, and each tag page", { tag: ["@issue-47"] }, async ({ page }) => {
		await page.goto("tags");

		const rendered = await page.locator(".tag-index__row").evaluateAll((rows) =>
			rows.map((row) => ({
				tag: row.querySelector("a")!.textContent!.trim(),
				href: row.querySelector("a")!.getAttribute("href")!,
				count: Number.parseInt(row.querySelector(".tag-index__count")!.textContent!, 10),
			})),
		);

		// Same tags, same order, same counts as the collection.
		expect(rendered.map((row) => row.tag)).toEqual(index.tags.map((tag) => tag.tag));
		expect(rendered.map((row) => row.count)).toEqual(index.tags.map((tag) => tag.count));

		// And each tag page renders exactly that many entries.
		for (const row of rendered) {
			await page.goto(row.href);
			await expect(page.locator(".change-index .change-entry"), row.tag).toHaveCount(row.count);
		}
	});

	test("every change with a tag appears on its tag page, linked to its release", { tag: ["@issue-47"] }, async ({ page }) => {
		for (const tag of index.tags.slice(0, 4)) {
			const expected = index.changesByTag.get(tag.tag)!;
			await page.goto(url(`/tags/${tag.slug}`));

			const rendered = await page.locator(".change-index .change-entry").evaluateAll((entries) =>
				entries.map((entry) => ({
					text: entry.querySelector(".change-entry__text")!.textContent!.trim(),
					release: entry.querySelector(".change-index__release a")!.textContent!.trim(),
					href: entry.querySelector(".change-index__release a")!.getAttribute("href")!,
					type: entry.getAttribute("data-change-type"),
				})),
			);

			expect(rendered.map((entry) => entry.release), tag.tag)
				.toEqual(expected.map((change) => `v${change.release.version}`));
			expect(rendered.map((entry) => entry.type), tag.tag)
				.toEqual(expected.map((change) => change.type));
			expect(rendered.map((entry) => entry.href), tag.tag)
				.toEqual(expected.map((change) => url(`/releases/${change.release.version}`)));
		}
	});

	test("change-type totals match the collection and every type is reachable", { tag: ["@issue-47"] }, async ({ page }) => {
		await page.goto("changes");

		const rendered = Object.fromEntries(
			await page.locator(".tag-index__row").evaluateAll((rows) =>
				rows.map((row) => [
					row.getAttribute("data-change-type"),
					{
						count: Number.parseInt(row.querySelector(".tag-index__count")!.textContent!, 10),
						href: row.querySelector("a")!.getAttribute("href")!,
					},
				]),
			),
		) as Record<string, { count: number; href: string }>;

		for (const [type, count] of Object.entries(stats.changesByType)) {
			expect(rendered[type]?.count, type).toBe(count);
			expect((await page.request.get(rendered[type].href)).status(), type).toBe(200);
		}

		// And each type page lists exactly the changes of that type.
		for (const [type, { href }] of Object.entries(rendered)) {
			if (type === "known-issue") continue;
			await page.goto(href);
			await expect(page.locator(".change-index .change-entry"), type)
				.toHaveCount(stats.changesByType[type as keyof typeof stats.changesByType]);
		}
	});

	test("the tracker's ages and ordering match the model", { tag: ["@issue-47"] }, async ({ page }) => {
		await page.goto("known-issues");

		const open = await page.locator('.known-issue[data-state="open"]').evaluateAll((issues) =>
			issues.map((issue) => ({
				id: issue.getAttribute("id"),
				span: issue.querySelector(".known-issue__span")!.textContent!.replace(/\s+/g, " ").trim(),
			})),
		);

		expect(open.map((issue) => issue.id)).toEqual(index.openKnownIssues.map((issue) => issue.id));

		for (const [position, issue] of index.openKnownIssues.entries()) {
			expect(open[position].span, issue.id).toContain(`Opened in v${issue.openedIn}`);
			expect(open[position].span, issue.id)
				.toContain(`open for ${issue.ageInReleases} release`);
		}
	});

	test("resolved issues show the right span, both endpoints real", { tag: ["@issue-47"] }, async ({ page }) => {
		await page.goto("known-issues");

		const resolved = await page.locator('.known-issue[data-state="resolved"]').evaluateAll((issues) =>
			issues.map((issue) => ({
				id: issue.getAttribute("id"),
				span: issue.querySelector(".known-issue__span")!.textContent!.replace(/\s+/g, " ").trim(),
				hrefs: [...issue.querySelectorAll(".known-issue__span a")].map((a) => a.getAttribute("href")!),
			})),
		);

		expect(resolved.map((issue) => issue.id))
			.toEqual(index.resolvedKnownIssues.map((issue) => issue.id));

		for (const [position, issue] of index.resolvedKnownIssues.entries()) {
			const rendered = resolved[position];
			expect(rendered.span, issue.id).toContain(`Opened in v${issue.openedIn}`);
			expect(rendered.span, issue.id).toContain(`resolved in v${issue.resolvedIn}`);
			expect(rendered.span, issue.id).toContain(`after ${issue.ageInReleases} release`);

			expect(rendered.hrefs, issue.id).toEqual([
				url(`/releases/${issue.openedIn}`),
				url(`/releases/${issue.resolvedIn}`),
			]);
			for (const href of rendered.hrefs) {
				expect((await page.request.get(href)).status(), href).toBe(200);
			}
		}
	});

	test("every stats figure matches the value computed from the collection", { tag: ["@issue-47"] }, async ({ page }) => {
		await page.goto("stats");

		const section = async (id: string) =>
			Object.fromEntries(
				await page.locator(`section:has(#${id}) .metadata-table__row`).evaluateAll((rows) =>
					rows.map((row) => [
						row.querySelector(".metadata-table__label")!.textContent!.trim(),
						row.querySelector(".metadata-table__value")!.textContent!.trim(),
					]),
				),
			) as Record<string, string>;

		const releases = await section("releases");
		expect(Number.parseInt(releases.Total, 10)).toBe(stats.totalReleases);
		expect(Number.parseInt(releases.Major, 10)).toBe(stats.releasesByType.major);
		expect(Number.parseInt(releases.Minor, 10)).toBe(stats.releasesByType.minor);
		expect(Number.parseInt(releases.Patch, 10)).toBe(stats.releasesByType.patch);

		const changes = await section("changes");
		expect(Number.parseInt(changes.Total, 10)).toBe(stats.totalChanges);
		expect(Number.parseInt(changes.Added, 10)).toBe(stats.changesByType.added);
		expect(Number.parseInt(changes.Fixed, 10)).toBe(stats.changesByType.fixed);

		const issues = await section("issues");
		expect(Number.parseInt(issues.Opened, 10)).toBe(stats.knownIssues.total);
		expect(Number.parseInt(issues.Resolved, 10)).toBe(stats.knownIssues.resolved);
		expect(Number.parseInt(issues["Still open"], 10)).toBe(stats.knownIssues.open);
		expect(issues["Longest open"])
			.toBe(`${stats.knownIssues.longestOpen!.ageInReleases} releases, since v${stats.knownIssues.longestOpen!.openedIn}`);

		const cadence = await section("cadence");
		expect(Number.parseFloat(cadence["Average gap"]))
			.toBeCloseTo(stats.cadence.averageGapDays, 0);
		expect(Number.parseFloat(cadence["Longest gap"]))
			.toBeCloseTo(stats.cadence.longestGapDays, 0);
		expect(cadence["Longest gap between"])
			.toBe(`v${stats.cadence.longestGapBetween![0]} → v${stats.cadence.longestGapBetween![1]}`);

		// The ranked tag table, in full.
		const ranked = await page.locator(".stats__rank").evaluateAll((cells) =>
			cells.map((cell) => cell.querySelector("a")!.textContent!.trim()),
		);
		expect(ranked).toEqual(index.tags.map((tag) => tag.tag));
	});

	test("the heatmap's accessible table matches the cadence data", { tag: ["@issue-47", "@issue-33"] }, async ({ page }) => {
		await page.goto("stats");

		const rows = await page.locator(".heatmap table tbody tr").evaluateAll((items) =>
			items.map((row) => ({
				year: Number.parseInt(row.querySelector("th")!.textContent!, 10),
				counts: [...row.querySelectorAll("td")].map((cell) => cell.textContent!.trim()),
			})),
		);

		expect(rows.length).toBeGreaterThan(0);

		for (const row of rows) {
			for (const [monthIndex, value] of row.counts.entries()) {
				const month = stats.cadence.byMonth.find(
					(entry) => entry.year === row.year && entry.monthOfYear === monthIndex + 1,
				);
				const expected = month ? String(month.count) : "—";
				expect(value, `${row.year}-${monthIndex + 1}`).toBe(expected);
			}
		}
	});
});
