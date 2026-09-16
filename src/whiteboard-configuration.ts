/*
 * Every setting worth changing lives here.  Changing any of them means
 * rebuilding and redeploying the site.
 */

/*
 * The instructor password.
 *
 * This is deliberately visible to anyone who reads the site's source.
 * It is a convenience gate that keeps students from wandering into the
 * gallery, not a security control: the gallery operations are reachable
 * through the Data API without it.  That trade-off is what lets the whole
 * app run as a static page with no server to maintain.
 */
export const INSTRUCTOR_PASSWORD = 'the_secret_word'

/* The board is always 4:3 and always exports at this resolution. */
export const BOARD_WIDTH_IN_PIXELS = 1200
export const BOARD_HEIGHT_IN_PIXELS = 900

/* The gallery thumbnail is the same drawing at a quarter of the size. */
export const THUMBNAIL_WIDTH_IN_PIXELS = 300
export const THUMBNAIL_HEIGHT_IN_PIXELS = 225

/* Matching the limits the database enforces, so the browser can say so first. */
export const MAXIMUM_FULL_PNG_BASE64_CHARACTERS = 1_398_104 // 1 MiB
export const MAXIMUM_THUMBNAIL_PNG_BASE64_CHARACTERS = 136_536 // 100 KiB

/* How often the gallery looks for new drawings while it is on screen. */
export const GALLERY_REFRESH_INTERVAL_IN_MILLISECONDS = 5_000

/* Ink colours, chosen to stay distinguishable on a projector. */
export const INK_COLORS = [
  { name: 'Black', value: '#000000' },
  { name: 'Blue', value: '#2851C2' },
  { name: 'Red', value: '#C2281F' },
  { name: 'Green', value: '#009E73' },
] as const

/* Pen widths in board pixels. */
export const INK_THICKNESSES = [
  { name: 'Thin', value: 4 },
  { name: 'Medium', value: 9 },
  { name: 'Thick', value: 18 },
] as const

/* The eraser is wider than the pen at the same setting, as a real one is. */
export const ERASER_WIDTH_MULTIPLIER = 4
