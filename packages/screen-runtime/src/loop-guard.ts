import type { NodePath, PluginObj, types as BabelTypes } from "@babel/core";
import { LOOP_BUDGET_MS, STUCK_MESSAGE } from "./constants";

type Loop = BabelTypes.WhileStatement | BabelTypes.DoWhileStatement | BabelTypes.ForStatement | BabelTypes.ForInStatement | BabelTypes.ForOfStatement;

// CodePen-style protection: every loop records when it started and throws once
// one synchronous run passes the budget. The runtime turns the error into the
// "This screen stopped responding" overlay.
export function loopGuardPlugin(options: { budgetMs?: number } = {}) {
  const budget = options.budgetMs ?? LOOP_BUDGET_MS;
  return ({ types: t }: { types: typeof BabelTypes }): PluginObj => {
    const guarded = new WeakSet<BabelTypes.Node>();
    const now = () => t.callExpression(t.memberExpression(t.identifier("Date"), t.identifier("now")), []);
    function guard(path: NodePath<Loop>) {
      if (guarded.has(path.node)) return;
      guarded.add(path.node);
      const started = path.scope.generateUidIdentifier("orionLoop");
      const check = t.ifStatement(
        t.binaryExpression(">", t.binaryExpression("-", now(), started), t.numericLiteral(budget)),
        t.throwStatement(t.newExpression(t.identifier("Error"), [t.stringLiteral(STUCK_MESSAGE)])),
      );
      const body = path.get("body") as NodePath<BabelTypes.Statement>;
      if (body.isBlockStatement()) body.unshiftContainer("body", check);
      else body.replaceWith(t.blockStatement([check, body.node]));
      // Keep every label directly attached to its loop so labeled continue
      // remains valid. Explicitly wrap single-statement positions: Babel's
      // insertBefore conversion can otherwise requeue a newly cloned loop.
      let anchor: NodePath<BabelTypes.Statement> = path;
      while (anchor.parentPath?.isLabeledStatement()) anchor = anchor.parentPath;
      const declaration = t.variableDeclaration("const", [t.variableDeclarator(started, now())]);
      if (anchor.inList) anchor.insertBefore(declaration);
      else anchor.replaceWith(t.blockStatement([declaration, anchor.node]));
    }
    return {
      name: "orion-loop-guard",
      visitor: {
        WhileStatement: guard,
        DoWhileStatement: guard,
        ForStatement: guard,
        ForInStatement: guard,
        ForOfStatement: guard,
      },
    };
  };
}
