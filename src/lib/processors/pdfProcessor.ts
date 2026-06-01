import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocument, PDFEmbeddedPage } from 'pdf-lib'
import type { EmbeddedPageData } from '../../types'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

/**
 * Embed all pages of a PDF file into the target PDFDocument.
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
