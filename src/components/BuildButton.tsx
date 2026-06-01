import React, { useState } from 'react'
import { useFileStore } from '../store/useFileStore'
import { buildPdf, type BuildProgress } from '../lib/builder'

export function BuildButton() {
  const files = useFileStore((s) => s.files)
  const settings = useFileStore((s) => s.settings)
  const [building, setBuilding] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [progress, setProgress] = useState<BuildProgress | null>(null)
  const [error, setError] = useState<string | null>(null)

  const readyCount = files.filter((f) => f.status === 'ready').length
  const totalCopies = files
    .filter((f) => f.status === 'ready')
    .reduce((sum, f) => sum + f.copies, 0)

  const handleBuild = async () => {
    if (building || previewing || readyCount === 0) return
    setBuilding(true)
    setError(null)
    setProgress(null)

    try {
      const readyFiles = files.filter((f) => f.status === 'ready')
      const bytes = await buildPdf(readyFiles, (p) => setProgress(p))

      const blob = new Blob([bytes], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = settings.outputFileName || 'merged.pdf'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败，请重试')
    } finally {
      setBuilding(false)
      setProgress(null)
    }
  }

  const handleOpenInBrowser = async () => {
    if (building || previewing || readyCount === 0) return
    setPreviewing(true)
    setError(null)
    setProgress(null)

    try {
      const readyFiles = files.filter((f) => f.status === 'ready')
      const bytes = await buildPdf(readyFiles, (p) => setProgress(p))

      const blob = new Blob([bytes], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      // 延迟释放，确保新标签页有足够时间加载
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败，请重试')
    } finally {
      setPreviewing(false)
      setProgress(null)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {(building || previewing) && progress && (
        <div className="text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
          <div className="flex justify-between mb-1">
            <span className="truncate">{progress.label}</span>
            <span className="shrink-0 ml-2">{progress.current}/{progress.total}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all"
              style={{ width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleOpenInBrowser}
          disabled={previewing || building || readyCount === 0}
          className="px-4 py-2.5 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
        >
          {previewing ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              生成中…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              在浏览器中预览
            </>
          )}
        </button>

        <button
          onClick={handleBuild}
          disabled={building || previewing || readyCount === 0}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {building ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              生成中…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              生成并下载 PDF
              {readyCount > 0 && (
                <span className="text-blue-200 text-xs font-normal">
                  ({readyCount} 个文件，共 {totalCopies} 页)
                </span>
              )}
            </>
          )}
        </button>
      </div>
    </div>
  )
}
