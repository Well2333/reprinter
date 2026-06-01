import React from 'react'
import { DropZone } from './components/DropZone'
import { FileList } from './components/FileList'
import { BuildButton } from './components/BuildButton'
import { useFileStore } from './store/useFileStore'

export default function App() {
  const files = useFileStore((s) => s.files)
  const settings = useFileStore((s) => s.settings)
  const updateSettings = useFileStore((s) => s.updateSettings)
  const clearAll = useFileStore((s) => s.clearAll)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 py-8 px-4">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">PDF 构建器</h1>
            <p className="text-sm text-gray-500 mt-1">合并 PDF、OFD 及图片文件，支持发票居中打印</p>
          </div>
          {files.length > 0 && (
            <button
              onClick={clearAll}
              className="text-sm text-gray-400 hover:text-red-500 transition-colors"
            >
              清空全部
            </button>
          )}
        </div>

        {/* Output filename */}
        <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 px-4 py-3">
          <label className="text-sm text-gray-600 shrink-0">输出文件名</label>
          <input
            type="text"
            value={settings.outputFileName}
            onChange={(e) => updateSettings({ outputFileName: e.target.value || 'merged.pdf' })}
            className="flex-1 text-sm border-none outline-none text-gray-800 bg-transparent"
            placeholder="merged.pdf"
          />
          {!settings.outputFileName.endsWith('.pdf') && (
            <span className="text-xs text-amber-500">建议以 .pdf 结尾</span>
          )}
        </div>

        {/* Drop zone */}
        <DropZone />

        {/* File list */}
        {files.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">
                文件列表
                <span className="ml-1.5 text-gray-400 font-normal">({files.length} 个)</span>
              </h2>
              <span className="text-xs text-gray-400">可拖拽排序</span>
            </div>
            <FileList />
          </div>
        )}

        {/* Action bar */}
        {files.length > 0 && (
          <BuildButton />
        )}

        {/* Footer */}
        <p className="text-center text-xs text-gray-400">
          所有处理均在浏览器本地完成，文件不会上传到任何服务器
        </p>
      </div>
    </div>
  )
}
