import { UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { StudentCard, type Student } from "@/components/teacher/student-card"

const students: Student[] = [
  { id: "1", name: "Настя Иванова", level: 3, xp: 70, nextLesson: "12 мая, 16:00" },
  { id: "2", name: "Максим Петров", level: 5, xp: 40, nextLesson: "12 мая, 17:30" },
  { id: "3", name: "Соня Кузнецова", level: 2, xp: 85, nextLesson: "13 мая, 15:00" },
  { id: "4", name: "Артём Смирнов", level: 4, xp: 20, nextLesson: "13 мая, 18:00" },
  { id: "5", name: "Лиза Волкова", level: 6, xp: 55, nextLesson: "14 мая, 16:30" },
  { id: "6", name: "Даниил Орлов", level: 1, xp: 30, nextLesson: "14 мая, 19:00" },
]

export default function TeacherPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Панель преподавателя</p>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground text-balance">
              Мои ученики
            </h1>
          </div>
          <Button size="lg">
            <UserPlus aria-hidden="true" />
            Добавить ученика
          </Button>
        </header>

        <section
          aria-label="Список учеников"
          className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          {students.map((student) => (
            <StudentCard key={student.id} student={student} />
          ))}
        </section>
      </div>
    </main>
  )
}
