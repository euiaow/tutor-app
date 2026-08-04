import { useEffect } from "react"

// Sets the browser tab title for as long as the calling component is
// mounted — used per-screen (login, student dashboard, teacher dashboard)
// rather than a single static <title> in index.html, since which screen is
// showing depends on auth state, not the route alone (e.g. /teacher shows
// either TeacherLogin or TeacherDashboard depending on whether the teacher
// is signed in).
export function usePageTitle(title) {
  useEffect(() => {
    document.title = title
  }, [title])
}
