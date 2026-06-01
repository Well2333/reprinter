import * as pdfjsLib from 'pdfjs-dist'
import type { FileEntry } from '../types'

// Reuse worker config from detector (already set globally)
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

const PREVIEW_SCALE = 1.5

/**
 * Generate a preview Data URL for the first page of any supported file.
 */
export async function generatePreview(entry: FileEntry): Promise<string> {
  const { ext, file } = entry

  if (ext === 'pdf') {
    return renderPdfPreview(file)
  }

  if (ext === 'ofd') {
    return renderOfdPreview(file)
  }

  // Images: use FileReader directly
  if (['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'].includes(ext)) {
    return readFileAsDataUrl(file)
  }

  return ''
}

async function renderPdfPreview(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const page = await pdf.getPage(1)
  const viewport = page.getViewport({ scale: PREVIEW_SCALE })

  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')!
  await page.render({ canvasContext: ctx, viewport }).promise
  return canvas.toDataURL('image/png')
}

async function renderOfdPreview(file: File): Promise<string> {
  try {
    // Dynamic import to avoid hard dependency at load time
    const { renderOfd } = await import('./processors/ofdProcessor')
    return renderOfd(file, true)
  } catch {
    return ''
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
}
