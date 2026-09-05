import { useEffect, useLayoutEffect, useRef, useState } from "react"
import {
  Bell,
  CalendarPlus,
  ChevronRight,
  Clock,
  GraduationCap,
  Loader2,
  LogOut,
  Play,
  Plus,
  RefreshCw,
  Settings,
} from "lucide-react"
import { usePageTitle } from "@/lib/usePageTitle"
import { StudentRow } from "@/components/teacher/student-row"
import { GroupsSection, GroupFormDialog } from "@/components/teacher/groups-section"
import { subscribeToGroups } from "@/firebase/groups"
import { UpcomingLessonCard } from "@/components/teacher/upcoming-lesson-card"
import { RegistrationLinkDialog } from "@/components/teacher/registration-link-dialog"
import { PendingRegistrations } from "@/components/teacher/pending-registrations"
import { HomeworkLessonDialog } from "@/components/teacher/homework-lesson-dialog"
import { ExtraLessonDialog } from "@/components/teacher/extra-lesson-dialog"
import { StudentTags } from "@/components/student-tags"
import { FinanceSection } from "@/components/teacher/finance-section"
import { CurriculumSection } from "@/components/teacher/curriculum-section"
import { getAllProgramsByStudent } from "@/firebase/curriculum"
import { VideoCallSettings } from "@/components/teacher/video-call-settings"
import { subscribeToVideoCallUrl } from "@/firebase/videoCall"
import { auth } from "@/firebase/firebase"
import { openExternalLink } from "@/lib/telegramWebApp"
import { Spinner } from "@/components/ui/spinner"
import {
  GhostBtn,
  Panel,
  SolidBtn,
  StudentDot,
  TeacherCancelBtn,
  TeacherDialog,
  TeacherDialogContent,
  TeacherDialogDescription,
  TeacherDialogTitle,
  TeacherModalFooter,
  TeacherSaveBtn,
  TeacherStatusBadge,
  teacherInputCls,
  Title,
} from "@/components/teacher/theme-ui"
import { GroupLessonDialog } from "@/components/teacher/group-lesson-dialog"
import { NotificationsList } from "@/components/notifications-list"
import { subscribeToStudents } from "@/firebase/students"
import {
  subscribeToTeacherNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/firebase/notifications"
import { signOutTeacher } from "@/firebase/auth"
import {
  subscribeToCompletedLessons,
  subscribeToUpcomingLessons,
  getAllCompletedLessons,
} from "@/firebase/lessons"
import { formatLessonDateTime } from "@/lib/schedule"
import {
  disconnectGoogleCalendar,
  getCalendarEmbedInfo,
  getGoogleCalendarStatus,
  startGoogleOAuth,
} from "@/firebase/google-calendar"
import { subscribeToTeacherProfile, updateTeacherSettings, updateTeacherName } from "@/firebase/teachers"
import { getThemeById } from "@/lib/themes"
import { UserPrefsProvider, useTimeZone } from "@/lib/user-prefs-context"
import { resolveTimeZone } from "@/lib/timezone"
import { SettingsDialog } from "@/components/settings-dialog"

const MAX_CLUSTERED_LESSONS = 3
const MAX_LESSON_GAP_DAYS = 6
const MS_PER_DAY = 1000 * 60 * 60 * 24

// Mirrors the admin panel's own status wording (AdminDashboard.jsx's
// SubscriptionStatus) but as one short line for the header, next to
// "Кабинет преподавателя" — a trial-plan teacher never sees payment dates
// at all, only a subscription-plan one does.
function subscriptionHeaderLabel(teacherProfile) {
  if (!teacherProfile) return null
  if (teacherProfile.plan !== "subscription") return "Пробный период"

  const paidUntil = teacherProfile.subscriptionPaidUntil?.toDate?.() ?? null
  if (!paidUntil) return "Подписка не оплачена"

  const day = String(paidUntil.getDate()).padStart(2, "0")
  const month = String(paidUntil.getMonth() + 1).padStart(2, "0")
  return paidUntil.getTime() > Date.now() ? `Подписка до ${day}.${month}` : `Подписка истекла ${day}.${month}`
}

// First-login prompt: a brand-new teachers/{uid} doc is bootstrapped with
// name: user.displayName || "" (App.jsx), which is empty unless their
// Google/etc. auth provider happened to supply one — this blocks the
// dashboard behind a one-field "как вас зовут" form until a real name is
// saved, so the admin panel and this page's own header never show a blank/
// "Без имени" teacher for long. Deliberately not built on TeacherDialog:
// that shared shell always renders a dismissible close-X, and this must
// not be dismissible without saving a name.
function NamePromptDialog() {
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function handleSave(event) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError("Введите имя")
      return
    }
    setSaving(true)
    setError("")
    try {
      await updateTeacherName(trimmed)
    } catch (err) {
      console.error("Failed to save teacher name:", err)
      setError(err?.message || "Не удалось сохранить имя")
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-ink/25 p-4 backdrop-blur-sm">
      <form
        onSubmit={handleSave}
        className="glass-panel w-full max-w-sm rounded-[2rem] p-6 outline-none md:p-7"
      >
        <h2 className="font-display text-xl tracking-tight text-ink">Как вас зовут?</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Это имя будет отображаться в шапке кабинета и в админ-панели.
        </p>

        <input
          autoFocus
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Имя"
          disabled={saving}
          className={`${teacherInputCls} mt-5`}
        />

        {error ? <p className="mt-2 text-sm font-semibold text-destructive">{error}</p> : null}

        <TeacherSaveBtn type="submit" disabled={saving} className="mt-5 w-full">
          {saving ? <Loader2 className="mx-auto size-4 animate-spin" aria-hidden="true" /> : "Сохранить"}
        </TeacherSaveBtn>
      </form>
    </div>
  )
}

// If a student's lessons are weekly, showing 3 of them a week apart isn't
// useful — only the first one is actually "coming up soon". Take lessons
// sorted by date, always keep the first, and keep adding the next one only
// while the gap from the last kept lesson stays within MAX_LESSON_GAP_DAYS;
// stop at the first gap that's too big, capped at MAX_CLUSTERED_LESSONS.
function selectClusteredUpcomingLessons(lessons) {
  const sorted = [...lessons].sort((a, b) => a.date - b.date)
  const selected = []

  for (const lesson of sorted) {
    if (selected.length >= MAX_CLUSTERED_LESSONS) break

    if (selected.length === 0) {
      selected.push(lesson)
      continue
    }

    const previous = selected[selected.length - 1]
    const gapDays = (lesson.date - previous.date) / MS_PER_DAY

    if (gapDays > MAX_LESSON_GAP_DAYS) break

    selected.push(lesson)
  }

  return selected
}

// A group lesson is fanned out as one real lesson doc per member (see
// core/groups.js) — subscribeToUpcomingLessons therefore returns N
// duplicate-looking entries for the same class session, one per attendee.
// Collapsed here into a single synthetic entry per groupLessonKey (built
// off the first mirror found, plus the full member id list) before
// clustering/rendering, so the dashboard shows one card per session, not
// one per member — the same "это один урок, не несколько" a group lesson
// already gets everywhere else (reminders, income, etc).
// Builds the result in a single pass, inserting each entry (individual, or
// a group lesson's first-seen mirror) at the position it's first
// encountered — not "every individual lesson, then every group lesson"
// (a real bug found in session 39's group-completion testing: that shape
// silently threw away the caller's own date ordering, since every group
// entry always landed after every individual one regardless of date).
// selectClusteredUpcomingLessons happens to re-sort its own input
// afterward, which is why this never surfaced there — "Прошедшие уроки"
// renders this output directly, so the bug was fully visible there.
function collapseGroupLessons(lessons) {
  const result = []
  const groupEntries = new Map()

  for (const lesson of lessons) {
    if (!lesson.isGroupLesson || !lesson.groupLessonKey) {
      result.push(lesson)
      continue
    }
    const existing = groupEntries.get(lesson.groupLessonKey)
    if (existing) {
      existing.memberIds.push(lesson.studentId)
    } else {
      const entry = { ...lesson, id: lesson.groupLessonKey, memberIds: [lesson.studentId] }
      groupEntries.set(lesson.groupLessonKey, entry)
      result.push(entry)
    }
  }

  return result
}

function PastLessonCard({ lesson, studentName, student, students = [] }) {
  const timeZone = useTimeZone()
  const [dialogOpen, setDialogOpen] = useState(false)
  const isGroupLesson = Boolean(lesson.isGroupLesson)
  // Same minimal stand-in shape UpcomingLessonCard uses — GroupLessonDialog
  // only reads id/name/subject off it, member roster comes from its own
  // mirror lookup keyed by groupLessonKey.
  const groupStub = { id: lesson.groupId, name: lesson.groupName || "Группа", subject: lesson.subject }

  return (
    <li className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <StudentDot />
          <span className="truncate font-semibold text-ink">{isGroupLesson ? lesson.groupName || "Группа" : studentName}</span>
          {isGroupLesson ? (
            <TeacherStatusBadge tone="rose">
              Группа{Array.isArray(lesson.memberIds) ? ` · ${lesson.memberIds.length} уч.` : ""}
            </TeacherStatusBadge>
          ) : (
            <StudentTags student={student} />
          )}
        </div>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="size-3" aria-hidden="true" />
          {formatLessonDateTime(lesson.rescheduledDate ?? lesson.date, timeZone)}
        </p>
        {lesson.topic ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{lesson.topic}</p> : null}
      </div>
      <GhostBtn onClick={() => setDialogOpen(true)} className="px-4 py-2">
        Открыть
      </GhostBtn>

      {isGroupLesson ? (
        <GroupLessonDialog
          teacherId={lesson.teacherId}
          group={groupStub}
          students={students}
          groupLessonKey={dialogOpen ? lesson.groupLessonKey : null}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      ) : (
        <HomeworkLessonDialog
          studentId={lesson.studentId}
          studentName={studentName}
          student={student}
          lessonId={lesson.id}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      )}
    </li>
  )
}

// Loads on demand (one-time getDocs via getAllCompletedLessons) the moment
// it's opened, rather than subscribing up front — the teacher dashboard's
// own subscribeToCompletedLessons feed stays capped, this is only for the
// "show everything" modal.
function AllPastLessonsDialog({ open, onOpenChange, students }) {
  const [lessons, setLessons] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!open) return

    const uid = auth.currentUser?.uid
    if (!uid) return

    let cancelled = false
    setLoading(true)
    setError("")

    getAllCompletedLessons(uid)
      .then((data) => {
        if (cancelled) return
        setLessons(collapseGroupLessons(data))
      })
      .catch((fetchError) => {
        console.error("Failed to load all completed lessons:", fetchError)
        if (cancelled) return
        setError("Не удалось загрузить уроки")
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open])

  return (
    <TeacherDialog open={open} onOpenChange={onOpenChange}>
      <TeacherDialogContent wide>
        <TeacherDialogTitle>Все прошедшие уроки</TeacherDialogTitle>

        <div className="mt-4 max-h-[70vh] overflow-y-auto scrollbar-hidden pr-1">
          {loading ? (
            <Spinner label="Загрузка..." />
          ) : error ? (
            <p className="text-sm font-semibold text-destructive">{error}</p>
          ) : lessons.length === 0 ? (
            <p className="text-sm text-muted-foreground">Уроков пока нет</p>
          ) : (
            <ul className="divide-y divide-glass-border">
              {lessons.map((lesson) => (
                <PastLessonCard
                  key={lesson.id}
                  lesson={lesson}
                  studentName={students.find((s) => s.id === lesson.studentId)?.name ?? "Ученик"}
                  student={students.find((s) => s.id === lesson.studentId)}
                  students={students}
                />
              ))}
            </ul>
          )}
        </div>
      </TeacherDialogContent>
    </TeacherDialog>
  )
}

function TeacherNotificationsBell() {
  const [notifications, setNotifications] = useState([])
  const [open, setOpen] = useState(false)
  const hasUnread = notifications.some((notification) => !notification.read)

  useEffect(() => {
    const uid = auth.currentUser?.uid
    if (!uid) return

    const unsubscribe = subscribeToTeacherNotifications(uid, setNotifications, (firestoreError) => {
      console.error("Failed to load notifications:", firestoreError)
    })

    return unsubscribe
  }, [])

  async function handleNotificationClick(notification) {
    if (!notification.read) {
      try {
        await markNotificationRead(notification.id)
      } catch (err) {
        console.error("Failed to mark notification read:", err)
      }
    }
  }

  async function handleMarkAllRead() {
    try {
      await markAllNotificationsRead(notifications)
    } catch (err) {
      console.error("Failed to mark all notifications read:", err)
    }
  }

  return (
    <TeacherDialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Уведомления"
        className="glass-tile relative grid size-10 place-items-center rounded-full text-foreground/70"
      >
        <Bell className="size-4" aria-hidden="true" />
        {hasUnread ? <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-primary" /> : null}
      </button>

      <TeacherDialogContent>
        <TeacherDialogTitle>Уведомления</TeacherDialogTitle>

        <div className="mt-5 flex max-h-[65vh] flex-col gap-3 overflow-y-auto scrollbar-hidden">
          {notifications.some((notification) => !notification.read) ? (
            <GhostBtn onClick={handleMarkAllRead} className="self-start px-4 py-2">
              Отметить все прочитанными
            </GhostBtn>
          ) : null}

          <NotificationsList notifications={notifications} onNotificationClick={handleNotificationClick} />
        </div>
      </TeacherDialogContent>
    </TeacherDialog>
  )
}

// Same shape as student-row.jsx's DeleteStudentDialog — theme-ui primitives,
// glass-tile Отмена + destructive-tinted confirm button.
function DisconnectGoogleCalendarDialog({ open, onOpenChange, onDisconnected }) {
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError] = useState("")

  function handleOpenChange(nextOpen) {
    if (disconnecting) return
    onOpenChange(nextOpen)
    if (!nextOpen) setError("")
  }

  async function handleDisconnect() {
    if (disconnecting) return
    setDisconnecting(true)
    setError("")
    try {
      await disconnectGoogleCalendar()
      setDisconnecting(false)
      onDisconnected()
      onOpenChange(false)
    } catch (err) {
      console.error("Failed to disconnect Google Calendar:", err)
      setError(err?.message || "Не удалось отключить Google Calendar")
      setDisconnecting(false)
    }
  }

  return (
    <TeacherDialog open={open} onOpenChange={handleOpenChange}>
      <TeacherDialogContent>
        <TeacherDialogTitle>Отключить Google Calendar?</TeacherDialogTitle>
        <TeacherDialogDescription>
          Расписание учеников не пострадает, но события в календаре перестанут обновляться, пока не подключишь
          заново.
        </TeacherDialogDescription>

        {error ? <p className="mt-2 text-sm font-semibold text-destructive">{error}</p> : null}

        <TeacherModalFooter className="mt-5">
          <TeacherCancelBtn onClick={() => handleOpenChange(false)} disabled={disconnecting} />
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="rounded-full bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {disconnecting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Отключаем...
              </span>
            ) : (
              "Отключить"
            )}
          </button>
        </TeacherModalFooter>
      </TeacherDialogContent>
    </TeacherDialog>
  )
}

export function TeacherDashboard() {
  usePageTitle("Учительская")
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [googleCalendarConnected, setGoogleCalendarConnected] = useState(null)
  const [connectingGoogleCalendar, setConnectingGoogleCalendar] = useState(false)
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false)
  const [embedUrl, setEmbedUrl] = useState(null)
  const [embedError, setEmbedError] = useState(null)
  const embedLoading = googleCalendarConnected === true && !embedUrl && !embedError
  // Bumped on every manual refresh click, used as the iframe's `key` — a
  // changed key forces React to unmount/remount the element (not just
  // reassign its `src`), which reliably reloads the embed. No auto-refresh
  // after actions (extra lesson/reschedule/cancel): Google's own indexing
  // delay for embed updates is unpredictable, so a manual button is the
  // actual fix, not a timer guessing at the delay.
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0)
  const [upcomingLessons, setUpcomingLessons] = useState([])
  const [completedLessons, setCompletedLessons] = useState([])
  // How many rows fit the "Прошедшие уроки" panel is derived from the
  // "Финансы" panel's real rendered height (which grows with the number of
  // students), not a fixed count — see the measurement effect below.
  const [completedVisibleCount, setCompletedVisibleCount] = useState(3)
  const financeWrapperRef = useRef(null)
  const pastLessonsPanelRef = useRef(null)
  const pastLessonsListRef = useRef(null)
  const [isAllPastLessonsOpen, setIsAllPastLessonsOpen] = useState(false)
  const [videoCallUrl, setVideoCallUrl] = useState(null)
  const [curriculumProgressByStudent, setCurriculumProgressByStudent] = useState({})
  const [teacherProfile, setTeacherProfile] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    const uid = auth.currentUser?.uid
    if (!uid) return

    const unsub = subscribeToVideoCallUrl(uid, setVideoCallUrl, (error) =>
      console.error("Failed to load video call url:", error),
    )
    return () => unsub()
  }, [])

  // Multi-tenancy Phase 4a: timezone/colorTheme live on the same
  // teachers/{uid} profile doc ensureTeacherProfile (App.jsx) bootstraps —
  // subscribed here (not read once) so a save from SettingsDialog re-renders
  // this page's UserPrefsProvider immediately without a manual refetch.
  useEffect(() => {
    const uid = auth.currentUser?.uid
    if (!uid) return

    const unsub = subscribeToTeacherProfile(uid, setTeacherProfile, (error) =>
      console.error("Failed to load teacher profile:", error),
    )
    return () => unsub()
  }, [])


  async function handleSignOut() {
    try {
      await signOutTeacher()
    } catch (err) {
      console.error("Failed to sign out:", err)
    }
  }

  async function handleConnectGoogleCalendar() {
    if (connectingGoogleCalendar) return

    setConnectingGoogleCalendar(true)
    try {
      const authUrl = await startGoogleOAuth()
      window.location.href = authUrl
    } catch (err) {
      console.error("Failed to start Google Calendar connection:", err)
      setConnectingGoogleCalendar(false)
    }
  }

  function handleGoogleCalendarDisconnected() {
    setGoogleCalendarConnected(false)
    setEmbedUrl(null)
    setEmbedError(null)
  }

  useEffect(() => {
    const uid = auth.currentUser?.uid
    if (!uid) return

    const unsubscribe = subscribeToStudents(
      uid,
      (data) => {
        setStudents(data)
        setLoading(false)
      },
      (firestoreError) => {
        console.error("Failed to load students:", firestoreError)
        setError("Не удалось загрузить список учеников")
        setLoading(false)
      },
    )

    return unsubscribe
  }, [])

  // Lifted up from GroupsSection (rather than subscribed there) so this
  // component can decide, by count, whether the whole "Группы" panel (and
  // its own "+ Создать группу" button) shows at all, or whether that button
  // instead lives in the "Ученики" panel until the first group exists — see
  // the button-placement logic just below the "Ученики" Panel.
  const [groups, setGroups] = useState([])
  useEffect(() => {
    const uid = auth.currentUser?.uid
    if (!uid) return

    const unsubscribe = subscribeToGroups(uid, setGroups, (groupsError) => {
      console.error("Failed to load groups:", groupsError)
    })

    return unsubscribe
  }, [])
  const [groupFormOpen, setGroupFormOpen] = useState(false)

  // One-time batch read (not a subscription) — powers every collapsed row's
  // progress bar at once, cheaper than a live listener per student; the
  // currently-expanded row layers its own live subscription on top (see
  // StudentRow). Re-fetched whenever the student count changes; doesn't
  // otherwise react to a progress assignment made while this list is
  // already loaded (that student's bar catches up next reload).
  useEffect(() => {
    if (students.length === 0) return

    const uid = auth.currentUser?.uid
    if (!uid) return

    getAllProgramsByStudent(uid)
      .then(setCurriculumProgressByStudent)
      .catch((error) => console.error("Failed to load curriculum progress summaries:", error))
  }, [students.length])

  useEffect(() => {
    const uid = auth.currentUser?.uid
    if (!uid) return

    const unsubscribe = subscribeToUpcomingLessons(
      uid,
      setUpcomingLessons,
      (firestoreError) => {
        console.error("Failed to load upcoming lessons:", firestoreError)
      },
      10,
    )

    return unsubscribe
  }, [])

  useEffect(() => {
    const uid = auth.currentUser?.uid
    if (!uid) return

    const unsubscribe = subscribeToCompletedLessons(uid, setCompletedLessons, (firestoreError) => {
      console.error("Failed to load completed lessons:", firestoreError)
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    getGoogleCalendarStatus()
      .then(setGoogleCalendarConnected)
      .catch((err) => {
        console.error("Failed to load Google Calendar status:", err)
        setGoogleCalendarConnected(false)
      })
  }, [])

  useEffect(() => {
    if (googleCalendarConnected !== true) return

    let cancelled = false

    getCalendarEmbedInfo()
      .then((url) => {
        if (!cancelled) setEmbedUrl(url)
      })
      .catch((err) => {
        console.error("Failed to load Google Calendar embed URL:", err)
        if (!cancelled) {
          setEmbedError(`Не удалось загрузить Google Calendar: ${err.message || err.code}`)
        }
      })

    return () => {
      cancelled = true
    }
  }, [googleCalendarConnected])

  const clusteredUpcomingLessons = selectClusteredUpcomingLessons(collapseGroupLessons(upcomingLessons))
  const collapsedCompletedLessons = collapseGroupLessons(completedLessons)

  // Fits "Прошедшие уроки" rows to whatever height "Финансы" naturally takes
  // (which grows with the student count) instead of a fixed row count. The
  // grid row itself must not CSS-stretch either panel to match the other
  // (see the "items-start" class below) — otherwise financeWrapperRef's
  // measured height would already include a stretch driven by our own
  // current row count, turning this into a runaway feedback loop instead of
  // a one-shot fit.
  useLayoutEffect(() => {
    if (collapsedCompletedLessons.length === 0 || !financeWrapperRef.current) return

    function recompute() {
      const financeEl = financeWrapperRef.current
      const panelEl = pastLessonsPanelRef.current
      const listEl = pastLessonsListRef.current
      if (!financeEl || !panelEl || !listEl || !listEl.children[0]) return

      const financeHeight = financeEl.getBoundingClientRect().height
      const chrome = panelEl.getBoundingClientRect().height - listEl.getBoundingClientRect().height
      const rowHeight = listEl.children[0].getBoundingClientRect().height
      if (rowHeight <= 0) return

      const fit = Math.max(1, Math.floor((financeHeight - chrome) / rowHeight))
      setCompletedVisibleCount((current) => {
        const next = Math.min(fit, collapsedCompletedLessons.length)
        return next === current ? current : next
      })
    }

    recompute()

    const observer = new ResizeObserver(recompute)
    observer.observe(financeWrapperRef.current)
    window.addEventListener("resize", recompute)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", recompute)
    }
  }, [collapsedCompletedLessons.length, students.length])

  // Статы — новый блок из макета, без прямого аналога в текущем коде.
  // Считаются из данных, уже загруженных на этой странице (без
  // дополнительных подписок), чтобы не дублировать источники правды:
  // FinanceSection отдельно грузит балансы, но paidLessonsBalance уже есть
  // прямо в students[] (см. finance-section.jsx), поэтому четвёртый стат
  // читает то же поле напрямую, а не через отдельный запрос.
  const now = Date.now()
  const lessonsThisWeek = upcomingLessons.filter((lesson) => {
    const date = lesson.rescheduledDate ?? lesson.date
    return date && date.getTime() - now <= 7 * MS_PER_DAY
  }).length
  const homeworkToReview = upcomingLessons.filter(
    (lesson) => lesson.homework.submission.files.length > 0,
  ).length
  const paymentDue = students.filter((student) => (student.paidLessonsBalance ?? 0) <= 0).length

  const stats = [
    { value: String(lessonsThisWeek), label: "Уроков на неделе" },
    { value: String(students.length), label: "Учеников" },
    { value: String(homeworkToReview), label: "ДЗ на проверке" },
    { value: String(paymentDue), label: "Оплата ожидается" },
  ]

  // Theme registry (src/lib/themes.js) resolves colorTheme -> {cssClassName,
  // ...}. "themed" always rides alongside the theme's own cssClassName (see
  // index.css's shared `.themed` derivation block) — see useThemeClass's
  // other callers in theme-ui.jsx/ui/dialog.jsx for why portaled dialogs
  // need this same pair of classes applied to themselves, not just this root.
  const themeClass = `${getThemeById(teacherProfile?.colorTheme ?? "pink").cssClassName} themed`
  const resolvedTimeZone = resolveTimeZone(teacherProfile?.timezone)
  // teacherProfile is null only while the very first snapshot hasn't
  // arrived yet — an existing profile doc always has (at minimum) an empty
  // string, so `=== ""` is the real "hasn't set a name yet" signal, not
  // `!teacherProfile.name` (which would also match briefly during load).
  const needsNamePrompt = teacherProfile != null && teacherProfile.name === ""

  return (
    <UserPrefsProvider
      timeZone={resolvedTimeZone}
      themeClass={themeClass}
      vkGroupId={teacherProfile?.vkGroupId ?? null}
      telegramBotKey={teacherProfile?.telegramBotKey ?? null}
    >
    <div className={`${themeClass} relative min-h-screen px-4 py-6 md:px-8 md:py-10`}>
      <div aria-hidden className="bg-grain-blobs">
        <div className="blob-a" />
        <div className="blob-b" />
        <div className="grain-layer" />
      </div>

      {needsNamePrompt ? <NamePromptDialog /> : null}

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="glass-panel flex items-center justify-between gap-4 rounded-[2rem] px-5 py-4">
          <div className="flex items-center gap-3">
            <div
              className="flex size-10 shrink-0 items-center justify-center rounded-full text-primary-foreground"
              style={{ background: "var(--gradient-orb)", boxShadow: "var(--shadow-soft)" }}
            >
              <GraduationCap className="size-5" aria-hidden="true" />
            </div>
            <div className="hidden md:block">
              <h1 className="font-display text-lg tracking-tight text-ink">{teacherProfile?.name || "Учебный портал"}</h1>
              <p className="text-xs text-muted-foreground">
                Кабинет преподавателя
                {subscriptionHeaderLabel(teacherProfile) ? ` · ${subscriptionHeaderLabel(teacherProfile)}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <VideoCallSettings />
            <TeacherNotificationsBell />
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Настройки"
              className="glass-tile grid size-10 place-items-center rounded-full text-foreground/70"
            >
              <Settings className="size-4" aria-hidden="true" />
            </button>
            <GhostBtn onClick={handleSignOut} className="px-4 py-2">
              <LogOut className="size-3.5" aria-hidden="true" /> Выйти
            </GhostBtn>
          </div>
        </header>

        <SettingsDialog
          variant="teacher"
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          name={teacherProfile?.name ?? ""}
          onSaveName={(nextName) => updateTeacherName(nextName)}
          timezone={teacherProfile?.timezone ?? ""}
          colorTheme={teacherProfile?.colorTheme ?? "pink"}
          muteFinanceNotifications={teacherProfile?.muteFinanceNotifications ?? false}
          onSave={(values) => updateTeacherSettings(auth.currentUser.uid, values)}
          subscription={
            teacherProfile
              ? { plan: teacherProfile.plan, paidUntil: teacherProfile.subscriptionPaidUntil?.toDate?.() ?? null }
              : null
          }
        />

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="glass-panel rounded-[1.75rem] px-5 py-4">
              <div className="font-display text-3xl text-ink">{s.value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>

        <Panel>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Title>Расписание</Title>
              {googleCalendarConnected === true ? (
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-primary" /> Google Calendar подключён
                  <button
                    type="button"
                    onClick={() => setDisconnectDialogOpen(true)}
                    className="underline decoration-dotted underline-offset-2 hover:text-rose-deep"
                  >
                    Отключить
                  </button>
                </p>
              ) : googleCalendarConnected === false ? (
                <p className="mt-1 text-xs text-muted-foreground">Google Calendar не подключён</p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCalendarRefreshKey((key) => key + 1)}
                aria-label="Обновить календарь"
                title="Обновить календарь"
                className="glass-tile grid size-9 shrink-0 place-items-center rounded-full text-foreground/70 transition hover:text-rose-deep"
              >
                <RefreshCw className="size-4" aria-hidden="true" />
              </button>
              <ExtraLessonDialog students={students} groups={groups} />
            </div>
          </div>

          <DisconnectGoogleCalendarDialog
            open={disconnectDialogOpen}
            onOpenChange={setDisconnectDialogOpen}
            onDisconnected={handleGoogleCalendarDisconnected}
          />

          {googleCalendarConnected === false ? (
            <div className="glass-tile mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[1.5rem] px-4 py-3">
              <p className="text-sm text-muted-foreground">Синхронизируйте расписание с Google Calendar</p>
              <GhostBtn onClick={handleConnectGoogleCalendar} disabled={connectingGoogleCalendar} className="px-4 py-2">
                <CalendarPlus className="size-3.5" aria-hidden="true" />
                {connectingGoogleCalendar ? "Переходим..." : "Подключить"}
              </GhostBtn>
            </div>
          ) : null}

          <div className="glass-tile mt-4 overflow-hidden rounded-[1.5rem]">
            {embedLoading ? (
              <div className="p-6">
                <Spinner label="Загрузка Google Calendar..." />
              </div>
            ) : embedError ? (
              <div className="flex h-64 items-center justify-center p-6 text-center">
                <p className="text-sm text-destructive">{embedError}</p>
              </div>
            ) : embedUrl ? (
              <iframe
                key={calendarRefreshKey}
                title="Google Calendar"
                src={`${embedUrl}&mode=WEEK`}
                style={{ border: 0, width: "100%", height: "600px" }}
                frameBorder="0"
                scrolling="no"
              />
            ) : (
              <div className="flex h-64 items-center justify-center p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  Google Calendar появится здесь после подключения
                </p>
              </div>
            )}
          </div>
        </Panel>

        {clusteredUpcomingLessons.length > 0 ? (
          <Panel>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Title>Ближайшие уроки</Title>
              <SolidBtn
                onClick={() => videoCallUrl && openExternalLink(videoCallUrl)}
                disabled={!videoCallUrl}
                title={videoCallUrl ? "Начать видеозвонок" : "Ссылка на видеозвонок не настроена"}
              >
                <Play className="size-3.5" aria-hidden="true" /> Начать урок
              </SolidBtn>
            </div>
            <ul className="mt-4 space-y-3">
              {/* A group lesson is a real per-student entry in this same
                  feed now (see core/groups.js) — no separate source/row
                  type needed, UpcomingLessonCard tells the two apart via
                  lesson.isGroupLesson on its own. */}
              {clusteredUpcomingLessons.map((lesson) => (
                <UpcomingLessonCard
                  key={lesson.id}
                  lesson={lesson}
                  studentName={students.find((s) => s.id === lesson.studentId)?.name ?? "Ученик"}
                  student={students.find((s) => s.id === lesson.studentId)}
                  students={students}
                />
              ))}
            </ul>
          </Panel>
        ) : null}

        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Title>Ученики</Title>
            <div className="flex items-center gap-2">
              {/* "+ Создать группу" lives here only until the first group
                  exists — once one does, GroupsSection renders below with
                  its own header button instead, per explicit instruction. */}
              {groups.length === 0 ? (
                <SolidBtn onClick={() => setGroupFormOpen(true)}>
                  <Plus className="size-3.5" aria-hidden="true" />
                  Создать группу
                </SolidBtn>
              ) : null}
              <RegistrationLinkDialog />
            </div>
          </div>

          <div className="mt-4">
            {loading ? (
              <Spinner label="Загрузка списка учеников..." />
            ) : error ? (
              <p className="text-sm font-semibold text-destructive">{error}</p>
            ) : students.length === 0 ? (
              <p className="text-sm text-muted-foreground">Пока нет учеников в базе данных.</p>
            ) : (
              <div className="space-y-3">
                {students.map((student) => (
                  <StudentRow
                    key={student.id}
                    student={student}
                    progressSummary={curriculumProgressByStudent[student.id] ?? null}
                  />
                ))}
              </div>
            )}
          </div>
        </Panel>

        {groups.length === 0 ? (
          <GroupFormDialog open={groupFormOpen} onOpenChange={setGroupFormOpen} students={students} group={null} />
        ) : (
          <GroupsSection students={students} groups={groups} />
        )}

        <div className={`grid items-start gap-5 ${collapsedCompletedLessons.length > 0 ? "lg:grid-cols-[2fr_3fr]" : ""}`}>
          {collapsedCompletedLessons.length > 0 ? (
            <div ref={pastLessonsPanelRef}>
              <Panel>
              <div className="flex items-center justify-between">
                <Title>Прошедшие уроки</Title>
              </div>
              <ul ref={pastLessonsListRef} className="mt-4 divide-y divide-glass-border">
                {collapsedCompletedLessons.slice(0, completedVisibleCount).map((lesson) => (
                  <PastLessonCard
                    key={lesson.id}
                    lesson={lesson}
                    studentName={students.find((s) => s.id === lesson.studentId)?.name ?? "Ученик"}
                    student={students.find((s) => s.id === lesson.studentId)}
                    students={students}
                  />
                ))}
              </ul>
              {collapsedCompletedLessons.length > completedVisibleCount ? (
                <button
                  type="button"
                  onClick={() => setIsAllPastLessonsOpen(true)}
                  className="mt-3 inline-flex shrink-0 items-center gap-1 self-start text-sm font-medium text-muted-foreground"
                >
                  Показать все прошедшие уроки
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
              </Panel>
            </div>
          ) : null}

          {students.length > 0 ? (
            <div ref={financeWrapperRef}>
              <FinanceSection students={students} />
            </div>
          ) : null}
        </div>

        <AllPastLessonsDialog open={isAllPastLessonsOpen} onOpenChange={setIsAllPastLessonsOpen} students={students} />

        <CurriculumSection />

        <PendingRegistrations />
      </div>
    </div>
    </UserPrefsProvider>
  )
}
