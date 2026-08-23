import { Trash2 } from "lucide-react"
import { DAY_OPTIONS } from "@/lib/schedule"
import { TeacherSelect, teacherInputCls } from "@/components/teacher/theme-ui"

const DAY_SELECT_OPTIONS = DAY_OPTIONS.map((day) => ({ value: day.value, label: day.label }))

export const MAX_SCHEDULE_SLOTS = 7

export function defaultScheduleSlot() {
  return { dayOfWeek: 1, time: "16:00", durationMinutes: 60 }
}

// Reusable "day + time" recurring-schedule editor — extracted out of
// StudentEditModal (student-row.jsx), which used to hand-draw this list
// inline, so the group form (groups-section.jsx) can render the identical
// control instead of a second hand-copied version. `makeDefaultSlot()`
// lets a caller customize what a freshly-added slot starts with (e.g.
// StudentEditModal seeds a per-slot `subject`); `renderExtra(slot, index,
// updateSlot)` renders an optional extra row under a slot (used for
// StudentEditModal's per-slot subject tag picker — groups don't need it,
// a group has exactly one subject already).
export function ScheduleSlotsEditor({
  slots,
  onChange,
  disabled,
  makeDefaultSlot = defaultScheduleSlot,
  renderExtra,
}) {
  function updateSlot(index, field, value) {
    onChange(slots.map((slot, i) => (i === index ? { ...slot, [field]: value } : slot)))
  }

  function addSlot() {
    if (slots.length >= MAX_SCHEDULE_SLOTS) return
    onChange([...slots, makeDefaultSlot()])
  }

  function removeSlot(index) {
    onChange(slots.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-2">
      {slots.map((slot, index) => (
        <div key={index} className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <TeacherSelect
              value={slot.dayOfWeek}
              onChange={(value) => updateSlot(index, "dayOfWeek", Number(value))}
              disabled={disabled}
              options={DAY_SELECT_OPTIONS}
              className="min-w-0 flex-1"
            />
            <input
              type="time"
              value={slot.time}
              onChange={(e) => updateSlot(index, "time", e.target.value)}
              disabled={disabled}
              className={`${teacherInputCls} max-w-36`}
            />
            <button
              type="button"
              onClick={() => removeSlot(index)}
              disabled={disabled}
              aria-label="Удалить слот"
              className="glass-tile grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:text-destructive disabled:opacity-50"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </div>
          {renderExtra ? renderExtra(slot, index, updateSlot) : null}
        </div>
      ))}
      <button
        type="button"
        onClick={addSlot}
        disabled={disabled || slots.length >= MAX_SCHEDULE_SLOTS}
        className="w-full rounded-full border border-dashed border-glass-border px-4 py-2.5 text-sm font-semibold text-muted-foreground transition hover:text-rose-deep disabled:opacity-50"
      >
        + Добавить слот
      </button>
    </div>
  )
}
