import { describe, expect, it } from "vitest";

import {
	buildKnownIssues,
	KnownIssueError,
	openKnownIssues,
	resolvedKnownIssues,
	type ReleaseLike,
} from "./known-issues.ts";

/**
 * Hand-checked fixture. Six releases spanning a major boundary, with one issue
 * resolved inside a major, one spanning the 31→32 rollover, and one left open.
 *
 *   31.0.0  opens creaky-knee, opens damp-patch
 *   31.0.1  —
 *   31.1.0  resolves damp-patch                    (damp-patch age: 2)
 *   32.0.0  opens missing-sock
 *   32.0.1  —
 *   32.1.0  resolves creaky-knee                   (creaky-knee age: 5)
 *
 *   missing-sock stays open; latest is index 5, opened at 3 → age 2.
 */
const release = (
	version: string,
	changes: ReleaseLike["changes"],
	day = 1,
): ReleaseLike => ({ version, released: new Date(2021, 0, day), changes });

const FIXTURE: ReleaseLike[] = [
	release("31.0.0", [
		{ type: "known-issue", id: "creaky-knee", text: "Left knee clicks on stairs.", tags: ["health"] },
		{ type: "known-issue", id: "damp-patch", text: "Damp patch above the window.", tags: ["housing"] },
	], 1),
	release("31.0.1", [{ type: "fixed", text: "Unrelated." }], 2),
	release("31.1.0", [{ type: "fixed", text: "Repointed the lintel.", resolves: ["damp-patch"] }], 3),
	release("32.0.0", [
		{ type: "known-issue", id: "missing-sock", text: "One sock, unaccounted for." },
	], 4),
	release("32.0.1", [{ type: "changed", text: "Unrelated." }], 5),
	release("32.1.0", [{ type: "fixed", text: "Physio, eight weeks of it.", resolves: ["creaky-knee"] }], 6),
];

const byId = (releases = FIXTURE) =>
	Object.fromEntries(buildKnownIssues(releases).map((issue) => [issue.id, issue]));

describe("@issue-21 known-issue resolution", () => {
	it("resolves references across the whole collection", () => {
		const issues = byId();

		expect(issues["damp-patch"].resolvedIn).toBe("31.1.0");
		expect(issues["creaky-knee"].resolvedIn).toBe("32.1.0");
		expect(issues["missing-sock"].resolvedIn).toBeUndefined();
	});

	it("derives open versus resolved for every known issue", () => {
		const issues = byId();

		expect(issues["damp-patch"].status).toBe("resolved");
		expect(issues["creaky-knee"].status).toBe("resolved");
		expect(issues["missing-sock"].status).toBe("open");
	});

	it("records the change that closed an issue, not just the version", () => {
		expect(byId()["creaky-knee"].resolvedBy).toBe("Physio, eight weeks of it.");
	});

	it("matches an issue that spans a major version boundary", () => {
		const knee = byId()["creaky-knee"];

		expect(knee.openedIn).toBe("31.0.0");
		expect(knee.resolvedIn).toBe("32.1.0");
	});
});

describe("@issue-21 age in releases", () => {
	it("counts releases from opening to resolution", () => {
		const issues = byId();

		// 31.0.0 → 31.1.0 is two releases along the ladder.
		expect(issues["damp-patch"].ageInReleases).toBe(2);
		// 31.0.0 → 32.1.0 is five.
		expect(issues["creaky-knee"].ageInReleases).toBe(5);
	});

	it("counts an open issue up to the most recent release", () => {
		// Opened at index 3, latest is index 5.
		expect(byId()["missing-sock"].ageInReleases).toBe(2);
	});

	it("gives an issue opened in the latest release an age of zero", () => {
		const issues = byId([
			...FIXTURE,
			release("32.1.1", [{ type: "known-issue", id: "brand-new", text: "Fresh." }], 7),
		]);

		expect(issues["brand-new"].ageInReleases).toBe(0);
		expect(issues["missing-sock"].ageInReleases).toBe(3);
	});

	it("is unaffected by how much wall-clock time passed", () => {
		// A gap of years with no release is not years of an issue being
		// ignored — nothing shipped, so nothing could have fixed it.
		const stretched = FIXTURE.map((r, index) => ({
			...r,
			released: new Date(2021 + index * 3, 0, 1),
		}));

		expect(byId(stretched)["creaky-knee"].ageInReleases).toBe(5);
	});
});

describe("@issue-21 build-breaking content errors", () => {
	it("fails loudly on a resolves pointing at an id that does not exist", () => {
		const broken = [
			release("31.0.0", [{ type: "known-issue", id: "real", text: "Real." }]),
			release("31.0.1", [{ type: "fixed", text: "Fixed?", resolves: ["typo"] }]),
		];

		expect(() => buildKnownIssues(broken)).toThrow(KnownIssueError);
		expect(() => buildKnownIssues(broken)).toThrow(/resolves "typo", which no release ever opened/);
	});

	it("names the ids that do exist, so the typo is obvious", () => {
		const broken = [
			release("31.0.0", [{ type: "known-issue", id: "creaky-knee", text: "Real." }]),
			release("31.0.1", [{ type: "fixed", text: "Fixed?", resolves: ["creaky-kneee"] }]),
		];

		expect(() => buildKnownIssues(broken)).toThrow(/creaky-knee/);
	});

	it("fails loudly when a resolution predates the release that opened it", () => {
		const broken = [
			release("31.0.0", [{ type: "fixed", text: "Fixed before it broke.", resolves: ["later"] }]),
			release("31.0.1", [{ type: "known-issue", id: "later", text: "Broke after." }]),
		];

		expect(() => buildKnownIssues(broken)).toThrow(KnownIssueError);
		expect(() => buildKnownIssues(broken)).toThrow(/cannot predate/);
	});

	it("fails loudly when one release both opens and resolves an issue", () => {
		const broken = [
			release("31.0.0", [
				{ type: "known-issue", id: "instant", text: "Broken." },
				{ type: "fixed", text: "Unbroken.", resolves: ["instant"] },
			]),
		];

		expect(() => buildKnownIssues(broken)).toThrow(/both opens and resolves/);
	});

	it("does not throw on the valid fixture", () => {
		expect(() => buildKnownIssues(FIXTURE)).not.toThrow();
	});
});

describe("@issue-21 tracker ordering", () => {
	it("returns open issues longest-open first", () => {
		const issues = buildKnownIssues([
			...FIXTURE,
			release("32.1.1", [{ type: "known-issue", id: "brand-new", text: "Fresh." }], 7),
			release("32.1.2", [{ type: "known-issue", id: "middling", text: "Middling." }], 8),
		]);

		const open = openKnownIssues(issues);

		expect(open.map((issue) => issue.id)).toEqual(["missing-sock", "brand-new", "middling"]);
		expect(open.map((issue) => issue.ageInReleases)).toEqual([4, 1, 0]);
	});

	it("excludes resolved issues from the open list entirely", () => {
		expect(openKnownIssues(buildKnownIssues(FIXTURE)).map((i) => i.id)).toEqual(["missing-sock"]);
	});

	it("returns resolved issues most recently resolved first", () => {
		expect(resolvedKnownIssues(buildKnownIssues(FIXTURE)).map((i) => i.id))
			.toEqual(["creaky-knee", "damp-patch"]);
	});

	it("copes with a collection that has no known issues at all", () => {
		const issues = buildKnownIssues([release("31.0.0", [{ type: "added", text: "Something." }])]);

		expect(issues).toEqual([]);
		expect(openKnownIssues(issues)).toEqual([]);
		expect(resolvedKnownIssues(issues)).toEqual([]);
	});
});
