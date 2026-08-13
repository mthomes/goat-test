import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { url } from "../helpers/routes.ts";

/**
 * Accessibility asserted per route rather than spot-checked.
 *
 * Every project runs this file, and one of them is `dark`, so each route is
 * audited in both colour schemes on every run. Dark matters more than usual
 * here: #17 re-tuned colours that had already passed in light, and #38 already
 * caught two contrast regressions that only existed there.
 */
const ROUTES = [
	["home", ""],
	["release detail", "releases/32.0.0"],
	["archive", "releases"],
	["tag page", "tags/housing"],
	["change-type page", "changes/fixed"],
	["tracker", "known-issues"],
	["stats", "stats"],
	["404", "no-such-page"],
] as const;

test.describe("axe audit", () => {
	for (const [name, path] of ROUTES) {
		test(`${name} has zero violations`, { tag: ["@issue-48"] }, async ({ page }, testInfo) => {
			await page.goto(path);
			await page.evaluate(() => document.fonts.ready);

			const results = await new AxeBuilder({ page })
				.withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
				.analyze();

			// Report the offending selector, not just a count — a violation you
			// have to go hunting for is a violation that gets ignored.
			const details = results.violations.flatMap((violation) =>
				violation.nodes.map(
					(node) => `[${violation.id}] ${node.target.join(" ")}\n    ${node.failureSummary?.replace(/\n/g, "\n    ")}`,
				),
			);

			expect(
				details,
				`${testInfo.project.name} · /${path}\n  ${details.join("\n  ")}`,
			).toEqual([]);
		});
	}
});

test.describe("landmarks and heading order", () => {
	for (const [name, path] of ROUTES) {
		test(`${name} has one main, one banner, one contentinfo`, { tag: ["@issue-48", "@issue-10"] }, async ({ page }) => {
			await page.goto(path);

			await expect(page.getByRole("banner")).toHaveCount(1);
			await expect(page.getByRole("main")).toHaveCount(1);
			await expect(page.getByRole("contentinfo")).toHaveCount(1);

			// Every navigation is named, so a screen-reader user can tell them apart.
			for (const nav of await page.getByRole("navigation").all()) {
				const label = await nav.getAttribute("aria-label");
				expect(label, `an unnamed <nav> on /${path}`).toBeTruthy();
			}
		});

		test(`${name} has exactly one h1 and no skipped heading levels`, { tag: ["@issue-48"] }, async ({ page }) => {
			await page.goto(path);

			const levels = await page.locator("h1, h2, h3, h4, h5, h6").evaluateAll((headings) =>
				headings.map((heading) => Number.parseInt(heading.tagName.slice(1), 10)),
			);

			expect(levels.filter((level) => level === 1), `/${path} h1 count`).toHaveLength(1);
			expect(levels[0], `/${path} does not start at h1`).toBe(1);

			for (let i = 1; i < levels.length; i++) {
				expect(
					levels[i] - levels[i - 1],
					`/${path} jumps from h${levels[i - 1]} to h${levels[i]}`,
				).toBeLessThanOrEqual(1);
			}
		});
	}
});

test.describe("keyboard access", () => {
	test("the skip link is first and moves focus into main", { tag: ["@issue-48", "@issue-10"] }, async ({ page }) => {
		await page.goto("releases");

		const first = await page.evaluate(() => {
			const selector = "a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])";
			return document.querySelector(selector)?.className ?? null;
		});
		expect(first).toBe("skip-link");

		const skip = page.getByRole("link", { name: /skip to content/i });
		await skip.focus();
		await expect(skip).toBeVisible();

		await page.keyboard.press("Enter");
		await expect(page.getByRole("main")).toBeFocused();
	});

	test("focus order follows the document, and focus is always visible", { tag: ["@issue-48"] }, async ({ page, browserName }) => {
		// macOS WebKit only tabs between form controls unless the system's full
		// keyboard access is on, so tab traversal is unassertable there.
		test.skip(browserName === "webkit", "macOS WebKit does not tab to links by default");

		await page.goto("releases/32.0.0");

		const seen: { y: number; outline: string }[] = [];
		for (let i = 0; i < 12; i++) {
			await page.keyboard.press("Tab");

			const focused = await page.evaluate(() => {
				const element = document.activeElement;
				if (!element || element === document.body) return null;
				const style = getComputedStyle(element);
				return {
					y: element.getBoundingClientRect().top + window.scrollY,
					outline: `${style.outlineStyle} ${style.outlineWidth}`,
					width: Number.parseFloat(style.outlineWidth),
				};
			});
			if (!focused) break;

			// Every focusable element shows a visible ring — nothing relies on
			// the browser default having survived the reset.
			expect(focused.outline, `outline at step ${i}`).not.toContain("none");
			expect(focused.width, `outline width at step ${i}`).toBeGreaterThan(0);

			seen.push(focused);
		}

		expect(seen.length).toBeGreaterThan(6);

		// Focus moves down the page, never back up: the visual order and the
		// tab order agree.
		const positions = seen.map((entry) => entry.y);
		expect(positions).toEqual([...positions].sort((a, b) => a - b));
	});

	test("marks the active nav item with aria-current", { tag: ["@issue-48", "@issue-11"] }, async ({ page }) => {
		for (const [path, label] of [
			["releases", "Releases"],
			["tags", "Tags"],
			["known-issues", "Known Issues"],
			["stats", "Stats"],
			// A page inside a section still marks its section.
			["releases/32.0.0", "Releases"],
			["tags/housing", "Tags"],
		] as const) {
			await page.goto(path);

			const nav = page.getByRole("navigation", { name: "Primary" });
			const current = nav.locator('[aria-current="page"]');

			await expect(current, path).toHaveCount(1);
			await expect(current, path).toHaveText(label);
		}

		// And nothing claims to be current off-navigation.
		await page.goto("");
		await expect(page.getByRole("navigation", { name: "Primary" }).locator("[aria-current]"))
			.toHaveCount(0);
	});

	test("gives the current pagination page aria-current, not a self-link", { tag: ["@issue-48", "@issue-26"] }, async ({ page }) => {
		await page.goto(url("/releases/2"));

		const current = page.getByRole("navigation", { name: "Release archive pages" })
			.locator('[aria-current="page"]');

		await expect(current).toHaveCount(1);
		expect(await current.evaluate((el) => el.tagName)).not.toBe("A");
	});
});
