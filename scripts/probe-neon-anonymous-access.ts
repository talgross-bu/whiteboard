/*
 * Confirms that an anonymous browser can drive every database function
 * this app relies on, including a full-size image at the 1 MiB ceiling.
 * Run it once after applying database/setup-whiteboard-database.sql:
 *
 *     npm run probe-neon
 *
 * It leaves the gallery empty and submissions closed.
 */

import 'dotenv/config'
import { create_whiteboard_client } from './shared-test-client.ts'
import { make_synthetic_png_base64 } from './synthetic-drawing.ts'

const client = create_whiteboard_client()

let checks_passed = 0
let checks_failed = 0

function check(description: string, condition: boolean, detail?: unknown) {
  if (condition) {
    checks_passed += 1
    console.log(`  pass  ${description}`)
  } else {
    checks_failed += 1
    console.log(`  FAIL  ${description}`)
    if (detail !== undefined) console.log(`        ${JSON.stringify(detail)}`)
  }
}

async function call(function_name: string, args: Record<string, unknown> = {}) {
  const { data, error } = await client.rpc(function_name, args)
  if (error) throw new Error(`${function_name}: ${error.message ?? JSON.stringify(error)}`)
  return data as any
}

async function main() {
  console.log('Probing Neon anonymous access\n')

  console.log('Status is readable')
  const initial_status = await call('whiteboard_status')
  check('whiteboard_status returns a generation', typeof initial_status.gallery_generation === 'number', initial_status)
  check('whiteboard_status returns an open flag', typeof initial_status.submissions_are_open === 'boolean', initial_status)

  console.log('\nSubmissions are refused while closed')
  await call('whiteboard_set_submissions_open', { p_submissions_are_open: false })
  const small_png = make_synthetic_png_base64(240, 180)
  const browser_id = crypto.randomUUID()
  const closed_attempt = await call('whiteboard_submit', {
    p_browser_submission_id: browser_id,
    p_spokesperson_name: 'Probe Script',
    p_full_png_base64: small_png,
    p_thumbnail_png_base64: small_png,
    p_gallery_generation: initial_status.gallery_generation,
  })
  check('a closed board rejects the submission', closed_attempt.result_status === 'submissions_closed', closed_attempt)

  console.log('\nA full-size drawing survives the round trip')
  const opened = await call('whiteboard_set_submissions_open', { p_submissions_are_open: true })
  const generation = opened.gallery_generation

  // The largest payload the database will accept, which is also the
  // largest request the Data API will ever be asked to carry.
  const large_png = make_synthetic_png_base64(1200, 900, { pad_to_base64_characters: 1_390_000 })
  console.log(`  full image is ${large_png.length.toLocaleString()} base64 characters`)

  const first_save = await call('whiteboard_submit', {
    p_browser_submission_id: browser_id,
    p_spokesperson_name: '  Probe Script  ',
    p_full_png_base64: large_png,
    p_thumbnail_png_base64: small_png,
    p_gallery_generation: generation,
  })
  check('a 1 MiB drawing is accepted', first_save.result_status === 'saved', first_save)
  check('the first save is revision 1', first_save.revision_number === 1, first_save)

  const index_after_save = await call('whiteboard_gallery_index')
  check('the gallery lists one drawing', index_after_save.length === 1, index_after_save.length)
  check('the name is stored trimmed', index_after_save[0]?.spokesperson_name === 'Probe Script', index_after_save[0])

  const fetched = await call('whiteboard_full_image', { p_browser_submission_id: browser_id })
  check('the full image comes back byte for byte', fetched.full_png_base64 === large_png)

  console.log('\nResubmitting replaces rather than duplicates')
  const second_save = await call('whiteboard_submit', {
    p_browser_submission_id: browser_id,
    p_spokesperson_name: 'Probe Script',
    p_full_png_base64: small_png,
    p_thumbnail_png_base64: small_png,
    p_gallery_generation: generation,
  })
  check('the replacement is revision 2', second_save.revision_number === 2, second_save)
  check('the original position is kept', second_save.first_submitted_at === first_save.first_submitted_at)
  const index_after_replace = await call('whiteboard_gallery_index')
  check('there is still only one drawing', index_after_replace.length === 1, index_after_replace.length)

  console.log('\nOversized and malformed input is refused')
  const too_large = 'iVBORw0KGgo' + 'A'.repeat(1_400_000)
  const oversize_result = await client.rpc('whiteboard_submit', {
    p_browser_submission_id: browser_id,
    p_spokesperson_name: 'Probe Script',
    p_full_png_base64: too_large,
    p_thumbnail_png_base64: small_png,
    p_gallery_generation: generation,
  })
  check('an oversized drawing is rejected', oversize_result.error !== null && oversize_result.error !== undefined)

  const blank_name_result = await client.rpc('whiteboard_submit', {
    p_browser_submission_id: browser_id,
    p_spokesperson_name: '   ',
    p_full_png_base64: small_png,
    p_thumbnail_png_base64: small_png,
    p_gallery_generation: generation,
  })
  check('a blank name is rejected', blank_name_result.error !== null && blank_name_result.error !== undefined)

  const not_a_png_result = await client.rpc('whiteboard_submit', {
    p_browser_submission_id: browser_id,
    p_spokesperson_name: 'Probe Script',
    p_full_png_base64: 'bm90IGEgcG5n',
    p_thumbnail_png_base64: small_png,
    p_gallery_generation: generation,
  })
  check('a non-PNG payload is rejected', not_a_png_result.error !== null && not_a_png_result.error !== undefined)

  console.log('\nThumbnails are fetched by identifier')
  const thumbnails = await call('whiteboard_thumbnails', { p_browser_submission_ids: [browser_id] })
  check('one thumbnail comes back', thumbnails.length === 1, thumbnails.length)
  check('an unknown identifier returns nothing', (await call('whiteboard_thumbnails', { p_browser_submission_ids: [crypto.randomUUID()] })).length === 0)

  console.log('\nClearing invalidates work that was already in flight')
  const cleared = await call('whiteboard_clear_all')
  check('the deleted count is reported', cleared.deleted_count === 1, cleared)
  check('the generation advances', cleared.gallery_generation === generation + 1, cleared)
  check('the open setting survives the clear', cleared.submissions_are_open === true, cleared)

  const stale_save = await call('whiteboard_submit', {
    p_browser_submission_id: browser_id,
    p_spokesperson_name: 'Probe Script',
    p_full_png_base64: small_png,
    p_thumbnail_png_base64: small_png,
    p_gallery_generation: generation,
  })
  check('a save from before the clear is refused', stale_save.result_status === 'gallery_was_cleared', stale_save)
  check('the refusal reports the new generation', stale_save.gallery_generation === generation + 1, stale_save)

  console.log('\nLeaving the board as it was found')
  await call('whiteboard_clear_all')
  await call('whiteboard_set_submissions_open', { p_submissions_are_open: false })
  const final_status = await call('whiteboard_status')
  check('the gallery is empty', final_status.submission_count === 0 || final_status.submission_count === '0', final_status)
  check('submissions are closed', final_status.submissions_are_open === false, final_status)

  console.log(`\n${checks_passed} passed, ${checks_failed} failed`)
  if (checks_failed > 0) process.exit(1)
}

main().catch((problem) => {
  console.error('\nThe probe could not finish:\n', problem)
  process.exit(1)
})
