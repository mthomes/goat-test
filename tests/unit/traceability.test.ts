import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

/**
 * The traceability report is the mechanism that turns test coverage into
 * evidence of requirements being met, so it needs to be trustworthy itself.
 * These run the real script against a scratch project.
 */

const TRACE = resolve("scripts/trace.mjs");
const scratches: string[] = [];

function scratchProject(requirements: object, testFiles: Record<string, string>) {
	const dir = mkdtempSync(join(tmpdir(), "trace-"));
	scratches.push(dir);
	writeFileSync(join(dir, "requirements.json"), JSON.stringify(requirements));
	mkdirSync(join(dir, "src"), { recursive: true });
	mkdirSync(join(dir, "tests"), { recursive: true });
	for (const [name, body] of Object.entries(testFiles)) {
		writeFileSync(join(dir, name), body);
	}
	return dir;
}

function runTrace(cwd: string, ...args: string[]) {
	try {
		return { code: 0, out: execFileSync("node", [TRACE, ...args], { cwd, encoding: "utf8" }) };
	} catch (error) {
		const e = error as { status: number; stdout: string; stderr: string };
		return { code: e.status, out: e.stdout + e.stderr };
	}
}

afterEach(() => {
	for (const dir of scratches.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const REQUIREMENTS = {
	repo: "example/example",
	issues: [
		{ number: 1, title: "Epic: Something", state: "OPEN", epic: true },
		{ number: 20, title: "Covered issue", state: "OPEN", epic: false },
		{ number: 21, title: "Uncovered issue", state: "OPEN", epic: false },
	],
};

describe("@issue-43 requirement traceability", () => {
	it("maps every issue number to the tests covering it", () => {
		const dir = scratchProject(REQUIREMENTS, {
			"tests/a.spec.ts": `test("does a thing", { tag: ["@issue-20"] }, () => {});\n`,
		});

		const { code, out } = runTrace(dir);

		expect(code).toBe(0);
		expect(out).toContain("tests/a.spec.ts:1");
		expect(out).toMatch(/#20 \| Covered issue \| 1 \|/);
	});

	it("flags an issue with zero covering tests", () => {
		const dir = scratchProject(REQUIREMENTS, {
			"tests/a.spec.ts": `test("does a thing", { tag: ["@issue-20"] }, () => {});\n`,
		});

		const { out } = runTrace(dir);

		expect(out).toContain("issue(s) with zero covering tests");
		expect(out).toContain("#21 — Uncovered issue");
	});

	it("exempts epics, which carry no acceptance criteria of their own", () => {
		const dir = scratchProject(REQUIREMENTS, {
			"tests/a.spec.ts": `test("does a thing", { tag: ["@issue-20"] }, () => {});\n`,
		});

		const { out } = runTrace(dir);

		expect(out).toContain("#1 | Epic: Something | — | _epic — exempt_");
		expect(out).not.toContain("#1 — Epic: Something");
	});

	it("flags a tag referencing a non-existent issue", () => {
		// Assembled rather than written out: the scanner reads *this* file too,
		// so a bogus tag written literally anywhere in it — including in a
		// comment explaining why you must not — is reported as a real unknown
		// tag in the project's own report. Both mistakes were made here first.
		const bogus = `@issue-${9999}`;
		const dir = scratchProject(REQUIREMENTS, {
			"tests/a.spec.ts": `test("typo", { tag: ["${bogus}"] }, () => {});\n`,
		});

		const { out } = runTrace(dir);

		expect(out).toContain("tag(s) referencing a non-existent issue");
		expect(out).toContain(bogus);
	});

	it("picks up the Vitest describe convention as well as Playwright tags", () => {
		const dir = scratchProject(REQUIREMENTS, {
			"src/thing.test.ts": `describe("@issue-20 the thing", () => { it("works", () => {}); });\n`,
		});

		const { out } = runTrace(dir);

		expect(out).toContain("src/thing.test.ts:1");
	});

	it("exits non-zero under --strict when anything is unproved", () => {
		const gap = scratchProject(REQUIREMENTS, {
			"tests/a.spec.ts": `test("does a thing", { tag: ["@issue-20"] }, () => {});\n`,
		});
		expect(runTrace(gap, "--strict").code).toBe(1);

		const complete = scratchProject(REQUIREMENTS, {
			"tests/a.spec.ts": `test("a", { tag: ["@issue-20"] }, () => {});\ntest("b", { tag: ["@issue-21"] }, () => {});\n`,
		});
		expect(runTrace(complete, "--strict").code).toBe(0);
	});

	it("keeps requirements.json in step with the issue numbers tests reference", () => {
		const { issues } = JSON.parse(readFileSync("requirements.json", "utf8"));
		expect(issues.length).toBeGreaterThan(0);
		expect(issues.every((i: { number: number }) => Number.isInteger(i.number))).toBe(true);
	});
});
