/**
 * Pure-browser OFD renderer using JSZip + DOMParser + Canvas.
 * Handles GB/T 33190-2016 OFD coordinate system (top-left origin, Y-down, unit = mm).
 * Supports TextObject, PathObject, ImageObject, PageBlock nesting, CTM, and basic colors.
 */
import JSZip from 'jszip'

const MM_TO_PX_BASE = 96 / 25.4 // px per mm at 96 DPI ≈ 3.7795

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OfdDoc {
  zip: JSZip
  docDir: string
  docDom: Document
  pageList: PageRef[]
  commonPageArea: { width: number; height: number }
  /** ResourceID → absolute ZIP path */
  resources: Map<string, ResourceEntry>
  /** FontID → CSS font-family string */
  fonts: Map<string, string>
  /** TemplateID → { baseLoc, zOrder } */
  templates: Map<string, { baseLoc: string; zOrder: string }>
  /** DrawParamID → resolved DrawParamEntry */
  drawParams: Map<string, DrawParamEntry>
}

interface PageRef {
  id: string
  baseLoc: string
}

interface ResourceEntry {
  path: string
  mimeType: string
}

interface DrawParamEntry {
  lineWidth: number | null
  strokeColor: string | null
  fillColor: string | null
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Render an OFD page to an HTMLCanvasElement. */
export async function renderOfdPage(
  file: File,
  pageIndex = 0,
  scale = 2
): Promise<HTMLCanvasElement> {
  const doc = await loadOfdDoc(file)
  return renderPage(doc, pageIndex, scale)
}

/** Return the number of pages in an OFD file. */
export async function getOfdPageCount(file: File): Promise<number> {
  const doc = await loadOfdDoc(file)
  return doc.pageList.length
}

// ---------------------------------------------------------------------------
// Document loading
// ---------------------------------------------------------------------------

async function loadOfdDoc(file: File): Promise<OfdDoc> {
  const buffer = await file.arrayBuffer()
  const zip = await JSZip.loadAsync(buffer)
  const parser = new DOMParser()

  // ── OFD.xml ──────────────────────────────────────────────────────────────
  const ofdXmlKey = Object.keys(zip.files).find(k => k.toLowerCase() === 'ofd.xml')
  if (!ofdXmlKey) throw new Error('无效的 OFD 文件：缺少 OFD.xml')
  const ofdXml = await zip.files[ofdXmlKey].async('text')
  const ofdDom = parser.parseFromString(ofdXml, 'text/xml')

  const docRootEl = findEl(ofdDom, 'DocRoot')
  // Strip leading '/' — ZIP entries never start with '/'
  const docRoot = (docRootEl?.textContent?.trim() || 'Doc_0/Document.xml').replace(/^\/+/, '')
  const docDir = docRoot.includes('/') ? docRoot.substring(0, docRoot.lastIndexOf('/') + 1) : ''

  // ── Document.xml ─────────────────────────────────────────────────────────
  const docXmlFile = zip.files[docRoot]
  if (!docXmlFile) throw new Error(`无效的 OFD 文件：缺少 ${docRoot}`)
  const docXml = await docXmlFile.async('text')
  const docDom = parser.parseFromString(docXml, 'text/xml')

  // Common page area (document-level default)
  const physBoxEl = findElIn(docDom, 'PageArea', 'PhysicalBox')
  const [, , pw, ph] = parseBox(physBoxEl?.textContent?.trim())
  const commonPageArea = { width: pw || 210, height: ph || 297 }

  // Page list (Pages > Page elements)
  const pagesEl = findEl(docDom, 'Pages')
  const pageList: PageRef[] = pagesEl
    ? Array.from(pagesEl.children)
        .filter(el => el.localName === 'Page')
        .map(el => ({
          id: el.getAttribute('ID') || '',
          // Strip leading '/' so path concatenation with docDir is correct
          baseLoc: (el.getAttribute('BaseLoc') || '').replace(/^\/+/, ''),
        }))
    : []

  // Template pages (TemplatePage elements in CommonData)
  const templates = new Map<string, { baseLoc: string; zOrder: string }>()
  for (const tp of Array.from(docDom.querySelectorAll('*')).filter(el => el.localName === 'TemplatePage')) {
    const id = tp.getAttribute('ID') || ''
    const rawLoc = (tp.getAttribute('BaseLoc') || '').replace(/^\/+/, '')
    const zOrder = tp.getAttribute('ZOrder') || 'Background'
    if (id && rawLoc) templates.set(id, { baseLoc: rawLoc, zOrder })
  }

  // ── Resources ─────────────────────────────────────────────────────────────
  const resources = new Map<string, ResourceEntry>()
  const fonts = new Map<string, string>()
  const drawParams = new Map<string, DrawParamEntry>()
  await loadResourceFiles(zip, docDom, docDir, resources, fonts, drawParams, parser)

  return { zip, docDir, docDom, pageList, commonPageArea, resources, fonts, templates, drawParams }
}

async function loadResourceFiles(
  zip: JSZip,
  docDom: Document,
  docDir: string,
  resources: Map<string, ResourceEntry>,
  fonts: Map<string, string>,
  drawParams: Map<string, DrawParamEntry>,
  parser: DOMParser
): Promise<void> {
  // Find all resource file references (DocumentRes, PublicRes)
  const resRefs = Array.from(docDom.querySelectorAll('*'))
    .filter(el => el.localName === 'DocumentRes' || el.localName === 'PublicRes')
    .map(el => el.textContent?.trim())
    .filter(Boolean) as string[]

  for (const ref of resRefs) {
    const absPath = ref.startsWith('/') ? ref.slice(1) : docDir + ref
    const resFile = zip.files[absPath]
    if (!resFile) continue

    const resXml = await resFile.async('text')
    const resDom = parser.parseFromString(resXml, 'text/xml')
    const resEl = resDom.documentElement
    const baseLoc = resEl.getAttribute('BaseLoc') || 'Res'
    const absBaseLoc = absPath.includes('/')
      ? absPath.substring(0, absPath.lastIndexOf('/') + 1) + baseLoc + '/'
      : baseLoc + '/'

    // DrawParam resources — parse before fonts/images so they can be referenced
    const rawParams = new Map<string, DrawParamEntry & { relative?: string }>()
    for (const dp of Array.from(resDom.querySelectorAll('*')).filter(el => el.localName === 'DrawParam')) {
      const id = dp.getAttribute('ID') || ''
      const relative = dp.getAttribute('Relative') || ''
      const lwAttr = dp.getAttribute('LineWidth')
      const scEl = Array.from(dp.children).find(c => c.localName === 'StrokeColor') ?? null
      const fcEl = Array.from(dp.children).find(c => c.localName === 'FillColor') ?? null
      rawParams.set(id, {
        lineWidth: lwAttr !== null ? Number(lwAttr) : null,
        strokeColor: parseOfdColorAttr(scEl),
        fillColor: parseOfdColorAttr(fcEl),
        relative: relative || undefined,
      })
    }
    // Resolve inheritance (single-level Relative)
    for (const [id, entry] of rawParams) {
      if (entry.relative) {
        const parent = rawParams.get(entry.relative)
        if (parent) {
          if (entry.lineWidth === null && parent.lineWidth !== null) entry.lineWidth = parent.lineWidth
          if (!entry.strokeColor && parent.strokeColor) entry.strokeColor = parent.strokeColor
          if (!entry.fillColor && parent.fillColor) entry.fillColor = parent.fillColor
        }
      }
      drawParams.set(id, { lineWidth: entry.lineWidth, strokeColor: entry.strokeColor, fillColor: entry.fillColor })
    }

    // MultiMedia resources (images)
    for (const mm of Array.from(resDom.querySelectorAll('*')).filter(el => el.localName === 'MultiMedia')) {
      const id = mm.getAttribute('ID') || ''
      const type = mm.getAttribute('Type') || ''
      if (type === 'Image' || type === 'image') {
        const mediaFile = Array.from(mm.children).find(c => c.localName === 'MediaFile')
        const fileName = mediaFile?.textContent?.trim() || ''
        if (id && fileName) {
          const imgPath = absBaseLoc + fileName
          const mime = /\.png$/i.test(fileName) ? 'image/png'
            : /\.(jpg|jpeg)$/i.test(fileName) ? 'image/jpeg'
            : 'image/png'
          resources.set(id, { path: imgPath, mimeType: mime })
        }
      }
    }

    // Font resources
    for (const font of Array.from(resDom.querySelectorAll('*')).filter(el => el.localName === 'Font')) {
      const id = font.getAttribute('ID') || ''
      const fontName = font.getAttribute('FontName') || font.getAttribute('FamilyName') || ''
      if (id && fontName) {
        fonts.set(id, mapFontName(fontName))
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Page rendering
// ---------------------------------------------------------------------------

async function renderPage(doc: OfdDoc, pageIndex: number, scale: number): Promise<HTMLCanvasElement> {
  if (pageIndex >= doc.pageList.length) {
    throw new Error(`页面索引 ${pageIndex} 超出范围（共 ${doc.pageList.length} 页）`)
  }

  const parser = new DOMParser()
  const pageRef = doc.pageList[pageIndex]
  // baseLoc may be absolute ('/Pages/Page_0/Content.xml') or relative ('Pages/Page_0/Content.xml')
  const rawLoc = pageRef.baseLoc.replace(/^\/+/, '')
  const contentPath = rawLoc.startsWith(doc.docDir) ? rawLoc : doc.docDir + rawLoc

  const contentFile = doc.zip.files[contentPath]
  if (!contentFile) throw new Error(`无法读取页面内容: ${contentPath}`)
  const contentXml = await contentFile.async('text')
  const contentDom = parser.parseFromString(contentXml, 'text/xml')

  // Page physical size (page-level overrides document-level)
  const pagePhysEl = Array.from(contentDom.querySelectorAll('*')).find(el => el.localName === 'PhysicalBox')
  const [, , pageW, pageH] = parseBox(pagePhysEl?.textContent?.trim())
  const width = pageW || doc.commonPageArea.width
  const height = pageH || doc.commonPageArea.height

  const mmToPx = MM_TO_PX_BASE * scale
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * mmToPx)
  canvas.height = Math.round(height * mmToPx)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Load image resources as blob URLs (merge template + page images)
  const imageCache = await preloadImagesFromZip(doc)

  // Helper to render a Content element from a parsed DOM
  const renderContent = async (dom: Document) => {
    const contentEl = Array.from(dom.querySelectorAll('*')).find(el => el.localName === 'Content')
    if (!contentEl) return
    for (const child of Array.from(contentEl.children)) {
      if (child.localName === 'Layer') {
        const dpId = child.getAttribute('DrawParam') || ''
        const inheritedDp = dpId ? (doc.drawParams.get(dpId) ?? null) : null
        await renderBlock(ctx, child, mmToPx, doc, imageCache, inheritedDp)
      }
    }
  }

  // Helper to render one template page
  const renderTemplate = async (tplId: string) => {
    const tpl = doc.templates.get(tplId)
    if (!tpl) return
    const rawLoc2 = tpl.baseLoc.replace(/^\/+/, '')
    const tplPath = rawLoc2.startsWith(doc.docDir) ? rawLoc2 : doc.docDir + rawLoc2
    const tplFile = doc.zip.files[tplPath]
    if (!tplFile) return
    const tplXml = await tplFile.async('text')
    const tplDom = parser.parseFromString(tplXml, 'text/xml')
    await renderContent(tplDom)
  }

  // Collect template references from the page, sorted by ZOrder
  const templateRefs = Array.from(contentDom.querySelectorAll('*'))
    .filter(el => el.localName === 'Template')

  // 1. Background templates
  for (const tRef of templateRefs) {
    const zOrder = tRef.getAttribute('ZOrder') || 'Background'
    if (zOrder === 'Background') {
      await renderTemplate(tRef.getAttribute('TemplateID') || '')
    }
  }

  // 2. Page content
  await renderContent(contentDom)

  // 3. Foreground templates
  for (const tRef of templateRefs) {
    const zOrder = tRef.getAttribute('ZOrder') || 'Background'
    if (zOrder === 'Foreground') {
      await renderTemplate(tRef.getAttribute('TemplateID') || '')
    }
  }

  // Revoke blob URLs
  for (const url of imageCache.values()) URL.revokeObjectURL(url)

  return canvas
}

async function preloadImagesFromZip(doc: OfdDoc): Promise<Map<string, string>> {
  const cache = new Map<string, string>()
  for (const [id, entry] of doc.resources) {
    const zipFile = doc.zip.files[entry.path]
    if (!zipFile) continue
    try {
      const data = await zipFile.async('uint8array')
      const blob = new Blob([data], { type: entry.mimeType })
      cache.set(id, URL.createObjectURL(blob))
    } catch {
      // ignore
    }
  }
  return cache
}

// ---------------------------------------------------------------------------
// Recursive block renderer (handles Layer, PageBlock, and drawing objects)
// ---------------------------------------------------------------------------

async function renderBlock(
  ctx: CanvasRenderingContext2D,
  el: Element,
  mmToPx: number,
  doc: OfdDoc,
  imageCache: Map<string, string>,
  inheritedDp: DrawParamEntry | null = null
): Promise<void> {
  for (const child of Array.from(el.children)) {
    switch (child.localName) {
      case 'Layer':
      case 'PageBlock': {
        // Layers and PageBlocks can have their own DrawParam that overrides parent
        const dpId = child.getAttribute('DrawParam') || ''
        const childDp = dpId ? (doc.drawParams.get(dpId) ?? inheritedDp) : inheritedDp
        await renderBlock(ctx, child, mmToPx, doc, imageCache, childDp)
        break
      }
      case 'TextObject':
        renderTextObject(ctx, child, mmToPx, doc, inheritedDp)
        break
      case 'PathObject':
        renderPathObject(ctx, child, mmToPx, inheritedDp)
        break
      case 'ImageObject':
        await renderImageObject(ctx, child, mmToPx, imageCache)
        break
      // CompositeObject and others: skip
    }
  }
}

// ---------------------------------------------------------------------------
// TextObject
// ---------------------------------------------------------------------------

function renderTextObject(
  ctx: CanvasRenderingContext2D,
  el: Element,
  mmToPx: number,
  doc: OfdDoc,
  _inheritedDp: DrawParamEntry | null
): void {
  const fontSize = Number(el.getAttribute('Size') || '3.5') * mmToPx
  const fontId = el.getAttribute('Font') || ''
  const fontFamily = doc.fonts.get(fontId) || '"SimSun","宋体",serif'

  const fillColorEl = getChildByName(el, 'FillColor')
  const fillColor = parseOfdColor(fillColorEl, '#000')

  ctx.save()
  ctx.font = `${fontSize}px ${fontFamily}`
  ctx.fillStyle = fillColor
  ctx.textBaseline = 'alphabetic'

  // ① Translate to TextObject Boundary origin (bx, by are in mm)
  const [bx, by] = parseBox(el.getAttribute('Boundary'))
  ctx.translate(bx * mmToPx, by * mmToPx)

  // ② Apply CTM (if present) within the boundary-translated space
  const ctm = parseCTM(el.getAttribute('CTM'))
  if (ctm) applyCtm(ctx, ctm, mmToPx)

  for (const tc of Array.from(el.children).filter(c => c.localName === 'TextCode')) {
    const tx = Number(tc.getAttribute('X') || '0')
    const ty = Number(tc.getAttribute('Y') || '0')
    const text = tc.textContent || ''

    const dxAttr = tc.getAttribute('DeltaX')
    if (dxAttr && text.length > 1) {
      const deltas = parseDeltaArray(dxAttr)
      let curX = tx * mmToPx
      for (let i = 0; i < text.length; i++) {
        ctx.fillText(text[i], curX, ty * mmToPx)
        curX += (deltas[i] ?? 0) * mmToPx
      }
    } else {
      ctx.fillText(text, tx * mmToPx, ty * mmToPx)
    }
  }

  ctx.restore()
}

// ---------------------------------------------------------------------------
// PathObject
// ---------------------------------------------------------------------------

function renderPathObject(
  ctx: CanvasRenderingContext2D,
  el: Element,
  mmToPx: number,
  inheritedDp: DrawParamEntry | null
): void {
  const abbrEl = getChildByName(el, 'AbbreviatedData')
  if (!abbrEl) return

  // DrawParam on this element overrides inherited
  const ownDpId = el.getAttribute('DrawParam') || ''

  // Resolve line width: element > own DrawParam > inherited DrawParam > default
  const lwAttr = el.getAttribute('LineWidth')
  const lineWidth = lwAttr !== null
    ? Number(lwAttr) * mmToPx
    : (inheritedDp?.lineWidth ?? 0.353) * mmToPx

  // Fill/stroke flags
  const fillAttr = el.getAttribute('Fill')
  const strokeAttr = el.getAttribute('Stroke')
  const doFill = fillAttr === 'true' || fillAttr === '1'
  // Default stroke = true unless explicitly disabled
  const doStroke = strokeAttr !== 'false' && strokeAttr !== '0'

  // Color: element child > DrawParam > inherited DrawParam > defaults
  const fillColorEl = getChildByName(el, 'FillColor')
  const strokeColorEl = getChildByName(el, 'StrokeColor')
  const fillColor = parseOfdColorAttr(fillColorEl) ?? inheritedDp?.fillColor ?? 'transparent'
  const strokeColor = parseOfdColorAttr(strokeColorEl) ?? inheritedDp?.strokeColor ?? '#000'

  // Unused but consumed to avoid TS warning
  void ownDpId

  ctx.save()
  ctx.lineWidth = lineWidth
  ctx.strokeStyle = strokeColor
  ctx.fillStyle = fillColor ?? 'transparent'

  // Boundary and CTM
  const [bx, by] = parseBox(el.getAttribute('Boundary'))
  ctx.translate(bx * mmToPx, by * mmToPx)
  const ctm = parseCTM(el.getAttribute('CTM'))
  if (ctm) applyCtm(ctx, ctm, mmToPx)

  ctx.beginPath()
  applyOfdPath(ctx, abbrEl.textContent || '', mmToPx)

  if (doFill && fillColor !== 'transparent') ctx.fill()
  if (doStroke) ctx.stroke()

  ctx.restore()
}

function applyOfdPath(ctx: CanvasRenderingContext2D, data: string, mmToPx: number): void {
  const tokens = data.trim().split(/\s+/)
  let i = 0
  while (i < tokens.length) {
    const cmd = tokens[i++]
    switch (cmd) {
      case 'M': {
        const x = Number(tokens[i++]) * mmToPx
        const y = Number(tokens[i++]) * mmToPx
        ctx.moveTo(x, y)
        break
      }
      case 'L': {
        const x = Number(tokens[i++]) * mmToPx
        const y = Number(tokens[i++]) * mmToPx
        ctx.lineTo(x, y)
        break
      }
      case 'B': { // cubic bezier
        const x1 = Number(tokens[i++]) * mmToPx; const y1 = Number(tokens[i++]) * mmToPx
        const x2 = Number(tokens[i++]) * mmToPx; const y2 = Number(tokens[i++]) * mmToPx
        const x3 = Number(tokens[i++]) * mmToPx; const y3 = Number(tokens[i++]) * mmToPx
        ctx.bezierCurveTo(x1, y1, x2, y2, x3, y3)
        break
      }
      case 'Q': { // quadratic bezier
        const x1 = Number(tokens[i++]) * mmToPx; const y1 = Number(tokens[i++]) * mmToPx
        const x2 = Number(tokens[i++]) * mmToPx; const y2 = Number(tokens[i++]) * mmToPx
        ctx.quadraticCurveTo(x1, y1, x2, y2)
        break
      }
      case 'A': {
        // Elliptical arc: rx ry rotateAngle largeArcFlag sweepFlag x y
        // Approximate with a line to the endpoint for now
        i += 5
        const x = Number(tokens[i++]) * mmToPx
        const y = Number(tokens[i++]) * mmToPx
        ctx.lineTo(x, y)
        break
      }
      case 'C':
      case 'Z':
        ctx.closePath()
        break
      default:
        // unknown token — try to skip it (might be a number from previous command)
        break
    }
  }
}

// ---------------------------------------------------------------------------
// ImageObject
// ---------------------------------------------------------------------------

async function renderImageObject(
  ctx: CanvasRenderingContext2D,
  el: Element,
  mmToPx: number,
  imageCache: Map<string, string>
): Promise<void> {
  const [bx, by, bw, bh] = parseBox(el.getAttribute('Boundary'))
  const resId = el.getAttribute('ResourceID') || el.getAttribute('ResourceId') || ''
  const url = imageCache.get(resId)
  if (!url) return

  await new Promise<void>((resolve) => {
    const img = new Image()
    img.onload = () => {
      ctx.save()
      // OFD ImageObject: Boundary fully specifies position and size in mm.
      // CTM encodes how the image was originally placed but is already reflected in Boundary,
      // so we draw directly to the Boundary rectangle and ignore CTM here.
      ctx.drawImage(img, bx * mmToPx, by * mmToPx, bw * mmToPx, bh * mmToPx)
      ctx.restore()
      resolve()
    }
    img.onerror = () => resolve()
    img.src = url
  })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseBox(s: string | null | undefined): [number, number, number, number] {
  if (!s) return [0, 0, 0, 0]
  const p = s.trim().split(/\s+/).map(Number)
  return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] ?? 0]
}

function parseOfdColor(el: Element | null | undefined, defaultColor: string): string {
  if (!el) return defaultColor
  const value = el.getAttribute('Value')
  if (value) {
    const parts = value.trim().split(/\s+/).map(Number)
    if (parts.length >= 3) {
      const a = parts.length >= 4 ? parts[3] / 255 : 1
      return `rgba(${parts[0]},${parts[1]},${parts[2]},${a})`
    }
  }
  return defaultColor
}

/** Same as parseOfdColor but returns null instead of a default when element is absent. */
function parseOfdColorAttr(el: Element | null | undefined): string | null {
  if (!el) return null
  const value = el.getAttribute('Value')
  if (value) {
    const parts = value.trim().split(/\s+/).map(Number)
    if (parts.length >= 3) {
      const a = parts.length >= 4 ? parts[3] / 255 : 1
      return `rgba(${parts[0]},${parts[1]},${parts[2]},${a})`
    }
  }
  return null
}

interface Ctm { a: number; b: number; c: number; d: number; e: number; f: number }

function parseCTM(attr: string | null | undefined): Ctm | null {
  if (!attr) return null
  const p = attr.trim().split(/\s+/).map(Number)
  if (p.length !== 6) return null
  return { a: p[0], b: p[1], c: p[2], d: p[3], e: p[4], f: p[5] }
}

function applyCtm(ctx: CanvasRenderingContext2D, ctm: Ctm, mmToPx: number): void {
  // CTM is in mm units; e and f (translation) need to be converted to px
  ctx.transform(ctm.a, ctm.b, ctm.c, ctm.d, ctm.e * mmToPx, ctm.f * mmToPx)
}

function parseDeltaArray(attr: string): number[] {
  // OFD DeltaX/DeltaY: can be "g count value ..." or plain space-separated numbers
  const result: number[] = []
  const tokens = attr.trim().split(/\s+/)
  let i = 0
  while (i < tokens.length) {
    if (tokens[i] === 'g') {
      const count = parseInt(tokens[i + 1] ?? '0', 10)
      const value = parseFloat(tokens[i + 2] ?? '0')
      for (let j = 0; j < count; j++) result.push(value)
      i += 3
    } else {
      result.push(parseFloat(tokens[i]))
      i++
    }
  }
  return result
}

/** Find first element by localName anywhere in the document. */
function findEl(parent: Document | Element, localName: string): Element | null {
  if (parent instanceof Document) {
    return (
      Array.from(parent.querySelectorAll('*')).find(el => el.localName === localName) ?? null
    )
  }
  return Array.from(parent.querySelectorAll('*')).find(el => el.localName === localName) ?? null
}

/** Find first child of a named parent element. */
function findElIn(parent: Document, parentName: string, childName: string): Element | null {
  const p = findEl(parent, parentName)
  return p ? (Array.from(p.children).find(el => el.localName === childName) ?? null) : null
}

function getChildByName(el: Element, localName: string): Element | null {
  return Array.from(el.children).find(c => c.localName === localName) ?? null
}

/** Map OFD font names to CSS font-family values. */
function mapFontName(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('hei') || n.includes('黑') || n.includes('gothic') || n.includes('yahei')) {
    return '"SimHei","黑体","Microsoft YaHei","微软雅黑",sans-serif'
  }
  if (n.includes('kai') || n.includes('楷')) {
    return '"KaiTi","楷体",cursive'
  }
  if (n.includes('fang') || n.includes('仿')) {
    return '"FangSong","仿宋",serif'
  }
  // Default: Song/Serif (most common in invoices)
  return '"SimSun","宋体","Times New Roman",serif'
}
