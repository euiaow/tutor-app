import { useState } from "react"
import { useTranslation } from "react-i18next"
import {
  Target,
  CalendarClock,
  ArrowRight,
  Gauge,
  Sparkles,
  AlertTriangle,
  ChevronUp,
  ChevronDown,
  BookOpen,
  Layers,
} from "lucide-react"
import { formatSubjects } from "@/lib/student-profile"
import { CurriculumItemGroups } from "@/components/student/curriculum-item-groups"
import { round1, buildRadarComment } from "@/lib/examRadar"
import { translateSubject } from "@/locales/subjectTranslations"
import { translateUnitLabel } from "@/locales/examUnitTranslations"
import { DecorationZone } from "@/components/student/decoration-zone"

// Judgment call (Phase 3 — not specified): final_week gets the same amber
// "pay attention" tone as yellow, without being as alarming as red — it's
// informational (time is short), not a pace judgment. done reuses green
// (goal met), matching the earlier instruction to keep it "в той же
// зелёной гамме что green". past has no color token at all — deliberately
// neutral/flat rather than any status tint. no_data (zero pace history —
// see computeRadarMetrics in lib/examRadar.js) gets its own explicit muted
// token rather than falling through to `null`, which used to produce an
// invalid `color-mix(in oklab, null 12%, transparent)` CSS value — not a
// crash, just a silently-broken/undefined-looking plaque instead of an
// actually neutral one.
const STATUS_COLOR = {
  green: "var(--status-good)",
  done: "var(--status-good)",
  yellow: "var(--status-warn)",
  final_week: "var(--status-warn)",
  red: "var(--status-bad)",
  no_data: "var(--muted-foreground)",
}

function daysWord(n, lang = "ru") {
  if (lang === "en") return n === 1 ? "day" : "days"
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return "день"
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return "дня"
  return "дней"
}

export function ExamRadar({
  subject,
  examTypeName,
  scaleType,
  scaleUnitLabel,
  scaleLabels,
  targetScore,
  metrics,
  requiredTopics,
  requiredPrototypes,
  staleDays,
  showDecoration = false,
}) {
  const { t, i18n } = useTranslation("student")
  const [expanded, setExpanded] = useState(false)

  // Block 3 — exam types are free-form now (teachers/{uid}/examTypes), not a
  // hardcoded "ege"/"oge" enum, so the old ОГЭ-specific "Целевая оценка" (no
  // unit word, bare number) formatting generalizes to "any scaleType ===
  // 'grade' exam type". MyGoalCard (StudentDashboard.jsx) applies the
  // identical rule to the goal-editing form, kept in sync by hand since the
  // two components differ in every other way (label position, editability).
  const isGradeScale = scaleType === "grade"
  // Hardcoded language-level scale (A1-C2) — targetScore is an index into
  // scaleLabels, resolved to its label here for display only.
  const isLanguageLevel = scaleType === "language_level"
  const translatedUnitLabel = translateUnitLabel(scaleUnitLabel, i18n.language)
  const goalLabel = isLanguageLevel
    ? t("goals.targetLevel")
    : isGradeScale
      ? t("goals.targetGrade")
      : t("goals.targetScoreUnit", { unit: translatedUnitLabel || t("goals.unitFallback") })
  const goalValue = isLanguageLevel
    ? (scaleLabels?.[targetScore] ?? `${targetScore}`)
    : isGradeScale
      ? `${targetScore}`
      : `${targetScore}${translatedUnitLabel ? ` ${translatedUnitLabel}` : ""}`

  const translatedSubjects = (subject ?? []).map((name) => translateSubject(name, i18n.language))
  const examLabel = t("examRadar.examLabel", {
    examType: examTypeName,
    subject: formatSubjects(translatedSubjects, t("goals.noSubject")),
  })
  const { status, daysLeft, requiredTotal, completedRequired } = metrics
  const percent = requiredTotal > 0 ? Math.round((completedRequired / requiredTotal) * 100) : 0
  const isPast = status === "past"
  const showPace = status === "green" || status === "yellow" || status === "red"
  const color = STATUS_COLOR[status] ?? null

  const comment = buildRadarComment(metrics, targetScore, i18n.language)

  const coveredTopics = requiredTopics.filter((item) => item.covered)
  const remainingTopics = requiredTopics.filter((item) => !item.covered)
  const coveredPrototypes = requiredPrototypes.filter((item) => item.covered)
  const remainingPrototypes = requiredPrototypes.filter((item) => !item.covered)

  return (
    <section className="glass-soft relative z-10 mt-5 rounded-4xl p-6 sm:p-7">
      {/* zone4/zone5 only ever render on this card now (session 26 — moved
          off CurriculumProgressCard, which shouldn't have a sticker at
          all). One unified position for every width, per the user's own
          real-device testing showing these already looked right on mobile.
          `z-10` on the section itself (not just the zone) is required for
          zone5 to actually paint over MaterialsLibrary/whatever card comes
          next: a plain `position:relative` ancestor with no z-index of its
          own doesn't win a stacking comparison against a later sibling no
          matter what z-index its own overflowing child carries — the
          child's z-index only out-ranks other children/contexts *inside*
          this same section, not the next section over. */}
      {showDecoration ? (
        <>
          <DecorationZone zone="zone4" className="top-[-56px] left-[75%]" />
          {/* right-12 (48px) is the mobile value, left untouched per explicit
              instruction — sm:right-[98px] is desktop-only, nudged further
              left across sessions 35-37 (53→68→88→98px). */}
          <DecorationZone zone="zone5" className="bottom-[-56px] right-12 sm:right-[98px]" />
        </>
      ) : null}
      <div className="flex items-center gap-3">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-primary-foreground"
          style={{ background: "var(--gradient-warm)" }}
        >
          <CalendarClock className="h-5 w-5" aria-hidden="true" />
        </span>
        <h3 className="font-display text-lg">{examLabel}</h3>
      </div>

      {staleDays != null && staleDays > 14 ? (
        <div className="mt-4 flex items-center gap-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t("examRadar.staleWarning", { days: staleDays, daysWord: daysWord(staleDays, i18n.language) })}
        </div>
      ) : null}

      {isPast ? (
        <p className="mt-5 text-sm text-secondary-foreground">
          {t("examRadar.goalWasPrefix", { goalLabel })} <b className="font-display">{goalValue}</b>
        </p>
      ) : (
        <div className="mt-5 flex flex-wrap items-end gap-x-4 gap-y-2">
          <p className="font-display text-5xl leading-none text-primary">
            {daysLeft}{" "}
            <span className="font-display text-2xl text-secondary-foreground">
              {daysWord(daysLeft, i18n.language)}
            </span>
          </p>
          <p className="ml-auto inline-flex items-center gap-2 text-sm text-secondary-foreground">
            <Target className="h-4 w-4 text-primary" aria-hidden="true" />
            {goalLabel}: <b className="font-display">{goalValue}</b>
          </p>
        </div>
      )}

      {!isPast ? (
        <div className="glass-inset mt-5 rounded-3xl p-4">
          <div className="flex items-center gap-2.5">
            <span className="text-sm text-secondary-foreground">
              {t("examRadar.progressLine", { completed: completedRequired, total: requiredTotal })}
            </span>
            <span className="ml-auto font-display text-sm text-primary">{percent}%</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/55">
            <div className="h-full rounded-full" style={{ width: `${percent}%`, background: "var(--gradient-warm)" }} />
          </div>
        </div>
      ) : null}

      {showPace ? (
        <div className="mt-3 grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <div className="glass-inset rounded-3xl p-4">
            <div className="flex items-center gap-2.5">
              <Gauge className="h-4 w-4 text-primary" aria-hidden="true" />
              <span className="text-sm text-secondary-foreground">{t("examRadar.paceNow")}</span>
              <span className="ml-auto font-display text-sm">
                {round1(metrics.currentPace)}{t("examRadar.perWeek")}
              </span>
            </div>
          </div>
          <ArrowRight className="mx-auto hidden h-4 w-4 text-muted-foreground sm:block" aria-hidden="true" />
          <div className="glass-inset rounded-3xl p-4">
            <div className="flex items-center gap-2.5">
              <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
              <span className="text-sm text-secondary-foreground">{t("examRadar.paceNeeded")}</span>
              <span className="ml-auto font-display text-sm">
                {round1(metrics.neededPace)}{t("examRadar.perWeek")}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      <div
        className={`mt-3 rounded-3xl p-4 ${isPast ? "glass-inset" : "border"}`}
        style={
          isPast
            ? undefined
            : {
                background: `color-mix(in oklab, ${color} 12%, transparent)`,
                borderColor: `color-mix(in oklab, ${color} 32%, transparent)`,
              }
        }
      >
        <div className="flex items-center gap-2.5">
          {!isPast ? (
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: color, boxShadow: `0 0 0 4px color-mix(in oklab, ${color} 20%, transparent)` }}
              aria-hidden="true"
            />
          ) : null}
          <p className="font-display text-[0.7rem] font-medium">{t(`examRadar.status.${status}`)}</p>
        </div>
        <p className="mt-2.5 text-sm text-secondary-foreground">{comment}</p>
      </div>

      {requiredTotal > 0 ? (
        <>
          {expanded ? (
            <div className={`mt-4 grid gap-6 ${requiredPrototypes.length > 0 ? "sm:grid-cols-2" : "grid-cols-1"}`}>
              <CurriculumItemGroups
                icon={BookOpen}
                title={t("examRadar.topicsFor", { goal: goalValue })}
                covered={coveredTopics}
                remaining={remainingTopics}
              />
              {requiredPrototypes.length > 0 ? (
                <CurriculumItemGroups
                  icon={Layers}
                  title={t("examRadar.prototypesFor", { goal: goalValue })}
                  covered={coveredPrototypes}
                  remaining={remainingPrototypes}
                />
              ) : null}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary"
          >
            {expanded ? t("common.collapse") : t("common.expand")}
            {expanded ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
          </button>
        </>
      ) : null}
    </section>
  )
}
