import { expect, test } from "@playwright/test";

/**
 * The typographic treatment, measured on a rendered page with the real fonts
 * loaded — the only place a claim about type can actually be checked.
 */

const PROBE = `
	<h1 data-t="h1">Heading one</h1>
	<h2 data-t="h2">Heading two</h2>
	<h3 data-t="h3">Heading three</h3>
	<h4 data-t="h4">Heading four</h4>
	<h5 data-t="h5">Heading five</h5>
	<h6 data-t="h6">Released</h6>
	<p data-t="p">Body copy set in the serif, long enough to have a measure worth capping.</p>
	<time data-t="time" datetime="2021-03-14">14 March 2021</time>
	<code data-t="code">31.0.0</code>
	<hr data-t="hr" />
`;

async function probe(page: import("@playwright/test").Page) {
	await page.goto("/");
	await page.evaluate((html) => {
		document.querySelector("main")!.innerHTML = html;
	}, PROBE);
	await page.evaluate(() => document.fonts.ready);
}

const styles = (page: import("@playwright/test").Page, selector: string) =>
	page.locator(`[data-t="${selector}"]`).evaluate((el) => {
		const cs = getComputedStyle(el);
		return {
			fontFamily: cs.fontFamily,
			fontSize: Number.parseFloat(cs.fontSize),
			lineHeight: Number.parseFloat(cs.lineHeight) / Number.parseFloat(cs.fontSize),
			letterSpacing: cs.letterSpacing,
			numeric: cs.fontVariantNumeric,
			caps: cs.fontVariantCaps,
			maxWidth: cs.maxInlineSize,
			borderTop: cs.borderBlockStartWidth,
		};
	});

test.describe("typographic treatment", () => {
	test.beforeEach(async ({ page }) => {
		await probe(page);
	});

	test("self-hosts the serif for prose and the mono for metadata", { tag: ["@issue-16"] }, async ({ page }) => {
		expect((await styles(page, "p")).fontFamily).toMatch(/Charis SIL/);
		expect((await styles(page, "time")).fontFamily).toMatch(/IBM Plex Mono/);

		// Self-hosted, not fetched from a third party.
		const faces = await page.evaluate(() =>
			[...document.fonts].map((f) => ({ family: f.family, status: f.status })),
		);
		expect(faces.some((f) => f.family.includes("Charis SIL"))).toBe(true);
		expect(faces.some((f) => f.family.includes("IBM Plex Mono"))).toBe(true);
	});

	test("serves woff2 with swap, preloaded", { tag: ["@issue-16"] }, async ({ page }) => {
		const preloads = page.locator('head link[rel="preload"][as="font"]');
		await expect(preloads).toHaveCount(2);
		for (const link of await preloads.all()) {
			await expect(link).toHaveAttribute("type", "font/woff2");
			await expect(link).toHaveAttribute("href", /\.woff2$/);
		}

		const displays = await page.evaluate(() => [...document.fonts].map((f) => f.display));
		expect(new Set(displays)).toEqual(new Set(["swap"]));

		// Every declared face resolves.
		for (const href of await preloads.evaluateAll((links) =>
			links.map((l) => (l as HTMLLinkElement).getAttribute("href")!),
		)) {
			expect((await page.request.get(href)).status()).toBe(200);
		}
	});

	test("descends the heading hierarchy across the fluid scale", { tag: ["@issue-16"] }, async ({ page }) => {
		const sizes = await Promise.all(
			["h1", "h2", "h3", "h4", "h5", "h6"].map(async (h) => (await styles(page, h)).fontSize),
		);

		for (let i = 1; i < sizes.length; i++) {
			expect(sizes[i], `${i + 1} is not smaller than h${i}`).toBeLessThan(sizes[i - 1]);
		}
	});

	test("sets headings noticeably tighter than body", { tag: ["@issue-16"] }, async ({ page }) => {
		const body = await styles(page, "p");
		const heading = await styles(page, "h1");

		expect(heading.lineHeight).toBeLessThan(body.lineHeight - 0.3);
		expect(body.lineHeight).toBeGreaterThan(1.4);
	});

	test("gives section labels small-caps and letterspacing", { tag: ["@issue-16"] }, async ({ page }) => {
		const label = await styles(page, "h6");

		expect(label.caps).toBe("all-small-caps");
		expect(Number.parseFloat(label.letterSpacing)).toBeGreaterThan(0);
		expect(label.fontFamily).toMatch(/IBM Plex Mono/);
	});

	test("defines a hairline rule as a reusable treatment", { tag: ["@issue-16"] }, async ({ page }) => {
		expect(Number.parseFloat((await styles(page, "hr")).borderTop)).toBeGreaterThan(0);

		// `--rule-line` is the treatment; blocks consume it rather than
		// re-deciding what a hairline is.
		const ruleLine = await page.evaluate(() =>
			getComputedStyle(document.documentElement).getPropertyValue("--rule-line").trim(),
		);
		expect(ruleLine).toMatch(/^\d/);
		expect(ruleLine).toContain("solid");
	});

	test("enables tabular figures on versions and dates", { tag: ["@issue-16"] }, async ({ page }) => {
		expect((await styles(page, "time")).numeric).toContain("tabular-nums");
		expect((await styles(page, "code")).numeric).toContain("tabular-nums");
	});

	test("caps the prose measure and holds it at every step", { tag: ["@issue-16"] }, async ({ page }) => {
		const paragraph = await styles(page, "p");
		expect(paragraph.maxWidth).not.toBe("none");

		// The measure is in `ch`, so it tracks the type size rather than
		// drifting as the scale changes.
		const measure = await page.evaluate(() =>
			getComputedStyle(document.documentElement).getPropertyValue("--measure").trim(),
		);
		expect(measure).toMatch(/ch$/);
	});

	test("marks change types with sigils the shipped subset can render", { tag: ["@issue-16"] }, async ({ page }) => {
		const sigils = await page.evaluate(() => {
			const root = getComputedStyle(document.documentElement);
			return Object.fromEntries(
				["added", "fixed", "changed", "removed", "deprecated", "known-issue"].map((type) => [
					type,
					root.getPropertyValue(`--sigil-${type}`).trim().replace(/^"|"$/g, ""),
				]),
			);
		});

		expect(Object.values(sigils).every(Boolean)).toBe(true);
		expect(new Set(Object.values(sigils)).size).toBe(6);
		expect(sigils.deprecated).toBe("†");
		expect(sigils["known-issue"]).toBe("‡");

		// Every sigil must be inside the latin subset actually shipped, or it
		// falls back to a system face mid-line and the column stops aligning.
		const rendersInMono = await page.evaluate(async (glyphs: string[]) => {
			await document.fonts.ready;
			return glyphs.map((glyph) => document.fonts.check('400 1rem "IBM Plex Mono"', glyph));
		}, Object.values(sigils));

		expect(rendersInMono).toEqual([true, true, true, true, true, true]);
	});
});

test.describe("typographic rules", () => {
	test("draws an hr at full width inside a stack", { tag: ["@issue-16"] }, async ({ page }) => {
		await page.goto("/");
		await page.evaluate(() => {
			document.querySelector("main")!.innerHTML =
				'<div class="stack" style="inline-size:600px"><p>a</p><hr data-t="hr" /><p>b</p></div>';
		});

		// The UA stylesheet's `margin-inline: auto` stops an hr stretching as a
		// flex item, which silently renders it at zero width.
		const rule = await page.locator('[data-t="hr"]').boundingBox();
		expect(rule!.width).toBeGreaterThan(500);
		expect(rule!.height).toBeGreaterThan(0);
	});
});
