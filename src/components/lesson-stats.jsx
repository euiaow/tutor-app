function computeLessonStats(lessons) {
  const totalLessons = lessons.length

  const attendanceRate =
    totalLessons > 0
      ? Math.round(
          (lessons.filter((lesson) => lesson.attendance === "on_time").length / totalLessons) * 100,
        )
      : 0

  const homeworkRate =
    totalLessons > 0
      ? Math.round(
          (lessons.filter((lesson) => lesson.homeworkDone).length / totalLessons) * 100,
        )
      : 0

  const sortedByDateDesc = [...lessons].sort((a, b) => {
    const aTime = a.date?.getTime?.() ?? 0
    const bTime = b.date?.getTime?.() ?? 0
    return bTime - aTime
  })

  let homeworkStreak = 0
  for (const lesson of sortedByDateDesc) {
    if (!lesson.homeworkDone) break
    homeworkStreak += 1
  }

  return { totalLessons, attendanceRate, homeworkRate, homeworkStreak }
}

function StatCard({ label, value, suffix }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-card-foreground">
        {value}
        {suffix ? (
          <span className="ml-1 text-sm font-semibold text-muted-foreground">{suffix}</span>
        ) : null}
      </p>
    </div>
  )
}

export function LessonStats({ lessons }) {
  if (lessons.length === 0) {
    return null
  }

  const { totalLessons, attendanceRate, homeworkStreak } = computeLessonStats(lessons)

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
      <StatCard label="Уроков пройдено" value={totalLessons} />
      <StatCard label="Домашка подряд" value={homeworkStreak} suffix="уроков" />
      <StatCard label="Посещаемость" value={attendanceRate} suffix="%" />
    </div>
  )
}
