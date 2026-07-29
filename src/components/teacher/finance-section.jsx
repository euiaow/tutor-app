import { useEffect, useState } from "react"
import { Plus } from "lucide-react"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { AddPaymentForm } from "@/components/teacher/add-payment-form"
import { StudentTags } from "@/components/student-tags"
import { subscribeToBalanceLedger } from "@/firebase/finance"
import { pluralizeLessons, getBalanceColorClass } from "@/lib/student-profile"

function AddPaymentPopoverCell({ studentId }) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
      >
        <Plus className="size-3.5" aria-hidden="true" />
        Внести
      </PopoverTrigger>
      <PopoverContent onClick={(e) => e.stopPropagation()}>
        <AddPaymentForm studentId={studentId} onDone={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
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
    <li className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
      <div className="min-w-0">
        <p className={`font-semibold ${isPayment ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"}`}>
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogTitle>Баланс — {student.name}</DialogTitle>
        <DialogDescription>История оплат и списаний за занятия.</DialogDescription>

        <div className="mt-4 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setAddingPayment((v) => !v)}
            className="self-start rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
          >
            + Внести оплату
          </button>

          {addingPayment ? (
            <AddPaymentForm studentId={student.id} onDone={() => setAddingPayment(false)} />
          ) : null}

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
      </DialogContent>
    </Dialog>
  )
}

export function FinanceSection({ students }) {
  const [selectedStudent, setSelectedStudent] = useState(null)

  const sortedStudents = [...students].sort(
    (a, b) => (a.paidLessonsBalance ?? 0) - (b.paidLessonsBalance ?? 0),
  )

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-extrabold tracking-tight text-foreground">Финансы</h2>

      {sortedStudents.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <p className="text-muted-foreground">Учеников пока нет</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">Имя</th>
                <th className="px-4 py-3">Теги</th>
                <th className="px-4 py-3">Баланс</th>
                <th className="px-4 py-3">Ставка/час</th>
                <th className="px-4 py-3">Оплата</th>
              </tr>
            </thead>
            <tbody>
              {sortedStudents.map((student) => {
                const balance = student.paidLessonsBalance ?? 0
                return (
                  <tr
                    key={student.id}
                    onClick={() => setSelectedStudent(student)}
                    className="cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-muted"
                  >
                    <td className="px-4 py-3 font-semibold text-card-foreground">{student.name}</td>
                    <td className="px-4 py-3">
                      <StudentTags student={student} />
                    </td>
                    <td className={`px-4 py-3 font-bold ${getBalanceColorClass(balance, student.lowBalanceThreshold ?? 1)}`}>
                      {balance} {pluralizeLessons(balance)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {student.hourlyRate > 0 ? `${student.hourlyRate} ₽` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <AddPaymentPopoverCell studentId={student.id} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <StudentLedgerDialog
        student={selectedStudent}
        open={Boolean(selectedStudent)}
        onOpenChange={(open) => !open && setSelectedStudent(null)}
      />
    </section>
  )
}
