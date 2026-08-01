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

export type ProgressVariant = {
  id: string;
  label: string;
  topics: Topic[];
  prototypes: Topic[];
  /** пройдено на этой неделе */
  weeklyCount: number;
};

/** мок-варианты для развёрнутого состояния блока «Прогресс подготовки» */
export const progressVariants: ProgressVariant[] = [
  {
    id: "mid",
    label: "Середина программы",
    topics,
    prototypes,
    weeklyCount: recentCount,
  },
  {
    id: "done",
    label: "Всё пройдено",
    topics: topics.map((t, i) => ({ ...t, date: t.date ?? `${2 + i} августа` })),
    prototypes: prototypes.map((t, i) => ({ ...t, date: t.date ?? `${1 + i} августа` })),
    weeklyCount: 4,
  },
  {
    id: "start",
    label: "Только начали",
    topics: topics.map(({ title }) => ({ title })),
    prototypes: [],
    weeklyCount: 0,
  },
];


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

export type ExamStatus = "good" | "warn" | "bad";

export type ExamRadar = {
  id: string;
  subject: string;
  examLabel: string;
  daysLeft: number;
  targetScore: number;
  topicsDone: number;
  topicsNeeded: number;
  paceNow: number;
  paceNeeded: number;
  status: ExamStatus;
  statusLabel: string;
  comment: string;
  weekPlan: string[];
  /** темы, входящие в диапазон целевого балла */
  goalTopics: Topic[];
  /** прототипы, входящие в диапазон целевого балла */
  goalPrototypes: Topic[];
};

const goalTopicsBase: Topic[] = [
  { title: "Производные и первообразные", date: "29 июля" },
  { title: "Тригонометрические уравнения", date: "26 июля", review: true },
  { title: "Стереометрия: объёмы", date: "22 июля" },
  { title: "Логарифмы", date: "18 июля" },
  { title: "Текстовые задачи на движение", date: "15 июля", review: true },
  { title: "Параметры (базовый уровень)" },
  { title: "Планиметрия: окружности" },
  { title: "Экономические задачи" },
  { title: "Неравенства с модулем" },
];

const goalPrototypesBase: Topic[] = [
  { title: "Задание 12: исследование функции", date: "29 июля" },
  { title: "Задание 13: стереометрия", date: "26 июля", review: true },
  { title: "Задание 15: экономическая задача", date: "21 июля" },
  { title: "Задание 17: планиметрия" },
  { title: "Задание 18: параметр" },
];

function cutGoalTopics(done: number) {
  const items = goalTopicsBase.map((t) => ({ ...t }));
  return items.map((t, i) => (i < done ? t : { title: t.title }));
}


/** мок-варианты блока «Экзаменационный радар» */
export const examRadars: ExamRadar[] = [
  {
    id: "good",
    subject: "математике",
    examLabel: "До ЕГЭ по математике",
    daysLeft: 87,
    targetScore: 80,
    topicsDone: 22,
    topicsNeeded: 28,
    paceNow: 2.8,
    paceNeeded: 2.5,
    status: "good",
    statusLabel: "Идёшь по плану",
    comment:
      "За последние 2 недели пройдено 6 тем при нужных 5. Такими темпами программа закроется на две недели раньше экзамена — останется время на разборы прототипов.",
    weekPlan: ["Тема: Производная (следующий урок)", "Тема: Интеграл (запланировано)"],
    goalTopics: cutGoalTopics(5),
    goalPrototypes: goalPrototypesBase,
  },
  {
    id: "warn",
    subject: "математике",
    examLabel: "До ЕГЭ по математике",
    daysLeft: 87,
    targetScore: 80,
    topicsDone: 18,
    topicsNeeded: 28,
    paceNow: 1.8,
    paceNeeded: 2.5,
    status: "warn",
    statusLabel: "Немного отстаёшь",
    comment:
      "За последние 2 недели пройдено 4 темы при нужных 5. Чтобы выйти на 80 баллов, держи темп 2,5 темы в неделю — это один дополнительный разбор дома.",
    weekPlan: ["Тема: Производная (следующий урок)", "Тема: Интеграл (запланировано)"],
    goalTopics: cutGoalTopics(4),
    goalPrototypes: goalPrototypesBase.map((t, i) => (i < 2 ? t : { title: t.title })),
  },
  {
    id: "bad",
    subject: "математике",
    examLabel: "До ЕГЭ по математике",
    daysLeft: 87,
    targetScore: 80,
    topicsDone: 11,
    topicsNeeded: 28,
    paceNow: 0.8,
    paceNeeded: 3.5,
    status: "bad",
    statusLabel: "Критическое отставание",
    comment:
      "За последние 2 недели пройдено 2 темы при нужных 5. Чтобы выйти на 80 баллов в ближайшие 3 недели, нужен темп 3 темы в неделю. Стоит обсудить с преподавателем дополнительное занятие.",
    weekPlan: ["Тема: Производная (следующий урок)", "Тема: Интеграл (запланировано)"],
    goalTopics: cutGoalTopics(2),
    goalPrototypes: goalPrototypesBase.map((t, i) => (i < 1 ? t : { title: t.title })),
  },
];
