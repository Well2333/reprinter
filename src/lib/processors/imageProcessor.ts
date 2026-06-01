import type { PDFDocument } from 'pdf-lib'
import type { RasterPageData } from '../../types'

/**
 * Load an image file (JPG/PNG/WebP/BMP) and return raster page data.
 * We read image dimensions from a temporary Image element.
 */
export async function processImage(
  file: File,
  _targetDoc: PDFDocument
): Promise<RasterPageData[]> {
  const arrayBuffer = await file.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)

  const mimeType = file.type.startsWith('image/jpeg')
    ? 'image/jpeg'
    : 'image/png'

  // Get image dimensions
  const { width, height } = await getImageDimensions(file)

  return [
    {
      type: 'raster' as const,
      imageBytes: bytes,
      mimeType,
      width,
      height,
    },
  ]
}

function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('无法读取图片尺寸'))
    }
    img.src = url
  })
}
