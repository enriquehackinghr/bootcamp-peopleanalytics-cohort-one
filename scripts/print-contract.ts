/**
 * Prints the shared contract surface for Dev 1 / Dev 2 sync checks.
 * Run: npx tsx scripts/print-contract.ts  (or inspect lib/types.ts directly)
 */
import {
  EMPTY_FILTER_CONTEXT,
  HIERARCHIES,
  MIN_CELL_SIZE,
} from '../lib/types'

console.log(
  JSON.stringify(
    {
      minCellSize: MIN_CELL_SIZE,
      hierarchies: HIERARCHIES,
      emptyFilterContext: EMPTY_FILTER_CONTEXT,
      note: 'Full shapes live in lib/types.ts — re-read after any change.',
    },
    null,
    2,
  ),
)
