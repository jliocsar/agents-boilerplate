/**
 * The local rules as an oxlint JS plugin. `Plugin.define`'s `name` supplies the
 * `local/` prefix the config uses.
 *
 * A `.ts` plugin only loads when oxlint itself runs under Bun — hence
 * `bunx --bun oxlint` everywhere. Under Node the import fails with
 * `ERR_UNKNOWN_FILE_EXTENSION`.
 */

import { Plugin } from 'effect-oxlint'
import expectPadding from './expect-padding.ts'
import noShadowedErrorField from './no-shadowed-error-field.ts'
import noTagAccess from './no-tag-access.ts'
import paddingLineBetweenStatements from './padding-line-between-statements.ts'
import statementOrder from './statement-order.ts'

export default Plugin.define({
  name: 'local',
  rules: {
    'statement-order': statementOrder,
    'expect-padding': expectPadding,
    'no-tag-access': noTagAccess,
    'no-shadowed-error-field': noShadowedErrorField,
    'padding-line-between-statements': paddingLineBetweenStatements,
  },
})
