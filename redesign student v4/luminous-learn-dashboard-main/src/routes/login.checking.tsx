import { createFileRoute } from "@tanstack/react-router";
import { LoginCard } from "@/components/auth/LoginCard";

export const Route = createFileRoute("/login/checking")({
  head: () => ({
    meta: [
      { title: "Проверяем код доступа — Lumina" },
      {
        name: "description",
        content: "Состояние загрузки: проверка 4-значного кода доступа при входе в кабинет ученика.",
      },
      { property: "og:title", content: "Проверяем код доступа — Lumina" },
      {
        property: "og:description",
        content: "Идёт проверка кода доступа.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <LoginCard loading />,
});
