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
    const resumed = new WeakSet<BabelTypes.Node>();
    const timers = new WeakMap<BabelTypes.Node, BabelTypes.Identifier>();
    const now = () => t.callExpression(t.memberExpression(t.identifier("Date"), t.identifier("now")), []);
    function enclosingTimers(path: NodePath) {
      const result: BabelTypes.Identifier[] = [];
      for (let parent = path.parentPath; parent && !parent.isFunction(); parent = parent.parentPath) {
        const timer = timers.get(parent.node);
        if (timer) result.push(timer);
      }
      return result;
    }
    const reset = (ids: BabelTypes.Identifier[]) => ids.map((id) => t.assignmentExpression("=", t.cloneNode(id), now()));
    const recover = (ids: BabelTypes.Identifier[]) => ids.map((id) => t.ifStatement(
      t.binaryExpression("===", t.cloneNode(id), t.nullLiteral()),
      t.expressionStatement(t.assignmentExpression("=", t.cloneNode(id), now())),
    ));
    function resume(path: NodePath<BabelTypes.AwaitExpression | BabelTypes.YieldExpression>) {
      if (resumed.has(path.node)) return;
      const ids = enclosingTimers(path);
      if (!ids.length) return;
      resumed.add(path.node);
      const value = path.scope.generateUidIdentifier("orionResume");
      path.scope.push({ id: value, kind: "let" });
      // Mark the suspension so catch/finally can also recover timers when
      // await rejects or a generator is resumed with throw()/return().
      const suspended = ids.map((id) => t.assignmentExpression("=", t.cloneNode(id), t.nullLiteral()));
      path.node.argument = t.sequenceExpression([
        t.assignmentExpression("=", t.cloneNode(value), path.node.argument ?? t.unaryExpression("void", t.numericLiteral(0))),
        ...suspended,
        t.cloneNode(value),
      ]);
      path.replaceWith(t.sequenceExpression([
        t.assignmentExpression("=", t.cloneNode(value), path.node),
        ...reset(ids),
        t.cloneNode(value),
      ]));
      path.skip();
    }
    function guard(path: NodePath<Loop>) {
      if (guarded.has(path.node)) return;
      guarded.add(path.node);
      const started = path.scope.generateUidIdentifier("orionLoop");
      timers.set(path.node, started);
      const check = t.ifStatement(
        t.binaryExpression(">", t.binaryExpression("-", now(), started), t.numericLiteral(budget)),
        t.throwStatement(t.newExpression(t.identifier("Error"), [t.stringLiteral(STUCK_MESSAGE)])),
      );
      const body = path.get("body") as NodePath<BabelTypes.Statement>;
      const checks: BabelTypes.Statement[] = [...recover([started]), check];
      if (t.isForOfStatement(path.node) && path.node.await) {
        // next() implicitly suspends before every body entry, including the
        // final done result. Reset outer loops on exit as well.
        checks.unshift(...reset([started, ...enclosingTimers(path)]).map((expression) => t.expressionStatement(expression)));
      }
      if (body.isBlockStatement()) body.unshiftContainer("body", checks);
      else body.replaceWith(t.blockStatement([...checks, body.node]));
      // Keep every label directly attached to its loop so labeled continue
      // remains valid. Explicitly wrap single-statement positions: Babel's
      // insertBefore conversion can otherwise requeue a newly cloned loop.
      let anchor: NodePath<BabelTypes.Statement> = path;
      while (anchor.parentPath?.isLabeledStatement()) anchor = anchor.parentPath;
      const declaration = t.variableDeclaration("let", [t.variableDeclarator(started, now())]);
      if (t.isForOfStatement(path.node) && path.node.await) {
        const outer = enclosingTimers(path);
        if (outer.length) {
          anchor.replaceWith(t.tryStatement(t.blockStatement([anchor.node]), null,
            t.blockStatement(reset(outer).map((expression) => t.expressionStatement(expression)))));
        }
      }
      if (anchor.inList) anchor.insertBefore(declaration);
      else anchor.replaceWith(t.blockStatement([declaration, anchor.node]));
    }
    return {
      name: "orion-loop-guard",
      visitor: {
        AwaitExpression: { exit: resume },
        YieldExpression: { exit: resume },
        CatchClause(path) {
          path.get("body").unshiftContainer("body", recover(enclosingTimers(path)));
        },
        TryStatement(path) {
          const finalizer = path.get("finalizer");
          if (finalizer.isBlockStatement()) finalizer.unshiftContainer("body", recover(enclosingTimers(path)));
        },
        WhileStatement: guard,
        DoWhileStatement: guard,
        ForStatement: guard,
        ForInStatement: guard,
        ForOfStatement: guard,
      },
    };
  };
}
