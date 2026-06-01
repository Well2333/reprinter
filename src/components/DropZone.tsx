import React, { useCallback } from 'react'
import { useFileStore } from '../store/useFileStore'

const ACCEPTED_EXTS = ['.pdf', '.ofd', '.jpg', '.jpeg', '.png', '.webp', '.bmp']
const ACCEPT_ATTR = ACCEPTED_EXTS.join(',')

export function DropZone() {
  const addFiles = useFileStore((s) => s.addFiles)
  const [dragOver, setDragOver] = React.useState(false)

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return
      addFiles(Array.from(files))
    },
    [addFiles]
  )

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }

  const onDragLeave = () => setDragOver(false)

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files)
    e.target.value = '' // allow re-selecting same file
  }

  return (
    <label
      className={`flex flex-col items-center justify-center gap-2 w-full min-h-32 rounded-xl border-2 border-dashed cursor-pointer transition-colors select-none
        ${dragOver
          ? 'border-blue-400 bg-blue-50 text-blue-600'
          : 'border-gray-300 bg-gray-50 hover:border-blue-300 hover:bg-blue-50/40 text-gray-500'
        }`}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
    >
      <svg className="w-10 h-10 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
      <span className="text-sm font-medium">拖拽文件到此处，或点击选择文件</span>
      <span className="text-xs opacity-60">支持 PDF、OFD、JPG、PNG、WebP、BMP</span>
      <input
        type="file"
        multiple
        accept={ACCEPT_ATTR}
        className="hidden"
        onChange={onInputChange}
      />
    </label>
  )
}
