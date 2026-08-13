import stylelint from "stylelint";

const ruleName = "goat/layer-order";

const messages = stylelint.utils.ruleMessages(ruleName, {
	missingStatement: (expected) =>
		`Expected the entry stylesheet to declare "@layer ${expected.join(", ")};" before any @import.`,
	wrongStatement: (found, expected) =>
		`Expected layer order "${expected.join(", ")}" but found "${found.join(", ")}".`,
	statementNotFirst: () =>
		"Expected the @layer statement to come before any @import — declaring it after one makes the "
		+ "order depend on import order, which is the thing it exists to prevent.",
	unknownLayer: (name, expected) =>
		`Layer "${name}" is not in the declared order (${expected.join(", ")}). An undeclared layer is `
		+ "appended to the end of the cascade, so it silently wins over everything.",
	strayRule: () =>
		"Expected this rule to be inside an @layer block. An unlayered rule beats every layered one "
		+ "regardless of specificity.",
});

/**
 * Enforce CUBE's cascade order at authoring time.
 *
 * Stylelint has no built-in rule for this, and it is the single convention
 * this project cannot afford to get wrong: the layer order is the entire
 * conflict-resolution mechanism.
 *
 * Checks three things:
 *   - the entry stylesheet declares the canonical order, before any @import
 *   - no file opens a layer the statement does not name
 *   - no file contains a rule outside a layer
 */
const ruleFunction = (primary) => (root, result) => {
	const valid = stylelint.utils.validateOptions(result, ruleName, {
		actual: primary,
		// validateOptions checks each element of an array primary.
		possible: [(value) => typeof value === "string"],
	});
	if (!valid) return;

	const expected = primary;
	const file = root.source?.input.file ?? "";
	const isEntry = file.endsWith("index.css") && !file.includes("blocks");

	if (isEntry) {
		const statement = root.nodes.find(
			(node) => node.type === "atrule" && node.name === "layer" && !node.nodes,
		);

		if (!statement) {
			stylelint.utils.report({
				message: messages.missingStatement(expected), node: root, result, ruleName,
			});
			return;
		}

		const found = statement.params.split(",").map((name) => name.trim());
		if (found.join() !== expected.join()) {
			stylelint.utils.report({
				message: messages.wrongStatement(found, expected), node: statement, result, ruleName,
			});
		}

		const firstImport = root.nodes.find((node) => node.type === "atrule" && node.name === "import");
		if (firstImport && root.index(firstImport) < root.index(statement)) {
			stylelint.utils.report({
				message: messages.statementNotFirst(), node: statement, result, ruleName,
			});
		}
		return;
	}

	root.walkAtRules("layer", (atRule) => {
		if (!atRule.nodes) return;
		for (const name of atRule.params.split(",").map((part) => part.trim())) {
			if (!expected.includes(name)) {
				stylelint.utils.report({
					message: messages.unknownLayer(name, expected), node: atRule, result, ruleName,
				});
			}
		}
	});

	root.walkRules((rule) => {
		let parent = rule.parent;
		while (parent && parent.type !== "root") {
			if (parent.type === "atrule" && parent.name === "layer") return;
			parent = parent.parent;
		}
		stylelint.utils.report({ message: messages.strayRule(), node: rule, result, ruleName });
	});
};

ruleFunction.ruleName = ruleName;
ruleFunction.messages = messages;

export default stylelint.createPlugin(ruleName, ruleFunction);
