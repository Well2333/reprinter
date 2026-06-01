import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useFileStore } from '../store/useFileStore'
import { FileCard } from './FileCard'

export function FileList() {
  const files = useFileStore((s) => s.files)
  const reorderFiles = useFileStore((s) => s.reorderFiles)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      reorderFiles(String(active.id), String(over.id))
    }
  }

  if (files.length === 0) return null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={files.map((f) => f.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2">
          {files.map((entry) => (
            <FileCard key={entry.id} entry={entry} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
