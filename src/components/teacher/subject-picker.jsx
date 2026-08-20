import { useEffect, useState } from "react"
import { STATIC_SUBJECTS, getSubjectColorClass } from "@/lib/subjects"
import { subscribeToCustomSubjects, createCustomSubjectIfNeeded, pushRecentSubject } from "@/firebase/customSubjects"
import { subscribeToTeacherProfile } from "@/firebase/teachers"
import { TeacherSelect, teacherInputCls } from "@/components/teacher/theme-ui"

const CUSTOM_VALUE = "__custom__"

// Multi-select subject picker used by the student edit form (Block 3) —
// "Недавние" chips (teachers/{uid}.recentSubjects, up to 3), already-picked
// chips (click to remove), and a dropdown combining STATIC_SUBJECTS with
// this teacher's own customSubjects, ending in "Указать свой предмет" which
// reveals a text input. Every pick (from any source) pushes to
// recentSubjects — see pushRecentSubject.
// `single`: Block 4 Phase 2 (template editor) needs one subject, not
// several — when true, `selected` is a plain string (not string[]) and
// `onToggle` replaces it instead of adding/removing, with no chip-removal
// UI (a template always needs exactly one subject, never zero).
export function SubjectPicker({ teacherId, selected, onToggle, disabled, single = false }) {
  const [customSubjects, setCustomSubjects] = useState([])
  const [recentSubjects, setRecentSubjects] = useState([])
  const [pickerValue, setPickerValue] = useState("")
  const [addingCustom, setAddingCustom] = useState(false)
  const [customInput, setCustomInput] = useState("")

  useEffect(() => {
    if (!teacherId) return
    const unsubCustom = subscribeToCustomSubjects(teacherId, setCustomSubjects, (error) =>
      console.error("Failed to load custom subjects:", error),
    )
    const unsubProfile = subscribeToTeacherProfile(
      teacherId,
      (data) => setRecentSubjects(data?.recentSubjects ?? []),
      (error) => console.error("Failed to load recent subjects:", error),
    )
    return () => {
      unsubCustom()
      unsubProfile()
    }
  }, [teacherId])

  const selectedList = single ? (selected ? [selected] : []) : selected
  const allOptions = [...STATIC_SUBJECTS, ...customSubjects.filter((name) => !STATIC_SUBJECTS.includes(name))]
  const availableOptions = single ? allOptions : allOptions.filter((name) => !selectedList.includes(name))

  async function selectSubject(name) {
    onToggle(name)
    if (teacherId) {
      await pushRecentSubject(teacherId, name).catch((error) =>
        console.error("Failed to update recent subjects:", error),
      )
    }
  }

  async function handlePickerChange(value) {
    setPickerValue("")
    if (value === CUSTOM_VALUE) {
      setAddingCustom(true)
      return
    }
    if (value) await selectSubject(value)
  }

  async function handleCustomConfirm() {
    const trimmed = customInput.trim()
    if (!trimmed || !teacherId) return
    await createCustomSubjectIfNeeded(teacherId, trimmed).catch((error) =>
      console.error("Failed to create custom subject:", error),
    )
    await selectSubject(trimmed)
    setCustomInput("")
    setAddingCustom(false)
  }

  return (
    <div className="space-y-2">
      {recentSubjects.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Недавние:</span>
          {recentSubjects.map((name) => (
            <button
              key={name}
              type="button"
              disabled={disabled || selectedList.includes(name)}
              onClick={() => selectSubject(name)}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition disabled:opacity-40 ${getSubjectColorClass(name)}`}
            >
              {name}
            </button>
          ))}
        </div>
      ) : null}

      {!single && selectedList.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {selectedList.map((name) => (
            <button
              key={name}
              type="button"
              disabled={disabled}
              onClick={() => onToggle(name)}
              title="Убрать предмет"
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${getSubjectColorClass(name)}`}
            >
              {name} ×
            </button>
          ))}
        </div>
      ) : null}

      {addingCustom ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            placeholder="Свой предмет"
            disabled={disabled}
            className={`${teacherInputCls} min-w-0 flex-1`}
          />
          <button
            type="button"
            onClick={handleCustomConfirm}
            disabled={disabled || !customInput.trim()}
            className="shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            style={{ background: "var(--gradient-orb)" }}
          >
            Добавить
          </button>
          <button
            type="button"
            onClick={() => setAddingCustom(false)}
            disabled={disabled}
            className="shrink-0 text-xs font-semibold text-muted-foreground"
          >
            Отмена
          </button>
        </div>
      ) : (
        <TeacherSelect
          value={single ? (selected || "") : pickerValue}
          onChange={handlePickerChange}
          disabled={disabled}
          placeholder="Выбрать предмет..."
          options={[
            ...availableOptions.map((name) => ({ value: name, label: name })),
            { value: CUSTOM_VALUE, label: "Указать свой предмет" },
          ]}
        />
      )}
    </div>
  )
}
