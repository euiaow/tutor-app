import { useRef } from "react"

const LENGTH = 4

export function PinInput({ value, onChange, hasError, disabled, onComplete }) {
  const inputsRef = useRef([])

  const focusInput = (index) => {
    const el = inputsRef.current[index]
    if (el) el.focus()
  }

  const handleChange = (index, raw) => {
    const digit = raw.replace(/\D/g, "").slice(-1)
    const next = [...value]
    next[index] = digit
    onChange(next)

    if (digit && index < LENGTH - 1) {
      focusInput(index + 1)
    }

    if (next.every((d) => d !== "")) {
      onComplete?.(next.join(""))
    }
  }

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace") {
      if (value[index]) {
        const next = [...value]
        next[index] = ""
        onChange(next)
      } else if (index > 0) {
        focusInput(index - 1)
        const next = [...value]
        next[index - 1] = ""
        onChange(next)
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      focusInput(index - 1)
    } else if (e.key === "ArrowRight" && index < LENGTH - 1) {
      focusInput(index + 1)
    }
  }

  const handlePaste = (e) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, LENGTH)
    if (!pasted) return
    const next = Array.from({ length: LENGTH }, (_, i) => pasted[i] ?? "")
    onChange(next)
    const lastFilled = Math.min(pasted.length, LENGTH) - 1
    focusInput(lastFilled)
    if (next.every((d) => d !== "")) {
      onComplete?.(next.join(""))
    }
  }

  return (
    <div className="flex items-center justify-center gap-3" role="group" aria-label="Код доступа из 4 цифр">
      {Array.from({ length: LENGTH }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            inputsRef.current[i] = el
          }}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          disabled={disabled}
          value={value[i] ?? ""}
          aria-label={`Цифра ${i + 1}`}
          placeholder="•"
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          className={`h-16 w-14 rounded-2xl border-2 bg-secondary/40 text-center text-3xl font-bold text-foreground shadow-sm outline-none transition-all placeholder:text-muted-foreground/40 focus:border-primary focus:bg-card focus:shadow-md focus:ring-4 focus:ring-primary/15 disabled:opacity-50 ${
            hasError ? "border-destructive bg-destructive/5" : "border-border"
          }`}
        />
      ))}
    </div>
  )
}
