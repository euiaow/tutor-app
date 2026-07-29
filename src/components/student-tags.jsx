// Single source of truth for subject/exam-target tag styling — reused by
// StudentTags below and by the Финансы table's "Предмет" column
// (finance-section.jsx renders the same tags, not a text label).
export const TAG_STYLES = {
  russian: { label: "Рус.", className: "bg-blue-500/15 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400" },
  literature: {
    label: "Лит.",
    className: "bg-purple-500/15 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400",
  },
  ege: { label: "ЕГЭ", className: "bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400" },
  oge: { label: "ОГЭ", className: "bg-teal-500/15 text-teal-700 dark:bg-teal-500/20 dark:text-teal-400" },
  school: { label: "Школа", className: "bg-gray-500/15 text-gray-700 dark:bg-gray-500/20 dark:text-gray-400" },
}

function Tag({ code }) {
  const style = TAG_STYLES[code]
  if (!style) return null

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${style.className}`}>
      {style.label}
    </span>
  )
}

export function StudentTags({ student }) {
  if (!student) return null

  const subjectCodes = student.subject ?? []

  if (subjectCodes.length === 0 && !student.examTarget) {
    return null
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {subjectCodes.map((code) => (
        <Tag key={code} code={code} />
      ))}
      {student.examTarget ? <Tag code={student.examTarget} /> : null}
    </div>
  )
}
