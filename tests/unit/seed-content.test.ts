import { describe, expect, it } from "vitest";

import { buildKnownIssues, openKnownIssues, resolvedKnownIssues } from "../../src/lib/known-issues.ts";
import { compareVersions, deriveReleaseType } from "../../src/lib/semver.ts";
import { loadSeedReleases } from "../helpers/seed.ts";

const releases = [...loadSeedReleases()].sort((a, b) => compareVersions(a.version, b.version));
const types = releases.map((release, index) =>
	deriveReleaseType(release.version, index === 0 ? null : releases[index - 1].version),
);
const issues = buildKnownIssues(releases);

describe("@issue-23 the seed corpus", () => {
	it("is 30 releases, all valid against the schema", () => {
		// loadSeedReleases throws on the first entry that fails to validate.
		expect(releases).toHaveLength(30);
	});

	it("splits into 4 majors, ~10 minors and patches for the rest", () => {
		const count = (type: string) => types.filter((t) => t === type).length;

		expect(count("major")).toBe(4);
		expect(count("minor")).toBeGreaterThanOrEqual(9);
		expect(count("minor")).toBeLessThanOrEqual(12);
		expect(count("patch")).toBe(30 - count("major") - count("minor"));
		expect(count("patch")).toBeGreaterThan(count("minor"));
	});

	it("runs from 31.0.0 to 34.2.1 with strictly increasing versions", () => {
		expect(releases[0].version).toBe("31.0.0");
		expect(releases.at(-1)!.version).toBe("34.2.1");

		for (let i = 1; i < releases.length; i++) {
			expect(
				compareVersions(releases[i - 1].version, releases[i].version),
				`${releases[i].version} does not follow ${releases[i - 1].version}`,
			).toBeLessThan(0);
		}
	});

	it("is dated plausibly across about four years, always moving forwards", () => {
		const span = releases.at(-1)!.released.getTime() - releases[0].released.getTime();
		const years = span / (365.25 * 24 * 60 * 60 * 1000);

		expect(years).toBeGreaterThan(3.5);
		expect(years).toBeLessThan(4.5);

		for (let i = 1; i < releases.length; i++) {
			expect(releases[i].released.getTime()).toBeGreaterThan(releases[i - 1].released.getTime());
		}
	});

	it("carries 2–6 change entries per release", () => {
		for (const release of releases) {
			expect(release.changes.length, `${release.version} has ${release.changes.length}`)
				.toBeGreaterThanOrEqual(2);
			expect(release.changes.length, `${release.version} has ${release.changes.length}`)
				.toBeLessThanOrEqual(6);
		}
	});

	it("gives roughly a third of releases a prose summary", () => {
		const summarised = releases.filter((release) => release.summary !== undefined).length;

		expect(summarised / releases.length).toBeGreaterThan(0.25);
		expect(summarised / releases.length).toBeLessThan(0.45);
	});

	it("uses a vocabulary of 12–18 tags at realistic density", () => {
		const counts = new Map<string, number>();
		for (const release of releases) {
			for (const change of release.changes) {
				for (const tag of change.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
			}
		}

		expect(counts.size).toBeGreaterThanOrEqual(12);
		expect(counts.size).toBeLessThanOrEqual(18);

		// Realistic density means a long tail, not a uniform sprinkle: some
		// tags should be common and some genuinely rare.
		const frequencies = [...counts.values()].sort((a, b) => b - a);
		expect(frequencies[0]).toBeGreaterThanOrEqual(8);
		expect(frequencies.at(-1)).toBeLessThanOrEqual(3);
		expect(frequencies[0]).toBeGreaterThan(frequencies.at(-1)! * 3);
	});

	it("opens 5–6 known issues that get resolved, and leaves 2–3 open", () => {
		expect(resolvedKnownIssues(issues).length).toBeGreaterThanOrEqual(5);
		expect(resolvedKnownIssues(issues).length).toBeLessThanOrEqual(6);
		expect(openKnownIssues(issues).length).toBeGreaterThanOrEqual(2);
		expect(openKnownIssues(issues).length).toBeLessThanOrEqual(3);
	});

	it("has at least one known issue spanning a major version boundary", () => {
		const spanning = issues.filter(
			(issue) =>
				issue.resolvedIn !== undefined &&
				issue.openedIn.split(".")[0] !== issue.resolvedIn.split(".")[0],
		);

		expect(spanning.length).toBeGreaterThanOrEqual(1);
	});

	it("keeps one issue open across the whole record", () => {
		const longest = openKnownIssues(issues)[0];

		expect(longest.openedIn).toBe("31.0.0");
		expect(longest.ageInReleases).toBe(29);
	});

	it("makes major releases read as genuinely larger events than patches", () => {
		const weight = (index: number) => {
			const release = releases[index];
			// Words of prose, not just entry count: a major that says five thin
			// things is not a larger event than a patch that says two real ones.
			const words = (text: string) => text.split(/\s+/).length;
			return (
				release.changes.reduce((total, change) => total + words(change.text), 0) +
				(release.summary ? words(release.summary) : 0)
			);
		};

		const majors = types.flatMap((type, i) => (type === "major" ? [weight(i)] : []));
		const patches = types.flatMap((type, i) => (type === "patch" ? [weight(i)] : []));
		const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

		expect(mean(majors)).toBeGreaterThan(mean(patches) * 2);
		// And every major is bigger than every patch, not just on average.
		expect(Math.min(...majors)).toBeGreaterThan(Math.max(...patches));

		// Every major carries a summary; a major that needs no framing isn't one.
		for (const [index, type] of types.entries()) {
			if (type === "major") {
				expect(releases[index].summary, `${releases[index].version} has no summary`).toBeTruthy();
			}
		}
	});

	it("cross-references its own history rather than reading as 30 unrelated posts", () => {
		// Entries that cite an earlier version by number. This is what makes the
		// corpus a record rather than a pile of filler that passes the schema.
		const citations = releases.flatMap((release) =>
			release.changes.filter((change) => /\b3[1-4]\.\d+\.\d+\b/.test(change.text)),
		);

		expect(citations.length).toBeGreaterThanOrEqual(6);
	});
});
