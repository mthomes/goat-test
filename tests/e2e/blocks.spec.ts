import { expect, test } from "@playwright/test";

import { builtCss, layerBody } from "../helpers/built-css.ts";

/**
 * The blocks as rendered. The unit suite checks the conventions; this checks
 * that the parts the ticket names actually appear on a page, with the
 * treatment the art direction asks for.
 */
test.describe("core content blocks", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await page.evaluate(() => document.fonts.ready);
	});

	test("metadata-table prints RELEASED / TYPE / CHANGES in mono", { tag: ["@issue-24"] }, async ({ page }) => {
		await page.goto("/releases/34.2.1");
		const table = page.locator(".metadata-table");
		await expect(table).toBeVisible();

		const labels = await table.locator(".metadata-table__label").allInnerTexts();
		expect(labels.map((l) => l.toLowerCase()).slice(0, 3)).toEqual(["released", "type", "changes"]);

		const style = await table.locator(".metadata-table__label").first().evaluate((el) => ({
			family: getComputedStyle(el).fontFamily,
			caps: getComputedStyle(el).fontVariantCaps,
		}));
		expect(style.family).toMatch(/IBM Plex Mono/);
		expect(style.caps).toBe("all-small-caps");
	});

	test("release-card carries version, date, type and change count", { tag: ["@issue-24"] }, async ({ page }) => {
		const card = page.locator(".release-card").first();

		await expect(card.locator(".release-card__version")).toContainText(/^v\d+\.\d+\.\d+$/);
		await expect(card.locator(".release-card__type")).toContainText(/Major|Minor|Patch/);
		await expect(card.locator(".release-card__meta time")).toHaveAttribute(
			"datetime",
			/^\d{4}-\d{2}-\d{2}$/,
		);
		await expect(card.locator(".release-card__meta")).toContainText(/\d+ changes?/);
		await expect(card).toHaveAttribute("data-release-type", /major|minor|patch/);
	});

	test("release-card rules get heavier with release type", { tag: ["@issue-24", "@issue-18"] }, async ({ page }) => {
		const weight = async (type: string) => {
			const card = page.locator(`.release-card[data-release-type="${type}"]`).first();
			if ((await card.count()) === 0) return null;
			return card.evaluate((el) => Number.parseFloat(getComputedStyle(el).borderBlockStartWidth));
		};

		const [minor, patch] = [await weight("minor"), await weight("patch")];
		expect(minor).not.toBeNull();
		expect(patch).not.toBeNull();
		expect(minor!).toBeGreaterThan(patch!);
	});

	test("change-list groups by type under small-caps labels", { tag: ["@issue-24"] }, async ({ page }) => {
		const groups = page.locator(".change-list__group");
		expect(await groups.count()).toBeGreaterThan(0);

		const label = groups.first().locator(".change-list__label");
		await expect(label).toBeVisible();
		expect(await label.evaluate((el) => getComputedStyle(el).fontVariantCaps)).toBe("all-small-caps");

		// Every entry in a group carries that group's type.
		for (const group of await groups.all()) {
			const types = await group.locator(".change-entry").evaluateAll((entries) =>
				entries.map((entry) => entry.getAttribute("data-change-type")),
			);
			expect(new Set(types).size).toBe(1);
		}
	});

	test("change-entry prints a typographic sigil, not a coloured pill", { tag: ["@issue-24", "@issue-16"] }, async ({ page }) => {
		const marks = await page.locator(".change-entry").evaluateAll((entries) =>
			entries.map((entry) => ({
				type: entry.getAttribute("data-change-type"),
				sigil: getComputedStyle(entry, "::before").content,
				background: getComputedStyle(entry).backgroundColor,
				radius: getComputedStyle(entry).borderRadius,
			})),
		);

		expect(marks.length).toBeGreaterThan(0);
		for (const mark of marks) {
			// A mark, one character, set in type.
			expect(mark.sigil, `${mark.type} has no sigil`).toMatch(/^"..?"$/);
			// Not a pill: no filled ground, no rounding.
			expect(mark.background).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
			expect(mark.radius).toBe("0px");
		}

		// Different types get different marks.
		const byType = new Map(marks.map((m) => [m.type, m.sigil]));
		expect(new Set(byType.values()).size).toBe(byType.size);
	});

	test("tag-list renders inline links to tag pages", { tag: ["@issue-24"] }, async ({ page }) => {
		const tags = page.locator(".tag-list").first().locator(".tag-list__tag");
		expect(await tags.count()).toBeGreaterThan(0);

		for (const tag of await tags.all()) {
			await expect(tag).toHaveAttribute("href", /^\/tags\/[a-z0-9-]+$/);
		}
	});

	test("known-issue-item shows state, opened-in and age", { tag: ["@issue-24"] }, async ({ page }) => {
		await page.goto("/known-issues");
		const issue = page.locator(".known-issue").first();

		await expect(issue).toHaveAttribute("data-state", /open|resolved/);
		await expect(issue.locator(".known-issue__text")).not.toBeEmpty();
		await expect(issue.locator(".known-issue__span")).toContainText(/Opened in v\d+\.\d+\.\d+/);
		await expect(issue.locator(".known-issue__span")).toContainText(/\d+ releases?/);
	});

	test("ships one stylesheet, and every block rule lives in @layer block", { tag: ["@issue-24"] }, async ({ page }) => {
		const block = layerBody(await builtCss(page), "block");
		const inLayer = [".release-card", ".change-entry", ".metadata-table", ".tag-list", ".known-issue"]
			.map((selector) => ({ selector, present: block.includes(selector) }));

		for (const { selector, present } of inLayer) {
			expect(present, `${selector} is not inside @layer block`).toBe(true);
		}
	});
});
