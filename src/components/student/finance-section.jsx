import { useEffect, useState } from "react"
import { Wallet, Receipt } from "lucide-react"
import { useTranslation } from "react-i18next"
import { GlassDialog, GlassDialogContent, GlassDialogTitle, GlassDialogDescription } from "@/components/glass-dialog"
import { subscribeToBalanceLedger } from "@/firebase/finance"
import { useTimeZone } from "@/lib/user-prefs-context"
import { useDateLocale } from "@/lib/i18n"

const VISIBLE_COUNT = 3

function formatLedgerDate(date, timeZone, locale) {
  if (!date) return "—"
  return date.toLocaleDateString(locale, {
    timeZone,
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  })
}

// Read-only mirror of the teacher's own LedgerEntryRow (finance-section.jsx,
// teacher side) — same entry shape (`type`/`amount`/`note`/`createdAt`),
// just glass-styled and translated for the student page instead of a "внести
// оплату" action, which stays teacher-only.
function LedgerEntryRow({ entry }) {
  const { t } = useTranslation("student")
  const timeZone = useTimeZone()
  const dateLocale = useDateLocale()
  const isPayment = entry.type === "payment"

  return (
    // glass-tile (not glass-soft, which the outer section already uses) —
    // stacking the same translucent-white tier directly on top of itself
    // reads as flat/white instead of glass; a distinct tier is what actually
    // produces visible depth (same outer-panel/inner-tile pairing the
    // teacher's own ledger rows use — Panel is glass-panel, rows are
    // glass-tile).
    <li className="glass-tile-light flex items-center justify-between gap-3 rounded-[1.25rem] px-4 py-3 text-sm">
      <div className="min-w-0">
        <p className={`font-semibold ${isPayment ? "text-primary" : "text-foreground"}`}>
          {isPayment ? t("finance.paymentEntry", { count: entry.amount }) : t("finance.deductionEntry", { count: entry.amount })}
        </p>
        {entry.note ? <p className="truncate text-xs text-muted-foreground">{entry.note}</p> : null}
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">{formatLedgerDate(entry.createdAt, timeZone, dateLocale)}</span>
    </li>
  )
}

function AllPaymentsDialog({ open, onOpenChange, entries }) {
  const { t } = useTranslation("student")

  return (
    <GlassDialog open={open} onOpenChange={onOpenChange}>
      <GlassDialogContent>
        <GlassDialogTitle>{t("finance.dialogTitle")}</GlassDialogTitle>
        <GlassDialogDescription>{t("finance.dialogDescription")}</GlassDialogDescription>
        <div className="mt-4 max-h-[60vh] overflow-y-auto scrollbar-hidden pr-1">
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("finance.empty")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {entries.map((entry) => (
                <LedgerEntryRow key={entry.id} entry={entry} />
              ))}
            </ul>
          )}
        </div>
      </GlassDialogContent>
    </GlassDialog>
  )
}

export function StudentFinanceSection({ studentId, paidLessonsBalance }) {
  const { t } = useTranslation("student")
  const [entries, setEntries] = useState([])
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    const unsub = subscribeToBalanceLedger(studentId, setEntries, (error) => {
      console.error("Failed to load balance ledger:", error)
    })
    return () => unsub()
  }, [studentId])

  const visibleEntries = entries.slice(0, VISIBLE_COUNT)

  return (
    <section className="glass-soft rounded-4xl p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display flex items-center gap-2 text-lg text-foreground">
          <Wallet className="size-5 text-primary" aria-hidden="true" />
          {t("finance.title")}
        </h2>
        <span className="glass-tile-light inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold text-foreground">
          {t("finance.balance", { count: paidLessonsBalance ?? 0 })}
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {visibleEntries.length === 0 ? (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Receipt className="size-3.5" aria-hidden="true" /> {t("finance.empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {visibleEntries.map((entry) => (
              <LedgerEntryRow key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
      </div>

      {entries.length > VISIBLE_COUNT ? (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-3 text-sm font-semibold text-primary transition hover:brightness-110"
        >
          {t("finance.showAll")}
        </button>
      ) : null}

      <AllPaymentsDialog open={showAll} onOpenChange={setShowAll} entries={entries} />
    </section>
  )
}
