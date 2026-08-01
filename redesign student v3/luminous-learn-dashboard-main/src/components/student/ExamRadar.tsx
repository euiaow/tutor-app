import { Target, CalendarClock, ArrowRight, Gauge, Square, Sparkles } from "lucide-react";
import { examRadars, type ExamRadar as ExamRadarData } from "@/data/student";

const statusColor: Record<ExamRadarData["status"], string> = {
  good: "var(--status-good)",
  warn: "var(--status-warn)",
  bad: "var(--status-bad)",
};

function daysWord(n: number) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "день";
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return "дня";
  return "дней";
}

function RadarCard({ data }: { data: ExamRadarData }) {
  const percent = Math.round((data.topicsDone / data.topicsNeeded) * 100);
  const color = statusColor[data.status];

  return (
    <section className="glass-soft mt-5 rounded-4xl p-6 sm:p-7">
      <div className="flex items-center gap-3">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-primary-foreground"
          style={{ background: "var(--gradient-warm)" }}
        >
          <CalendarClock className="h-5 w-5" />
        </span>
        <h3 className="text-lg">{data.examLabel}</h3>
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-x-4 gap-y-2">
        <p className="font-display text-5xl leading-none text-primary">
          {data.daysLeft}{" "}
          <span className="font-display text-2xl text-secondary-foreground">
            {daysWord(data.daysLeft)}
          </span>
        </p>
        <p className="ml-auto inline-flex items-center gap-2 text-sm text-secondary-foreground">
          <Target className="h-4 w-4 text-primary" />
          Цель: <b className="font-display">{data.targetScore} баллов</b>
        </p>
      </div>

      <div className="glass-inset mt-5 rounded-3xl p-4">
        <div className="flex items-center gap-2.5">
          <span className="text-sm text-secondary-foreground">
            Тем пройдено: {data.topicsDone} из {data.topicsNeeded} нужных
          </span>
          <span className="ml-auto font-display text-sm text-primary">{percent}%</span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/55">
          <div
            className="h-full rounded-full"
            style={{ width: `${percent}%`, background: "var(--gradient-warm)" }}
          />
        </div>
      </div>

      <div className="mt-3 grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <div className="glass-inset rounded-3xl p-4">
          <div className="flex items-center gap-2.5">
            <Gauge className="h-4 w-4 text-primary" />
            <span className="text-sm text-secondary-foreground">Темп сейчас</span>
            <span className="ml-auto font-display text-sm">{data.paceNow}/нед</span>
          </div>
        </div>
        <ArrowRight className="mx-auto hidden h-4 w-4 text-muted-foreground sm:block" />
        <div className="glass-inset rounded-3xl p-4">
          <div className="flex items-center gap-2.5">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm text-secondary-foreground">Нужно</span>
            <span className="ml-auto font-display text-sm">{data.paceNeeded}/нед</span>
          </div>
        </div>
      </div>

      <div
        className="mt-3 rounded-3xl border p-4"
        style={{
          background: `color-mix(in oklab, ${color} 12%, transparent)`,
          borderColor: `color-mix(in oklab, ${color} 32%, transparent)`,
        }}
      >
        <div className="flex items-center gap-2.5">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: color, boxShadow: `0 0 0 4px color-mix(in oklab, ${color} 20%, transparent)` }}
          />
          <p className="font-display text-[0.7rem] font-medium">{data.statusLabel}</p>
        </div>
        <p className="mt-2.5 text-sm text-secondary-foreground">{data.comment}</p>
      </div>

      <div className="mt-5">
        <p className="mb-2.5 text-xs text-muted-foreground">На этой неделе</p>
        <ul className="space-y-2">
          {data.weekPlan.map((item) => (
            <li key={item} className="flex items-start gap-3 text-sm text-secondary-foreground">
              <Square className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function RadarEmptyCard() {
  return (
    <section className="glass-soft mt-5 flex flex-wrap items-center gap-4 rounded-4xl p-6">
      <span
        className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-primary-foreground"
        style={{ background: "var(--gradient-warm)" }}
      >
        <Target className="h-5 w-5" />
      </span>
      <div className="min-w-[14rem] flex-1">
        <h3 className="text-lg">Экзаменационный радар</h3>
        <p className="mt-1 text-sm text-secondary-foreground">
          Укажи цель и дату экзамена, чтобы видеть свой прогресс
        </p>
      </div>
      <button
        className="rounded-full px-5 py-2.5 text-sm font-medium text-primary-foreground"
        style={{ background: "var(--gradient-warm)", boxShadow: "var(--shadow-soft)" }}
      >
        Заполнить
      </button>
    </section>
  );
}

export function ExamRadar() {
  return (
    <>
      {examRadars.map((r) => (
        <RadarCard key={r.id} data={r} />
      ))}
      <RadarEmptyCard />
    </>
  );
}
