// Student page background: white base + two blurred orange grain shapes —
// ported from "redesign student v3" (luminous-learn-dashboard-main)'s
// GrainBackground.tsx, replacing the earlier JPG-image + white/22 blur
// overlay approach (bg-glass.jpg) this page used before.
export function StudentGrainBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden bg-white">
      <div
        className="absolute -right-20 -top-24 h-[26rem] w-[26rem] rounded-full blur-[70px] sm:h-[32rem] sm:w-[32rem]"
        style={{
          background:
            "radial-gradient(circle at 35% 35%, oklch(0.82 0.16 60 / 0.95), oklch(0.72 0.19 47 / 0.5) 55%, transparent 75%)",
        }}
      />
      <div
        className="absolute -bottom-28 -left-24 h-[24rem] w-[24rem] rounded-full blur-[80px] sm:h-[30rem] sm:w-[30rem]"
        style={{
          background:
            "radial-gradient(circle at 60% 40%, oklch(0.78 0.17 38 / 0.85), oklch(0.7 0.19 30 / 0.4) 55%, transparent 75%)",
        }}
      />
      <div className="grain absolute inset-0" />
    </div>
  )
}
