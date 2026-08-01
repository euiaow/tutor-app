import { CalendarDays, Paperclip, CheckCircle2, CircleDashed, ChevronRight } from "lucide-react";
import { lessons, type Attendance, type Homework } from "@/data/student";

const attendanceLabel: Record<Attendance, string> = {
  ontime: "Вовремя",
  late: "Опоздал",
  missed: "Не пришёл",
};

function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "warm" | "muted";
}) {
  const tones = {
    neutral: "bg-white/60 text-secondary-foreground",
    warm: "text-primary-foreground",
    muted: "bg-white/45 text-muted-foreground",
  } as const;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${tones[tone]}`}
      style={tone === "warm" ? { background: "var(--gradient-warm)" } : undefined}
    >
      {children}
    </span>
  );
}

export function LessonHistory() {
  return (
    <section className="mt-8">
      <h3 className="px-1 text-lg">История уроков</h3>

      <div className="mt-4 space-y-4">
        {lessons.map((l) => (
          <article key={l.id} className="glass-soft rounded-4xl p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" />
                {l.date}
              </span>
              <span className="ml-auto">
                <Badge tone={l.attendance === "ontime" ? "warm" : "muted"}>
                  {attendanceLabel[l.attendance]}
                </Badge>
              </span>
            </div>

            <h4 className="mt-2 text-base">
              {l.topic ?? <span className="text-muted-foreground">Без темы</span>}
            </h4>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge tone={l.homework === "done" ? "neutral" : "muted"}>
                {l.homework === "done" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <CircleDashed className="h-3.5 w-3.5" />
                )}
                {l.homework === "done" ? "Домашка сделана" : "Домашка не сдана"}
              </Badge>
              {l.grade ? <Badge tone="warm">{l.grade}</Badge> : null}
            </div>

            {l.files.length > 0 ? (
              <ul className="mt-4 space-y-2">
                {l.files.map((f) => (
                  <li key={f}>
                    <button className="glass-inset flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm text-secondary-foreground transition-colors hover:bg-white/70">
                      <Paperclip className="h-4 w-4 shrink-0 opacity-60" />
                      <span className="truncate">{f}</span>
                      <ChevronRight className="ml-auto h-4 w-4 shrink-0 opacity-40" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
