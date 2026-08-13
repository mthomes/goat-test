import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Project-shape assertions. These cover acceptance criteria that belong to no
 * particular module, so they live here rather than colocated — the colocation
 * rule is for tests that cover a module.
 */

const read = (path: string) => readFileSync(path, "utf8");
const pkg = JSON.parse(read("package.json"));

describe("@issue-8 project scaffold", () => {
	it("puts TypeScript in strict mode", () => {
		expect(JSON.parse(read("tsconfig.json")).extends).toBe("astro/tsconfigs/strict");
	});

	it("creates the src directory structure every later ticket lands in", () => {
		for (const dir of ["components", "content", "layouts", "lib", "pages", "styles"]) {
			expect(existsSync(`src/${dir}`), `src/${dir} is missing`).toBe(true);
		}
	});

	it("commits .gitignore, .editorconfig and .nvmrc, and pins engines", () => {
		expect(existsSync(".gitignore")).toBe(true);
		expect(existsSync(".editorconfig")).toBe(true);
		expect(existsSync(".nvmrc")).toBe(true);
		expect(pkg.engines?.node).toBeTruthy();
	});

	it("keeps the nvmrc version inside the engines range", () => {
		const nvmrc = Number(read(".nvmrc").trim().replace(/^v/, "").split(".")[0]);
		const engines = Number(pkg.engines.node.replace(/[^\d.]/g, "").split(".")[0]);
		expect(nvmrc).toBeGreaterThanOrEqual(engines);
	});

	it("exposes dev, build and preview scripts", () => {
		for (const script of ["dev", "build", "preview"]) {
			expect(pkg.scripts[script], `npm run ${script} is missing`).toBeTruthy();
		}
	});

	it("leaves no starter or demo content behind", () => {
		expect(read("README.md")).not.toContain("Astro Starter Kit");
		expect(pkg.name).not.toBe("short-shell");
		// Astro's minimal template ships its own branded favicons.
		expect(existsSync("public/favicon.svg") && read("public/favicon.svg").includes("#D83333")).toBe(false);
	});
});

describe("@issue-41 unit test harness", () => {
	it("reports coverage from v8 into coverage/", () => {
		expect(pkg.scripts["test:unit:coverage"]).toContain("--coverage");
	});
});
