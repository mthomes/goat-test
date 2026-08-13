import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The CI and deploy workflows, asserted as configuration.
 *
 * A workflow's real proof is that it runs — and these all do, on every PR in
 * this repository. What that cannot catch is a step being quietly dropped, or
 * a budget being loosened, in a diff nobody reads closely. These assertions
 * are for that: they pin the parts of the pipeline whose absence would not be
 * obvious from a green tick.
 */
const ci = readFileSync(".github/workflows/ci.yml", "utf8");
const lighthouse = readFileSync(".github/workflows/lighthouse.yml", "utf8");
const stylelintrc = readFileSync(".stylelintrc.mjs", "utf8");
const pkg = JSON.parse(readFileSync("package.json", "utf8"));

describe("@issue-37 the pull-request gate", () => {
	it("runs on pull requests and on push to main", () => {
		expect(ci).toMatch(/on:\s*\n\s*pull_request:/);
		expect(ci).toMatch(/push:\s*\n\s*branches: \[main\]/);
	});

	it("pins Node from .nvmrc rather than to a literal", () => {
		// A literal here is a second copy of the version, and it drifts.
		expect(ci).toContain("node-version-file: .nvmrc");
		expect(ci).not.toMatch(/node-version:\s*["']?\d/);
	});

	it("installs from the lockfile, type-checks and builds", () => {
		expect(ci).toContain("npm ci");
		expect(ci).toContain("npm run check");
		expect(ci).toContain("npm run build");
	});

	it("caches dependencies", () => {
		expect(ci).toContain("cache: npm");
	});

	it("cancels superseded runs rather than queueing them", () => {
		expect(ci).toContain("cancel-in-progress: true");
	});
});

describe("@issue-36 stylelint in CI", () => {
	it("runs the CSS linter as its own step", () => {
		expect(ci).toContain("npm run lint:css");
		expect(ci).toContain("npm run lint:style-blocks");
	});

	it("enforces the CUBE rules the ticket names", () => {
		for (const rule of [
			"goat/layer-order",
			"selector-max-id",
			"selector-max-specificity",
			"declaration-no-important",
			"custom-property-pattern",
			"color-no-hex",
		]) {
			expect(stylelintrc, `${rule} is not configured`).toContain(rule);
		}
	});

	it("scopes the colour ban off the token layer, and only that file", () => {
		const overrides = stylelintrc.slice(stylelintrc.indexOf("overrides:"));
		expect(overrides).toContain("src/styles/tokens.css");
		expect(overrides.match(/files: \[/g)).toHaveLength(1);
	});
});

describe("@issue-38 lighthouse budgets", () => {
	const rc = readFileSync("lighthouserc.cjs", "utf8");

	it("runs against a production build in Actions", () => {
		expect(lighthouse).toContain("npm run test:lighthouse");
		expect(pkg.scripts["test:lighthouse"]).toContain("npm run build");
		expect(rc).toContain("startServerCommand");
		expect(rc).toContain("npm run preview");
	});

	it("holds the budgets the ticket sets", () => {
		expect(rc).toMatch(/"categories:performance":\s*\["error",\s*\{\s*minScore:\s*0\.98/);
		expect(rc).toMatch(/"categories:accessibility":\s*\["error",\s*\{\s*minScore:\s*1/);
		expect(rc).toMatch(/"categories:best-practices":\s*\["error",\s*\{\s*minScore:\s*0\.95/);
	});

	it("asserts zero JavaScript as a resource budget, not a score", () => {
		// A score can be diluted by everything else on the page; these cannot.
		expect(rc).toMatch(/"resource-summary:script:size":\s*\["error",\s*\{\s*maxNumericValue:\s*0/);
		expect(rc).toMatch(/"resource-summary:script:count":\s*\["error",\s*\{\s*maxNumericValue:\s*0/);
	});

	it("audits the representative route set", () => {
		for (const route of ["/goat-test/", "/goat-test/releases", "/goat-test/releases/", "/goat-test/known-issues", "/goat-test/stats"]) {
			expect(rc, route).toContain(route);
		}
	});

	it("reports failures onto the pull request", () => {
		expect(lighthouse).toContain("pull-requests: write");
		expect(lighthouse).toContain("createComment");
		expect(lighthouse).toContain("if: failure() && github.event_name == 'pull_request'");
	});
});

describe("@issue-51 the full suite in CI", () => {
	it("runs every suite: unit, e2e, a11y, guardrail and visual", () => {
		expect(ci).toContain("npm run test:unit:coverage");
		expect(ci).toContain("npm run test:e2e");
		expect(ci).toContain("npm run test:guardrails");
		expect(ci).toContain("npm run test:visual");

		// The a11y and contrast specs live in the E2E suite and shard with it.
		expect(pkg.scripts["test:e2e"]).toBeTruthy();
	});

	it("caches Playwright browsers, keyed by version and by browser set", () => {
		expect(ci).toContain("~/.cache/ms-playwright");

		// Keyed by the Playwright version, so a bump invalidates the cache…
		const keys = [...ci.matchAll(/key: (playwright-[^\n]+)/g)].map((match) => match[1]);
		expect(keys.length).toBeGreaterThanOrEqual(2);
		for (const key of keys) {
			expect(key).toContain("${{ steps.playwright.outputs.version }}");
		}

		// …and by the browser set, so the chromium-only visual job cannot hand
		// the three-browser E2E job a cache with no Firefox in it.
		expect(new Set(keys).size).toBe(keys.length);

		// The install runs unconditionally: a no-op on a full cache hit, and
		// the difference between a fast job and a correct one otherwise.
		expect(ci).not.toContain("if: steps.browsers.outputs.cache-hit");
	});

	it("shards the E2E suite across parallel jobs", () => {
		expect(ci).toMatch(/shard: \[1, 2, 3, 4\]/);
		expect(ci).toContain("--shard=${{ matrix.shard }}/4");
		// Sharded runs produce blob reports that have to be merged back.
		expect(ci).toContain("merge-reports");
	});

	it("posts coverage and traceability to the job summary", () => {
		expect(ci).toContain("GITHUB_STEP_SUMMARY");
		expect(ci).toContain("coverage-summary.json");
		expect(ci).toContain("npm run trace");
	});

	it("fails the build on any issue with zero covering tests", () => {
		// The criterion that makes the testing epic self-enforcing.
		expect(ci).toContain("npm run trace -- --strict");
	});

	it("uploads traces, screenshots and visual diffs on failure", () => {
		expect(ci).toMatch(/name: e2e-failures-\$\{\{ matrix\.shard \}\}/);
		expect(ci).toContain("name: visual-diffs");
		expect(ci).toContain("playwright-report-visual/");
		expect(ci).toContain("name: coverage");
	});

	it("documents the required status checks for branch protection", () => {
		const contributing = readFileSync("CONTRIBUTING.md", "utf8");
		expect(contributing).toMatch(/required status check/i);
		for (const job of ["Lint, types, build", "Unit + coverage", "Guardrails", "Visual regression", "Requirement traceability"]) {
			expect(contributing, `${job} is not documented`).toContain(job);
		}
	});
});

describe("@issue-39 the Pages deploy", () => {
	const deploy = readFileSync(".github/workflows/deploy.yml", "utf8");

	it("builds and publishes on push to main", () => {
		expect(deploy).toMatch(/push:\s*\n\s*branches: \[main\]/);
		expect(deploy).toContain("actions/upload-pages-artifact");
		expect(deploy).toContain("actions/deploy-pages");
		expect(deploy).toContain("path: dist");
	});

	it("requests exactly the permissions Pages needs", () => {
		// Read the repo, write the artefact, mint an OIDC token. Nothing else.
		expect(deploy).toMatch(/permissions:\s*\n\s*contents: read\s*\n\s*pages: write\s*\n\s*id-token: write/);
	});

	it("serialises deploys and never cancels one mid-flight", () => {
		// A cancelled deploy can leave the site half-published.
		expect(deploy).toMatch(/concurrency:\s*\n\s*group: pages\s*\n\s*cancel-in-progress: false/);
	});

	it("deploys the same build the tests ran against", () => {
		// `site` and `base` come from astro.config.mjs, not from workflow
		// inputs, so there is no second copy to get wrong.
		expect(deploy).toContain("npm run build");
		expect(deploy).not.toMatch(/--site|--base|ASTRO_BASE/);

		const config = readFileSync("astro.config.mjs", "utf8");
		expect(config).toMatch(/site:\s*"https:\/\/mthomes\.github\.io"/);
		expect(config).toMatch(/base:\s*"\/goat-test"/);
	});

	it("names the environment so the deployed URL is surfaced", () => {
		expect(deploy).toContain("environment:");
		expect(deploy).toContain("name: github-pages");
		expect(deploy).toContain("url: ${{ steps.deployment.outputs.page_url }}");
	});
});
