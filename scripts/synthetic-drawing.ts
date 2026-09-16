/*
 * Builds real, valid PNG files in Node so that the probe and the load
 * test can push the same kind of payload a browser would, without
 * needing a canvas.  The image is a plain coloured rectangle; when a
 * larger file is wanted, a text chunk is appended as filler, which is
 * how a PNG is padded without making it invalid.
 */

import { deflateSync, crc32 } from 'node:zlib'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function png_chunk(chunk_type: string, payload: Buffer): Buffer {
  const length_field = Buffer.alloc(4)
  length_field.writeUInt32BE(payload.length, 0)

  const type_and_payload = Buffer.concat([Buffer.from(chunk_type, 'latin1'), payload])

  const crc_field = Buffer.alloc(4)
  crc_field.writeUInt32BE(crc32(type_and_payload), 0)

  return Buffer.concat([length_field, type_and_payload, crc_field])
}

function image_header(width: number, height: number): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.writeUInt8(8, 8) // bit depth
  header.writeUInt8(2, 9) // colour type 2 is truecolour RGB
  header.writeUInt8(0, 10) // compression
  header.writeUInt8(0, 11) // filter
  header.writeUInt8(0, 12) // no interlacing
  return png_chunk('IHDR', header)
}

function image_data(width: number, height: number): Buffer {
  const bytes_per_row = width * 3 + 1 // one filter byte, then RGB triples
  const raw = Buffer.alloc(bytes_per_row * height, 0)

  for (let row = 0; row < height; row += 1) {
    const row_start = row * bytes_per_row
    raw[row_start] = 0 // filter type: none
    // A soft vertical gradient, so the file is not entirely uniform.
    const shade = 200 + Math.floor((row / Math.max(height - 1, 1)) * 40)
    raw.fill(shade, row_start + 1, row_start + bytes_per_row)
  }

  return png_chunk('IDAT', deflateSync(raw, { level: 6 }))
}

export interface SyntheticPngOptions {
  /** Pad the file with a text chunk until the base64 form is about this long. */
  pad_to_base64_characters?: number
}

export function make_synthetic_png_base64(
  width: number,
  height: number,
  options: SyntheticPngOptions = {},
): string {
  const core = Buffer.concat([PNG_SIGNATURE, image_header(width, height), image_data(width, height)])
  const end = png_chunk('IEND', Buffer.alloc(0))

  const target_characters = options.pad_to_base64_characters
  if (target_characters === undefined) {
    return Buffer.concat([core, end]).toString('base64')
  }

  // Base64 needs 4 characters for every 3 bytes, so work backwards from
  // the character target to the number of filler bytes required.
  const target_bytes = Math.floor((target_characters * 3) / 4)
  const filler_bytes = target_bytes - core.length - end.length - 12 - 8 // chunk overhead + keyword
  if (filler_bytes <= 0) {
    return Buffer.concat([core, end]).toString('base64')
  }

  const filler = png_chunk(
    'tEXt',
    Buffer.concat([Buffer.from('Comment\0', 'latin1'), Buffer.alloc(filler_bytes, 0x61)]),
  )

  return Buffer.concat([core, filler, end]).toString('base64')
}
