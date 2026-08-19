import { getSubjectColorClass } from "@/lib/subjects"

// Block 3 — subjects are free-form now (STATIC_SUBJECTS + per-teacher
// customSubjects, see src/lib/subjects.js), so each tag's color comes from
// a deterministic hash of the subject's own display name (already what
// student.subject stores) instead of a hardcoded lookup table keyed by a
// fixed set of subject codes. The exam-type tag is now optional: it needs
// the name resolved from teachers/{uid}/examTypes by whichever caller has
// that list loaded (student-row.jsx, TeacherDashboard.jsx) — callers that
// don't pass examTypeName just get subject tags, not a crash or a missing
// "—" placeholder.
function SubjectTag({ name }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${getSubjectColorClass(name)}`}>
      {name}
    </span>
  )
}

function ExamTypeTag({ name }) {
  return (
    <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">
      {name}
    </span>
  )
}

export function StudentTags({ student, examTypeName }) {
  if (!student) return null

  const subjects = student.subject ?? []

  if (subjects.length === 0 && !examTypeName) {
    return null
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {subjects.map((name) => (
        <SubjectTag key={name} name={name} />
      ))}
      {examTypeName ? <ExamTypeTag name={examTypeName} /> : null}
    </div>
  )
}
