import * as pdfjsLib from 'pdfjs-dist'
import type { FileEntry } from '../types'

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

const INVOICE_KEYWORDS_FILENAME = ['发票', 'invoice', 'fapiao']
const INVOICE_KEYWORDS_CONTENT = [
  '发票代码',
  '统一社会信用代码',
  '纳税人识别号',
  '增值税',
  '专用发票',
  '普通发票',
  '电子发票',
]

export async function detectInvoice(entry: FileEntry): Promise<boolean> {
  const { ext, name, file } = entry

  // Rule 1: OFD files are always invoices
  if (ext === 'ofd') return true

  // Rule 2: filename keywords
  const nameLower = name.toLowerCase()
  if (INVOICE_KEYWORDS_FILENAME.some((kw) => nameLower.includes(kw.toLowerCase()))) {
    return true
  }

  // Rule 3: PDF content scan (first page text)
  if (ext === 'pdf') {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      const page = await pdf.getPage(1)
      const textContent = await page.getTextContent()
      const text = textContent.items
        .map((item) => ('str' in item ? item.str : ''))
        .join('')
      if (INVOICE_KEYWORDS_CONTENT.some((kw) => text.includes(kw))) {
        return true
      }
    } catch {
      // If parsing fails, fall through to default
    }
  }

  return false
}
