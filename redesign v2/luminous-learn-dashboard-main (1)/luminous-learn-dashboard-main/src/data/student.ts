export type Topic = {
  title: string;
  /** дата прохождения, если тема пройдена */
  date?: string;
  /** отмечена «к повторению» */
  review?: boolean;
};

export type Attendance = "ontime" | "late" | "missed";
export type Homework = "done" | "missing";

export type Lesson = {
  id: string;
  date: string;
  topic?: string;
  attendance: Attendance;
  homework: Homework;
  grade?: string;
  files: string[];
};

export const materials = [
  "Памятка поступившему с общежитием 2025.pdf",
  "cbh.cpp.txt",
  "piev_52021904331396.pdf",
];

export const topics: Topic[] = [
  { title: "Причастный оборот", date: "29 июля" },
  { title: "Деепричастный оборот", date: "26 июля", review: true },
  { title: "Односоставные предложения", date: "22 июля" },
  { title: "Сложноподчинённые предложения", date: "18 июля" },
  { title: "Обособленные определения", date: "15 июля", review: true },
  { title: "Вводные конструкции" },
  { title: "Прямая и косвенная речь" },
  { title: "Тире между подлежащим и сказуемым" },
  { title: "Правописание НЕ и НИ" },
];

export const prototypes: Topic[] = [
  { title: "Задание 8: синтаксические нормы", date: "29 июля" },
  { title: "Задание 21: пунктуационный анализ", date: "26 июля", review: true },
  { title: "Задание 26: средства выразительности", date: "21 июля" },
  { title: "Задание 9: корни с чередованием", date: "14 июля" },
  { title: "Задание 12: спряжения" },
  { title: "Задание 16: однородные члены" },
  { title: "Сочинение: комментарий" },
];

/** темп прохождения тем за последние 2 занятия против предыдущих */
export const paceMultiplier = 1.5;
/** пройдено за последние 7 дней */
export const recentCount = 3;

export const lessons: Lesson[] = [
  {
    id: "1",
    date: "29 июля 2026 г.",
    topic: "Доп урок",
    attendance: "ontime",
    homework: "done",
    grade: "Хорошо",
    files: ["terminal AI.txt"],
  },
  {
    id: "2",
    date: "28 июля 2026 г.",
    attendance: "ontime",
    homework: "done",
    grade: "Отлично",
    files: ["1-3.pdf"],
  },
  {
    id: "3",
    date: "22 июля 2026 г.",
    topic: "Алгоритмы сортировки",
    attendance: "late",
    homework: "missing",
    files: [],
  },
  {
    id: "4",
    date: "15 июля 2026 г.",
    topic: "Причастный оборот",
    attendance: "missed",
    homework: "missing",
    files: ["конспект-15-07.pdf", "разбор.docx"],
  },
];
