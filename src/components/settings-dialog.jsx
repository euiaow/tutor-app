import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import {
  TeacherDialog,
  TeacherDialogContent,
  TeacherDialogTitle,
  TeacherDialogDescription,
  TeacherModalFooter,
  TeacherCancelBtn,
  TeacherSaveBtn,
  TeacherSelect,
  Field,
  teacherInputCls,
} from "@/components/teacher/theme-ui"
import { GlassDialog, GlassDialogContent, GlassDialogTitle, GlassDialogDescription } from "@/components/glass-dialog"
import { TIME_ZONE_OPTIONS, getDeviceTimeZone } from "@/lib/timezone"
import { THEME_REGISTRY } from "@/lib/themes"
import { TeacherBotConnectStatus } from "@/components/teacher/teacher-bot-connect"

const COLOR_THEME_OPTIONS = THEME_REGISTRY.map((theme) => ({ value: theme.id, label: theme.label }))

const glassSelectCls =
  "glass-inset h-11 w-full rounded-2xl px-3.5 text-sm font-medium text-foreground outline-none transition-all focus:ring-4 focus:ring-primary/15 disabled:opacity-50"

// A saved timezone might not be one of TIME_ZONE_OPTIONS' curated entries
// (e.g. it was picked up from the device on first save and the device sits
// in a zone not on our shortlist) — a plain <select> would silently show
// nothing selected in that case, so the current value is always injected
// as an extra option if it's missing from the list.
function timeZoneOptionsWith(value) {
  if (!value || TIME_ZONE_OPTIONS.some((option) => option.value === value)) {
    return TIME_ZONE_OPTIONS
  }
  return [{ value, label: value }, ...TIME_ZONE_OPTIONS]
}

// Its own field + "Изменить" button, saved independently of the timezone/
// colorTheme form below — a name change is a single, immediate write, not
// part of the "adjust a few fields then Сохранить" flow the rest of this
// dialog uses.
function NameEditor({ name, onSave }) {
  const [value, setValue] = useState(name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    setValue(name)
    setError("")
  }, [name])

  async function handleSave() {
    const trimmed = value.trim()
    if (!trimmed) {
      setError("Имя не может быть пустым")
      return
    }
    setSaving(true)
    setError("")
    try {
      await onSave(trimmed)
    } catch (err) {
      console.error("Failed to save teacher name:", err)
      setError(err?.message || "Не удалось сохранить имя")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Field label="Имя">
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={saving}
          className={teacherInputCls}
        />
        <TeacherSaveBtn onClick={handleSave} disabled={saving || value.trim() === name} className="shrink-0 px-4">
          Изменить
        </TeacherSaveBtn>
      </div>
      {error ? <p className="mt-1.5 text-xs font-semibold text-destructive">{error}</p> : null}
    </Field>
  )
}

// Shared logic (state, validation-free save flow, field values) behind two
// visual variants — "teacher" (TeacherDialog/glass-panel primitives) and
// "student" (GlassDialog/grey-glass primitives), matching whichever
// dashboard opened it. See CLAUDE Phase 4a plan: one reusable component,
// each dashboard's own gear-icon button supplies the role-specific data
// (current timezone/colorTheme, save callback) rather than two independent
// dialogs duplicating this logic.
export function SettingsDialog({ variant, open, onOpenChange, name, onSaveName, timezone, colorTheme, onSave }) {
  const [timezoneValue, setTimezoneValue] = useState(timezone || getDeviceTimeZone())
  const [colorThemeValue, setColorThemeValue] = useState(colorTheme)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  // Re-sync local state to props each time the dialog opens, rather than on
  // every prop change — avoids clobbering an in-progress edit if the
  // underlying profile doc happens to update mid-edit (Firestore
  // subscription).
  useEffect(() => {
    if (open) {
      setTimezoneValue(timezone || getDeviceTimeZone())
      setColorThemeValue(colorTheme)
      setError("")
    }
  }, [open, timezone, colorTheme])

  async function handleSave() {
    if (saving) return
    setSaving(true)
    setError("")
    try {
      await onSave({ timezone: timezoneValue, colorTheme: colorThemeValue })
      onOpenChange(false)
    } catch (err) {
      console.error("Failed to save settings:", err)
      setError(err?.message || "Не удалось сохранить настройки")
    } finally {
      setSaving(false)
    }
  }

  if (variant === "teacher") {
    return (
      <TeacherDialog open={open} onOpenChange={onOpenChange}>
        <TeacherDialogContent>
          <TeacherDialogTitle>Настройки</TeacherDialogTitle>
          <TeacherDialogDescription>Часовой пояс и цветовая тема кабинета</TeacherDialogDescription>

          <div className="mt-5 flex flex-col gap-4">
            {onSaveName ? <NameEditor name={name ?? ""} onSave={onSaveName} /> : null}

            <Field label="Часовой пояс">
              <TeacherSelect
                value={timezoneValue}
                onChange={setTimezoneValue}
                options={timeZoneOptionsWith(timezoneValue)}
                disabled={saving}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Обрати внимание: сам Google Calendar показывает время по часовому поясу, заданному в настройках
                твоего Google-аккаунта, а не по часовому поясу, выбранному здесь. Чтобы поменять его: откройте{" "}
                <a
                  href="https://calendar.google.com/calendar/r/settings"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-dotted underline-offset-2 hover:text-rose-deep"
                >
                  calendar.google.com
                </a>{" "}
                → значок шестерёнки → Настройки → раздел «Часовой пояс» → выберите нужный.
              </p>
            </Field>

            <Field label="Цветовая тема">
              <TeacherSelect
                value={colorThemeValue}
                onChange={setColorThemeValue}
                options={COLOR_THEME_OPTIONS}
                disabled={saving}
              />
            </Field>

            <div>
              <p className="text-xs font-medium text-muted-foreground">Уведомления</p>
              <div className="mt-2">
                <TeacherBotConnectStatus />
              </div>
            </div>

            {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}

            <TeacherModalFooter>
              <TeacherCancelBtn onClick={() => onOpenChange(false)} disabled={saving} />
              <TeacherSaveBtn onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="mx-auto size-4 animate-spin" aria-hidden="true" /> : "Сохранить"}
              </TeacherSaveBtn>
            </TeacherModalFooter>
          </div>
        </TeacherDialogContent>
      </TeacherDialog>
    )
  }

  return (
    <GlassDialog open={open} onOpenChange={onOpenChange}>
      <GlassDialogContent>
        <GlassDialogTitle>Настройки</GlassDialogTitle>
        <GlassDialogDescription>Часовой пояс и цветовая тема кабинета</GlassDialogDescription>

        <div className="mt-5 flex flex-col gap-4">
          <label className="block">
            <span className="text-xs text-muted-foreground">Часовой пояс</span>
            <select
              value={timezoneValue}
              onChange={(e) => setTimezoneValue(e.target.value)}
              disabled={saving}
              className={`${glassSelectCls} mt-1.5`}
            >
              {timeZoneOptionsWith(timezoneValue).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-muted-foreground">Цветовая тема</span>
            <select
              value={colorThemeValue}
              onChange={(e) => setColorThemeValue(e.target.value)}
              disabled={saving}
              className={`${glassSelectCls} mt-1.5`}
            >
              {COLOR_THEME_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}

          <div className="mt-1 flex gap-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="flex-1 rounded-full border border-white/60 bg-white/45 px-5 py-3 text-sm font-medium text-secondary-foreground backdrop-blur-md transition-colors hover:bg-white/70 disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex flex-1 items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium text-destructive-foreground transition-transform hover:scale-[1.02] disabled:opacity-50"
              style={{ background: "var(--gradient-warm)", boxShadow: "var(--shadow-soft)" }}
            >
              {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : "Сохранить"}
            </button>
          </div>
        </div>
      </GlassDialogContent>
    </GlassDialog>
  )
}
