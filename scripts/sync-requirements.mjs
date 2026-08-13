/**
 * Snapshot the project's issues into `requirements.json`.
 *
 * The traceability report needs to know which issues exist. Reading that from
 * the GitHub API at report time would make `npm run trace` require network and
 * a token, and would make its output depend on the state of a remote system at
 * the moment it ran. A committed snapshot keeps the report deterministic,
 * runnable offline, and — because it is in git — makes the requirement set
 * itself reviewable in a diff.
 *
 * Re-run with `npm run trace:sync` when issues are added, renamed or relabelled.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const REPO = "mthomes/goat-test";

const raw = execFileSync(
	"gh",
	["issue", "list", "--repo", REPO, "--state", "all", "--limit", "500",
	 "--json", "number,title,labels,state"],
	{ encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
);

const issues = JSON.parse(raw)
	.map((issue) => ({
		number: issue.number,
		title: issue.title,
		state: issue.state,
		// Epics carry no acceptance criteria of their own — they are closed by
		// their children closing — so they are exempt from the coverage rule.
		epic: issue.labels.some((label) => label.name === "epic"),
	}))
	.sort((a, b) => a.number - b.number);

writeFileSync(
	"requirements.json",
	`${JSON.stringify({ repo: REPO, syncedAt: new Date().toISOString(), issues }, null, "\t")}\n`,
);

console.log(`Synced ${issues.length} issues from ${REPO} into requirements.json`);
