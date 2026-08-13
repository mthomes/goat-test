import { describe, expect, it } from "vitest";

import {
	buildKnownIssues,
	KnownIssueError,
	openKnownIssues,
	resolvedKnownIssues,
	type ReleaseLike,
} from "../../src/lib/known-issues.ts";
import {
	byNewestFirst,
	compareVersions,
	deriveReleaseType,
	groupByMajor,
	parseVersion,
	tryParseVersion,
} from "../../src/lib/semver.ts";
import { loadSeedReleases } from "../helpers/seed.ts";

/**
 * The pure logic everything else derives from, run against the **real seed
 * range** rather than a fixture.
 *
 * `semver.test.ts` and `known-issues.test.ts` cover the same functions against
 * invented ladders, which is where the edge cases live. This file is the other
 * half: it proves the models hold on the 30 releases the site actually ships,
 * which is the failure mode that would otherwise render silently as wrong
 * content.
 */
const seed = [...loadSeedReleases()].sort((a, b) => compareVersions(a.version, b.version));
const versions = seed.map((release) => release.version);
const issues = buildKnownIssues(seed);

describe("@issue-44 semver parsing over the seed range", () => {
	it("parses every version in the corpus", () => {
		for (const version of versions) {
			const { major, minor, patch } = parseVersion(version);
			expect(`${major}.${minor}.${patch}`).toBe(version);
			expect(major).toBeGreaterThanOrEqual(31);
			expect(major).toBeLessThanOrEqual(34);
		}
	});

	it.each([
		"", " ", "31", "31.0", "31.0.0.0", "v31.0.0", "31.0.0-rc.1", "31.0.0+build",
		"01.0.0", "31.0.0 ", "thirty-one", "-1.0.0", "31..0",
	])("rejects malformed input: %j", (input) => {
		expect(tryParseVersion(input)).toBeNull();
		expect(() => parseVersion(input)).toThrow(TypeError);
	});
});

describe("@issue-44 the sort comparator over the seed range", () => {
	it("sorts the full corpus newest-first from any starting order", () => {
		const expected = [...versions].reverse();

		expect([...versions].sort(byNewestFirst)).toEqual(expected);
		expect([...versions].reverse().sort(byNewestFirst)).toEqual(expected);
		// Lexicographic order is the bug this comparator exists to avoid, so
		// start from it and check we still land in the right place.
		expect([...versions].sort().sort(byNewestFirst)).toEqual(expected);
	});

	it("puts 32.0.0 above every 31.x across the major rollover", () => {
		const sorted = [...versions].sort(byNewestFirst);
		const rollover = sorted.indexOf("32.0.0");

		for (const [index, version] of sorted.entries()) {
			if (version.startsWith("31.")) expect(index).toBeGreaterThan(rollover);
			if (version.startsWith("33.") || version.startsWith("34.")) {
				expect(index).toBeLessThan(rollover);
			}
		}
	});

	it("does not order 31.10.x below 31.2.x, which a string sort would", () => {
		// The corpus has no double-digit minor, so the trap is asserted directly.
		expect(compareVersions("31.2.0", "31.10.0")).toBeLessThan(0);
		expect("31.2.0".localeCompare("31.10.0")).toBeGreaterThan(0);
	});

	it("groups the corpus into four majors, newest first", () => {
		const groups = groupByMajor(versions, (version) => version);

		expect(groups.map((group) => group.major)).toEqual([34, 33, 32, 31]);
		expect(groups.flatMap((group) => group.items)).toHaveLength(versions.length);
	});
});

describe("@issue-44 release-type derivation over the seed range", () => {
	const types = versions.map((version, index) =>
		deriveReleaseType(version, index === 0 ? null : versions[index - 1]),
	);

	it("derives exactly four majors, one per year of the record", () => {
		const majors = versions.filter((_, index) => types[index] === "major");
		expect(majors).toEqual(["31.0.0", "32.0.0", "33.0.0", "34.0.0"]);
	});

	it("derives every minor and patch transition correctly", () => {
		for (const [index, version] of versions.entries()) {
			const { minor, patch } = parseVersion(version);
			const expected =
				index === 0 || parseVersion(versions[index - 1]).major !== parseVersion(version).major
					? "major"
					: parseVersion(versions[index - 1]).minor !== minor
						? "minor"
						: "patch";

			expect(types[index], `${version} (minor ${minor}, patch ${patch})`).toBe(expected);
		}
	});

	it("accounts for every release as exactly one type", () => {
		const counts = { major: 0, minor: 0, patch: 0 };
		for (const type of types) counts[type] += 1;
		expect(counts.major + counts.minor + counts.patch).toBe(versions.length);
	});
});

describe("@issue-44 known-issue resolution over the seed range", () => {
	it("matches open, resolved and multi-release spans", () => {
		const open = openKnownIssues(issues);
		const resolved = resolvedKnownIssues(issues);

		expect(open.length).toBeGreaterThan(0);
		expect(resolved.length).toBeGreaterThan(0);
		expect(open.length + resolved.length).toBe(issues.length);

		for (const issue of resolved) {
			expect(compareVersions(issue.openedIn, issue.resolvedIn!)).toBeLessThan(0);
			expect(issue.ageInReleases).toBeGreaterThan(0);
			expect(issue.resolvedBy).toBeTruthy();
		}
	});

	it("resolves issues that span a major version boundary", () => {
		const spanning = issues.filter(
			(issue) =>
				issue.resolvedIn !== undefined &&
				parseVersion(issue.openedIn).major !== parseVersion(issue.resolvedIn).major,
		);

		expect(spanning.length).toBeGreaterThanOrEqual(1);
		for (const issue of spanning) {
			expect(issue.status).toBe("resolved");
			expect(issue.ageInReleases).toBeGreaterThan(1);
		}
	});

	it("points every resolves reference in the corpus at a real known issue", () => {
		const declared = new Set(issues.map((issue) => issue.id));
		for (const release of seed) {
			for (const change of release.changes) {
				for (const id of change.resolves ?? []) {
					expect(declared, `${release.version} resolves "${id}"`).toContain(id);
				}
			}
		}
	});
});

describe("@issue-44 the two build-failure conditions", () => {
	/** A deeply mutable clone, so a test can corrupt one field of it. */
	interface MutableRelease {
		version: string;
		released: Date;
		changes: { type: string; text: string; id?: string; resolves?: string[] }[];
	}

	/** The real corpus with one change swapped, so the fixture is the site's own data. */
	function corruptSeed(mutate: (releases: MutableRelease[]) => void): ReleaseLike[] {
		const copy: MutableRelease[] = seed.map((release) => ({
			version: release.version,
			released: release.released,
			changes: release.changes.map((change) => ({
				type: change.type,
				text: change.text,
				id: change.id,
				resolves: change.resolves ? [...change.resolves] : undefined,
			})),
		}));
		mutate(copy);
		return copy;
	}

	it("fails on a dangling resolves id", () => {
		const broken = corruptSeed((releases) => {
			const resolver = releases.find((release) =>
				release.changes.some((change) => (change.resolves ?? []).length > 0),
			)!;
			const change = resolver.changes.find((c) => (c.resolves ?? []).length > 0)!;
			change.resolves = ["no-such-issue"];
		});

		expect(() => buildKnownIssues(broken)).toThrow(KnownIssueError);
		expect(() => buildKnownIssues(broken)).toThrow(/no-such-issue/);
	});

	it("fails when a resolution predates the release that opened the issue", () => {
		const broken = corruptSeed((releases) => {
			// Take a genuinely resolved issue and move its resolution to the
			// very first release, before the one that opened it.
			const resolved = resolvedKnownIssues(issues)[0];
			for (const release of releases) {
				for (const change of release.changes) {
					if ((change.resolves ?? []).includes(resolved.id)) {
						change.resolves = undefined;
					}
				}
			}
			releases[0].changes.push({
				type: "fixed",
				text: "Fixed before it broke.",
				resolves: [resolved.id],
			});
		});

		expect(() => buildKnownIssues(broken)).toThrow(KnownIssueError);
		expect(() => buildKnownIssues(broken)).toThrow(/cannot predate/);
	});

	it("does not throw on the corpus as shipped", () => {
		expect(() => buildKnownIssues(seed)).not.toThrow();
	});
});

describe("@issue-44 age in releases, hand-checked", () => {
	/** Position of a version in the ladder, counting from the first release. */
	const rung = (version: string) => versions.indexOf(version);

	it("equals the distance along the ladder for every resolved issue", () => {
		for (const issue of resolvedKnownIssues(issues)) {
			expect(issue.ageInReleases, `${issue.id}`).toBe(rung(issue.resolvedIn!) - rung(issue.openedIn));
		}
	});

	it("equals the distance to the latest release for every open issue", () => {
		const latest = versions.length - 1;
		for (const issue of openKnownIssues(issues)) {
			expect(issue.ageInReleases, `${issue.id}`).toBe(latest - rung(issue.openedIn));
		}
	});

	it("makes the oldest open issue exactly as old as the record", () => {
		// Hand-checked: opened in the first release, still open in the last, so
		// its age is the number of releases since — 29, not 30.
		const oldest = openKnownIssues(issues)[0];

		expect(oldest.openedIn).toBe("31.0.0");
		expect(oldest.status).toBe("open");
		expect(oldest.ageInReleases).toBe(29);
		expect(oldest.ageInReleases).toBe(versions.length - 1);
	});

	it("orders open issues by age, longest first", () => {
		const ages = openKnownIssues(issues).map((issue) => issue.ageInReleases);
		expect(ages).toEqual([...ages].sort((a, b) => b - a));
	});
});
