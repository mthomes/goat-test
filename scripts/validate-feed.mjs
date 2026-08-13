/**
 * Validate `dist/rss.xml` against the W3C feed validator.
 *
 * Posted as raw data rather than by URL, so it works before the site is
 * deployed and against whatever is in `dist/` right now.
 *
 * Not wired into CI: it depends on a third-party service being up, and a
 * green build should not hinge on that. `npm run build && npm run validate:feed`.
 */
import { readFileSync } from "node:fs";

const raw = readFileSync("dist/rss.xml", "utf8");

const response = await fetch("https://validator.w3.org/feed/check.cgi", {
	method: "POST",
	headers: { "content-type": "application/x-www-form-urlencoded" },
	body: new URLSearchParams({ rawdata: raw, manual: "1", output: "soap12" }),
});

const body = await response.text();
const validity = /<m:validity>(\w+)</.exec(body)?.[1];

const problems = [...body.matchAll(/<m:(error|warning)>([\s\S]*?)<\/m:\1>/g)].map(([, kind, block]) => {
	const text = /<m:text>([\s\S]*?)<\/m:text>/.exec(block)?.[1] ?? "?";
	const line = /<m:line>([\s\S]*?)<\/m:line>/.exec(block)?.[1] ?? "?";
	return `  ${kind}: ${text} (line ${line})`;
});

console.log(`W3C feed validator: ${validity}`);
for (const problem of problems) console.log(problem);

if (validity !== "true") process.exit(1);
