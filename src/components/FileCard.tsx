import React, { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { FileEntry } from '../types'
import { useFileStore } from '../store/useFileStore'

interface FileCardProps {
  entry: FileEntry
}

export function FileCard({ entry }: FileCardProps) {
  const updateFile = useFileStore((s) => s.updateFile)
  const removeFile = useFileStore((s) => s.removeFile)
  const [lightbox, setLightbox] = useState(false)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const handleCopiesChange = (val: string) => {
    const n = parseInt(val, 10)
    if (!isNaN(n) && n >= 1 && n <= 99) {
      updateFile(entry.id, { copies: n })
    }
  }

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-200 shadow-sm"
      >
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 shrink-0 touch-none"
          aria-label="拖拽排序"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M7 2a2 2 0 110 4 2 2 0 010-4zM13 2a2 2 0 110 4 2 2 0 010-4zM7 8a2 2 0 110 4 2 2 0 010-4zM13 8a2 2 0 110 4 2 2 0 010-4zM7 14a2 2 0 110 4 2 2 0 010-4zM13 14a2 2 0 110 4 2 2 0 010-4z" />
          </svg>
        </button>

        {/* Preview thumbnail */}
        <div
          className="w-14 h-14 rounded-lg overflow-hidden border border-gray-200 bg-gray-100 shrink-0 cursor-pointer"
          onClick={() => entry.previewUrl && setLightbox(true)}
          title="点击放大预览"
        >
          {entry.status === 'loading' ? (
            <div className="w-full h-full flex items-center justify-center">
              <svg className="w-5 h-5 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            </div>
          ) : entry.status === 'error' ? (
            <div className="w-full h-full flex items-center justify-center text-red-400 text-xs text-center p-1">
              错误
            </div>
          ) : entry.previewUrl ? (
            <img
              src={entry.previewUrl}
              alt="预览"
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
              {entry.ext.toUpperCase()}
            </div>
          )}
        </div>

        {/* File info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate" title={entry.name}>
            {entry.name}
          </p>
          {entry.status === 'error' && (
            <p className="text-xs text-red-500 mt-0.5 truncate">{entry.errorMsg}</p>
          )}

          {/* Invoice checkbox */}
          <label className="flex items-center gap-1.5 mt-1.5 cursor-pointer w-fit">
            <input
              type="checkbox"
              className="w-3.5 h-3.5 rounded accent-blue-500"
              checked={entry.isInvoice}
              onChange={(e) => updateFile(entry.id, { isInvoice: e.target.checked })}
            />
            <span className="text-xs text-gray-600">发票文件</span>
            {entry.autoDetected && (
              <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded-full font-medium">
                自动识别
              </span>
            )}
          </label>
        </div>

        {/* Copies */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs text-gray-500">份数</span>
          <input
            type="number"
            min={1}
            max={99}
            value={entry.copies}
            onChange={(e) => handleCopiesChange(e.target.value)}
            className="w-12 text-center text-sm border border-gray-300 rounded-lg px-1 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        {/* Remove */}
        <button
          onClick={() => removeFile(entry.id)}
          className="text-gray-300 hover:text-red-500 transition-colors shrink-0"
          aria-label="删除文件"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setLightbox(false)}
        >
          <img
            src={entry.previewUrl}
            alt="预览"
            className="max-w-full max-h-full rounded-lg shadow-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}
