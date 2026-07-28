import { useEffect, useState } from "react"
import { Navigate, Route, BrowserRouter, Routes } from "react-router-dom"
import { onAuthStateChanged } from "firebase/auth"
import { auth } from "@/firebase/firebase"
import { Spinner } from "@/components/ui/spinner"
import { StudentDashboard } from "./pages/StudentDashboard"
import { TeacherDashboard } from "./pages/TeacherDashboard"
import { TeacherLogin } from "./pages/TeacherLogin"

function TeacherRoute() {
  const [user, setUser] = useState(undefined)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, setUser)
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
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/teacher" replace />} />
        <Route path="/teacher" element={<TeacherRoute />} />
        <Route path="/student/:studentId" element={<StudentDashboard />} />
      </Routes>
    </BrowserRouter>
  )
}
