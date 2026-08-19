import { useEffect, useState } from "react"
import { Navigate, Route, BrowserRouter, Routes } from "react-router-dom"
import { onAuthStateChanged } from "firebase/auth"
import { doc, getDoc, setDoc, serverTimestamp, collection, addDoc } from "firebase/firestore"
import { auth, db } from "@/firebase/firebase"
import { generateTeacherSlug } from "@/firebase/teachers"
import { Spinner } from "@/components/ui/spinner"
import { StudentDashboard } from "./pages/StudentDashboard"
import { TeacherDashboard } from "./pages/TeacherDashboard"
import { TeacherLogin } from "./pages/TeacherLogin"
import { AppEntry } from "./pages/AppEntry"
import { TeacherLanding } from "./pages/TeacherLanding"

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
  const snapshot = await getDoc(ref)

  if (snapshot.exists()) {
    return
  }

  const name = user.displayName || ""
  const slug = await generateTeacherSlug(name || user.email || user.uid)

  await setDoc(ref, {
    name,
    email: user.email || "",
    slug,
    timezone: "Europe/Moscow",
    language: "ru",
    colorTheme: "pink",
    createdAt: serverTimestamp(),
  })

  // Seed the 3 starting exam types (Block 3 — free-form exam types replacing
  // the old hardcoded "ege"/"oge"/"school" enum). Only runs once, alongside
  // the teacher doc itself never existing yet — an existing teacher's
  // examTypes are never touched here even if empty for some other reason.
  const examTypesRef = collection(db, "teachers", user.uid, "examTypes")
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
}

function TeacherRoute() {
  const [user, setUser] = useState(undefined)

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

  if (user === undefined) {
    return (
      <main className="min-h-screen bg-background px-4 py-8 sm:px-6">
        <Spinner label="Проверка входа..." />
      </main>
    )
  }

  return user ? <TeacherDashboard /> : <TeacherLogin />
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
      </Routes>
    </BrowserRouter>
  )
}
