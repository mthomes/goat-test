import { describe, expect, it } from "vitest";

import {
	byNewestFirst,
	compareVersions,
	deriveReleaseType,
	formatVersion,
	groupByMajor,
	parseVersion,
	tryParseVersion,
	versionSlug,
} from "./semver.ts";

/**
 * The version ladder this site is built on. #44 re-runs the same assertions
 * against the real collection once #23 has authored it; this fixture keeps the
 * pure logic testable without a content dependency.
 */
const LADDER = [
	"31.0.0", "31.0.1", "31.1.0", "31.1.1", "31.2.0", "31.2.1", "31.3.0",
	"32.0.0", "32.0.1", "32.1.0", "32.1.1", "32.2.0",
	"33.0.0", "33.1.0", "33.1.1", "33.2.0",
	"34.0.0", "34.1.0", "34.2.0", "34.2.1",
];

describe("@issue-20 semver parsing", () => {
	it("parses a version into major, minor and patch", () => {
		expect(parseVersion("31.4.2")).toEqual({ major: 31, minor: 4, patch: 2 });
		expect(parseVersion("0.0.0")).toEqual({ major: 0, minor: 0, patch: 0 });
	});

	it.each([
		"31.4", "31.4.2.1", "v31.4.2", "31.4.2-beta", "01.4.2", "", "thirty-one",
	])("rejects malformed input: %j", (input) => {
		expect(() => parseVersion(input)).toThrow(TypeError);
		expect(tryParseVersion(input)).toBeNull();
	});

	it("reports what it was given when it throws", () => {
		expect(() => parseVersion("31.4")).toThrow(/"31\.4"/);
	});
});

describe("@issue-20 version comparison", () => {
	it("orders by major, then minor, then patch", () => {
		expect(compareVersions("31.0.0", "32.0.0")).toBeLessThan(0);
		expect(compareVersions("31.2.0", "31.10.0")).toBeLessThan(0);
		expect(compareVersions("31.2.9", "31.2.10")).toBeLessThan(0);
		expect(compareVersions("31.2.1", "31.2.1")).toBe(0);
	});

	it("sorts the full ladder newest-first, across the 31→32 rollover", () => {
		const shuffled = [...LADDER].reverse();
		shuffled.sort(byNewestFirst);

		expect(shuffled).toEqual([...LADDER].reverse());
		expect(shuffled[0]).toBe("34.2.1");
		expect(shuffled.at(-1)).toBe("31.0.0");
		// The rollover specifically: 32.0.0 must sit above every 31.x.
		expect(shuffled.indexOf("32.0.0")).toBeLessThan(shuffled.indexOf("31.3.0"));
	});

	it("accepts parsed versions as well as strings", () => {
		expect(compareVersions(parseVersion("31.0.0"), "32.0.0")).toBeLessThan(0);
	});
});

describe("@issue-20 release-type derivation", () => {
	it.each([
		["32.0.0", "31.3.0", "major"],
		["31.1.0", "31.0.1", "minor"],
		["31.0.1", "31.0.0", "patch"],
		["34.2.1", "34.2.0", "patch"],
		["33.0.0", "32.2.0", "major"],
	] as const)("%s after %s is a %s", (version, previous, expected) => {
		expect(deriveReleaseType(version, previous)).toBe(expected);
	});

	it("judges the first release by its own shape", () => {
		expect(deriveReleaseType("31.0.0", null)).toBe("major");
		expect(deriveReleaseType("31.4.0")).toBe("minor");
		expect(deriveReleaseType("31.4.2")).toBe("patch");
	});

	it("derives exactly four majors across the ladder", () => {
		const types = LADDER.map((version, index) =>
			deriveReleaseType(version, index === 0 ? null : LADDER[index - 1]),
		);

		expect(types.filter((type) => type === "major")).toHaveLength(4);
		expect(types[0]).toBe("major");
		expect(types[LADDER.indexOf("32.0.0")]).toBe("major");
	});
});

describe("@issue-20 grouping by major", () => {
	const groups = groupByMajor(LADDER, (version) => version);

	it("returns one group per major, newest major first", () => {
		expect(groups.map((group) => group.major)).toEqual([34, 33, 32, 31]);
	});

	it("sorts items newest-first inside each group", () => {
		expect(groups[3].items).toEqual([
			"31.3.0", "31.2.1", "31.2.0", "31.1.1", "31.1.0", "31.0.1", "31.0.0",
		]);
	});

	it("accounts for every item exactly once", () => {
		expect(groups.flatMap((group) => group.items).sort()).toEqual([...LADDER].sort());
	});

	it("works over objects, not just bare strings", () => {
		const releases = [{ v: "32.0.0" }, { v: "31.0.0" }];
		expect(groupByMajor(releases, (release) => release.v).map((g) => g.major)).toEqual([32, 31]);
	});
});

describe("@issue-20 version formatting", () => {
	it("prefixes a display version with v", () => {
		expect(formatVersion("31.4.2")).toBe("v31.4.2");
	});

	it("leaves a slug bare, so /releases/31.4.2 reads as a coordinate", () => {
		expect(versionSlug("31.4.2")).toBe("31.4.2");
	});

	it("round-trips every version on the ladder through both forms", () => {
		for (const version of LADDER) {
			expect(versionSlug(version)).toBe(version);
			expect(formatVersion(version)).toBe(`v${version}`);
			expect(parseVersion(versionSlug(version))).toEqual(parseVersion(version));
		}
	});
});
