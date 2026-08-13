import { describe, expect, it } from "vitest";

import {
	changeTypeLabel,
	formatDate,
	isoDate,
	pluralise,
	releaseTypeLabel,
	routes,
} from "./format.ts";
import { CHANGE_TYPES } from "./release-index.ts";

describe("@issue-24 display formatting", () => {
	it("prints dates as ISO, so a column of them is one width", () => {
		expect(formatDate(new Date("2021-03-14T00:00:00Z"))).toBe("2021-03-14");
		expect(formatDate(new Date("2025-01-26T23:59:59Z"))).toBe("2025-01-26");
		expect(isoDate(new Date("2021-03-14T00:00:00Z"))).toBe("2021-03-14");
	});

	it("pluralises counts, including the one that is not plural", () => {
		expect(pluralise(0, "change")).toBe("0 changes");
		expect(pluralise(1, "change")).toBe("1 change");
		expect(pluralise(5, "change")).toBe("5 changes");
		expect(pluralise(1, "entry", "entries")).toBe("1 entry");
		expect(pluralise(3, "entry", "entries")).toBe("3 entries");
	});

	it("labels every release type", () => {
		expect(releaseTypeLabel("major")).toBe("Major");
		expect(releaseTypeLabel("minor")).toBe("Minor");
		expect(releaseTypeLabel("patch")).toBe("Patch");
	});

	it("labels every change type, with none left as a raw enum value", () => {
		for (const type of CHANGE_TYPES) {
			const label = changeTypeLabel(type);
			expect(label, `${type} has no label`).toBeTruthy();
			expect(label).not.toBe(type);
			expect(label[0]).toBe(label[0].toUpperCase());
		}
	});
});

describe("@issue-24 routes", () => {
	it("builds every URL the site links to", () => {
		expect(routes.home()).toBe("/");
		expect(routes.releases()).toBe("/releases");
		expect(routes.release("31.0.0")).toBe("/releases/31.0.0");
		expect(routes.tags()).toBe("/tags");
		expect(routes.tag("housing")).toBe("/tags/housing");
		expect(routes.changes()).toBe("/changes");
		expect(routes.changeType("fixed")).toBe("/changes/fixed");
		expect(routes.knownIssues()).toBe("/known-issues");
		expect(routes.stats()).toBe("/stats");
	});

	it("produces root-relative paths with no trailing slash", () => {
		const built = [
			routes.releases(), routes.release("34.2.1"), routes.tags(), routes.tag("plants"),
			routes.changes(), routes.changeType("added"), routes.knownIssues(), routes.stats(),
		];

		for (const path of built) {
			expect(path.startsWith("/")).toBe(true);
			expect(path.endsWith("/")).toBe(false);
			expect(path).not.toContain("//");
		}
	});
});
