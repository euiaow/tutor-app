import { useEffect, useState } from "react"
import { FileText } from "lucide-react"
import { AddPaymentForm } from "@/components/teacher/add-payment-form"
import { StudentTags } from "@/components/student-tags"
import { subscribeToBalanceLedger } from "@/firebase/finance"
import { subscribeToIncomeLessons } from "@/firebase/lessons"
import {
  GhostBtn,
  Panel,
  StudentDot,
  Title,
  TeacherDialog,
  TeacherDialogContent,
  TeacherDialogDescription,
  TeacherDialogTitle,
} from "@/components/teacher/theme-ui"
import { useTimeZone } from "@/lib/user-prefs-context"
import { auth } from "@/firebase/firebase"

// Same danger/warn/ok split as getBalanceColorClass used to encode via
// hardcoded Tailwind red/amber/emerald classes, expressed through the
// teacher theme's own --balance-* tokens instead so it reads consistently
// with the rest of the rose palette.
function balanceColor(balance, lowBalanceThreshold) {
  if (balance <= 0) return "var(--balance-danger)"
  if (balance <= lowBalanceThreshold) return "var(--balance-warn)"
  return "var(--balance-ok)"
}

const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

// Moscow has been fixed at UTC+3 with no DST since 2014, so the week
// (Monday 00:00 – Sunday 23:59:59.999, Moscow time) can be derived with
// plain UTC-getter arithmetic instead of a timezone library: shifting the
// instant by the fixed offset before reading UTC fields yields Moscow's
// wall-clock date, and shifting back after zeroing to Monday midnight
// recovers the real UTC instant that boundary falls on.
function getMoscowWeekBounds(reference = new Date()) {
  const shifted = new Date(reference.getTime() + MOSCOW_OFFSET_MS)
  const daysSinceMonday = (shifted.getUTCDay() + 6) % 7
  const mondayWallMs = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() - daysSinceMonday)

  const weekStart = new Date(mondayWallMs - MOSCOW_OFFSET_MS)
  const weekEnd = new Date(weekStart.getTime() + 7 * DAY_MS - 1)
  return { weekStart, weekEnd }
}

// A lesson bills at its own program's rate when one is resolved
// (lesson.programId, stamped at creation time — see core/lessons.js's
// createUpcomingDraft/createExtraLesson and core/groups.js's group-mirror
// fan-out) and that program has its own hourlyRate set; otherwise falls back
// to the student's single hourlyRate, same as before per-program rates
// existed — covers a student with 0-1 programs, a legacy lesson with no
// programId, and a genuinely ambiguous slot (2+ programs sharing a subject,
// no explicit override) alike.
function resolveLessonRate(lesson, student, programsByStudentId) {
  if (lesson.programId) {
    const programs = programsByStudentId?.[lesson.studentId] ?? []
    const program = programs.find((p) => p.id === lesson.programId)
    if (typeof program?.hourlyRate === "number" && program.hourlyRate > 0) {
      return program.hourlyRate
    }
  }
  return student?.hourlyRate ?? 0
}

// income lessons already come pre-filtered to status upcoming/completed
// (see subscribeToIncomeLessons) — this only has to narrow that down to the
// current Moscow week (by *effective* date, since a reschedule can move a
// lesson in or out of it) and skip students with no resolvable rate.
function computeWeeklyIncome(incomeLessons, students, programsByStudentId) {
  const { weekStart, weekEnd } = getMoscowWeekBounds()
  const studentById = new Map(students.map((student) => [student.id, student]))

  let total = 0
  for (const lesson of incomeLessons) {
    const student = studentById.get(lesson.studentId)
    if (!student) continue
    const rate = resolveLessonRate(lesson, student, programsByStudentId)
    if (!(rate > 0)) continue

    const effectiveDate = lesson.rescheduledDate ?? lesson.date
    if (!effectiveDate || effectiveDate < weekStart || effectiveDate > weekEnd) continue

    total += rate * (lesson.durationMinutes / 60)
  }
  return total
}

// Once a student has 2+ programs, students.paidLessonsBalance itself is
// frozen at 0 (see assignCurriculumTemplate's 1-to-2 transfer,
// core/curriculum.js) — sorting by it directly would clump every
// multi-program student at the "zero" end regardless of their real
// per-program balances. The minimum across their own programs is the
// closest single number to "how urgently does this student need a
// payment" for sort purposes; it's never displayed, just used to order
// the list the same way the plain single balance already did before.
function sortableBalance(student, programs) {
  if (programs.length >= 2) {
    return Math.min(...programs.map((program) => program.paidLessonsBalance ?? 0))
  }
  return student.paidLessonsBalance ?? 0
}

function AddPaymentDialog({ studentId, programs, open, onOpenChange }) {
  return (
    <TeacherDialog open={open} onOpenChange={onOpenChange}>
      <TeacherDialogContent>
        <TeacherDialogTitle>Внести оплату</TeacherDialogTitle>
        <div className="mt-5">
          <AddPaymentForm studentId={studentId} programs={programs} onDone={() => onOpenChange(false)} />
        </div>
      </TeacherDialogContent>
    </TeacherDialog>
  )
}

function formatLedgerDate(date, timeZone) {
  if (!date) return "—"
  return date.toLocaleDateString("ru-RU", {
    timeZone,
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function LedgerEntryRow({ entry }) {
  const timeZone = useTimeZone()
  const isPayment = entry.type === "payment"

  return (
    <li className="glass-tile flex items-center justify-between gap-3 rounded-[1rem] px-3 py-2 text-sm">
      <div className="min-w-0">
        <p className={`font-semibold ${isPayment ? "text-rose-deep" : "text-ink"}`}>
          {isPayment ? `+${entry.amount} оплата` : `${entry.amount} списание за урок`}
          {entry.programName ? <span className="ml-1.5 font-normal text-muted-foreground">· {entry.programName}</span> : null}
        </p>
        {entry.note ? <p className="truncate text-xs text-muted-foreground">{entry.note}</p> : null}
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">{formatLedgerDate(entry.createdAt, timeZone)}</span>
    </li>
  )
}

function StudentLedgerDialog({ student, programs, open, onOpenChange }) {
  const [entries, setEntries] = useState([])
  const [addingPayment, setAddingPayment] = useState(false)

  useEffect(() => {
    if (!open || !student) return

    const unsub = subscribeToBalanceLedger(
      student.id,
      (data) => setEntries(data),
      (error) => console.error("Failed to load balance ledger:", error),
    )

    return () => unsub()
  }, [open, student])

  if (!student) return null

  return (
    <TeacherDialog open={open} onOpenChange={onOpenChange}>
      <TeacherDialogContent>
        <TeacherDialogTitle>Баланс — {student.name}</TeacherDialogTitle>
        <TeacherDialogDescription>История оплат и списаний за занятия.</TeacherDialogDescription>

        <div className="mt-4 flex flex-col gap-3">
          <GhostBtn onClick={() => setAddingPayment((v) => !v)} className="self-start px-4 py-2">
            + Внести оплату
          </GhostBtn>

          {addingPayment ? (
            <div className="glass-tile rounded-[1.25rem] p-4">
              <AddPaymentForm studentId={student.id} programs={programs} onDone={() => setAddingPayment(false)} />
            </div>
          ) : null}

          <div className="max-h-[50vh] overflow-y-auto scrollbar-hidden pr-1">
            {entries.length === 0 ? (
              <p className="text-sm text-muted-foreground">Операций пока нет</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {entries.map((entry) => (
                  <LedgerEntryRow key={entry.id} entry={entry} />
                ))}
              </ul>
            )}
          </div>
        </div>
      </TeacherDialogContent>
    </TeacherDialog>
  )
}

// A student's own "Оплачено"/"Ставка" pair once they have 0-1 programs —
// unchanged from before per-program balances/rates existed.
function SingleProgramBalance({ student }) {
  const balance = student.paidLessonsBalance ?? 0

  return (
    <>
      <span className="flex items-center gap-1.5 sm:contents">
        <span className="text-xs text-muted-foreground sm:hidden">Оплачено:</span>
        <span
          className="text-lg font-semibold sm:w-14 sm:shrink-0 sm:text-right"
          style={{ color: balanceColor(balance, student.lowBalanceThreshold ?? 1) }}
        >
          {balance}
        </span>
      </span>
      <span className="flex items-center gap-1.5 sm:contents">
        <span className="text-xs text-muted-foreground sm:hidden">Ставка:</span>
        <span className="text-base text-muted-foreground sm:w-16 sm:shrink-0 sm:text-right">
          {student.hourlyRate > 0 ? `${student.hourlyRate} ₽` : "—"}
        </span>
      </span>
    </>
  )
}

// Once a student has 2+ programs, "Оплачено" and "Ставка" stop being single
// values — each program bills and gets paid for independently (see
// core/finance.js's resolveBalanceTarget). One row per program, built with
// the exact same flex-1-name + gap-6-group(w-14, w-16, w-24) shape the
// header row and SingleProgramBalance's own row already use — the name gets
// whatever width the row doesn't need for the numbers (flex-1, so a long
// template name like "Информатика — Олимпиадная подготовка (IOI)" still gets
// real room before truncating), and the trailing w-14/w-16/w-24 slots land
// in exactly the same x-position as the header's Оплачено/Ставка/action
// columns — a fixed-width name column here would drift out of alignment
// with those depending on how long the name happened to be.
function MultiProgramBalanceRow({ student, program }) {
  const balance = program.paidLessonsBalance ?? 0

  return (
    <div className="flex items-center gap-4">
      <span className="min-w-0 flex-1 truncate pl-7 text-sm text-ink" title={program.name}>
        {program.name}
      </span>
      <div className="flex items-center gap-6">
        <span
          className="w-14 shrink-0 text-right text-sm font-semibold"
          style={{ color: balanceColor(balance, student.lowBalanceThreshold ?? 1) }}
        >
          {balance}
        </span>
        <span className="w-16 shrink-0 text-right text-sm text-muted-foreground">
          {typeof program.hourlyRate === "number" && program.hourlyRate > 0 ? `${program.hourlyRate} ₽` : "—"}
        </span>
        <span className="hidden w-24 shrink-0 sm:block" />
      </div>
    </div>
  )
}

export function FinanceSection({ students, programsByStudentId }) {
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [payingStudentId, setPayingStudentId] = useState(null)
  const [incomeLessons, setIncomeLessons] = useState([])

  // Group lessons now live as real per-student mirrors in this exact same
  // collection (see core/groups.js) — subscribeToIncomeLessons already
  // returns one doc per member with its own studentId, so
  // computeWeeklyIncome sums them the same way it sums any individual
  // lesson, once per member, with no separate group income source needed.
  useEffect(() => {
    const uid = auth.currentUser?.uid
    if (!uid) return

    const unsub = subscribeToIncomeLessons(uid, setIncomeLessons, (error) => {
      console.error("Failed to load income lessons:", error)
    })

    return unsub
  }, [])

  const sortedStudents = [...students].sort(
    (a, b) =>
      sortableBalance(a, programsByStudentId?.[a.id] ?? []) - sortableBalance(b, programsByStudentId?.[b.id] ?? []),
  )
  // Group lessons Phase 5 — individual income + the sum across every
  // attendee of every group lesson this week, per the task's own explicit
  // "не только на одну" requirement (a 3-member group lesson adds 3
  // students' rates, not 1).
  const weeklyIncome = computeWeeklyIncome(incomeLessons, students, programsByStudentId)
  const selectedStudentPrograms = selectedStudent ? programsByStudentId?.[selectedStudent.id] ?? [] : []
  const payingStudentPrograms = payingStudentId ? programsByStudentId?.[payingStudentId] ?? [] : []

  return (
    <Panel>
      <Title>Финансы</Title>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <FileText className="size-3" aria-hidden="true" /> Ученики с предоплатой и задолженностями
      </p>

      {sortedStudents.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Учеников пока нет</p>
      ) : (
        <>
          <div className="mt-4 hidden items-center gap-4 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:flex">
            <span className="flex-1">Ученик</span>
            <div className="flex items-center gap-6">
              <span className="w-14 text-right">Оплачено</span>
              <span className="w-16 text-right">Ставка</span>
              <span className="w-24 shrink-0" />
            </div>
          </div>

          <ul className="mt-2 flex flex-col gap-1">
            {sortedStudents.map((student) => {
              const programs = programsByStudentId?.[student.id] ?? []
              const hasMultiplePrograms = programs.length >= 2

              return (
                <li key={student.id} className="flex flex-col gap-2 py-3">
                  {hasMultiplePrograms ? (
                    <>
                      <div className="flex items-center gap-4">
                        <button
                          type="button"
                          onClick={() => setSelectedStudent(student)}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <StudentDot />
                          <span className="truncate font-semibold text-ink">{student.name}</span>
                          <StudentTags student={student} />
                        </button>
                        {/* Empty placeholders reserving the same w-14/w-16
                            width the header's Оплачено/Ставка columns use —
                            without them the Оплата button below would sit
                            under Ставка instead of the header's own action
                            column, and every MultiProgramBalanceRow's numbers
                            (which assume this same gap-6 group width) would
                            drift out of alignment with the header too. */}
                        <div className="flex items-center sm:gap-6">
                          <span className="hidden w-14 shrink-0 sm:block" />
                          <span className="hidden w-16 shrink-0 sm:block" />
                          <GhostBtn onClick={() => setPayingStudentId(student.id)} className="shrink-0 justify-center py-2 text-sm sm:w-24">
                            Оплата
                          </GhostBtn>
                        </div>
                      </div>
                      {programs.map((program) => (
                        <MultiProgramBalanceRow key={program.id} student={student} program={program} />
                      ))}
                    </>
                  ) : (
                    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
                      <button
                        type="button"
                        onClick={() => setSelectedStudent(student)}
                        className="flex w-full min-w-0 items-center gap-3 text-left sm:w-auto sm:flex-1"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <StudentDot />
                            <span className="font-semibold text-ink sm:truncate">{student.name}</span>
                            <StudentTags student={student} />
                          </div>
                        </div>
                      </button>

                      <div className="flex items-center justify-between gap-4 sm:justify-start sm:gap-6">
                        <SingleProgramBalance student={student} />
                        <GhostBtn onClick={() => setPayingStudentId(student.id)} className="shrink-0 justify-center py-2 text-sm sm:w-24">
                          Оплата
                        </GhostBtn>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-glass-border pt-3">
        <span className="font-display text-sm text-muted-foreground">Доход за неделю</span>
        <span className="glass-tile rounded-full px-4 py-1.5 font-display text-base text-ink">
          {Math.round(weeklyIncome)} ₽
        </span>
      </div>

      <StudentLedgerDialog
        student={selectedStudent}
        programs={selectedStudentPrograms}
        open={Boolean(selectedStudent)}
        onOpenChange={(open) => !open && setSelectedStudent(null)}
      />

      <AddPaymentDialog
        studentId={payingStudentId}
        programs={payingStudentPrograms}
        open={Boolean(payingStudentId)}
        onOpenChange={(open) => !open && setPayingStudentId(null)}
      />
    </Panel>
  )
}
