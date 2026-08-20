import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { GlassDialog, GlassDialogContent, GlassDialogTitle, GlassDialogDescription } from "@/components/glass-dialog"
import { TIME_ZONE_OPTIONS, getDeviceTimeZone } from "@/lib/timezone"
import { studentI18n } from "@/lib/i18n"

const glassSelectCls =
  "glass-inset h-11 w-full rounded-2xl px-3.5 text-sm font-medium text-foreground outline-none transition-all focus:ring-4 focus:ring-primary/15 disabled:opacity-50"

// Language names are shown in their own language, not translated against
// the current UI language — the whole point of a language picker is to
// stay legible to someone who doesn't (yet) read the current language.
const LANGUAGE_OPTIONS = [
  { value: "ru", label: "Русский" },
  { value: "en", label: "English" },
]

// A saved timezone might not be one of TIME_ZONE_OPTIONS' curated entries —
// same fallback shape as the shared SettingsDialog (settings-dialog.jsx),
// duplicated here on purpose rather than reused, see this file's own doc
// comment below.
function timeZoneOptionsWith(value) {
  if (!value || TIME_ZONE_OPTIONS.some((option) => option.value === value)) {
    return TIME_ZONE_OPTIONS
  }
  return [{ value, label: value }, ...TIME_ZONE_OPTIONS]
}

// Student-only fork of the shared SettingsDialog (settings-dialog.jsx),
// specifically so this page's i18n dependency (react-i18next/studentI18n)
// never has to be imported into a file the teacher panel also renders
// through — SettingsDialog's own "teacher" branch stays completely
// untouched. The color-theme field is intentionally rendered
// visible-but-disabled here (task spec, phase 1) — that field still shows
// the student's current theme but can't be changed yet. Language, unlike
// color theme, IS a real editable select (added in a follow-up to the
// original "no switcher yet" phase) — saving applies studentI18n.changeLanguage
// immediately (optimistic), on top of the authoritative sync StudentDashboard.jsx
// already does from the live student.language subscription.
export function StudentSettingsDialog({ open, onOpenChange, timezone, colorTheme, language, onSave }) {
  const { t } = useTranslation("student")
  const [timezoneValue, setTimezoneValue] = useState(timezone || getDeviceTimeZone())
  const [languageValue, setLanguageValue] = useState(language || "ru")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const colorThemeOptions = [
    { value: "pink", label: t("settings.colorThemeOptions.pink") },
    { value: "amber", label: t("settings.colorThemeOptions.amber") },
  ]

  useEffect(() => {
    if (open) {
      setTimezoneValue(timezone || getDeviceTimeZone())
      setLanguageValue(language || "ru")
      setError("")
    }
  }, [open, timezone, language])

  async function handleSave() {
    if (saving) return
    setSaving(true)
    setError("")
    try {
      await onSave({ timezone: timezoneValue, colorTheme, language: languageValue })
      await studentI18n.changeLanguage(languageValue)
      onOpenChange(false)
    } catch (err) {
      console.error("Failed to save settings:", err)
      setError(err?.message || t("settings.saveError"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <GlassDialog open={open} onOpenChange={onOpenChange}>
      <GlassDialogContent>
        <GlassDialogTitle>{t("settings.title")}</GlassDialogTitle>
        <GlassDialogDescription>{t("settings.description")}</GlassDialogDescription>

        <div className="mt-5 flex flex-col gap-4">
          <label className="block">
            <span className="text-xs text-muted-foreground">{t("settings.timezone")}</span>
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
            <span className="text-xs text-muted-foreground">{t("settings.language")}</span>
            <select
              value={languageValue}
              onChange={(e) => setLanguageValue(e.target.value)}
              disabled={saving}
              className={`${glassSelectCls} mt-1.5`}
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-muted-foreground">{t("settings.colorTheme")}</span>
            <select
              value={colorTheme}
              disabled
              className={`${glassSelectCls} mt-1.5`}
            >
              {colorThemeOptions.map((option) => (
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
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex flex-1 items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium text-destructive-foreground transition-transform hover:scale-[1.02] disabled:opacity-50"
              style={{ background: "var(--gradient-warm)", boxShadow: "var(--shadow-soft)" }}
            >
              {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : t("common.save")}
            </button>
          </div>
        </div>
      </GlassDialogContent>
    </GlassDialog>
  )
}
