import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocument, PDFEmbeddedPage } from 'pdf-lib'
import type { EmbeddedPageData, RasterPageData } from '../../types'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

const PDF_RASTER_SCALE = 2 // 2× DPI for clarity

// CJK fonts require cMaps to render/extract correctly
const CMAP_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/'
const CMAP_PACKED = true

/**
 * Embed all pages of a PDF file into the target PDFDocument (vector mode).
 * Used for non-invoice files only.
 * Uses CropBox for visible dimensions so centering math is correct,
 * and stores MediaBox + crop offsets for proper drawing in builder.ts.
 */
export async function processPdf(
  file: File,
  targetDoc: PDFDocument
): Promise<EmbeddedPageData[]> {
  const { PDFDocument: PDFLib } = await import('pdf-lib')

  const arrayBuffer = await file.arrayBuffer()
  const srcDoc = await PDFLib.load(arrayBuffer, { ignoreEncryption: true })
  const embeddedPages = await targetDoc.embedPages(srcDoc.getPages())

  return embeddedPages.map((embeddedPage: PDFEmbeddedPage, i: number) => {
    const srcPage = srcDoc.getPage(i)

    // MediaBox: the full physical page (what embedPages embeds)
    const { width: mediaWidth, height: mediaHeight } = srcPage.getSize()

    // CropBox: the visible/printed area. Falls back to MediaBox if not set.
    const cropBox = srcPage.getCropBox()
    const cropX = cropBox.x
    const cropY = cropBox.y
    const cropW = cropBox.width
    const cropH = cropBox.height

    // Sanity-check: if CropBox equals MediaBox or is degenerate, use MediaBox
    const visibleWidth = cropW > 0 ? cropW : mediaWidth
    const visibleHeight = cropH > 0 ? cropH : mediaHeight

    return {
      type: 'embedded' as const,
      embeddedPage,
      width: visibleWidth,
      height: visibleHeight,
      cropX,
      cropY,
      mediaWidth,
      mediaHeight,
    }
  })
}

/**
 * Rasterize all pages of a PDF file using PDF.js (image mode).
 * Used for invoice files to ensure no editable text/vector elements remain,
 * and to naturally handle CropBox cropping via the renderer.
 */
export async function processPdfRaster(file: File): Promise<RasterPageData[]> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({
    data: arrayBuffer,
    cMapUrl: CMAP_URL,
    cMapPacked: CMAP_PACKED,
  }).promise
  const results: RasterPageData[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: PDF_RASTER_SCALE })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法获取Canvas上下文')
    await page.render({ canvasContext: ctx, viewport }).promise
    results.push({
      type: 'raster' as const,
      imageBytes: canvasToBytes(canvas),
      mimeType: 'image/png' as const,
      width: canvas.width,
      height: canvas.height,
    })
  }

  return results
}

function canvasToBytes(canvas: HTMLCanvasElement): Uint8Array {
  const dataUrl = canvas.toDataURL('image/png')
  const base64 = dataUrl.split(',')[1]
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
