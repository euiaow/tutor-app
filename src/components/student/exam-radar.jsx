import { useState } from "react"
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
import { formatSubjects, formatExamTarget } from "@/lib/student-profile"
import { CurriculumItemGroups } from "@/components/student/curriculum-item-groups"
import { round1, buildRadarComment } from "@/lib/examRadar"

// Judgment call (Phase 3 — not specified): final_week gets the same amber
// "pay attention" tone as yellow, without being as alarming as red — it's
// informational (time is short), not a pace judgment. done reuses green
// (goal met), matching the earlier instruction to keep it "в той же
// зелёной гамме что green". past has no color token at all — deliberately
// neutral/flat rather than any status tint.
const STATUS_COLOR = {
  green: "var(--status-good)",
  done: "var(--status-good)",
  yellow: "var(--status-warn)",
  final_week: "var(--status-warn)",
  red: "var(--status-bad)",
}

const STATUS_LABEL = {
  green: "Идёшь по плану",
  yellow: "Немного отстаёшь",
  red: "Критическое отставание",
  done: "Цель достигнута 🎉",
  past: "Дата экзамена уже прошла",
  final_week: "Последняя неделя — темп больше не считаем, просто закрывай оставшееся",
}

function daysWord(n) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return "день"
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return "дня"
  return "дней"
}

export function ExamRadar({
  subject,
  examTarget,
  targetScore,
  metrics,
  requiredTopics,
  requiredPrototypes,
  staleDays,
}) {
  const [expanded, setExpanded] = useState(false)

  const examLabel = `До ${formatExamTarget(examTarget)} по ${formatSubjects(subject)}`
  const { status, daysLeft, requiredTotal, completedRequired } = metrics
  const percent = requiredTotal > 0 ? Math.round((completedRequired / requiredTotal) * 100) : 0
  const isPast = status === "past"
  const showPace = status === "green" || status === "yellow" || status === "red"
  const color = STATUS_COLOR[status] ?? null

  const comment = buildRadarComment(metrics, targetScore)

  const coveredTopics = requiredTopics.filter((item) => item.covered)
  const remainingTopics = requiredTopics.filter((item) => !item.covered)
  const coveredPrototypes = requiredPrototypes.filter((item) => item.covered)
  const remainingPrototypes = requiredPrototypes.filter((item) => !item.covered)

  return (
    <section className="glass-soft mt-5 rounded-4xl p-6 sm:p-7">
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
          Прогресс не обновлялся {staleDays} {daysWord(staleDays)} — попроси репетитора отметить пройденное
        </div>
      ) : null}

      {isPast ? (
        <p className="mt-5 text-sm text-secondary-foreground">
          Цель была: <b className="font-display">{targetScore} баллов</b>
        </p>
      ) : (
        <div className="mt-5 flex flex-wrap items-end gap-x-4 gap-y-2">
          <p className="font-display text-5xl leading-none text-primary">
            {daysLeft} <span className="font-display text-2xl text-secondary-foreground">{daysWord(daysLeft)}</span>
          </p>
          <p className="ml-auto inline-flex items-center gap-2 text-sm text-secondary-foreground">
            <Target className="h-4 w-4 text-primary" aria-hidden="true" />
            Цель: <b className="font-display">{targetScore} баллов</b>
          </p>
        </div>
      )}

      {!isPast ? (
        <div className="glass-inset mt-5 rounded-3xl p-4">
          <div className="flex items-center gap-2.5">
            <span className="text-sm text-secondary-foreground">
              Тем/прототипов пройдено {completedRequired} из {requiredTotal} нужных
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
              <span className="text-sm text-secondary-foreground">Темп сейчас</span>
              <span className="ml-auto font-display text-sm">{round1(metrics.currentPace)}/нед</span>
            </div>
          </div>
          <ArrowRight className="mx-auto hidden h-4 w-4 text-muted-foreground sm:block" aria-hidden="true" />
          <div className="glass-inset rounded-3xl p-4">
            <div className="flex items-center gap-2.5">
              <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
              <span className="text-sm text-secondary-foreground">Нужно</span>
              <span className="ml-auto font-display text-sm">{round1(metrics.neededPace)}/нед</span>
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
          <p className="font-display text-[0.7rem] font-medium">{STATUS_LABEL[status]}</p>
        </div>
        <p className="mt-2.5 text-sm text-secondary-foreground">{comment}</p>
      </div>

      {requiredTotal > 0 ? (
        <>
          {expanded ? (
            <div className={`mt-4 grid gap-6 ${requiredPrototypes.length > 0 ? "sm:grid-cols-2" : "grid-cols-1"}`}>
              <CurriculumItemGroups
                icon={BookOpen}
                title={`Темы для ${targetScore} баллов`}
                covered={coveredTopics}
                remaining={remainingTopics}
              />
              {requiredPrototypes.length > 0 ? (
                <CurriculumItemGroups
                  icon={Layers}
                  title={`Прототипы для ${targetScore} баллов`}
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
            {expanded ? "Свернуть" : "Подробнее"}
            {expanded ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
          </button>
        </>
      ) : null}
    </section>
  )
}
