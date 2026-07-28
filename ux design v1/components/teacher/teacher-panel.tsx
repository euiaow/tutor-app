"use client"

import { useState } from "react"
import {
  GraduationCap,
  LogOut,
  Calendar,
  Plus,
  Zap,
  Copy,
  Check,
  Trash2,
  Clock,
} from "lucide-react"

type CalendarView = "day" | "week" | "month"

type Student = {
  id: string
  name: string
  level: number
  xp: number
  xpToNext: number
  nextLessonDay: string
  nextLessonTime: string
  topic: string
}

type PendingStudent = {
  id: string
  name: string
  createdAt: string
  link: string
}

const INITIAL_STUDENTS: Student[] = [
  {
    id: "1",
    name: "Настя Иванова",
    level: 3,
    xp: 70,
    xpToNext: 100,
    nextLessonDay: "Пн, 3 авг",
    nextLessonTime: "16:00",
    topic: "Неправильные глаголы",
  },
  {
    id: "2",
    name: "Максим Петров",
    level: 5,
    xp: 40,
    xpToNext: 100,
    nextLessonDay: "Вт, 4 авг",
    nextLessonTime: "18:30",
    topic: "Present Perfect",
  },
  {
    id: "3",
    name: "Соня Кузнецова",
    level: 2,
    xp: 85,
    xpToNext: 100,
    nextLessonDay: "Ср, 5 авг",
    nextLessonTime: "15:00",
    topic: "Модальные глаголы",
  },
  {
    id: "4",
    name: "Егор Смирнов",
    level: 4,
    xp: 20,
    xpToNext: 100,
    nextLessonDay: "Чт, 6 авг",
    nextLessonTime: "17:15",
    topic: "Условные предложения",
  },
]

const INITIAL_PENDING: PendingStudent[] = [
  {
    id: "p1",
    name: "Дарья Волкова",
    createdAt: "1 авг 2026",
    link: "https://portal.edu/join/8f2a9c",
  },
  {
    id: "p2",
    name: "Артём Лебедев",
    createdAt: "31 июл 2026",
    link: "https://portal.edu/join/4b7e1d",
  },
]

const VIEW_TABS: { key: CalendarView; label: string }[] = [
  { key: "day", label: "День" },
  { key: "week", label: "Неделя" },
  { key: "month", label: "Месяц" },
]

// Calendar configuration — swap these with real data later.
const CALENDAR_START_HOUR = 9 // 9:00
const CALENDAR_END_HOUR = 21 // 21:00
const CALENDAR_HOURS = Array.from(
  { length: CALENDAR_END_HOUR - CALENDAR_START_HOUR + 1 },
  (_, i) => CALENDAR_START_HOUR + i,
)

type WeekDay = { key: string; weekday: string; date: string }

const WEEK_DAYS: WeekDay[] = [
  { key: "mon", weekday: "Пн", date: "3 авг" },
  { key: "tue", weekday: "Вт", date: "4 авг" },
  { key: "wed", weekday: "Ср", date: "5 авг" },
  { key: "thu", weekday: "Чт", date: "6 авг" },
  { key: "fri", weekday: "Пт", date: "7 авг" },
  { key: "sat", weekday: "Сб", date: "8 авг" },
  { key: "sun", weekday: "Вс", date: "9 авг" },
]

type Subject = "Русский язык" | "Литература"

type CalendarEvent = {
  id: string
  dayKey: string
  start: number // hour, e.g. 16 for 16:00
  end: number // hour, e.g. 17 for 17:00
  student: string
  subject: Subject
}

// Two-color palette keyed by subject — harmonious blue/violet pair.
const SUBJECT_COLORS: Record<Subject, string> = {
  "Русский язык": "bg-blue-100 text-blue-800 border-blue-200",
  "Литература": "bg-violet-100 text-violet-800 border-violet-200",
}

const CALENDAR_EVENTS: CalendarEvent[] = [
  {
    id: "e1",
    dayKey: "mon",
    start: 16,
    end: 17,
    student: "Настя Иванова",
    subject: "Русский язык",
  },
  {
    id: "e2",
    dayKey: "tue",
    start: 18,
    end: 19,
    student: "Максим Петров",
    subject: "Литература",
  },
  {
    id: "e3",
    dayKey: "wed",
    start: 15,
    end: 16,
    student: "Соня Кузнецова",
    subject: "Русский язык",
  },
  {
    id: "e4",
    dayKey: "thu",
    start: 17,
    end: 18,
    student: "Егор Смирнов",
    subject: "Литература",
  },
  {
    id: "e5",
    dayKey: "fri",
    start: 12,
    end: 13,
    student: "Настя Иванова",
    subject: "Русский язык",
  },
]

const ROW_HEIGHT = 56 // px per hour row

export default function TeacherPanel() {
  const [students, setStudents] = useState<Student[]>(INITIAL_STUDENTS)
  const [pending, setPending] = useState<PendingStudent[]>(INITIAL_PENDING)
  const [calendarView, setCalendarView] = useState<CalendarView>("week")
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  function addXp(id: string) {
    setStudents((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s
        let xp = s.xp + 10
        let level = s.level
        if (xp >= s.xpToNext) {
          xp -= s.xpToNext
          level += 1
        }
        return { ...s, xp, level }
      }),
    )
  }

  async function copyLink(item: PendingStudent, channel: "vk" | "tg") {
    const key = `${item.id}:${channel}`
    try {
      await navigator.clipboard.writeText(item.link)
    } catch {
      // clipboard may be unavailable in some contexts; still show feedback
    }
    setCopiedKey(key)
    setTimeout(() => setCopiedKey((cur) => (cur === key ? null : cur)), 1800)
  }

  function removePending(id: string) {
    setPending((prev) => prev.filter((p) => p.id !== id))
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white">
              <GraduationCap className="h-5 w-5" />
            </span>
            <span className="text-lg font-extrabold tracking-tight">Учебный портал</span>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-semibold text-gray-600 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-900"
          >
            <LogOut className="h-4 w-4" />
            Выйти
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-10 px-4 py-8 sm:px-6">
        {/* 1. Schedule */}
        <section>
          <h2 className="text-xl font-extrabold tracking-tight">Расписание</h2>
          <div className="mt-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  <Calendar className="h-5 w-5" />
                </span>
                <h3 className="text-base font-bold">Календарь занятий</h3>
              </div>
              <div className="inline-flex rounded-xl bg-gray-100 p-1">
                {VIEW_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setCalendarView(tab.key)}
                    className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                      calendarView === tab.key
                        ? "bg-white text-indigo-600 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4 overflow-x-auto">
              <div className="min-w-[720px]">
                {/* Day headers */}
                <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-gray-200">
                  <div className="border-r border-gray-100" aria-hidden />
                  {WEEK_DAYS.map((day) => (
                    <div key={day.key} className="px-2 pb-2 text-center">
                      <div className="text-xs font-bold uppercase tracking-wide text-gray-500">
                        {day.weekday}
                      </div>
                      <div className="text-sm font-semibold text-gray-900">{day.date}</div>
                    </div>
                  ))}
                </div>

                {/* Time grid */}
                <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))]">
                  {/* Time column */}
                  <div className="border-r border-gray-100">
                    {CALENDAR_HOURS.map((hour) => (
                      <div
                        key={hour}
                        style={{ height: ROW_HEIGHT }}
                        className="relative -top-2 pr-2 text-right text-xs font-medium text-gray-400"
                      >
                        {hour}:00
                      </div>
                    ))}
                  </div>

                  {/* Day columns */}
                  {WEEK_DAYS.map((day) => {
                    const dayEvents = CALENDAR_EVENTS.filter((e) => e.dayKey === day.key)
                    return (
                      <div
                        key={day.key}
                        className="relative border-r border-gray-100 last:border-r-0"
                        style={{ height: CALENDAR_HOURS.length * ROW_HEIGHT }}
                      >
                        {/* Hour lines */}
                        {CALENDAR_HOURS.map((hour) => (
                          <div
                            key={hour}
                            style={{ height: ROW_HEIGHT }}
                            className="border-b border-gray-100"
                          />
                        ))}

                        {/* Events */}
                        {dayEvents.map((event) => {
                          const top = (event.start - CALENDAR_START_HOUR) * ROW_HEIGHT
                          const height = (event.end - event.start) * ROW_HEIGHT
                          return (
                            <div
                              key={event.id}
                              style={{ top: top + 2, height: height - 4 }}
                              className={`absolute inset-x-1 flex flex-col overflow-hidden rounded-lg border px-1.5 py-1 text-left shadow-sm ${SUBJECT_COLORS[event.subject]}`}
                            >
                              <p className="truncate text-[11px] font-bold leading-tight">
                                {event.student}
                              </p>
                              <p className="truncate text-[10px] font-medium leading-tight opacity-75">
                                {event.start}:00–{event.end}:00
                              </p>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 2. Students */}
        <section>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-extrabold tracking-tight">Ученики</h2>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              Добавить ученика
            </button>
          </div>

          {/* 3. Registered students */}
          <div className="mt-6">
            <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500">
              Зарегистрированные ученики
            </h3>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {students.map((s) => {
                const pct = Math.min(100, Math.round((s.xp / s.xpToNext) * 100))
                return (
                  <div
                    key={s.id}
                    className="flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
                        {s.name
                          .split(" ")
                          .map((p) => p[0])
                          .join("")
                          .slice(0, 2)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-bold">{s.name}</p>
                        <p className="text-xs font-medium text-gray-500">
                          Уровень {s.level} · {s.xp} XP
                        </p>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="mt-1.5 text-xs text-gray-400">
                        {s.xpToNext - s.xp} XP до {s.level + 1} уровня
                      </p>
                    </div>

                    <div className="mt-4 rounded-lg bg-gray-50 px-3 py-2.5">
                      <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
                        <Clock className="h-4 w-4 text-gray-400" />
                        {s.nextLessonDay}, {s.nextLessonTime}
                      </div>
                      <p className="mt-0.5 text-xs text-gray-500">{s.topic}</p>
                    </div>

                    <div className="mt-4 flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => addXp(s.id)}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-600"
                      >
                        <Zap className="h-4 w-4" />
                        +10 XP
                      </button>
                      <button
                        type="button"
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50"
                      >
                        <Plus className="h-4 w-4" />
                        Добавить урок
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 4. Pending registration */}
          <div className="mt-8">
            <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500">
              Ожидают регистрации
            </h3>
            <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              {pending.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-gray-400">
                  Нет уче��иков, ожидающих регистрации.
                </p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {pending.map((p) => (
                    <li
                      key={p.id}
                      className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{p.name}</p>
                        <p className="text-xs text-gray-400">Ссылка создана {p.createdAt}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => copyLink(p, "vk")}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50"
                        >
                          {copiedKey === `${p.id}:vk` ? (
                            <>
                              <Check className="h-4 w-4 text-emerald-500" />
                              Скопировано
                            </>
                          ) : (
                            <>
                              <Copy className="h-4 w-4" />
                              Скопировать ссылку ВК
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => copyLink(p, "tg")}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50"
                        >
                          {copiedKey === `${p.id}:tg` ? (
                            <>
                              <Check className="h-4 w-4 text-emerald-500" />
                              Скопировано
                            </>
                          ) : (
                            <>
                              <Copy className="h-4 w-4" />
                              Скопировать ссылку ТГ
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => removePending(p.id)}
                          aria-label={`Удалить ${p.name}`}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
