/**
 * A run of consecutive `expect(...)` statements is one block: blank line around
 * it, none inside it.
 *
 * A comment on its own line between two assertions is exempt, along with the
 * spacing around it — it is a real reason to break the block, and without the
 * exemption the dense-block fixer deleted the note. A trailing comment is part
 * of its line, so the gap below it still closes.
 *
 * Fixable both ways.
 */

import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import { Diagnostic, type ESTree, type OxlintSourceCode, Rule, RuleContext } from 'effect-oxlint'
import {
  adjacentPairs,
  blankLinesBetween,
  lineStartRange,
  statementsOf,
} from './source-position.ts'

/** The root of a call/member chain: `expect(x).resolves.toBe(y)` → `expect`. */
function chainRoot(expression: ESTree.Expression): ESTree.Expression {
  if (expression.type === 'AwaitExpression') {
    return chainRoot(expression.argument)
  }

  if (expression.type === 'CallExpression') {
    return chainRoot(expression.callee)
  }

  if (expression.type === 'MemberExpression') {
    return chainRoot(expression.object)
  }

  return expression
}

function isExpectStatement(statement: ESTree.Node): boolean {
  if (statement.type !== 'ExpressionStatement') {
    return false
  }

  const root = chainRoot(statement.expression)

  return root.type === 'Identifier' && root.name === 'expect'
}

/**
 * The one gap between two adjacent statements, or none when the vertical-spacing
 * rules own it (neither side is an assertion) and when it already reads right.
 */
function gapDiagnostic(
  sourceCode: OxlintSourceCode,
  previous: ESTree.Node,
  current: ESTree.Node,
): Option.Option<Diagnostic.Diagnostic> {
  const previousIsExpect = isExpectStatement(previous)
  const currentIsExpect = isExpectStatement(current)

  if (!previousIsExpect && !currentIsExpect) {
    return Option.none()
  }

  const blankLines = blankLinesBetween(previous, current)

  if (previousIsExpect && currentIsExpect) {
    const comments = sourceCode.getCommentsBefore(current)

    // A note on its own line is content, not spacing.
    if (comments.some((comment) => comment.loc.start.line > previous.loc.end.line)) {
      return Option.none()
    }

    if (blankLines === 0) {
      return Option.none()
    }

    // Replace the whole gap so several blank lines collapse at once, starting
    // after any trailing comment on the previous line.
    const gapStart = comments.at(-1)?.range[1] ?? previous.range[1]

    return Option.some(
      Diagnostic.withFix(
        Diagnostic.fromId({ node: current, messageId: 'denseExpectBlock' }),
        (fixer) =>
          fixer.replaceTextRange(
            [gapStart, current.range[0]],
            `\n${' '.repeat(current.loc.start.column)}`,
          ),
      ),
    )
  }

  // Exactly one side is an assertion, so this gap is the block's edge.
  if (blankLines > 0) {
    return Option.none()
  }

  return Option.some(
    Diagnostic.withFix(
      Diagnostic.fromId({ node: current, messageId: 'fenceExpectBlock' }),
      (fixer) => fixer.insertTextBeforeRange(lineStartRange(current), '\n'),
    ),
  )
}

export default Rule.define({
  name: 'expect-padding',
  meta: Rule.meta({
    type: 'layout',
    description: 'a run of expect() calls is one block: blank line around it, none inside',
    fixable: 'whitespace',
    messages: {
      fenceExpectBlock: 'Add a blank line between this and the adjacent expect() block.',
      denseExpectBlock: 'Remove the blank line(s) between consecutive expect() calls.',
    },
  }),
  create: function* () {
    const context = yield* RuleContext

    const checkBody = (node: ESTree.Node) =>
      Effect.forEach(
        Arr.getSomes(
          adjacentPairs(statementsOf(node)).map(([previous, current]) =>
            gapDiagnostic(context.sourceCode, previous, current),
          ),
        ),
        context.report,
        { discard: true },
      )

    return {
      Program: checkBody,
      BlockStatement: checkBody,
      SwitchCase: checkBody,
      StaticBlock: checkBody,
    }
  },
})
