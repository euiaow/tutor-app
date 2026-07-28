import { Calendar, Clock, RotateCcw } from "lucide-react"

export function NextLessonCard({
  subject = "Английский язык",
  nextLessonDate = "",
  nextLessonTime = "",
  reviewTopic = "",
}) {
  return (
    <section
      aria-labelledby="next-lesson-title"
      className="relative overflow-hidden rounded-3xl bg-primary p-6 text-primary-foreground shadow-lg shadow-primary/25 sm:p-8"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary-foreground/10"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-16 right-16 h-32 w-32 rounded-full bg-primary-foreground/10"
      />

      <div className="relative">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary-foreground/70">
          Следующее занятие
        </p>

        <h2 id="next-lesson-title" className="mt-2 text-3xl font-extrabold text-balance sm:text-4xl">
          {subject}
        </h2>

        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3">
          {nextLessonDate ? (
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-foreground/15">
                <Calendar className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="text-base font-semibold">{nextLessonDate}</span>
            </div>
          ) : null}
          {nextLessonTime ? (
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-foreground/15">
                <Clock className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="text-base font-semibold">{nextLessonTime}</span>
            </div>
          ) : null}
        </div>

        {reviewTopic ? (
          <div className="mt-6 flex items-center gap-3 rounded-2xl bg-primary-foreground/15 p-4 backdrop-blur-sm">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-foreground/20">
              <RotateCcw className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="leading-tight">
              <p className="text-xs font-medium text-primary-foreground/70">Повторить</p>
              <p className="text-base font-bold">{reviewTopic}</p>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}
