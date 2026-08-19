import { useEffect, useState } from "react"
import { STATIC_SUBJECTS, getSubjectColorClass } from "@/lib/subjects"
import { subscribeToCustomSubjects, createCustomSubjectIfNeeded, pushRecentSubject } from "@/firebase/customSubjects"
import { subscribeToTeacherProfile } from "@/firebase/teachers"
import { teacherInputCls } from "@/components/teacher/theme-ui"

const CUSTOM_VALUE = "__custom__"

// Multi-select subject picker used by the student edit form (Block 3) —
// "Недавние" chips (teachers/{uid}.recentSubjects, up to 3), already-picked
// chips (click to remove), and a dropdown combining STATIC_SUBJECTS with
// this teacher's own customSubjects, ending in "Указать свой предмет" which
// reveals a text input. Every pick (from any source) pushes to
// recentSubjects — see pushRecentSubject.
export function SubjectPicker({ teacherId, selected, onToggle, disabled }) {
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

  const allOptions = [...STATIC_SUBJECTS, ...customSubjects.filter((name) => !STATIC_SUBJECTS.includes(name))]
  const availableOptions = allOptions.filter((name) => !selected.includes(name))

  async function selectSubject(name) {
    onToggle(name)
    if (teacherId) {
      await pushRecentSubject(teacherId, name).catch((error) =>
        console.error("Failed to update recent subjects:", error),
      )
    }
  }

  async function handlePickerChange(e) {
    const value = e.target.value
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
              disabled={disabled || selected.includes(name)}
              onClick={() => selectSubject(name)}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition disabled:opacity-40 ${getSubjectColorClass(name)}`}
            >
              {name}
            </button>
          ))}
        </div>
      ) : null}

      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {selected.map((name) => (
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
        <select value={pickerValue} onChange={handlePickerChange} disabled={disabled} className={teacherInputCls}>
          <option value="">Выбрать предмет...</option>
          {availableOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          <option value={CUSTOM_VALUE}>Указать свой предмет</option>
        </select>
      )}
    </div>
  )
}
