/*
 * Creates the same Neon client the browser uses, but reading the two
 * endpoint URLs from .env so the probe and the load test exercise the
 * real anonymous path rather than a privileged connection.
 */

import { createClient } from '@neondatabase/neon-js'

export function create_whiteboard_client() {
  const auth_url = process.env.VITE_NEON_AUTH_URL
  const data_api_url = process.env.VITE_NEON_DATA_API_URL

  if (!auth_url || !data_api_url) {
    throw new Error(
      'VITE_NEON_AUTH_URL and VITE_NEON_DATA_API_URL must be set. Copy .env.example to .env and fill in the two URLs from the Neon console.',
    )
  }

  return createClient({
    auth: { url: auth_url, allowAnonymous: true },
    dataApi: { url: data_api_url },
  })
}
