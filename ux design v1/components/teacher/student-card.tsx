"use client"

import { useState } from "react"
import { CalendarDays, Sparkles, Plus, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"

export interface Student {
  id: string
  name: string
  level: number
  xp: number
  nextLesson: string
}

export function StudentCard({ student }: { student: Student }) {
  const [xp, setXp] = useState(student.xp)
  const [level, setLevel] = useState(student.level)

  const initials = student.name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()

  function addXp() {
    setXp((prev) => {
      const next = prev + 10
      if (next >= 100) {
        setLevel((lvl) => lvl + 1)
        return next - 100
      }
      return next
    })
  }

  function changeDate() {
    const next = window.prompt("Новая дата урока", student.nextLesson)
    if (next) {
      // In a real app this would persist to the backend.
      console.log("[v0] change lesson date to:", next)
    }
  }

  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
      <header className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-sm font-bold text-secondary-foreground"
        >
          {initials}
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold text-card-foreground">{student.name}</h2>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
            Уровень {level} · {xp} XP
          </p>
        </div>
      </header>

      <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2.5 text-sm text-foreground">
        <CalendarDays className="size-4 text-muted-foreground" aria-hidden="true" />
        <span className="text-muted-foreground">Следующий урок:</span>
        <span className="ml-auto font-semibold">{student.nextLesson}</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={addXp}
          className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40"
        >
          <Plus className="size-4" aria-hidden="true" />
          10 XP
        </button>
        <Button type="button" variant="secondary" size="lg" onClick={changeDate} className="flex-1">
          <Pencil aria-hidden="true" />
          Изменить дату урока
        </Button>
      </div>
    </article>
  )
}
