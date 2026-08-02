// Student page background: white base + two blurred orange grain shapes —
// ported from "redesign student v3" (luminous-learn-dashboard-main)'s
// GrainBackground.tsx, replacing the earlier JPG-image + white/22 blur
// overlay approach (bg-glass.jpg) this page used before.
export function StudentGrainBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 overflow-hidden bg-cover bg-center"
      style={{ backgroundImage: "url('/bg/gr21.jpg')" }}
    ></div>
  )
}
