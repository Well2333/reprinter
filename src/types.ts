export interface FileEntry {
  id: string
  file: File
  name: string
  ext: string
  isInvoice: boolean
  autoDetected: boolean
  copies: number
  previewUrl: string
  status: 'loading' | 'ready' | 'error'
  errorMsg?: string
}

export interface Settings {
  outputFileName: string
}

export type ProcessedPageType = 'embedded' | 'raster'

export interface EmbeddedPageData {
  type: 'embedded'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  embeddedPage: any // PDFEmbeddedPage — typed at usage site to avoid pdf-lib import cycle
  /** Visible width in pts (CropBox), used for scale/centering math */
  width: number
  /** Visible height in pts (CropBox), used for scale/centering math */
  height: number
  /** CropBox x origin in MediaBox coordinates */
  cropX: number
  /** CropBox y origin in MediaBox coordinates */
  cropY: number
  /** Full MediaBox width — needed to draw the embedded page at correct size */
  mediaWidth: number
  /** Full MediaBox height */
  mediaHeight: number
}

export interface RasterPageData {
  type: 'raster'
  imageBytes: Uint8Array
  mimeType: 'image/png' | 'image/jpeg'
  width: number
  height: number
}

export type ProcessedPage = EmbeddedPageData | RasterPageData
