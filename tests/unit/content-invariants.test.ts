import { describe, expect, it } from "vitest";

import {
	releaseSchema,
	resetKnownIssueRegistry,
	VERSION_PATTERN,
} from "../../src/content/schema.ts";
import { buildKnownIssues, openKnownIssues, resolvedKnownIssues } from "../../src/lib/known-issues.ts";
import { buildIndex, CHANGE_TYPES } from "../../src/lib/release-index.ts";
import { compareVersions, deriveReleaseType, parseVersion } from "../../src/lib/semver.ts";
import { loadSeedReleases } from "../helpers/seed.ts";

/**
 * Assertions over the real seed content, not over fixtures.
 *
 * A schema test that only runs against invented data proves the schema is
 * self-consistent. These prove the 30 releases the site actually ships obey it,
 * and that the query layer's derived figures agree with a naive recount of the
 * same content.
 */
const seed = [...loadSeedReleases()].sort((a, b) => compareVersions(a.version, b.version));
const index = buildIndex(seed);
const issues = buildKnownIssues(seed);

/** A release that validates, as the base for each rejection case. */
const valid = {
	version: "31.0.0",
	released: new Date("2021-03-14"),
	changes: [{ type: "added", text: "Something." }],
};

function parse(release: unknown) {
	resetKnownIssueRegistry();
	return releaseSchema.safeParse(release);
}

describe("@issue-45 @issue-19 schema rejections", () => {
	it.each([
		["31.0", "malformed version: too few parts"],
		["31.0.0.0", "malformed version: too many parts"],
		["v31.0.0", "malformed version: a v prefix"],
		["31.0.0-rc.1", "malformed version: a prerelease"],
		["01.0.0", "malformed version: a leading zero"],
		["", "malformed version: empty"],
	])("rejects %j — %s", (version) => {
		const result = parse({ ...valid, version });

		expect(result.success).toBe(false);
		expect(VERSION_PATTERN.test(version)).toBe(false);
	});

	it("rejects an unknown change type", () => {
		const result = parse({ ...valid, changes: [{ type: "improved", text: "x" }] });

		expect(result.success).toBe(false);
		expect(JSON.stringify(result.error!.issues)).toContain("known-issue");
	});

	it("rejects a duplicate known-issue id within one release", () => {
		const result = parse({
			...valid,
			changes: [
				{ type: "known-issue", id: "dupe", text: "a" },
				{ type: "known-issue", id: "dupe", text: "b" },
			],
		});

		expect(result.success).toBe(false);
		expect(JSON.stringify(result.error!.issues)).toContain("Duplicate known-issue id");
	});

	it("rejects a duplicate known-issue id across two releases", () => {
		// Uniqueness is a property of the whole collection, not of one entry.
		resetKnownIssueRegistry();
		const first = releaseSchema.safeParse({
			...valid,
			version: "31.0.0",
			changes: [{ type: "known-issue", id: "shared", text: "a" }],
		});
		const second = releaseSchema.safeParse({
			...valid,
			version: "31.1.0",
			changes: [{ type: "known-issue", id: "shared", text: "b" }],
		});

		expect(first.success).toBe(true);
		expect(second.success).toBe(false);
		expect(JSON.stringify(second.error!.issues)).toContain("already declared by 31.0.0");
	});

	it("rejects a known-issue entry with no id at all", () => {
		expect(parse({ ...valid, changes: [{ type: "known-issue", text: "x" }] }).success).toBe(false);
	});

	it("accepts the shape it is supposed to accept", () => {
		expect(parse(valid).success).toBe(true);
	});
});

describe("@issue-45 the seed collection", () => {
	it("validates all 30 releases against the schema", () => {
		// loadSeedReleases parses each file through the real schema and throws
		// on the first failure, naming the file and the field.
		expect(seed).toHaveLength(30);
		for (const release of seed) {
			expect(VERSION_PATTERN.test(release.version), release.version).toBe(true);
			expect(release.released).toBeInstanceOf(Date);
			expect(release.changes.length).toBeGreaterThan(0);
		}
	});

	it("has strictly increasing versions across the collection", () => {
		for (let i = 1; i < seed.length; i++) {
			expect(
				compareVersions(seed[i - 1].version, seed[i].version),
				`${seed[i].version} does not follow ${seed[i - 1].version}`,
			).toBeLessThan(0);
		}

		// And no version appears twice, which a comparison alone would miss if
		// the list were sorted by something else.
		expect(new Set(seed.map((release) => release.version)).size).toBe(seed.length);
	});

	it("resolves every `resolves` reference to a real known-issue id", () => {
		const declared = new Set(
			seed.flatMap((release) =>
				release.changes.filter((c) => c.type === "known-issue").map((c) => c.id!),
			),
		);

		const references = seed.flatMap((release) =>
			release.changes.flatMap((change) =>
				(change.resolves ?? []).map((id) => ({ id, from: release.version })),
			),
		);

		expect(references.length).toBeGreaterThan(0);
		for (const { id, from } of references) {
			expect(declared, `${from} resolves "${id}"`).toContain(id);
		}
	});
});

describe("@issue-45 the query layer against a naive recount", () => {
	const allChanges = seed.flatMap((release) => release.changes);

	it("counts every tag exactly as the content does", () => {
		const naive = new Map<string, number>();
		for (const change of allChanges) {
			for (const tag of change.tags ?? []) naive.set(tag, (naive.get(tag) ?? 0) + 1);
		}

		// Every tag in content appears in getAllTags()…
		const reported = new Map(index.tags.map((tag) => [tag.tag, tag.count]));
		expect([...reported.keys()].sort()).toEqual([...naive.keys()].sort());

		// …with the right count.
		for (const [tag, count] of naive) expect(reported.get(tag), tag).toBe(count);
	});

	it("cross-checks getStats totals against a recount of the collection", () => {
		const { stats } = index;

		expect(stats.totalReleases).toBe(seed.length);
		expect(stats.totalChanges).toBe(allChanges.length);
		expect(stats.totalTags).toBe(
			new Set(allChanges.flatMap((change) => change.tags ?? [])).size,
		);

		for (const type of CHANGE_TYPES) {
			expect(stats.changesByType[type], type)
				.toBe(allChanges.filter((change) => change.type === type).length);
		}

		const naiveTypes = seed.map((release, i) =>
			deriveReleaseType(release.version, i === 0 ? null : seed[i - 1].version),
		);
		for (const type of ["major", "minor", "patch"] as const) {
			expect(stats.releasesByType[type], type)
				.toBe(naiveTypes.filter((t) => t === type).length);
		}

		expect(stats.knownIssues.total)
			.toBe(allChanges.filter((change) => change.type === "known-issue").length);
	});

	it("cross-checks cadence against a recount of the dates", () => {
		const days = seed.slice(1).map(
			(release, i) =>
				(release.released.getTime() - seed[i].released.getTime()) / 86_400_000,
		);

		expect(index.stats.cadence.longestGapDays).toBeCloseTo(Math.max(...days), 6);
		expect(index.stats.cadence.averageGapDays)
			.toBeCloseTo(days.reduce((a, b) => a + b, 0) / days.length, 6);
		expect(index.stats.cadence.byMonth.reduce((total, m) => total + m.count, 0))
			.toBe(seed.length);
	});
});

describe("@issue-45 the shape #23 promised", () => {
	const types = seed.map((release, i) =>
		deriveReleaseType(release.version, i === 0 ? null : seed[i - 1].version),
	);

	it("ships exactly 4 major releases", () => {
		expect(types.filter((type) => type === "major")).toHaveLength(4);
	});

	it("resolves 5–6 known issues and leaves 2–3 open", () => {
		const resolved = resolvedKnownIssues(issues).length;
		const open = openKnownIssues(issues).length;

		expect(resolved).toBeGreaterThanOrEqual(5);
		expect(resolved).toBeLessThanOrEqual(6);
		expect(open).toBeGreaterThanOrEqual(2);
		expect(open).toBeLessThanOrEqual(3);
	});

	it("has at least one known issue spanning a major version boundary", () => {
		const spanning = issues.filter(
			(issue) =>
				issue.resolvedIn !== undefined &&
				parseVersion(issue.openedIn).major !== parseVersion(issue.resolvedIn).major,
		);

		expect(spanning.length).toBeGreaterThanOrEqual(1);
	});

	it("keeps every release to 2–6 change entries", () => {
		for (const release of seed) {
			expect(release.changes.length, release.version).toBeGreaterThanOrEqual(2);
			expect(release.changes.length, release.version).toBeLessThanOrEqual(6);
		}
	});

	it("gives roughly a third of releases a prose summary", () => {
		const share = seed.filter((release) => release.summary !== undefined).length / seed.length;

		expect(share).toBeGreaterThan(0.25);
		expect(share).toBeLessThan(0.45);
	});

	it("uses a vocabulary of 12–18 tags", () => {
		expect(index.tags.length).toBeGreaterThanOrEqual(12);
		expect(index.tags.length).toBeLessThanOrEqual(18);
	});
});
