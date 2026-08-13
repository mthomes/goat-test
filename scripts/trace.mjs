/**
 * Requirement traceability report.
 *
 * Coverage tools measure lines executed. This measures acceptance criteria
 * demonstrated: every test carries the number of the issue it proves, and this
 * walks the suite backwards from those tags to the requirement set.
 *
 * The implementation is deliberately dumb — it greps tags out of test files.
 * Anything cleverer (a custom reporter, a runtime registry) would only work
 * for tests that actually ran, and the interesting failure is the test that
 * was never written.
 *
 *   npm run trace              report, always exit 0
 *   npm run trace -- --strict  exit 1 on an uncovered issue or an unknown tag
 */
import { readdirSync, readFileSync, statSync, appendFileSync } from "node:fs";
import { join } from "node:path";

const TAG = /@issue-(\d+)/g;
const TITLE = /(?:describe|test|it)(?:\.\w+)?\s*\(\s*(['"`])((?:\\.|(?!\1).)*)\1/;
const TEST_FILE = /\.(?:test|spec)\.(?:ts|tsx|mts|js|mjs)$/;
const SEARCH_ROOTS = ["src", "tests"];

const strict = process.argv.includes("--strict");

/* ------------------------------------------------------------------ inputs */

const { issues } = JSON.parse(readFileSync("requirements.json", "utf8"));
const known = new Map(issues.map((issue) => [issue.number, issue]));

function walk(dir) {
	let out = [];
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) out = out.concat(walk(path));
		else if (TEST_FILE.test(entry)) out.push(path);
	}
	return out;
}

/* ------------------------------------------------------------------- scan */

/** issue number -> [{ file, line, title }] */
const coverage = new Map();
/** tags pointing at issues that don't exist */
const unknownTags = [];

for (const file of SEARCH_ROOTS.flatMap((root) => walk(root))) {
	const lines = readFileSync(file, "utf8").split("\n");

	lines.forEach((line, index) => {
		for (const match of line.matchAll(TAG)) {
			const number = Number(match[1]);

			// The nearest enclosing (or same-line) test title, walking back up.
			let title = "";
			for (let i = index; i >= 0 && !title; i--) {
				title = lines[i].match(TITLE)?.[2] ?? "";
			}

			const entry = { file, line: index + 1, title: title || "(untitled)" };
			if (!known.has(number)) {
				unknownTags.push({ ...entry, number });
				continue;
			}
			if (!coverage.has(number)) coverage.set(number, []);
			coverage.get(number).push(entry);
		}
	});
}

/* ----------------------------------------------------------------- report */

const requiresCoverage = issues.filter((issue) => !issue.epic);
const uncovered = requiresCoverage.filter((issue) => !coverage.has(issue.number));
const covered = requiresCoverage.length - uncovered.length;

const lines = [];
const say = (line = "") => lines.push(line);

say("## Requirement traceability");
say();
say(`**${covered} of ${requiresCoverage.length}** issues with acceptance criteria have covering tests. `
	+ `${issues.length - requiresCoverage.length} epics are exempt — they carry no criteria of their own.`);
say();
say("| Issue | Title | Tests | Covering tests |");
say("| ----- | ----- | ----: | -------------- |");

for (const issue of issues) {
	const tests = coverage.get(issue.number) ?? [];
	const status = issue.epic ? "—" : tests.length > 0 ? String(tests.length) : "**0**";
	const detail = issue.epic
		? "_epic — exempt_"
		: tests.length > 0
			? tests.map((t) => `\`${t.file}:${t.line}\``).join("<br>")
			: "**no covering test**";
	say(`| #${issue.number} | ${issue.title} | ${status} | ${detail} |`);
}

if (uncovered.length > 0) {
	say();
	say(`### ⚠️ ${uncovered.length} issue(s) with zero covering tests`);
	say();
	for (const issue of uncovered) say(`- #${issue.number} — ${issue.title}`);
}

if (unknownTags.length > 0) {
	say();
	say(`### ⚠️ ${unknownTags.length} tag(s) referencing a non-existent issue`);
	say();
	for (const tag of unknownTags) {
		say(`- \`@issue-${tag.number}\` at \`${tag.file}:${tag.line}\` — no such issue in requirements.json`);
	}
}

const report = lines.join("\n");
console.log(report);

if (process.env.GITHUB_STEP_SUMMARY) {
	appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
}

if (strict && (uncovered.length > 0 || unknownTags.length > 0)) {
	console.error(
		`\ntrace: ${uncovered.length} uncovered issue(s), ${unknownTags.length} unknown tag(s).`,
	);
	process.exit(1);
}
