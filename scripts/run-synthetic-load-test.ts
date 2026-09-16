/*
 * Puts a classroom's worth of synthetic traffic through the real database:
 * 250 page visitors reading the status, then 65 browsers submitting at the
 * same moment, then all 65 replacing what they sent.
 *
 *     npm run load-test
 *
 * Every simulated browser gets its own client and its own anonymous token,
 * so the token endpoint is exercised too.  The gallery is cleared and
 * submissions are closed again at the end.
 */

import 'dotenv/config'
import { create_whiteboard_client } from './shared-test-client.ts'
import { make_synthetic_png_base64 } from './synthetic-drawing.ts'

const PAGE_VISITOR_COUNT = 250
const SUBMITTING_BROWSER_COUNT = 65

/* About the size of a real line drawing at 1200 by 900. */
const FULL_PNG_BASE64_CHARACTERS = 80_000

const NAMES = ['Sam', 'Alex', 'Jordan', 'Riley', 'Casey', 'Morgan', 'Avery', 'Quinn']

function percentile(sorted_milliseconds: number[], fraction: number): number {
  if (sorted_milliseconds.length === 0) return 0
  const index = Math.min(sorted_milliseconds.length - 1, Math.floor(fraction * sorted_milliseconds.length))
  return sorted_milliseconds[index]
}

function report(label: string, durations: number[], failures: string[]) {
  const sorted = [...durations].sort((a, b) => a - b)
  console.log(`\n${label}`)
  console.log(`  succeeded   ${durations.length}`)
  console.log(`  failed      ${failures.length}`)
  console.log(`  median      ${percentile(sorted, 0.5).toFixed(0)} ms`)
  console.log(`  90th pct    ${percentile(sorted, 0.9).toFixed(0)} ms`)
  console.log(`  99th pct    ${percentile(sorted, 0.99).toFixed(0)} ms`)
  console.log(`  slowest     ${(sorted[sorted.length - 1] ?? 0).toFixed(0)} ms`)
  for (const failure of failures.slice(0, 5)) console.log(`  failure     ${failure}`)
  if (failures.length > 5) console.log(`  ... and ${failures.length - 5} more`)
}

/** Runs the same piece of work many times at once, timing each attempt. */
async function run_in_parallel(
  count: number,
  work: (index: number) => Promise<void>,
): Promise<{ durations: number[]; failures: string[] }> {
  const durations: number[] = []
  const failures: string[] = []

  await Promise.all(
    Array.from({ length: count }, async (_unused, index) => {
      const started_at = performance.now()
      try {
        await work(index)
        durations.push(performance.now() - started_at)
      } catch (problem) {
        failures.push(problem instanceof Error ? problem.message : String(problem))
      }
    }),
  )

  return { durations, failures }
}

async function main() {
  const instructor = create_whiteboard_client()

  async function instructor_call(function_name: string, args: Record<string, unknown> = {}) {
    const { data, error } = await instructor.rpc(function_name, args)
    if (error) throw new Error(`${function_name}: ${error.message ?? JSON.stringify(error)}`)
    return data as any
  }

  console.log('Synthetic load test against the live Neon project')
  console.log('Clearing the gallery and opening submissions first.\n')
  await instructor_call('whiteboard_clear_all')
  const opened = await instructor_call('whiteboard_set_submissions_open', {
    p_submissions_are_open: true,
  })
  const generation = opened.gallery_generation as number

  /* ---------- 250 page visitors ---------- */

  const visitor_run = await run_in_parallel(PAGE_VISITOR_COUNT, async () => {
    const visitor = create_whiteboard_client()
    const { error } = await visitor.rpc('whiteboard_status', {})
    if (error) throw new Error(error.message ?? JSON.stringify(error))
  })
  report(`${PAGE_VISITOR_COUNT} page visitors reading the status`, visitor_run.durations, visitor_run.failures)

  /* ---------- 65 simultaneous submissions ---------- */

  const full_png = make_synthetic_png_base64(1200, 900, {
    pad_to_base64_characters: FULL_PNG_BASE64_CHARACTERS,
  })
  const thumbnail_png = make_synthetic_png_base64(300, 225)
  console.log(
    `\nEach submission carries ${full_png.length.toLocaleString()} base64 characters of drawing.`,
  )

  const browser_ids = Array.from({ length: SUBMITTING_BROWSER_COUNT }, () => crypto.randomUUID())

  async function submit_as_browser(index: number, revision_note: string) {
    const browser = create_whiteboard_client()
    const { data, error } = await browser.rpc('whiteboard_submit', {
      p_browser_submission_id: browser_ids[index],
      p_spokesperson_name: `${NAMES[index % NAMES.length]} ${revision_note}`,
      p_full_png_base64: full_png,
      p_thumbnail_png_base64: thumbnail_png,
      p_gallery_generation: generation,
    })
    if (error) throw new Error(error.message ?? JSON.stringify(error))
    if ((data as any).result_status !== 'saved') {
      throw new Error(`refused: ${(data as any).result_status}`)
    }
  }

  const first_run = await run_in_parallel(SUBMITTING_BROWSER_COUNT, (index) =>
    submit_as_browser(index, 'group'),
  )
  report(`${SUBMITTING_BROWSER_COUNT} browsers submitting at once`, first_run.durations, first_run.failures)

  const after_first = await instructor_call('whiteboard_status')
  console.log(`\n  gallery now holds ${after_first.submission_count} drawings`)

  /* ---------- The same 65 browsers replacing their work ---------- */

  const replacement_run = await run_in_parallel(SUBMITTING_BROWSER_COUNT, (index) =>
    submit_as_browser(index, 'group, revised'),
  )
  report(
    `${SUBMITTING_BROWSER_COUNT} browsers replacing their drawing at once`,
    replacement_run.durations,
    replacement_run.failures,
  )

  const after_replacement = await instructor_call('whiteboard_status')
  console.log(`\n  gallery still holds ${after_replacement.submission_count} drawings`)

  /* ---------- What the instructor's gallery costs to poll ---------- */

  const poll_started_at = performance.now()
  const index_rows = await instructor_call('whiteboard_gallery_index')
  const index_milliseconds = performance.now() - poll_started_at

  const thumbnails_started_at = performance.now()
  const thumbnail_rows = await instructor_call('whiteboard_thumbnails', {
    p_browser_submission_ids: browser_ids,
  })
  const thumbnails_milliseconds = performance.now() - thumbnails_started_at

  console.log('\nInstructor gallery')
  console.log(`  index of ${index_rows.length} drawings      ${index_milliseconds.toFixed(0)} ms`)
  console.log(`  all ${thumbnail_rows.length} thumbnails at once  ${thumbnails_milliseconds.toFixed(0)} ms`)
  console.log(
    `  (the running gallery only refetches thumbnails that changed, so a settled poll costs the index alone)`,
  )

  /* ---------- Put everything back ---------- */

  console.log('\nClearing the gallery and closing submissions.')
  const cleared = await instructor_call('whiteboard_clear_all')
  await instructor_call('whiteboard_set_submissions_open', { p_submissions_are_open: false })
  console.log(`  deleted ${cleared.deleted_count} drawings`)

  const total_failures =
    visitor_run.failures.length + first_run.failures.length + replacement_run.failures.length
  const expected_count = Number(after_replacement.submission_count)

  console.log('')
  if (total_failures === 0 && expected_count === SUBMITTING_BROWSER_COUNT) {
    console.log('Load test passed: no failures, and every browser held exactly one entry.')
  } else {
    console.log(
      `Load test found problems: ${total_failures} failed requests, gallery held ${expected_count} of ${SUBMITTING_BROWSER_COUNT}.`,
    )
    process.exit(1)
  }
}

main().catch((problem) => {
  console.error('\nThe load test could not finish:\n', problem)
  process.exit(1)
})
