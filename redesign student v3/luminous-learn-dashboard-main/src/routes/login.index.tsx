import { createFileRoute } from "@tanstack/react-router";
import { LoginCard } from "@/components/auth/LoginCard";

export const Route = createFileRoute("/login/")({
  head: () => ({
    meta: [
      { title: "Вход по коду доступа — Lumina" },
      {
        name: "description",
        content: "Войдите в личный кабинет ученика с помощью 4-значного кода доступа от преподавателя.",
      },
      { property: "og:title", content: "Вход по коду доступа — Lumina" },
      {
        property: "og:description",
        content: "4-значный код доступа выдаёт преподаватель.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <LoginCard />,
});
