import { expect, test } from "@playwright/test";

/** The release cadence heatmap on `/stats`. */
test.describe("cadence heatmap", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/stats");
		await page.evaluate(() => document.fonts.ready);
	});

	test("is a CSS grid, with no chart library and no script", { tag: ["@issue-33"] }, async ({ page }) => {
		const grid = page.locator(".heatmap__grid");

		expect(await grid.evaluate((el) => getComputedStyle(el).display)).toBe("grid");
		// 12 months plus the year label column.
		expect(await grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length))
			.toBe(13);

		await expect(page.locator("main canvas, main svg")).toHaveCount(0);
		await expect(page.locator("script")).toHaveCount(0);
	});

	test("drives cell intensity from the release count", { tag: ["@issue-33"] }, async ({ page }) => {
		const cells = await page.locator(".heatmap__grid .heatmap__cell").evaluateAll((nodes) =>
			nodes.map((node) => ({
				heat: node.getAttribute("data-heat"),
				background: getComputedStyle(node).backgroundColor,
				outside: node.hasAttribute("data-outside"),
			})),
		);

		expect(cells.length).toBeGreaterThan(40);

		// One colour per level, and different levels look different.
		const inSpan = cells.filter((cell) => !cell.outside);
		const byLevel = new Map<string, Set<string>>();
		for (const cell of inSpan) {
			if (!byLevel.has(cell.heat!)) byLevel.set(cell.heat!, new Set());
			byLevel.get(cell.heat!)!.add(cell.background);
		}

		expect(byLevel.size).toBeGreaterThan(1);
		for (const [level, colours] of byLevel) expect(colours.size, `level ${level}`).toBe(1);
		expect(new Set([...byLevel.values()].map((set) => [...set][0])).size).toBe(byLevel.size);
	});

	test("matches the counts in its accessible table", { tag: ["@issue-33"] }, async ({ page }) => {
		const table = page.locator(".heatmap table");
		await expect(table).toHaveCount(1);

		// The table is the accessible equivalent: same data, read out in full.
		const counts = await table.locator("tbody td").evaluateAll((cells) =>
			cells.map((cell) => cell.textContent!.trim()),
		);
		const total = counts
			.filter((value) => value !== "—")
			.reduce((sum, value) => sum + Number.parseInt(value, 10), 0);

		await page.goto("/releases");
		const releases = Number.parseInt(
			/(\d+) releases/.exec(await page.locator(".archive__count").first().innerText())![1],
			10,
		);
		expect(total).toBe(releases);
	});

	test("hides the grid from assistive tech and exposes the table instead", { tag: ["@issue-33"] }, async ({ page }) => {
		// 47 unlabelled cells teach a screen reader nothing; the table does.
		await expect(page.locator(".heatmap__grid")).toHaveAttribute("aria-hidden", "true");

		const table = page.locator(".heatmap table");
		await expect(table.locator("caption")).toContainText(/releases per month/i);
		await expect(table.locator('thead th[scope="col"]')).toHaveCount(13);
		await expect(table.locator('tbody th[scope="row"]')).toHaveCount(5);

		// Hidden visually, still in the accessibility tree. The clipping happens
		// on the wrapper — auto table layout ignores a width narrower than its
		// content, so the table itself stays full width inside a 1px box.
		const wrapper = page.locator(".heatmap .visually-hidden");
		const box = await wrapper.boundingBox();
		expect(box!.width).toBeLessThan(3);
		expect(await wrapper.evaluate((el) => getComputedStyle(el).display)).not.toBe("none");
		expect(await wrapper.evaluate((el) => getComputedStyle(el).clipPath)).toContain("inset");
	});

	test("stays legible at 320px without scrolling sideways", { tag: ["@issue-33"] }, async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 900 });
		await page.goto("/stats");

		const grid = await page.locator(".heatmap__grid").boundingBox();
		expect(grid!.width).toBeLessThanOrEqual(320);

		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth > document.documentElement.clientWidth,
			),
		).toBe(false);

		// Cells stay square rather than collapsing to slivers.
		const cell = await page.locator(".heatmap__grid .heatmap__cell").first().boundingBox();
		expect(cell!.width).toBeGreaterThan(8);
		expect(cell!.height).toBeCloseTo(cell!.width, 0);
	});

	test("re-tunes itself for the dark palette", { tag: ["@issue-33", "@issue-17"] }, async ({ page }, testInfo) => {
		const ground = await page.locator("body").evaluate((el) => getComputedStyle(el).backgroundColor);
		const hottest = await page.locator('.heatmap__cell[data-heat="3"]').first()
			.evaluate((el) => getComputedStyle(el).backgroundColor);

		// The ramp is mixed from the accent into the paper, so it follows the
		// palette rather than needing a second set of values.
		expect(hottest).not.toBe(ground);

		const isDark = testInfo.project.name === "dark";
		const lightness = (colour: string) =>
			colour.match(/\d+/g)!.slice(0, 3).map(Number).reduce((a, b) => a + b, 0);
		expect(lightness(ground) < 250).toBe(isDark);
	});
});
