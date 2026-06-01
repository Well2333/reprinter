import { PDFDocument, rgb } from 'pdf-lib'
import type { FileEntry, ProcessedPage, EmbeddedPageData, RasterPageData } from '../types'
import { processPdf, processPdfRaster } from './processors/pdfProcessor'
import { processImage } from './processors/imageProcessor'
import { processOfd } from './processors/ofdProcessor'

// A4 dimensions in points (1pt = 1/72 inch)
const A4_WIDTH = 595.28
const A4_HEIGHT = 841.89

export interface BuildProgress {
  current: number
  total: number
  label: string
}

/**
 * Build the merged PDF from all file entries.
 * Calls onProgress with each step.
 */
export async function buildPdf(
  files: FileEntry[],
  onProgress?: (p: BuildProgress) => void
): Promise<Uint8Array> {
  const outputDoc = await PDFDocument.create()

  const totalSteps = files.reduce((sum, f) => sum + f.copies, 0)
  let step = 0

  for (const entry of files) {
    onProgress?.({ current: step, total: totalSteps, label: `处理: ${entry.name}` })

    let pages: ProcessedPage[]
    try {
      pages = await getProcessedPages(entry, outputDoc)
    } catch (err) {
      throw new Error(`处理文件 "${entry.name}" 失败: ${err instanceof Error ? err.message : String(err)}`)
    }

    for (let c = 0; c < entry.copies; c++) {
      for (const pageData of pages) {
        if (entry.isInvoice) {
          await appendInvoicePage(outputDoc, pageData)
        } else {
          await appendDirectPage(outputDoc, pageData)
        }
      }
      step++
      onProgress?.({ current: step, total: totalSteps, label: `写入: ${entry.name} (${c + 1}/${entry.copies})` })
    }
  }

  return outputDoc.save()
}

async function getProcessedPages(
  entry: FileEntry,
  outputDoc: PDFDocument
): Promise<ProcessedPage[]> {
  const { ext } = entry

  if (ext === 'pdf') {
    // Invoice PDFs are rasterized to avoid editable elements and CropBox cropping issues
    if (entry.isInvoice) {
      return processPdfRaster(entry.file)
    }
    return processPdf(entry.file, outputDoc)
  }

  if (ext === 'ofd') {
    return processOfd(entry.file, outputDoc)
  }

  // All image formats
  if (['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'].includes(ext)) {
    return processImage(entry.file, outputDoc)
  }

  throw new Error(`不支持的格式: .${ext}`)
}

/**
 * Append page directly (non-invoice): preserves original visible size (CropBox).
 */
async function appendDirectPage(
  outputDoc: PDFDocument,
  pageData: ProcessedPage
): Promise<void> {
  if (pageData.type === 'embedded') {
    const data = pageData as EmbeddedPageData
    // Output page size = visible CropBox area
    const page = outputDoc.addPage([data.width, data.height])
    // Position the embedded page so the CropBox area maps to (0,0)
    // drawPage draws the full MediaBox; shift so CropBox origin is at (0,0)
    const scaleX = data.width / data.mediaWidth
    const scaleY = data.height / data.mediaHeight
    page.drawPage(data.embeddedPage, {
      x: -data.cropX * scaleX,
      y: -data.cropY * scaleY,
      width: data.mediaWidth * scaleX,
      height: data.mediaHeight * scaleY,
    })
  } else {
    const data = pageData as RasterPageData
    const image = data.mimeType === 'image/jpeg'
      ? await outputDoc.embedJpg(data.imageBytes)
      : await outputDoc.embedPng(data.imageBytes)

    // Use pixel dimensions converted to points (assuming 96dpi screen)
    const ptWidth = (data.width / 96) * 72
    const ptHeight = (data.height / 96) * 72
    const page = outputDoc.addPage([ptWidth, ptHeight])
    page.drawImage(image, { x: 0, y: 0, width: ptWidth, height: ptHeight })
  }
}

/**
 * Append page as invoice: center content on A4, scale to fit if needed.
 *
 * Algorithm (from architecture.md):
 *   scale = min(A4_WIDTH / srcW, A4_HEIGHT / srcH)
 *   fitW = srcW * scale,  fitH = srcH * scale
 *   offsetX = (A4_WIDTH - fitW) / 2
 *   offsetY = (A4_HEIGHT - fitH) / 2
 */
async function appendInvoicePage(
  outputDoc: PDFDocument,
  pageData: ProcessedPage
): Promise<void> {
  const page = outputDoc.addPage([A4_WIDTH, A4_HEIGHT])

  // White background
  page.drawRectangle({
    x: 0, y: 0,
    width: A4_WIDTH, height: A4_HEIGHT,
    color: rgb(1, 1, 1),
  })

  if (pageData.type === 'embedded') {
    const data = pageData as EmbeddedPageData
    // Scale based on CropBox visible area
    const srcW = data.width
    const srcH = data.height
    const scale = Math.min(A4_WIDTH / srcW, A4_HEIGHT / srcH)
    const fitW = srcW * scale
    const fitH = srcH * scale
    const offsetX = (A4_WIDTH - fitW) / 2
    const offsetY = (A4_HEIGHT - fitH) / 2

    // Draw the full MediaBox but positioned so CropBox aligns to (offsetX, offsetY)
    // CropBox origin (cropX, cropY) in source maps to (offsetX, offsetY) in dest
    const drawW = data.mediaWidth * scale
    const drawH = data.mediaHeight * scale
    const drawX = offsetX - data.cropX * scale
    const drawY = offsetY - data.cropY * scale

    page.drawPage(data.embeddedPage, {
      x: drawX,
      y: drawY,
      width: drawW,
      height: drawH,
    })
  } else {
    const data = pageData as RasterPageData
    const image = data.mimeType === 'image/jpeg'
      ? await outputDoc.embedJpg(data.imageBytes)
      : await outputDoc.embedPng(data.imageBytes)

    const srcW = data.width
    const srcH = data.height
    const scale = Math.min(A4_WIDTH / srcW, A4_HEIGHT / srcH)
    const fitW = srcW * scale
    const fitH = srcH * scale
    const offsetX = (A4_WIDTH - fitW) / 2
    const offsetY = (A4_HEIGHT - fitH) / 2

    page.drawImage(image, {
      x: offsetX,
      y: offsetY,
      width: fitW,
      height: fitH,
    })
  }
}
