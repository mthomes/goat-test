import { expect, test } from "@playwright/test";

/**
 * The composition primitives, exercised on a scratch page at 320px, 768px and
 * 1440px.
 *
 * The scratch page is built here rather than shipped as a route: it exists to
 * prove the primitives behave, and a styleguide route would end up in the
 * sitemap, the visual baselines and the Lighthouse budget for no benefit. It
 * loads the site's real stylesheet, so what is measured is what ships.
 */

const SCRATCH = `
	<div class="wrapper" data-probe="wrapper">
		<div class="stack" data-probe="stack">
			<p data-probe="stack-a">one</p>
			<p data-probe="stack-b">two</p>
		</div>

		<div class="cluster" data-probe="cluster">
			<span>alpha</span><span>beta</span><span>gamma</span><span>delta</span>
			<span>epsilon</span><span>zeta</span><span>eta</span><span>theta</span>
		</div>

		<div class="sidebar" data-probe="sidebar">
			<div data-probe="sidebar-aside">aside</div>
			<div data-probe="sidebar-main">main column with enough words in it to need room</div>
		</div>

		<div class="grid" data-probe="grid">
			<div>a</div><div>b</div><div>c</div><div>d</div>
		</div>

		<div class="repel" data-probe="repel">
			<span data-probe="repel-start">start</span>
			<span data-probe="repel-end">end</span>
		</div>
	</div>
`;

const WIDTHS = [320, 768, 1440] as const;

/** Renders the scratch markup inside the real page, keeping the real CSS. */
async function scratch(page: import("@playwright/test").Page, width: number) {
	await page.setViewportSize({ width, height: 900 });
	await page.goto("/");
	await page.evaluate((html) => {
		document.querySelector("main")!.innerHTML = html;
	}, SCRATCH);
}

const box = (page: import("@playwright/test").Page, probe: string) =>
	page.locator(`[data-probe="${probe}"]`).boundingBox();

test.describe("composition primitives", () => {
	for (const width of WIDTHS) {
		test.describe(`at ${width}px`, () => {
			test.beforeEach(async ({ page }) => {
				await scratch(page, width);
			});

			test("stack spaces siblings but never its own outside", { tag: ["@issue-14"] }, async ({ page }) => {
				const [outer, first, second] = await Promise.all([
					box(page, "stack"), box(page, "stack-a"), box(page, "stack-b"),
				]);

				// Space between the two children…
				expect(second!.y - (first!.y + first!.height)).toBeGreaterThan(8);
				// …and none leaking above the first or below the last.
				expect(first!.y).toBeCloseTo(outer!.y, 0);
				expect(second!.y + second!.height).toBeCloseTo(outer!.y + outer!.height, 0);
			});

			test("cluster wraps rather than overflowing", { tag: ["@issue-14"] }, async ({ page }) => {
				const cluster = await box(page, "cluster");
				const scrolls = await page.evaluate(
					() => document.documentElement.scrollWidth > document.documentElement.clientWidth,
				);

				expect(cluster!.width).toBeLessThanOrEqual(width);
				expect(scrolls, "the page scrolls sideways").toBe(false);
			});

			test("wrapper centres, caps and gutters", { tag: ["@issue-14"] }, async ({ page }) => {
				const wrapper = await box(page, "wrapper");
				const leftGutter = wrapper!.x;
				const rightGutter = width - (wrapper!.x + wrapper!.width);

				expect(leftGutter).toBeCloseTo(rightGutter, 0);
				expect(wrapper!.width).toBeLessThanOrEqual(width);
				// Content is padded in from the wrapper's own edge.
				const padding = await page.locator('[data-probe="wrapper"]')
					.evaluate((el) => Number.parseFloat(getComputedStyle(el).paddingInlineStart));
				expect(padding).toBeGreaterThan(0);
			});

			test("grid keeps every track equal and never overflows", { tag: ["@issue-14"] }, async ({ page }) => {
				const tracks = await page.locator('[data-probe="grid"]').evaluate((el) =>
					getComputedStyle(el).gridTemplateColumns.split(" ").map(Number.parseFloat),
				);

				expect(tracks.length).toBeGreaterThanOrEqual(1);
				for (const track of tracks) expect(track).toBeCloseTo(tracks[0], 0);

				const scrolls = await page.evaluate(
					() => document.documentElement.scrollWidth > document.documentElement.clientWidth,
				);
				expect(scrolls).toBe(false);
			});

			test("repel pushes a pair apart", { tag: ["@issue-14"] }, async ({ page }) => {
				const [start, end, repel] = await Promise.all([
					box(page, "repel-start"), box(page, "repel-end"), box(page, "repel"),
				]);

				expect(start!.x).toBeCloseTo(repel!.x, 0);
				expect(end!.x + end!.width).toBeCloseTo(repel!.x + repel!.width, 0);
			});
		});
	}
});

/**
 * Two primitives are about how layout *changes* across widths, so they are
 * measured as a sweep rather than asserted at each width in isolation.
 */
test.describe("composition primitives across the range", () => {
	test("sidebar collapses on its own, with no media query", { tag: ["@issue-14"] }, async ({ page }) => {
		const sideBySide: Record<number, boolean> = {};

		for (const width of WIDTHS) {
			await scratch(page, width);
			const [aside, main] = await Promise.all([
				box(page, "sidebar-aside"), box(page, "sidebar-main"),
			]);
			sideBySide[width] = Math.abs(aside!.y - main!.y) < 2;
		}

		// Narrow: stacked. Wide: side by side. The switch happens on its own.
		expect(sideBySide[320]).toBe(false);
		expect(sideBySide[1440]).toBe(true);

		// And it happens without a media query — the whole point of the
		// technique. No `@media` appears anywhere in the composition layer.
		const composition = await page.evaluate(async () => {
			const href = document.querySelector<HTMLLinkElement>('link[rel="stylesheet"]')!.href;
			const css = await (await fetch(href)).text();
			const start = css.indexOf("@layer composition{");
			const next = css.indexOf("@layer ", start + 1);
			return css.slice(start, next === -1 ? undefined : next);
		});
		expect(composition).not.toContain("@media");
	});

	test("grid adds tracks as the viewport grows", { tag: ["@issue-14"] }, async ({ page }) => {
		const counts: number[] = [];

		for (const width of WIDTHS) {
			await scratch(page, width);
			counts.push(
				await page.locator('[data-probe="grid"]').evaluate(
					(el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
				),
			);
		}

		expect(counts[0]).toBe(1);
		expect(counts[2]).toBeGreaterThan(counts[0]);
		expect(counts).toEqual([...counts].sort((a, b) => a - b));
	});
});
