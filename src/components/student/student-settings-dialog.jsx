import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { GlassDialog, GlassDialogContent, GlassDialogTitle, GlassDialogDescription } from "@/components/glass-dialog"
import { GlassSelect } from "@/components/glass-select"
import { TIME_ZONE_OPTIONS, getDeviceTimeZone } from "@/lib/timezone"
import { studentI18n } from "@/lib/i18n"
import { THEME_REGISTRY } from "@/lib/themes"

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
// untouched. Color theme is now a real editable select, sourced from
// THEME_REGISTRY (src/lib/themes.js) — same registry TeacherDashboard's own
// SettingsDialog picks from. Saving applies studentI18n.changeLanguage
// immediately (optimistic) for the language field, on top of the
// authoritative sync StudentDashboard.jsx already does from the live
// student.language subscription.
export function StudentSettingsDialog({ open, onOpenChange, timezone, colorTheme, language, onSave }) {
  const { t } = useTranslation("student")
  const [timezoneValue, setTimezoneValue] = useState(timezone || getDeviceTimeZone())
  const [colorThemeValue, setColorThemeValue] = useState(colorTheme || THEME_REGISTRY[0].id)
  const [languageValue, setLanguageValue] = useState(language || "ru")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  // A theme without its own translation key still shows up (falls back to
  // the registry's own Russian label) — see src/lib/themes.js's doc comment
  // on adding a theme: a locale entry is optional, not required.
  const colorThemeOptions = THEME_REGISTRY.map((theme) => ({
    value: theme.id,
    label: t(`settings.colorThemeOptions.${theme.id}`, { defaultValue: theme.label }),
  }))

  useEffect(() => {
    if (open) {
      setTimezoneValue(timezone || getDeviceTimeZone())
      setColorThemeValue(colorTheme || THEME_REGISTRY[0].id)
      setLanguageValue(language || "ru")
      setError("")
    }
  }, [open, timezone, colorTheme, language])

  async function handleSave() {
    if (saving) return
    setSaving(true)
    setError("")
    try {
      await onSave({ timezone: timezoneValue, colorTheme: colorThemeValue, language: languageValue })
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
            <GlassSelect
              value={timezoneValue}
              onChange={setTimezoneValue}
              options={timeZoneOptionsWith(timezoneValue)}
              disabled={saving}
              className="mt-1.5"
            />
          </label>

          <label className="block">
            <span className="text-xs text-muted-foreground">{t("settings.language")}</span>
            <GlassSelect
              value={languageValue}
              onChange={setLanguageValue}
              options={LANGUAGE_OPTIONS}
              disabled={saving}
              className="mt-1.5"
            />
          </label>

          <label className="block">
            <span className="text-xs text-muted-foreground">{t("settings.colorTheme")}</span>
            <GlassSelect
              value={colorThemeValue}
              onChange={setColorThemeValue}
              options={colorThemeOptions}
              disabled={saving}
              className="mt-1.5"
            />
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
