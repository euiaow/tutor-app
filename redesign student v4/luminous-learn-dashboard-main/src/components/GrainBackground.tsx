/**
 * Фон приложения: белая основа + две зернистые оранжевые градиентные формы.
 */
export function GrainBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden bg-white">
      {/* Форма 1 — верх справа */}
      <div
        className="absolute -right-20 -top-24 h-[26rem] w-[26rem] rounded-full blur-[70px] sm:h-[32rem] sm:w-[32rem]"
        style={{
          background:
            "radial-gradient(circle at 35% 35%, oklch(0.82 0.16 60 / 0.95), oklch(0.72 0.19 47 / 0.5) 55%, transparent 75%)",
        }}
      />
      {/* Форма 2 — низ слева */}
      <div
        className="absolute -bottom-28 -left-24 h-[24rem] w-[24rem] rounded-full blur-[80px] sm:h-[30rem] sm:w-[30rem]"
        style={{
          background:
            "radial-gradient(circle at 60% 40%, oklch(0.78 0.17 38 / 0.85), oklch(0.7 0.19 30 / 0.4) 55%, transparent 75%)",
        }}
      />
      {/* Зерно поверх градиентов */}
      <div className="grain absolute inset-0" />
    </div>
  );
}
