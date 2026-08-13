import { describe, expect, it } from "vitest";

import { currentNavItem, NAVIGATION, sectionMarker } from "./navigation.ts";

describe("@issue-11 primary navigation", () => {
	it("is Releases, Tags, Known Issues and Stats, in that order", () => {
		expect(NAVIGATION.map((item) => item.label)).toEqual([
			"Releases",
			"Tags",
			"Known Issues",
			"Stats",
		]);
	});

	it("points every item at a root-relative URL", () => {
		for (const item of NAVIGATION) expect(item.href).toMatch(/^\/[a-z-]+$/);
	});
});

describe("@issue-11 current section", () => {
	it.each([
		["/releases", "Releases"],
		["/tags", "Tags"],
		["/known-issues", "Known Issues"],
		["/stats", "Stats"],
	])("marks %s as %s", (path, label) => {
		expect(currentNavItem(path)?.label).toBe(label);
	});

	it("keeps the section marked when the reader follows a link into it", () => {
		// A release detail page belongs to Releases. Matching on the section
		// rather than the exact URL is what stops the navigation going blank
		// the moment somebody clicks through.
		expect(currentNavItem("/releases/31.0.0")?.label).toBe("Releases");
		expect(currentNavItem("/tags/housing")?.label).toBe("Tags");
	});

	it("tolerates a trailing slash", () => {
		expect(currentNavItem("/releases/")?.label).toBe("Releases");
		expect(currentNavItem("/tags/housing/")?.label).toBe("Tags");
	});

	it("marks nothing on the home page or off-navigation", () => {
		expect(currentNavItem("/")).toBeUndefined();
		expect(currentNavItem("/404")).toBeUndefined();
		expect(currentNavItem("/changes/fixed")).toBeUndefined();
	});

	it("does not match a path that merely starts with the same letters", () => {
		expect(currentNavItem("/releases-archive")).toBeUndefined();
		expect(currentNavItem("/statsomething")).toBeUndefined();
	});
});

describe("@issue-11 running-head marker", () => {
	it("prints the section on a section page", () => {
		expect(sectionMarker("/releases")).toBe("Releases");
		expect(sectionMarker("/releases/34.2.1")).toBe("Releases");
		expect(sectionMarker("/stats")).toBe("Stats");
	});

	it("prints a marker for sections with no nav item of their own", () => {
		expect(sectionMarker("/changes")).toBe("Changes");
		expect(sectionMarker("/changes/fixed")).toBe("Changes");
	});

	it("prints nothing on the home page, which is not in a section", () => {
		expect(sectionMarker("/")).toBeUndefined();
	});
});
