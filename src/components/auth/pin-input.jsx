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
    <div className="grid grid-cols-4 gap-3" role="group" aria-label="Код доступа из 4 цифр">
      {Array.from({ length: LENGTH }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            inputsRef.current[i] = el
          }}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus={i === 0}
          maxLength={1}
          disabled={disabled}
          value={value[i] ?? ""}
          aria-label={`Цифра ${i + 1}`}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          className={`h-16 rounded-3xl text-center font-display text-2xl text-foreground outline-none transition-shadow focus:ring-2 focus:ring-ring/60 disabled:opacity-60 ${
            hasError ? "border-2 border-destructive bg-destructive/5" : "glass-inset"
          }`}
        />
      ))}
    </div>
  )
}
