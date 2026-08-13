import { describe, expect, it } from "vitest";

import { buildIndex, CHANGE_TYPES } from "../../src/lib/release-index.ts";
import { compareVersions } from "../../src/lib/semver.ts";
import { loadSeedReleases } from "../helpers/seed.ts";

/**
 * The query layer, exercised against the real seed corpus rather than a
 * fixture — a query layer that only works on invented data is not a query
 * layer.
 */
const seed = loadSeedReleases();
const index = buildIndex(seed);

/** Deliberately naive recounts, for cross-checking the derived figures. */
const allChanges = seed.flatMap((release) => release.changes);
const naiveTagCounts = allChanges
	.flatMap((change) => change.tags ?? [])
	.reduce((counts, tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1), new Map<string, number>());

describe("@issue-22 getAllReleases", () => {
	it("returns every release, newest first", () => {
		expect(index.releases).toHaveLength(seed.length);
		for (let i = 1; i < index.releases.length; i++) {
			expect(compareVersions(index.releases[i - 1].version, index.releases[i].version))
				.toBeGreaterThan(0);
		}
		expect(index.releases[0].version).toBe("34.2.1");
	});

	it("attaches the derived release type", () => {
		expect(index.byVersion.get("32.0.0")!.releaseType).toBe("major");
		expect(index.byVersion.get("32.1.0")!.releaseType).toBe("minor");
		expect(index.byVersion.get("32.1.1")!.releaseType).toBe("patch");
	});

	it("links each release to its neighbours, with the ends open", () => {
		const newest = index.releases[0];
		const oldest = index.releases.at(-1)!;

		expect(newest.next).toBeUndefined();
		expect(oldest.previous).toBeUndefined();

		// Walking `previous` from the newest visits every release exactly once.
		const walked: string[] = [];
		let cursor = newest;
		while (true) {
			walked.push(cursor.version);
			if (cursor.previous === undefined) break;
			cursor = index.byVersion.get(cursor.previous)!;
		}
		expect(walked).toHaveLength(seed.length);
		expect(new Set(walked).size).toBe(seed.length);
	});

	it("groups a release's changes by type, in a stable order, without empty groups", () => {
		for (const release of index.releases) {
			const order = release.changesByType.map((group) => group.type);
			expect(order).toEqual([...order].sort(
				(a, b) => CHANGE_TYPES.indexOf(a) - CHANGE_TYPES.indexOf(b),
			));
			for (const group of release.changesByType) expect(group.changes.length).toBeGreaterThan(0);
			expect(release.changesByType.reduce((n, g) => n + g.changes.length, 0))
				.toBe(release.changes.length);
		}
	});
});

describe("@issue-22 getReleaseByVersion", () => {
	it("finds every version in the corpus", () => {
		for (const release of seed) {
			expect(index.byVersion.get(release.version)?.version).toBe(release.version);
		}
	});

	it("returns undefined for a version that does not exist", () => {
		expect(index.byVersion.get("99.0.0")).toBeUndefined();
	});
});

describe("@issue-22 getAllTags", () => {
	it("counts every tag, and counts them correctly", () => {
		expect(index.tags).toHaveLength(naiveTagCounts.size);
		for (const { tag, count } of index.tags) {
			expect(count, `${tag} is miscounted`).toBe(naiveTagCounts.get(tag));
		}
	});

	it("orders by frequency, then alphabetically so ties are stable", () => {
		for (let i = 1; i < index.tags.length; i++) {
			const [previous, current] = [index.tags[i - 1], index.tags[i]];
			expect(previous.count).toBeGreaterThanOrEqual(current.count);
			if (previous.count === current.count) {
				expect(previous.tag.localeCompare(current.tag)).toBeLessThan(0);
			}
		}
	});

	it("gives every tag a URL-safe slug", () => {
		for (const { slug } of index.tags) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
	});
});

describe("@issue-22 getChangesByTag", () => {
	it("flattens every change carrying a tag, newest first", () => {
		for (const { tag, count } of index.tags) {
			const changes = index.changesByTag.get(tag)!;
			expect(changes, `${tag}`).toHaveLength(count);

			for (let i = 1; i < changes.length; i++) {
				expect(compareVersions(changes[i - 1].release.version, changes[i].release.version))
					.toBeGreaterThanOrEqual(0);
			}
		}
	});

	it("carries the parent release on every entry", () => {
		for (const change of index.changesByTag.get("housing")!) {
			expect(index.byVersion.has(change.release.version)).toBe(true);
			expect(change.release.released).toBeInstanceOf(Date);
			expect(change.tags).toContain("housing");
		}
	});

	it("returns nothing for a tag that is not in use", () => {
		expect(index.changesByTag.get("nonexistent")).toBeUndefined();
	});
});

describe("@issue-22 getChangesByType", () => {
	it("accounts for every change exactly once across all types", () => {
		const total = CHANGE_TYPES.reduce((n, type) => n + index.changesByType.get(type)!.length, 0);
		expect(total).toBe(allChanges.length);
	});

	it("puts each change under its own type only", () => {
		for (const type of CHANGE_TYPES) {
			const changes = index.changesByType.get(type)!;
			expect(changes.length).toBe(allChanges.filter((c) => c.type === type).length);
			for (const change of changes) expect(change.type).toBe(type);
		}
	});

	it("orders each type newest first, carrying the parent release", () => {
		for (const type of CHANGE_TYPES) {
			const changes = index.changesByType.get(type)!;
			for (let i = 1; i < changes.length; i++) {
				expect(compareVersions(changes[i - 1].release.version, changes[i].release.version))
					.toBeGreaterThanOrEqual(0);
			}
			for (const change of changes) expect(index.byVersion.has(change.release.version)).toBe(true);
		}
	});
});

describe("@issue-22 getKnownIssues", () => {
	it("carries resolution state through from the lifecycle model", () => {
		expect(index.knownIssues.length).toBe(index.openKnownIssues.length + index.resolvedKnownIssues.length);
		for (const issue of index.openKnownIssues) expect(issue.resolvedIn).toBeUndefined();
		for (const issue of index.resolvedKnownIssues) expect(issue.resolvedIn).toBeTruthy();
	});

	it("points every endpoint at a release that exists", () => {
		for (const issue of index.knownIssues) {
			expect(index.byVersion.has(issue.openedIn)).toBe(true);
			if (issue.resolvedIn) expect(index.byVersion.has(issue.resolvedIn)).toBe(true);
		}
	});

	it("finds one known issue per known-issue change entry", () => {
		expect(index.knownIssues).toHaveLength(
			allChanges.filter((change) => change.type === "known-issue").length,
		);
	});
});

describe("@issue-22 getStats", () => {
	const { stats } = index;

	it("totals releases and splits them by type", () => {
		expect(stats.totalReleases).toBe(seed.length);
		const { major, minor, patch } = stats.releasesByType;
		expect(major + minor + patch).toBe(seed.length);
	});

	it("totals changes and splits them by type, cross-checked against a naive recount", () => {
		expect(stats.totalChanges).toBe(allChanges.length);
		for (const type of CHANGE_TYPES) {
			expect(stats.changesByType[type]).toBe(allChanges.filter((c) => c.type === type).length);
		}
		expect(Object.values(stats.changesByType).reduce((a, b) => a + b, 0)).toBe(allChanges.length);
	});

	it("ranks the most-used tags", () => {
		expect(stats.totalTags).toBe(naiveTagCounts.size);
		expect(stats.topTags[0].count).toBe(Math.max(...naiveTagCounts.values()));
	});

	it("names the longest-open known issue", () => {
		expect(stats.knownIssues.longestOpen?.id).toBe(index.openKnownIssues[0].id);
		expect(stats.knownIssues.open + stats.knownIssues.resolved).toBe(stats.knownIssues.total);
	});

	it("gives the ratio of things fixed to things still broken", () => {
		expect(stats.fixedToBroken).toBeCloseTo(
			stats.knownIssues.resolved / stats.knownIssues.open,
			10,
		);
	});

	it("computes cadence: average gap, longest gap, and the pair either side of it", () => {
		const dates = [...seed].sort((a, b) => compareVersions(a.version, b.version))
			.map((release) => release.released.getTime());
		const gaps = dates.slice(1).map((date, i) => (date - dates[i]) / 86_400_000);

		expect(stats.cadence.averageGapDays).toBeCloseTo(
			gaps.reduce((a, b) => a + b, 0) / gaps.length, 6,
		);
		expect(stats.cadence.longestGapDays).toBeCloseTo(Math.max(...gaps), 6);

		const [before, after] = stats.cadence.longestGapBetween!;
		const gap =
			(index.byVersion.get(after)!.released.getTime()
				- index.byVersion.get(before)!.released.getTime()) / 86_400_000;
		expect(gap).toBeCloseTo(stats.cadence.longestGapDays, 6);
	});

	it("includes every month in the span, quiet ones included", () => {
		const { byMonth } = stats.cadence;
		const firstRelease = stats.cadence.firstRelease!;
		const lastRelease = stats.cadence.lastRelease!;

		const months =
			(lastRelease.getUTCFullYear() - firstRelease.getUTCFullYear()) * 12
			+ (lastRelease.getUTCMonth() - firstRelease.getUTCMonth()) + 1;
		expect(byMonth).toHaveLength(months);

		// A heatmap with the quiet months missing is a list, not a heatmap.
		expect(byMonth.some((month) => month.count === 0)).toBe(true);
		expect(byMonth.reduce((total, month) => total + month.count, 0)).toBe(seed.length);
	});
});

describe("@issue-22 index construction", () => {
	it("builds an empty index over an empty collection", () => {
		// A changelog with nothing in it yet is a legitimate day-one state, not
		// a misconfiguration — malformed content already fails at the schema.
		const empty = buildIndex([]);

		expect(empty.releases).toEqual([]);
		expect(empty.tags).toEqual([]);
		expect(empty.knownIssues).toEqual([]);
		expect(empty.stats.totalReleases).toBe(0);
		expect(empty.stats.cadence.firstRelease).toBeUndefined();
		expect(empty.stats.cadence.longestGapBetween).toBeUndefined();
		// Every change-type bucket still exists, so a page can iterate them.
		expect([...empty.changesByType.keys()]).toHaveLength(6);
	});

	it("is independent of the order releases arrive in", () => {
		const shuffled = buildIndex([...seed].reverse());
		expect(shuffled.releases.map((r) => r.version)).toEqual(index.releases.map((r) => r.version));
		expect(shuffled.stats.totalChanges).toBe(index.stats.totalChanges);
	});
});
