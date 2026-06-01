import type { PDFDocument } from 'pdf-lib'
import type { RasterPageData } from '../../types'
import { renderOfdPage, getOfdPageCount } from '../ofdRenderer'

const OFD_RENDER_SCALE = 2 // 2× DPI for clarity
const OFD_PREVIEW_SCALE = 1.5

/**
 * Render all pages of an OFD file to RasterPageData[].
 * Uses the built-in JSZip-based renderer (no commercial library needed).
 */
export async function processOfd(
  file: File,
  _targetDoc: PDFDocument
): Promise<RasterPageData[]> {
  const count = await getOfdPageCount(file)
  const results: RasterPageData[] = []

  for (let i = 0; i < count; i++) {
    const canvas = await renderOfdPage(file, i, OFD_RENDER_SCALE)
    const bytes = canvasToBytes(canvas)
    results.push({
      type: 'raster' as const,
      imageBytes: bytes,
      mimeType: 'image/png' as const,
      width: canvas.width,
      height: canvas.height,
    })
  }

  return results
}

/**
 * Render OFD first page to a Data URL for preview thumbnail.
 */
export async function renderOfd(file: File, previewOnly: boolean): Promise<string> {
  const scale = previewOnly ? OFD_PREVIEW_SCALE : OFD_RENDER_SCALE
  const canvas = await renderOfdPage(file, 0, scale)
  return canvas.toDataURL('image/png')
}

function canvasToBytes(canvas: HTMLCanvasElement): Uint8Array {
  const dataUrl = canvas.toDataURL('image/png')
  const base64 = dataUrl.split(',')[1]
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
