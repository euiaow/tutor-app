import { useEffect, useState } from "react"
import { Loader2, ChevronDown, ChevronUp, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react"
import { usePageTitle } from "@/lib/usePageTitle"
import {
  subscribeToAllTeachers,
  subscribeToSubscriptionPayments,
  recordSubscriptionPayment,
  updateTeacherNotes,
  setTeacherBlocked,
  setTeacherPlan,
  getTeacherStats,
  deleteTeacherAccount,
} from "@/firebase/admin"

function formatRuDate(date) {
  if (!date) return null
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })
}

function formatRuDateTime(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString("ru-RU", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

// Combines plan + paidUntil + block state into one label — trial plan
// never shows a payment status at all (nothing to pay), subscription plan
// shows active/expired the same way Phase 2 originally did, and an
// auto-block for non-payment gets its own distinct red label so it reads
// differently from a manual block (rendered separately by the caller via
// the "Заблокирован" badge).
function SubscriptionStatus({ teacher }) {
  if (teacher.plan !== "subscription") {
    return <span className="font-medium text-sky-600">Пробный период</span>
  }
  if (teacher.blocked && teacher.blockedReason === "subscription_expired") {
    return <span className="font-medium text-red-600">Заблокирован за неуплату</span>
  }
  if (!teacher.subscriptionPaidUntil) {
    return <span className="font-medium text-muted-foreground">Не оплачено</span>
  }
  const isActive = teacher.subscriptionPaidUntil.getTime() > Date.now()
  return isActive ? (
    <span className="font-medium text-emerald-600">Активна до {formatRuDate(teacher.subscriptionPaidUntil)}</span>
  ) : (
    <span className="font-medium text-red-600">Истекла {formatRuDate(teacher.subscriptionPaidUntil)}</span>
  )
}

function PlanToggle({ teacherId, plan }) {
  const [saving, setSaving] = useState(false)

  async function handleSelect(nextPlan) {
    if (nextPlan === plan || saving) return
    setSaving(true)
    try {
      await setTeacherPlan(teacherId, nextPlan)
    } catch (err) {
      console.error("Failed to set teacher plan:", err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="inline-flex overflow-hidden rounded-md border border-neutral-300">
      {[
        { value: "trial", label: "Пробный период" },
        { value: "subscription", label: "Подписка" },
      ].map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={saving}
          onClick={() => handleSelect(option.value)}
          className={
            "px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 " +
            (plan === option.value ? "bg-neutral-900 text-white" : "bg-white text-neutral-600 hover:bg-neutral-50")
          }
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function ConfirmDialog({ open, title, description, confirmLabel, onConfirm, onCancel, busy }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-5 shadow-xl">
        <h3 className="text-base font-semibold text-neutral-900">{title}</h3>
        {description ? <p className="mt-2 text-sm text-neutral-600">{description}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// Higher-friction than ConfirmDialog's plain confirm button — this action
// is irreversible (deletes the teacher's students, groups, programs,
// tokens, notifications, and the Firebase Auth account itself), so it
// requires typing the teacher's own name/email exactly before the button
// even enables, the same "type to confirm" pattern destructive actions get
// elsewhere.
function DeleteTeacherDialog({ open, teacher, onConfirm, onCancel, busy, error }) {
  const [confirmText, setConfirmText] = useState("")

  useEffect(() => {
    if (open) setConfirmText("")
  }, [open])

  if (!open) return null

  const expected = teacher.name || teacher.email || teacher.id
  const canConfirm = confirmText.trim() === expected

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg border border-red-200 bg-white p-5 shadow-xl">
        <h3 className="text-base font-semibold text-red-700">Удалить учителя «{expected}»?</h3>
        <p className="mt-2 text-sm text-neutral-600">
          Это необратимо удалит всех учеников, группы, программы, шаблоны, уведомления и токены этого учителя, а
          также его аккаунт входа. Данные восстановить будет нельзя.
        </p>
        <label className="mt-4 block text-xs font-medium text-neutral-500">
          Введите «{expected}» для подтверждения
        </label>
        <input
          type="text"
          value={confirmText}
          onChange={(event) => setConfirmText(event.target.value)}
          className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          autoFocus
        />
        {error ? <p className="mt-2 text-sm font-medium text-red-600">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || !canConfirm}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : "Удалить навсегда"}
          </button>
        </div>
      </div>
    </div>
  )
}

function PaymentForm({ teacherId }) {
  const [daysAdded, setDaysAdded] = useState("")
  const [amount, setAmount] = useState("")
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(event) {
    event.preventDefault()
    setError("")
    const days = Number(daysAdded)
    if (!Number.isFinite(days) || days <= 0) {
      setError("Укажите положительное число дней")
      return
    }
    setSaving(true)
    try {
      await recordSubscriptionPayment(teacherId, {
        daysAdded: days,
        amount: amount === "" ? null : Number(amount),
        note: note.trim() || null,
      })
      setDaysAdded("")
      setAmount("")
      setNote("")
    } catch (err) {
      console.error("Failed to record payment:", err)
      setError(err?.message || "Не удалось внести оплату")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 rounded-md border border-neutral-200 p-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-neutral-500">Дней</label>
        <input
          type="number"
          min="1"
          value={daysAdded}
          onChange={(event) => setDaysAdded(event.target.value)}
          className="w-24 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-neutral-500">Сумма (необязательно)</label>
        <input
          type="number"
          min="0"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          className="w-28 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
        />
      </div>
      <div className="flex flex-1 min-w-[10rem] flex-col gap-1">
        <label className="text-xs font-medium text-neutral-500">Заметка к платежу</label>
        <input
          type="text"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
      >
        {saving ? "Добавляем..." : "Добавить"}
      </button>
      {error ? <p className="w-full text-sm font-medium text-red-600">{error}</p> : null}
    </form>
  )
}

function PaymentHistory({ teacherId }) {
  const [payments, setPayments] = useState(null)
  const [error, setError] = useState("")

  useEffect(() => {
    setPayments(null)
    setError("")
    const unsubscribe = subscribeToSubscriptionPayments(teacherId, setPayments, (err) => {
      console.error("Failed to load payment history:", err)
      // Deliberately NOT collapsed into "no payments" (payments.length ===
      // 0) — a permission-denied here (e.g. a missing/stale Firestore Rule
      // for teachers/{id}/subscriptionPayments) would otherwise look
      // exactly like "this teacher genuinely has no payment history",
      // which already happened once and was confusing to debug.
      setError(err?.message || "Не удалось загрузить историю платежей")
    })
    return unsubscribe
  }, [teacherId])

  if (error) {
    return <p className="mt-2 text-sm font-medium text-red-600">{error}</p>
  }
  if (payments === null) {
    return <p className="mt-2 text-sm text-neutral-500">Загрузка истории...</p>
  }
  if (payments.length === 0) {
    return <p className="mt-2 text-sm text-neutral-500">Платежей ещё не было</p>
  }

  return (
    <ul className="mt-2 flex flex-col gap-1.5">
      {payments.map((payment) => (
        <li key={payment.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="text-neutral-500">{formatRuDateTime(payment.recordedAt) ?? "..."}</span>
          <span className="font-medium text-neutral-900">+{payment.daysAdded} дн.</span>
          {payment.amount != null ? <span className="text-neutral-600">{payment.amount} ₽</span> : null}
          {payment.note ? <span className="text-neutral-500">— {payment.note}</span> : null}
        </li>
      ))}
    </ul>
  )
}

function NotesEditor({ teacherId, initialNotes }) {
  const [notes, setNotes] = useState(initialNotes)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    try {
      await updateTeacherNotes(teacherId, notes)
      setSaved(true)
    } catch (err) {
      console.error("Failed to save notes:", err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={notes}
        onChange={(event) => {
          setNotes(event.target.value)
          setSaved(false)
        }}
        rows={3}
        className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
        placeholder="Личные рабочие заметки об этом учителе..."
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="self-start rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
        >
          {saving ? "Сохраняем..." : "Сохранить"}
        </button>
        {saved ? <span className="text-sm text-emerald-600">Сохранено</span> : null}
      </div>
    </div>
  )
}

function StatTile({ label, value }) {
  return (
    <div className="rounded-md border border-neutral-200 px-3 py-2">
      <p className="text-lg font-semibold text-neutral-900">{value}</p>
      <p className="text-xs text-neutral-500">{label}</p>
    </div>
  )
}

function IntegrationBadge({ label, connected }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium " +
        (connected ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-neutral-200 bg-neutral-50 text-neutral-500")
      }
    >
      <span className={"size-1.5 rounded-full " + (connected ? "bg-emerald-500" : "bg-neutral-300")} aria-hidden="true" />
      {label}: {connected ? "подключено" : "не подключено"}
    </span>
  )
}

function StatsBlock({ teacherId }) {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    setStats(null)
    setError("")
    getTeacherStats(teacherId)
      .then((data) => {
        if (!cancelled) setStats(data)
      })
      .catch((err) => {
        console.error("Failed to load teacher stats:", err)
        if (!cancelled) setError(err?.message || "Не удалось загрузить статистику")
      })
    return () => {
      cancelled = true
    }
  }, [teacherId])

  if (error) {
    return <p className="text-sm font-medium text-red-600">{error}</p>
  }
  if (!stats) {
    return (
      <p className="flex items-center gap-2 text-sm text-neutral-500">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Считаем статистику...
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <StatTile label="Учеников" value={stats.studentsCount} />
        <StatTile label="Групп" value={stats.groupsCount} />
        <StatTile label="Программ" value={stats.curriculumTemplatesCount} />
        <StatTile label="Назначено программ" value={stats.assignedProgramsCount} />
        <StatTile label="Проведено уроков всего" value={stats.totalCompletedLessons} />
        <StatTile label="Уроков за 30 дней" value={stats.completedLessonsLast30Days} />
      </div>
      <div className="flex flex-wrap gap-2">
        <IntegrationBadge label="Google Календарь" connected={stats.integrationsConnected.googleCalendar} />
        <IntegrationBadge label="Видеозвонок" connected={stats.integrationsConnected.videoCall} />
        <IntegrationBadge label="Бот" connected={stats.integrationsConnected.botNotifications} />
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-neutral-600">
        <span>Регистрация: {formatRuDateTime(stats.registeredAt) ?? "—"}</span>
        <span>Последнее действие: {formatRuDateTime(stats.lastActivityAt) ?? "—"}</span>
      </div>
    </div>
  )
}

function TeacherRow({ teacher }) {
  const [expanded, setExpanded] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")

  async function handleToggleBlocked() {
    setToggling(true)
    try {
      await setTeacherBlocked(teacher.id, !teacher.blocked)
      setConfirmOpen(false)
    } catch (err) {
      console.error("Failed to toggle blocked status:", err)
    } finally {
      setToggling(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    setDeleteError("")
    try {
      await deleteTeacherAccount(teacher.id)
      setDeleteOpen(false)
    } catch (err) {
      console.error("Failed to delete teacher account:", err)
      setDeleteError(err?.message || "Не удалось удалить учителя")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left"
      >
        <span className="min-w-[10rem] flex-1 font-medium text-neutral-900">{teacher.name || "Без имени"}</span>
        <span className="min-w-[12rem] flex-1 text-sm text-neutral-500">{teacher.email || "—"}</span>
        <span className="text-sm text-neutral-500">{formatRuDate(teacher.createdAt) ?? "—"}</span>
        <span className="text-sm"><SubscriptionStatus teacher={teacher} /></span>
        {teacher.blocked && teacher.blockedReason === "manual" ? (
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-red-600">
            <ShieldAlert className="size-4" aria-hidden="true" /> Заблокирован
          </span>
        ) : null}
        {expanded ? <ChevronUp className="ml-auto size-4 text-neutral-400" aria-hidden="true" /> : <ChevronDown className="ml-auto size-4 text-neutral-400" aria-hidden="true" />}
      </button>

      {expanded ? (
        <div className="flex flex-col gap-6 border-t border-neutral-200 px-4 py-4">
          <section>
            <h4 className="mb-2 text-sm font-semibold text-neutral-900">Тарифный план</h4>
            <PlanToggle teacherId={teacher.id} plan={teacher.plan} />
            {teacher.plan === "subscription" ? (
              <p className="mt-2 text-xs text-neutral-500">
                Если запись об оплате отсутствует более 2 дней после истечения срока — доступ блокируется
                автоматически.
              </p>
            ) : (
              <p className="mt-2 text-xs text-neutral-500">На пробном периоде оплата не требуется, блокировка за
                неуплату не применяется.</p>
            )}
          </section>

          <section>
            <h4 className="mb-2 text-sm font-semibold text-neutral-900">Оплата</h4>
            <p className="mb-3 text-sm"><SubscriptionStatus teacher={teacher} /></p>
            <PaymentForm teacherId={teacher.id} />
            <PaymentHistory teacherId={teacher.id} />
          </section>

          <section>
            <h4 className="mb-2 text-sm font-semibold text-neutral-900">Статистика</h4>
            <StatsBlock teacherId={teacher.id} />
          </section>

          <section>
            <h4 className="mb-2 text-sm font-semibold text-neutral-900">Заметки</h4>
            <NotesEditor teacherId={teacher.id} initialNotes={teacher.adminNotes} />
          </section>

          <section>
            <h4 className="mb-2 text-sm font-semibold text-neutral-900">Доступ</h4>
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className={
                "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium " +
                (teacher.blocked
                  ? "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                  : "border-red-300 text-red-600 hover:bg-red-50")
              }
            >
              {teacher.blocked ? <ShieldCheck className="size-4" aria-hidden="true" /> : <ShieldAlert className="size-4" aria-hidden="true" />}
              {teacher.blocked ? "Разблокировать" : "Заблокировать"}
            </button>
          </section>

          <section>
            <h4 className="mb-2 text-sm font-semibold text-red-700">Опасная зона</h4>
            <button
              type="button"
              onClick={() => {
                setDeleteError("")
                setDeleteOpen(true)
              }}
              className="inline-flex items-center gap-2 rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Удалить учителя
            </button>
          </section>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        title={teacher.blocked ? `Разблокировать «${teacher.name || teacher.email}»?` : `Заблокировать «${teacher.name || teacher.email}»?`}
        description={
          teacher.blocked
            ? "Доступ к платформе будет немедленно восстановлен."
            : "Учитель немедленно потеряет доступ к платформе. Данные (ученики, уроки) не удаляются."
        }
        confirmLabel={teacher.blocked ? "Разблокировать" : "Заблокировать"}
        onConfirm={handleToggleBlocked}
        onCancel={() => setConfirmOpen(false)}
        busy={toggling}
      />

      <DeleteTeacherDialog
        open={deleteOpen}
        teacher={teacher}
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
        busy={deleting}
        error={deleteError}
      />
    </div>
  )
}

export function AdminDashboard() {
  usePageTitle("Админка")
  const [teachers, setTeachers] = useState(null)
  const [error, setError] = useState("")

  useEffect(() => {
    const unsubscribe = subscribeToAllTeachers(setTeachers, (err) => {
      console.error("Failed to load teachers list:", err)
      setError(err?.message || "Не удалось загрузить список учителей")
    })
    return unsubscribe
  }, [])

  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-6 text-xl font-semibold text-neutral-900">Админка</h1>

        {error ? <p className="mb-4 text-sm font-medium text-red-600">{error}</p> : null}

        {teachers === null && !error ? (
          <p className="flex items-center gap-2 text-sm text-neutral-500">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Загрузка списка учителей...
          </p>
        ) : null}

        {teachers && teachers.length === 0 ? <p className="text-sm text-neutral-500">Учителей пока нет</p> : null}

        <div className="flex flex-col gap-2">
          {teachers?.map((teacher) => (
            <TeacherRow key={teacher.id} teacher={teacher} />
          ))}
        </div>
      </div>
    </main>
  )
}
