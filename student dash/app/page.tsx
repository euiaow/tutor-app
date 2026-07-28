import { NextLessonCard } from "@/components/next-lesson-card"
import { LevelCard } from "@/components/level-card"
import { SubmitHomeworkButton } from "@/components/submit-homework-button"
import { Achievements } from "@/components/achievements"

export default function Page() {
  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-6">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Добро пожаловать</p>
            <h1 className="text-3xl font-extrabold text-foreground text-balance">
              Привет, Настя! ✌️
            </h1>
          </div>
          <span
            aria-hidden="true"
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-lg font-extrabold text-primary-foreground shadow-md shadow-primary/25"
          >
            Н
          </span>
        </header>

        <NextLessonCard />

        <LevelCard />

        <SubmitHomeworkButton />

        <Achievements />
      </div>
    </main>
  )
}
