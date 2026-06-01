import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { FileEntry, Settings } from '../types'
import { detectInvoice } from '../lib/detector'
import { generatePreview } from '../lib/previewGenerator'

interface FileStore {
  files: FileEntry[]
  settings: Settings
  addFiles: (files: File[]) => Promise<void>
  removeFile: (id: string) => void
  reorderFiles: (activeId: string, overId: string) => void
  updateFile: (id: string, patch: Partial<FileEntry>) => void
  updateSettings: (patch: Partial<Settings>) => void
  clearAll: () => void
}

export const useFileStore = create<FileStore>((set, get) => ({
  files: [],
  settings: {
    outputFileName: 'merged.pdf',
  },

  addFiles: async (rawFiles: File[]) => {
    // Create placeholder entries immediately (loading state)
    const entries: FileEntry[] = rawFiles.map((file) => {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
      return {
        id: nanoid(),
        file,
        name: file.name,
        ext,
        isInvoice: false,
        autoDetected: false,
        copies: 1,
        previewUrl: '',
        status: 'loading' as const,
      }
    })

    set((state) => ({ files: [...state.files, ...entries] }))

    // Process each file asynchronously
    for (const entry of entries) {
      try {
        const [autoDetected, previewUrl] = await Promise.all([
          detectInvoice(entry),
          generatePreview(entry),
        ])
        get().updateFile(entry.id, {
          isInvoice: autoDetected,
          autoDetected,
          previewUrl,
          status: 'ready',
        })
      } catch (err) {
        get().updateFile(entry.id, {
          status: 'error',
          errorMsg: err instanceof Error ? err.message : '处理失败',
        })
      }
    }
  },

  removeFile: (id: string) => {
    set((state) => ({ files: state.files.filter((f) => f.id !== id) }))
  },

  reorderFiles: (activeId: string, overId: string) => {
    set((state) => {
      const files = [...state.files]
      const oldIndex = files.findIndex((f) => f.id === activeId)
      const newIndex = files.findIndex((f) => f.id === overId)
      if (oldIndex === -1 || newIndex === -1) return state
      const [removed] = files.splice(oldIndex, 1)
      files.splice(newIndex, 0, removed)
      return { files }
    })
  },

  updateFile: (id: string, patch: Partial<FileEntry>) => {
    set((state) => ({
      files: state.files.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    }))
  },

  updateSettings: (patch: Partial<Settings>) => {
    set((state) => ({ settings: { ...state.settings, ...patch } }))
  },

  clearAll: () => {
    set({ files: [] })
  },
}))
