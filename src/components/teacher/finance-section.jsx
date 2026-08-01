import { useEffect, useState } from "react"
import { FileText } from "lucide-react"
import { AddPaymentForm } from "@/components/teacher/add-payment-form"
import { StudentTags } from "@/components/student-tags"
import { subscribeToBalanceLedger } from "@/firebase/finance"
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

// Same danger/warn/ok split as getBalanceColorClass used to encode via
// hardcoded Tailwind red/amber/emerald classes, expressed through the
// teacher theme's own --balance-* tokens instead so it reads consistently
// with the rest of the rose palette.
function balanceColor(balance, lowBalanceThreshold) {
  if (balance <= 0) return "var(--balance-danger)"
  if (balance <= lowBalanceThreshold) return "var(--balance-warn)"
  return "var(--balance-ok)"
}

function AddPaymentDialog({ studentId, open, onOpenChange }) {
  return (
    <TeacherDialog open={open} onOpenChange={onOpenChange}>
      <TeacherDialogContent>
        <TeacherDialogTitle>Внести оплату</TeacherDialogTitle>
        <div className="mt-5">
          <AddPaymentForm studentId={studentId} onDone={() => onOpenChange(false)} />
        </div>
      </TeacherDialogContent>
    </TeacherDialog>
  )
}

function formatLedgerDate(date) {
  if (!date) return "—"
  return date.toLocaleDateString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function LedgerEntryRow({ entry }) {
  const isPayment = entry.type === "payment"

  return (
    <li className="glass-tile flex items-center justify-between gap-3 rounded-[1rem] px-3 py-2 text-sm">
      <div className="min-w-0">
        <p className={`font-semibold ${isPayment ? "text-rose-deep" : "text-ink"}`}>
          {isPayment ? `+${entry.amount} оплата` : `${entry.amount} списание за урок`}
        </p>
        {entry.note ? <p className="truncate text-xs text-muted-foreground">{entry.note}</p> : null}
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">{formatLedgerDate(entry.createdAt)}</span>
    </li>
  )
}

function StudentLedgerDialog({ student, open, onOpenChange }) {
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
              <AddPaymentForm studentId={student.id} onDone={() => setAddingPayment(false)} />
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

export function FinanceSection({ students }) {
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [payingStudentId, setPayingStudentId] = useState(null)

  const sortedStudents = [...students].sort(
    (a, b) => (a.paidLessonsBalance ?? 0) - (b.paidLessonsBalance ?? 0),
  )

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
              const balance = student.paidLessonsBalance ?? 0

              return (
                <li key={student.id} className="flex flex-wrap items-center gap-4 py-3">
                  <button
                    type="button"
                    onClick={() => setSelectedStudent(student)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <StudentDot />
                        <span className="truncate font-semibold text-ink">{student.name}</span>
                        <StudentTags student={student} />
                      </div>
                    </div>
                  </button>

                  <div className="flex items-center gap-6">
                    <span
                      className="w-14 shrink-0 text-right text-sm font-semibold"
                      style={{ color: balanceColor(balance, student.lowBalanceThreshold ?? 1) }}
                    >
                      {balance}
                    </span>
                    <span className="w-16 shrink-0 text-right text-base text-muted-foreground">
                      {student.hourlyRate > 0 ? `${student.hourlyRate} ₽` : "—"}
                    </span>
                    <GhostBtn onClick={() => setPayingStudentId(student.id)} className="w-24 shrink-0 justify-center py-2 text-sm">
                      Оплата
                    </GhostBtn>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}

      <StudentLedgerDialog
        student={selectedStudent}
        open={Boolean(selectedStudent)}
        onOpenChange={(open) => !open && setSelectedStudent(null)}
      />

      <AddPaymentDialog
        studentId={payingStudentId}
        open={Boolean(payingStudentId)}
        onOpenChange={(open) => !open && setPayingStudentId(null)}
      />
    </Panel>
  )
}
