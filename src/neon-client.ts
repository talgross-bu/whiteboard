/*
 * The only place the app talks to Neon.  Each function here wraps exactly
 * one of the seven database functions, so the shape of every call and
 * every reply is written down once.
 *
 * The browser never holds a Postgres password.  The SDK fetches a
 * short-lived anonymous token by itself and attaches it to each request.
 */

import { createClient } from '@neondatabase/neon-js'

const auth_url = import.meta.env.VITE_NEON_AUTH_URL
const data_api_url = import.meta.env.VITE_NEON_DATA_API_URL

if (!auth_url || !data_api_url) {
  throw new Error(
    'VITE_NEON_AUTH_URL and VITE_NEON_DATA_API_URL are missing. Copy .env.example to .env for local work, or set them as repository variables for the deployed site.',
  )
}

const client = createClient({
  auth: { url: auth_url, allowAnonymous: true },
  dataApi: { url: data_api_url },
})

async function call_database_function<ResultType>(
  function_name: string,
  args: Record<string, unknown> = {},
): Promise<ResultType> {
  const { data, error } = await client.rpc(function_name, args)
  if (!error) return data as ResultType

  const message = error.message ?? ''

  // A browser reports a blocked cross-origin request and an unplugged
  // network cable identically, so say what both could mean rather than
  // passing "Failed to fetch" on to whoever is looking at the screen.
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    throw new Error(
      'Could not reach the whiteboard database. Check the connection, and check that this site’s address is listed in the Data API’s allowed origins in the Neon console.',
    )
  }

  // PostgREST has not been told about the functions yet.
  if ((error as { code?: string }).code === 'PGRST202') {
    throw new Error(
      'The database is missing its whiteboard functions. Run database/setup-whiteboard-database.sql in Neon, then press Refresh schema cache on the Data API page.',
    )
  }

  throw new Error(message || `The database refused the ${function_name} request.`)
}

/* ---------- Types returned by the database ---------- */

export interface WhiteboardStatus {
  submissions_are_open: boolean
  gallery_generation: number
  submission_count: number
  latest_change_at: string | null
}

export interface GalleryEntry {
  browser_submission_id: string
  spokesperson_name: string
  first_submitted_at: string
  last_updated_at: string
  revision_number: number
}

export interface ThumbnailRecord {
  browser_submission_id: string
  thumbnail_png_base64: string
  last_updated_at: string
}

export type SubmitResult =
  | {
      result_status: 'saved'
      gallery_generation: number
      revision_number: number
      first_submitted_at: string
      last_updated_at: string
    }
  | { result_status: 'submissions_closed'; gallery_generation: number }
  | { result_status: 'gallery_was_cleared'; gallery_generation: number }

export type FullImageResult =
  | { result_status: 'not_found' }
  | {
      result_status: 'found'
      browser_submission_id: string
      spokesperson_name: string
      full_png_base64: string
      last_updated_at: string
    }

export interface ClearResult {
  deleted_count: number
  gallery_generation: number
  submissions_are_open: boolean
}

/* ---------- The seven operations ---------- */

export function fetch_whiteboard_status(): Promise<WhiteboardStatus> {
  return call_database_function<WhiteboardStatus>('whiteboard_status')
}

export function submit_drawing(submission: {
  browser_submission_id: string
  spokesperson_name: string
  full_png_base64: string
  thumbnail_png_base64: string
  gallery_generation: number
}): Promise<SubmitResult> {
  return call_database_function<SubmitResult>('whiteboard_submit', {
    p_browser_submission_id: submission.browser_submission_id,
    p_spokesperson_name: submission.spokesperson_name,
    p_full_png_base64: submission.full_png_base64,
    p_thumbnail_png_base64: submission.thumbnail_png_base64,
    p_gallery_generation: submission.gallery_generation,
  })
}

export function fetch_gallery_index(): Promise<GalleryEntry[]> {
  return call_database_function<GalleryEntry[]>('whiteboard_gallery_index')
}

export function fetch_thumbnails(browser_submission_ids: string[]): Promise<ThumbnailRecord[]> {
  if (browser_submission_ids.length === 0) return Promise.resolve([])
  return call_database_function<ThumbnailRecord[]>('whiteboard_thumbnails', {
    p_browser_submission_ids: browser_submission_ids,
  })
}

export function fetch_full_image(browser_submission_id: string): Promise<FullImageResult> {
  return call_database_function<FullImageResult>('whiteboard_full_image', {
    p_browser_submission_id: browser_submission_id,
  })
}

export function set_submissions_open(
  submissions_are_open: boolean,
): Promise<{ submissions_are_open: boolean; gallery_generation: number }> {
  return call_database_function('whiteboard_set_submissions_open', {
    p_submissions_are_open: submissions_are_open,
  })
}

export function clear_all_drawings(): Promise<ClearResult> {
  return call_database_function<ClearResult>('whiteboard_clear_all')
}
