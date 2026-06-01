import React, { useState, useEffect } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import type { FileEntry } from '../types'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

const A4_ASPECT = 841.89 / 595.28 // height / width

interface PreviewPage {
  dataUrl: string
  isInvoice: boolean
  label: string
}

interface PreviewModalProps {
  files: FileEntry[]
  onClose: () => void
}

export function PreviewModal({ files, onClose }: PreviewModalProps) {
  const [pages, setPages] = useState<PreviewPage[]>([])
  const [loading, setLoading] = useState(true)
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function buildPages() {
      const result: PreviewPage[] = []

      for (const entry of files) {
        if (entry.status !== 'ready') continue
        const preview = entry.previewUrl || ''

        for (let c = 0; c < entry.copies; c++) {
          result.push({
            dataUrl: preview,
            isInvoice: entry.isInvoice,
            label: `${entry.name}${entry.copies > 1 ? ` (${c + 1}/${entry.copies})` : ''}`,
          })
        }
      }

      if (!cancelled) {
        setPages(result)
        setLoading(false)
      }
    }

    buildPages()
    return () => { cancelled = true }
  }, [files])

  const total = pages.length

  return (
    <div
      className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">
            合并效果预览
            {total > 0 && <span className="ml-2 text-sm text-gray-400">共 {total} 页</span>}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="关闭"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-48 text-gray-400">
              <svg className="w-8 h-8 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              加载预览中...
            </div>
          ) : total === 0 ? (
            <div className="text-center text-gray-400 py-12">暂无可预览的页面</div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              {/* Main view */}
              <PagePreview page={pages[current]} />

              {/* Label */}
              <p className="text-sm text-gray-500">
                第 {current + 1} / {total} 页 — {pages[current]?.label}
                {pages[current]?.isInvoice && (
                  <span className="ml-2 text-xs px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded-full">发票居中</span>
                )}
              </p>

              {/* Nav */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setCurrent((c) => Math.max(0, c - 1))}
                  disabled={current === 0}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm disabled:opacity-40 hover:bg-gray-50 transition-colors"
                >
                  ← 上一页
                </button>
                <button
                  onClick={() => setCurrent((c) => Math.min(total - 1, c + 1))}
                  disabled={current === total - 1}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm disabled:opacity-40 hover:bg-gray-50 transition-colors"
                >
                  下一页 →
                </button>
              </div>

              {/* Thumbnail strip */}
              {total > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-2 w-full justify-center flex-wrap">
                  {pages.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrent(i)}
                      className={`shrink-0 rounded border-2 overflow-hidden transition-all ${
                        i === current ? 'border-blue-500' : 'border-gray-200 hover:border-gray-400'
                      }`}
                      style={{ width: 48 }}
                    >
                      <PagePreview page={p} compact />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PagePreview({ page, compact = false }: { page: PreviewPage; compact?: boolean }) {
  if (!page) return null

  const containerClass = compact
    ? 'w-12'
    : 'w-full max-w-sm'

  if (page.isInvoice) {
    // Show A4 frame with content centered (gray border = white margins)
    return (
      <div
        className={`${containerClass} bg-gray-200 flex items-center justify-center`}
        style={{ aspectRatio: `${595.28} / ${841.89}` }}
      >
        {page.dataUrl ? (
          <img
            src={page.dataUrl}
            alt="页面预览"
            className="max-w-[80%] max-h-[65%] object-contain shadow"
          />
        ) : (
          <div className="text-gray-400 text-xs">无预览</div>
        )}
      </div>
    )
  }

  return (
    <div className={`${containerClass} bg-white border border-gray-200 shadow`}>
      {page.dataUrl ? (
        <img
          src={page.dataUrl}
          alt="页面预览"
          className="w-full h-auto object-contain"
        />
      ) : (
        <div
          className="w-full flex items-center justify-center text-gray-400 text-xs"
          style={{ aspectRatio: `${595.28} / ${841.89}` }}
        >
          无预览
        </div>
      )}
    </div>
  )
}
