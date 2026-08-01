// Exam Radar Phase 2 — pure metrics calculation, no UI/Firestore here.
// Returns exact (unrounded) numbers; the caller (Phase 3) rounds anything
// meant for display to one decimal place.

const MS_PER_DAY = 86400000
const MS_PER_WEEK = MS_PER_DAY * 7
const PACE_WINDOW_CAP_WEEKS = 4

function toJsDate(value) {
  if (!value) return null
  if (typeof value.toDate === "function") return value.toDate()
  if (value instanceof Date) return value
  return null
}

// Moved here from exam-radar.jsx (Phase 3 had its own local copy) so
// buildRadarComment (Phase 4) can round pace numbers into its sentences
// using the exact same rounding the UI already displays, rather than a
// second independent implementation of "round to 1 decimal."
export function round1(n) {
  return Math.round(n * 10) / 10
}

// Which topics/prototypes actually count toward *this* target score —
// Phase 1's minScoreRequired <= targetScore filter (see curriculum
// templates), not the student's whole program. Exported too (Phase 3) so
// the page can build the same requiredTopics/requiredPrototypes lists it
// passes to ExamRadar's expanded state, without duplicating this filter.
export function requiredItems(items, targetScore) {
  return (Array.isArray(items) ? items : []).filter((item) => (item.minScoreRequired ?? 0) <= targetScore)
}

// "Давно не обновлялось" indicator (Phase 3) — latest coveredAt across
// EVERY topic/prototype (not just required ones; any progress update
// counts), in whole days. null when nothing has ever been covered — that's
// "no history yet", a different signal from "stale", so the indicator
// should never show for it.
export function daysSinceLastUpdate(topics, prototypes) {
  const allItems = [...(topics ?? []), ...(prototypes ?? [])]
  const coveredDates = allItems.map((item) => toJsDate(item.coveredAt)).filter(Boolean)
  if (coveredDates.length === 0) return null

  const mostRecent = new Date(Math.max(...coveredDates.map((date) => date.getTime())))
  return Math.floor((Date.now() - mostRecent.getTime()) / MS_PER_DAY)
}

export function computeRadarMetrics({ examDate, targetScore, topics, prototypes, assignedAt }) {
  const now = new Date()
  const exam = toJsDate(examDate)
  const score = targetScore ?? 0

  const requiredTopics = requiredItems(topics, score)
  const requiredPrototypes = requiredItems(prototypes, score)
  const requiredTotal = requiredTopics.length + requiredPrototypes.length
  const completedRequired =
    requiredTopics.filter((item) => item.covered).length + requiredPrototypes.filter((item) => item.covered).length
  const topicsLeft = requiredTotal - completedRequired

  // Judgment call (spec text was cut off here): whole days until the exam,
  // rounded up — "1 day left" should still read as 1, not 0, until the day
  // itself has actually passed.
  const daysLeft = exam ? Math.ceil((exam.getTime() - now.getTime()) / MS_PER_DAY) : 0

  if (daysLeft <= 0) {
    return { status: "past", daysLeft, topicsLeft, requiredTotal, completedRequired }
  }

  // Judgment call: checked before final_week/pace — being done with every
  // required item makes the pace question moot regardless of how much time
  // is left, so "done" takes priority over "final_week".
  if (topicsLeft <= 0) {
    return { status: "done", daysLeft, topicsLeft: 0, requiredTotal, completedRequired }
  }

  const weeksLeft = daysLeft / 7
  if (weeksLeft < 1) {
    return { status: "final_week", daysLeft, topicsLeft, requiredTotal, completedRequired }
  }

  const neededPace = topicsLeft / weeksLeft

  // Pace window: actual weeks since assignment, capped at 4 — not a fixed
  // 4-week lookback, so a program assigned 1 week ago measures pace over
  // that 1 week, not 1-completed-over-4 (which would read as artificially
  // slow before there's been time to build real history).
  const assigned = toJsDate(assignedAt)
  const weeksSinceStart = assigned ? Math.max(1, (now.getTime() - assigned.getTime()) / MS_PER_WEEK) : 1
  const paceCappedWeeks = Math.min(weeksSinceStart, PACE_WINDOW_CAP_WEEKS)

  const windowStart = new Date(now.getTime() - paceCappedWeeks * MS_PER_WEEK)
  const recentCompleted = [...requiredTopics, ...requiredPrototypes].filter((item) => {
    if (!item.covered) return false
    const coveredAt = toJsDate(item.coveredAt)
    return coveredAt && coveredAt.getTime() >= windowStart.getTime()
  }).length

  const currentPace = recentCompleted / paceCappedWeeks
  const paceRatio = currentPace / neededPace

  // Judgment call — thresholds weren't in the spec text at all (fully cut
  // off); reverse-engineered from the original mock data's three examples
  // (good: 2.8 vs 2.5 → ratio ~1.12, warn: 1.8 vs 2.5 → ~0.72, bad: 0.8 vs
  // 3.5 → ~0.23), which cleanly fall into >=1 / >=0.7 / below.
  const status = paceRatio >= 1 ? "green" : paceRatio >= 0.7 ? "yellow" : "red"

  return {
    status,
    daysLeft,
    topicsLeft,
    requiredTotal,
    completedRequired,
    weeksLeft,
    neededPace,
    currentPace,
    recentCompleted,
    paceRatio,
  }
}

// Phase 4 — template-based comment (no LLM). Tone note, especially for
// "red": deliberately flat/neutral-constructive, no exclamation marks, no
// "критично"/"опасно"/"срочно" — states the fact and points at one concrete
// next step (talk to the tutor), not alarm. This register is an explicit,
// settled decision — not something to soften toward "motivational" or
// sharpen toward "warning" later without being asked.
export function buildRadarComment(metrics, targetScore) {
  const { status } = metrics

  if (status === "done") {
    return `Все темы для ${targetScore} баллов пройдены 🎉 Дальше — повторение и практика.`
  }

  if (status === "past") {
    return "Дата экзамена уже прошла. Если сдавал(а) — как всё прошло? Обнови цель, если готовишься к следующей попытке."
  }

  if (status === "final_week") {
    return `Последняя неделя перед экзаменом. Осталось тем: ${metrics.topicsLeft}. Сосредоточься на том, что ещё не закрыто, а не на скорости — в темпе на этом отрезке смысла нет.`
  }

  // green / yellow / red — pace-based, but pace is meaningless with zero
  // history (e.g. a program assigned days ago) — a currentPace of 0 with
  // nothing completed in the pace window isn't "red", it's "too early to
  // tell", so it gets its own text instead of reading as an alarming
  // (and false) worst-case status.
  const { currentPace, neededPace, recentCompleted, topicsLeft, daysLeft } = metrics
  if (currentPace === 0 && recentCompleted === 0) {
    return "Пока рано судить о темпе — начни проходить темы, и здесь появится реальная картина."
  }

  const pace = round1(currentPace)
  const needed = round1(neededPace)

  if (status === "green") {
    return `Отличный темп! Сейчас проходишь ${pace} тем(ы) в неделю при нужных ${needed}. Если продолжишь так же — успеешь с запасом на повторение.`
  }

  if (status === "yellow") {
    return `Небольшое отставание. За последние недели пройдено в среднем ${pace} тем(ы) в неделю, а нужно ${needed}. Наверстать реально — стоит взять на пару тем больше в ближайших уроках.`
  }

  return `Текущий темп ${pace} тем(ы) в неделю заметно отстаёт от нужного ${needed}. Осталось ${topicsLeft} тем при ${daysLeft} днях до экзамена — стоит обсудить с репетитором, как перераспределить нагрузку.`
}
