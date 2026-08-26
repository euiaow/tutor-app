import { useEffect, useState } from "react"
import { Navigate, Route, BrowserRouter, Routes } from "react-router-dom"
import { onAuthStateChanged } from "firebase/auth"
import { doc, getDoc, setDoc, serverTimestamp, collection, addDoc, onSnapshot } from "firebase/firestore"
import { auth, db } from "@/firebase/firebase"
import { generateTeacherSlug } from "@/firebase/teachers"
import { isAdmin } from "@/firebase/admin"
import { Spinner } from "@/components/ui/spinner"
import { StudentDashboard } from "./pages/StudentDashboard"
import { TeacherDashboard } from "./pages/TeacherDashboard"
import { TeacherLogin } from "./pages/TeacherLogin"
import { AppEntry } from "./pages/AppEntry"
import { TeacherLanding } from "./pages/TeacherLanding"
import { AdminDashboard } from "./pages/AdminDashboard"

// Multi-tenancy Phase 1: every teacher needs a teachers/{uid} profile doc to
// exist before the dashboard (or anything reading teacher-scoped data)
// renders. Bootstrapped here rather than via a Cloud Function trigger on
// Auth user creation, since this project has no such trigger set up and
// this is simpler — a plain client getDoc/setDoc the teacher is always
// allowed to do for their own uid (see the Firestore Rules draft). Runs
// once per new teacher; a no-op read for every existing one.
//
// Multi-tenancy Phase 3: the slug itself now comes from the
// generateTeacherSlug callable rather than being generated here — checking
// slug uniqueness needs admin-SDK read access across every teacher's doc,
// which the per-teacher Firestore Rules deliberately don't grant this
// client. This function still owns the actual write to its own doc.
async function ensureTeacherProfile(user) {
  const ref = doc(db, "teachers", user.uid)

  let snapshot
  try {
    snapshot = await getDoc(ref)
  } catch (error) {
    console.error("ensureTeacherProfile: getDoc(teachers/{uid}) failed", { code: error.code, message: error.message, uid: user.uid })
    throw error
  }

  if (snapshot.exists()) {
    return
  }

  const name = user.displayName || ""

  let slug
  try {
    slug = await generateTeacherSlug(name || user.email || user.uid)
  } catch (error) {
    console.error("ensureTeacherProfile: generateTeacherSlug callable failed", { code: error.code, message: error.message, uid: user.uid })
    throw error
  }

  try {
    await setDoc(ref, {
      name,
      email: user.email || "",
      slug,
      timezone: "Europe/Moscow",
      language: "ru",
      colorTheme: "pink",
      createdAt: serverTimestamp(),
      subscriptionPaidUntil: null,
      blocked: false,
      blockedReason: null,
      adminNotes: "",
      expiryReminderSentFor: null,
      plan: "trial",
      subscriptionPlanSince: null,
    })
  } catch (error) {
    console.error("ensureTeacherProfile: setDoc(teachers/{uid}) failed", { code: error.code, message: error.message, uid: user.uid })
    throw error
  }

  // Seed the 3 starting exam types (Block 3 — free-form exam types replacing
  // the old hardcoded "ege"/"oge"/"school" enum). Only runs once, alongside
  // the teacher doc itself never existing yet — an existing teacher's
  // examTypes are never touched here even if empty for some other reason.
  const examTypesRef = collection(db, "teachers", user.uid, "examTypes")
  try {
    await Promise.all([
      addDoc(examTypesRef, {
        name: "ЕГЭ",
        scaleType: "score",
        scaleMin: 0,
        scaleMax: 100,
        scaleStep: 10,
        scaleDefault: 70,
        scaleUnitLabel: "баллов",
      }),
      addDoc(examTypesRef, {
        name: "ОГЭ",
        scaleType: "grade",
        scaleMin: 2,
        scaleMax: 5,
        scaleStep: 1,
        scaleDefault: 4,
        scaleUnitLabel: "оценка",
      }),
      addDoc(examTypesRef, {
        name: "Школьная программа",
        scaleType: "none",
        scaleMin: null,
        scaleMax: null,
        scaleStep: 1,
        scaleDefault: null,
        scaleUnitLabel: "",
      }),
    ])
  } catch (error) {
    console.error("ensureTeacherProfile: seeding examTypes failed", { code: error.code, message: error.message, uid: user.uid })
    throw error
  }
}

// Admin panel Phase 3: a neutral, no-details suspension screen — the reason
// a teacher might be blocked isn't necessarily payment-related, so this
// text deliberately never says why. This is UX only; the real enforcement
// is server-side (functions/core/tenancy.js's assertTeacherNotBlocked).
function BlockedScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8 sm:px-6">
      <div className="max-w-sm text-center">
        <h1 className="mb-2 text-lg font-semibold text-foreground">Доступ приостановлен</h1>
        <p className="text-sm text-muted-foreground">
          Доступ к платформе временно приостановлен. Свяжитесь с администратором для уточнения деталей.
        </p>
      </div>
    </main>
  )
}

function TeacherRoute() {
  const [user, setUser] = useState(undefined)
  const [blocked, setBlocked] = useState(false)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
      if (nextUser) {
        ensureTeacherProfile(nextUser).catch((error) => {
          console.error("Failed to bootstrap teacher profile:", error)
        })
      }
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    if (!user) {
      setBlocked(false)
      return
    }
    const unsubscribe = onSnapshot(doc(db, "teachers", user.uid), (snapshot) => {
      setBlocked(Boolean(snapshot.data()?.blocked))
    })
    return unsubscribe
  }, [user])

  if (user === undefined) {
    return (
      <main className="min-h-screen bg-background px-4 py-8 sm:px-6">
        <Spinner label="Проверка входа..." />
      </main>
    )
  }

  if (!user) {
    return <TeacherLogin />
  }

  return blocked ? <BlockedScreen /> : <TeacherDashboard />
}

// Not linked from anywhere in the normal teacher navigation — reachable
// only by navigating to /admin directly. Reuses the teacher's own Firebase
// Auth session; isAdmin() checks server-side whether that uid is also
// listed in config/admin.allowedUids.
function AdminRoute() {
  const [user, setUser] = useState(undefined)
  const [adminStatus, setAdminStatus] = useState(undefined)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, setUser)
    return unsubscribe
  }, [])

  useEffect(() => {
    if (user === undefined) {
      return
    }
    if (!user) {
      setAdminStatus(false)
      return
    }
    setAdminStatus(undefined)
    isAdmin()
      .then(setAdminStatus)
      .catch((error) => {
        console.error("Failed to check admin status:", error)
        setAdminStatus(false)
      })
  }, [user])

  if (user === undefined || adminStatus === undefined) {
    return (
      <main className="min-h-screen bg-background px-4 py-8 sm:px-6">
        <Spinner label="Проверка доступа..." />
      </main>
    )
  }

  if (!user) {
    return <TeacherLogin />
  }

  if (!adminStatus) {
    return <Navigate to="/teacher" replace />
  }

  return <AdminDashboard />
}

export default function App() {
  useEffect(() => {
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.ready()
      window.Telegram.WebApp.expand()
    }
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/teacher" replace />} />
        <Route path="/teacher" element={<TeacherRoute />} />
        <Route path="/student/:studentId" element={<StudentDashboard />} />
        <Route path="/app" element={<AppEntry />} />
        <Route path="/app/:slug" element={<TeacherLanding />} />
        <Route path="/admin" element={<AdminRoute />} />
      </Routes>
    </BrowserRouter>
  )
}
