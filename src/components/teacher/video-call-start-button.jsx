import { useRef, useState } from "react"
import { Play } from "lucide-react"
import { SolidBtn } from "@/components/teacher/theme-ui"
import { openExternalLink } from "@/lib/telegramWebApp"
import { VIDEO_CALL_SETTINGS_TRIGGER_ID } from "@/components/teacher/video-call-settings"

// Scrolls to and clicks the same header icon VideoCallSettings itself
// renders (matched by id, not a prop/ref — the two components don't
// otherwise know about each other and live far apart in the tree) so
// "Настроить ссылку" opens the exact same dialog a teacher would get by
// clicking the video-call icon directly, instead of a second, divergent
// entry point. The short delay lets the smooth-scroll actually finish
// before the dialog opens on top of it — reads as "screen scrolls up, then
// the window opens," not both happening on top of each other instantly.
function openVideoCallSettings() {
  const trigger = document.getElementById(VIDEO_CALL_SETTINGS_TRIGGER_ID)
  if (!trigger) return
  trigger.scrollIntoView({ behavior: "smooth", block: "center" })
  window.setTimeout(() => trigger.click(), 350)
}

const HIDE_DELAY_MS = 600

// "Начать урок" — opens the teacher's saved Yandex Telemost link in a new
// tab once one exists. Disabled with a native `title` used to be the whole
// story, but a bare browser tooltip on a disabled button doesn't explain
// *why*, doesn't offer a way to fix it, and on some platforms doesn't show
// on a disabled element at all — so the disabled state gets its own
// hover/focus-triggered custom tooltip instead, with a real "Настроить
// ссылку" action.
export function VideoCallStartButton({ videoCallUrl }) {
  const [tooltipOpen, setTooltipOpen] = useState(false)
  const hideTimeoutRef = useRef(null)

  function clearHideTimeout() {
    if (hideTimeoutRef.current) {
      window.clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
  }

  function show() {
    clearHideTimeout()
    setTooltipOpen(true)
  }

  // Hiding on a delay (not immediately on mouseleave) is the real fix for
  // "can't reach Настроить ссылку before the tooltip closes" — the button
  // and the tooltip panel below it aren't visually touching (there's a small
  // gap), and a `position: relative` wrapper's own hoverable box doesn't
  // extend into that gap, only its actual in-flow content (the button). The
  // instant the pointer crosses out of the button into that gap, this fires
  // — cleared again the moment the pointer lands on the tooltip itself
  // (still a descendant of this same wrapper), so a normal, unhurried
  // diagonal move to "Настроить ссылку" comfortably fits inside the delay.
  function scheduleHide() {
    clearHideTimeout()
    hideTimeoutRef.current = window.setTimeout(() => setTooltipOpen(false), HIDE_DELAY_MS)
  }

  if (videoCallUrl) {
    return (
      <SolidBtn onClick={() => openExternalLink(videoCallUrl)} title="Начать видеозвонок">
        <Play className="size-3.5" aria-hidden="true" /> Начать урок
      </SolidBtn>
    )
  }

  return (
    <div className="relative" onMouseEnter={show} onMouseLeave={scheduleHide} onFocus={show} onBlur={scheduleHide}>
      <SolidBtn disabled aria-describedby="video-call-start-tooltip">
        <Play className="size-3.5" aria-hidden="true" /> Начать урок
      </SolidBtn>
      {tooltipOpen ? (
        <div
          id="video-call-start-tooltip"
          role="tooltip"
          // Solid --popover (no alpha, unlike glass-panel/--card) plus a
          // strong blur of its own — a floating tooltip has nothing dimming
          // the page behind it the way a real dialog's backdrop does, so the
          // usual translucent glass surface left text genuinely hard to read
          // over whatever happened to be underneath it (the lesson list,
          // the background blobs). Matches the teacher's chosen theme
          // (var(--popover) is themed) without needing its own theme logic.
          className="absolute right-0 top-full z-20 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-[1.25rem] border border-glass-border p-4 text-left shadow-[var(--shadow-soft)] backdrop-blur-xl"
          style={{ background: "var(--popover)", color: "var(--popover-foreground)" }}
        >
          <p className="text-sm">
            Кнопка открывает конференцию в Яндекс Телемост, чтобы вы и ваши ученики могли ей пользоваться — сохраните
            ссылку на конференцию.
          </p>
          <button
            type="button"
            onClick={openVideoCallSettings}
            className="mt-3 text-xs font-semibold text-rose-deep transition hover:brightness-105"
          >
            Настроить ссылку
          </button>
        </div>
      ) : null}
    </div>
  )
}
