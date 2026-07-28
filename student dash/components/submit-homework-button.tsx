"use client"

import { Paperclip, Camera } from "lucide-react"

export function SubmitHomeworkButton() {
  return (
    <button
      type="button"
      className="group flex w-full items-center justify-center gap-3 rounded-3xl bg-primary px-6 py-5 text-lg font-extrabold text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/40 active:translate-y-0"
    >
      <span className="flex items-center gap-1.5">
        <Paperclip className="h-6 w-6" aria-hidden="true" />
        <Camera className="h-6 w-6" aria-hidden="true" />
      </span>
      Отправить домашку
    </button>
  )
}
