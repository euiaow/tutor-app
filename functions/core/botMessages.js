// Single source of truth for every user-facing bot message string, so the
// telegram.js/vk.js adapters stay pure "format + send" and never hardcode
// copy themselves. Every entry is a function (even the parameterless ones)
// so callers use one consistent shape regardless of whether a message needs
// interpolation.

function WELCOME_NO_TOKEN() {
  return `Привет! Я помощник твоего репетитора 👋
Через меня ты будешь получать напоминания об уроках и присылать домашние задания.
Чтобы подключиться, попроси репетитора прислать тебе ссылку для регистрации.`
}

function WELCOME_WITH_TOKEN() {
  return `Привет! Я помощник твоего репетитора 👋
Давай познакомимся — как тебя зовут? (Имя и фамилия)`
}

function NAME_SAVED(name) {
  return `Отлично, ${name}! Теперь придумай 4-значный код — он понадобится для входа в личный кабинет на сайте.`
}

function PIN_SAVED(url) {
  return `Готово! Ты зарегистрирован(а) 🎉
Вот ссылка на твой личный кабинет: ${url}

Здесь ты будешь видеть расписание, задания и свой прогресс.
Когда получишь домашнее задание — просто пришли фото сюда в чат, я передам репетитору.`
}

function INVALID_PIN() {
  return "Код должен состоять ровно из 4 цифр. Попробуй ещё раз:"
}

function INVALID_TOKEN() {
  return `Эта ссылка недействительна или уже была использована.
Попроси репетитора прислать новую ссылку.`
}

function HOMEWORK_RECEIVED() {
  return "Домашка получена! ✓ Репетитор её увидит перед уроком."
}

function HOMEWORK_NO_LESSON() {
  return "Сейчас нет активного задания. Если хочешь что-то передать репетитору — напиши ему напрямую."
}

function UNKNOWN_MESSAGE() {
  return "Не понимаю это сообщение. Если хочешь сдать домашку — пришли фото."
}

// Not part of the requested set, but kept here for the same reason — these
// adapter-only strings shouldn't be hardcoded in telegram.js/vk.js either.
function STUDENT_NOT_LINKED() {
  return "Не нашли твой аккаунт. Обратись к репетитору за новой ссылкой"
}

function HOMEWORK_SAVE_FAILED() {
  return "Не удалось сохранить файл, попробуй ещё раз"
}

function REGISTRATION_FAILED() {
  return "Не удалось завершить регистрацию. Обратись к репетитору за новой ссылкой"
}

function formatMoscowDateTime(date) {
  if (!date) {
    return "—"
  }

  const datePart = date.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "long" })
  const timePart = date.toLocaleTimeString("ru-RU", {
    timeZone: "Europe/Moscow",
    hour: "2-digit",
    minute: "2-digit",
  })

  return `${datePart}, ${timePart}`
}

function RESCHEDULE_PROPOSED_TO_STUDENT(oldDate, newDate) {
  return `Репетитор предлагает перенести урок ${formatMoscowDateTime(oldDate)} на ${formatMoscowDateTime(newDate)}.
Ответь:
✅ Подтвердить
❌ Отклонить`
}

function RESCHEDULE_PROPOSED_TO_TEACHER(studentName, oldDate, newDate) {
  return `Ученик ${studentName} предлагает перенести урок ${formatMoscowDateTime(oldDate)} на ${formatMoscowDateTime(newDate)}.
Подтверди или отклони в панели учителя.`
}

function RESCHEDULE_CONFIRMED(newDate) {
  return `Перенос подтверждён! Новое время: ${formatMoscowDateTime(newDate)}`
}

function RESCHEDULE_REJECTED() {
  return "Перенос отклонён"
}

function RESCHEDULE_ASK_DATE() {
  return "Напиши желаемую дату и время в формате ДД.ММ ЧЧ:ММ (например: 15.08 18:00)"
}

function RESCHEDULE_INVALID_DATE() {
  return "Не получилось распознать дату. Формат: ДД.ММ ЧЧ:ММ (например: 15.08 18:00)"
}

function RESCHEDULE_REQUEST_SENT() {
  return "Запрос на перенос отправлен репетитору. Сообщим, как только он ответит."
}

function RESCHEDULE_NO_UPCOMING_LESSON() {
  return "Сейчас нет запланированного урока для переноса."
}

function RESCHEDULE_CALLBACK_FAILED() {
  return "Не удалось обработать запрос, попробуй ещё раз"
}

// Same two actions, expressed in each platform's own button format —
// Telegram's inline keyboard callback_data vs VK's keyboard button payload.
function RESCHEDULE_KEYBOARDS(lessonId) {
  return {
    telegram: {
      inline_keyboard: [
        [
          { text: "✅ Подтвердить", callback_data: `confirm_reschedule_${lessonId}` },
          { text: "❌ Отклонить", callback_data: `cancel_reschedule_${lessonId}` },
        ],
      ],
    },
    vk: {
      one_time: true,
      buttons: [
        [
          {
            action: {
              type: "text",
              label: "✅ Подтвердить",
              payload: JSON.stringify({ command: "confirm_reschedule", lessonId }),
            },
            color: "positive",
          },
          {
            action: {
              type: "text",
              label: "❌ Отклонить",
              payload: JSON.stringify({ command: "cancel_reschedule", lessonId }),
            },
            color: "negative",
          },
        ],
      ],
    },
  }
}

function REMINDER_MIDDAY(time, assignmentText) {
  const tail = assignmentText
    ? `Задание: ${assignmentText}\nЕсли готово — пришли фото домашки сюда в чат.`
    : "Проверь, есть ли домашнее задание — если есть, пришли фото сюда в чат."
  return `Напоминаем: завтра в ${time} у тебя урок! 📚\n${tail}`
}

function REMINDER_PRE_LESSON(assignmentText) {
  const tail = assignmentText
    ? `Не забудь домашнее задание: ${assignmentText}\nПришли фото сюда если ещё не отправил(а).`
    : "Удачи на уроке! Если есть домашка — пришли фото сюда."
  return `Через 2 часа урок! 🕐\n${tail}`
}

module.exports = {
  WELCOME_NO_TOKEN,
  WELCOME_WITH_TOKEN,
  NAME_SAVED,
  PIN_SAVED,
  INVALID_PIN,
  INVALID_TOKEN,
  HOMEWORK_RECEIVED,
  HOMEWORK_NO_LESSON,
  UNKNOWN_MESSAGE,
  STUDENT_NOT_LINKED,
  HOMEWORK_SAVE_FAILED,
  REGISTRATION_FAILED,
  REMINDER_MIDDAY,
  REMINDER_PRE_LESSON,
  RESCHEDULE_PROPOSED_TO_STUDENT,
  RESCHEDULE_PROPOSED_TO_TEACHER,
  RESCHEDULE_CONFIRMED,
  RESCHEDULE_REJECTED,
  RESCHEDULE_ASK_DATE,
  RESCHEDULE_INVALID_DATE,
  RESCHEDULE_REQUEST_SENT,
  RESCHEDULE_NO_UPCOMING_LESSON,
  RESCHEDULE_CALLBACK_FAILED,
  RESCHEDULE_KEYBOARDS,
}
