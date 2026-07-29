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
  return "✅ Домашка получена! Репетитор увидит её перед уроком."
}

function HOMEWORK_SUBMITTED_TO_TEACHER(studentName, lessonDate) {
  return `📝 ${studentName} прислал(а) домашнее задание к уроку ${formatMoscowDateTime(lessonDate)}`
}

function ASSIGNMENT_ADDED(lessonDate, assignmentText) {
  const tail = assignmentText ? assignmentText : "Проверь личный кабинет"
  return `📚 Репетитор добавил задание к уроку ${formatMoscowDateTime(lessonDate)}: ${tail}`
}

function MATERIAL_ADDED(lessonDate, materialTitle) {
  return `📎 К уроку ${formatMoscowDateTime(lessonDate)} добавлен новый материал: ${materialTitle}`
}

function EXTRA_LESSON_ASSIGNED(lessonDate) {
  return `📌 Репетитор назначил(а) дополнительный урок: ${formatMoscowDateTime(lessonDate)}`
}

function ASSIGNMENT_UPDATED(lessonDate, assignmentText) {
  return `✏️ Репетитор изменил задание к уроку ${formatMoscowDateTime(lessonDate)}: ${assignmentText}`
}

function ASSIGNMENT_FILES_ADDED(lessonDate, fileTitles) {
  const word = fileTitles.length > 1 ? "файлы" : "файл"
  return `📎 Репетитор прикрепил ${word} к уроку ${formatMoscowDateTime(lessonDate)}: ${fileTitles.join(", ")}`
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
  return `📅 Репетитор предлагает перенести урок ${formatMoscowDateTime(oldDate)} на ${formatMoscowDateTime(newDate)}`
}

function RESCHEDULE_PROPOSED_TO_TEACHER(studentName, oldDate, newDate) {
  return `📅 ${studentName} просит перенести урок ${formatMoscowDateTime(oldDate)} на ${formatMoscowDateTime(newDate)}`
}

function RESCHEDULE_CONFIRMED(newDate) {
  return `✅ Перенос урока подтверждён. Новое время: ${formatMoscowDateTime(newDate)}`
}

function RESCHEDULE_REJECTED(originalDate) {
  return `❌ Перенос урока отклонён. Урок остаётся ${formatMoscowDateTime(originalDate)}`
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
// VK "callback" buttons (as opposed to plain "text" buttons) deliver the
// press as a message_event webhook event rather than a regular message, so
// the payload has to carry everything handleCallbackEvent needs to act
// without a prior session/chat lookup — studentId included, not just lessonId.
function RESCHEDULE_KEYBOARDS(lessonId, studentId) {
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
      inline: true,
      buttons: [
        [
          {
            action: {
              type: "callback",
              label: "✅ Подтвердить",
              payload: JSON.stringify({ action: "confirm_reschedule", studentId, lessonId }),
            },
            color: "positive",
          },
          {
            action: {
              type: "callback",
              label: "❌ Отклонить",
              payload: JSON.stringify({ action: "cancel_reschedule", studentId, lessonId }),
            },
            color: "negative",
          },
        ],
      ],
    },
  }
}

function CANCELLATION_PROPOSED_TO_STUDENT(lessonDate) {
  return `🔴 Репетитор предлагает отменить урок ${formatMoscowDateTime(lessonDate)}`
}

function CANCELLATION_PROPOSED_TO_TEACHER(studentName, lessonDate) {
  return `🔴 ${studentName} просит отменить урок ${formatMoscowDateTime(lessonDate)}`
}

function CANCELLATION_CONFIRMED(lessonDate) {
  return `❌ Урок ${formatMoscowDateTime(lessonDate)} отменён`
}

function CANCELLATION_REJECTED() {
  return "↩️ Отмена урока отклонена. Урок остаётся в силе."
}

function CANCELLATION_CALLBACK_FAILED() {
  return "Не удалось обработать запрос, попробуй ещё раз"
}

// Same shape as RESCHEDULE_KEYBOARDS — see its comment for why VK needs
// studentId embedded in the payload and "inline: true" rather than "one_time".
function CANCELLATION_KEYBOARDS(lessonId, studentId) {
  return {
    telegram: {
      inline_keyboard: [
        [
          { text: "✅ Подтвердить отмену", callback_data: `confirm_cancel_${lessonId}_${studentId}` },
          { text: "❌ Отклонить", callback_data: `reject_cancel_${lessonId}_${studentId}` },
        ],
      ],
    },
    vk: {
      inline: true,
      buttons: [
        [
          {
            action: {
              type: "callback",
              label: "✅ Подтвердить отмену",
              payload: JSON.stringify({ action: "confirm_cancel", studentId, lessonId }),
            },
            color: "positive",
          },
          {
            action: {
              type: "callback",
              label: "❌ Отклонить",
              payload: JSON.stringify({ action: "reject_cancel", studentId, lessonId }),
            },
            color: "negative",
          },
        ],
      ],
    },
  }
}

// lessonDate accepts either a Firestore Timestamp or a plain Date — reminders.js
// passes whatever effective date it resolved (rescheduledDate ?? date, a
// Date), but this stays tolerant of a raw Timestamp too. This runs
// server-side (Cloud Functions),
// so the lesson time is formatted in Europe/Moscow explicitly rather than via
// Intl.DateTimeFormat().resolvedOptions().timeZone, which reflects the
// server's own timezone and not the student's.
function toDate(lessonDate) {
  return typeof lessonDate?.toDate === "function" ? lessonDate.toDate() : lessonDate
}

function moscowDayKey(date) {
  return date.toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" })
}

function dayLabel(date, now) {
  return moscowDayKey(date) === moscowDayKey(now) ? "Сегодня" : "Завтра"
}

function formatMoscowTime(date) {
  return date.toLocaleTimeString("ru-RU", {
    timeZone: "Europe/Moscow",
    hour: "2-digit",
    minute: "2-digit",
  })
}

// lessons: [{ date, assignmentText }], sorted ascending, all falling within
// "the rest of today + all of tomorrow" (see reminders.js) — so dayLabel
// only ever needs to distinguish those two days.
function REMINDER_MIDDAY_SUMMARY(lessons, now) {
  if (lessons.length === 1) {
    const { date, assignmentText } = lessons[0]
    const label = dayLabel(date, now).toLowerCase()
    const time = formatMoscowTime(toDate(date))
    const tail = assignmentText
      ? `Задание: ${assignmentText}\nЕсли готово — пришли фото домашки сюда в чат.`
      : "Проверь, есть ли домашнее задание — если есть, пришли фото сюда в чат."
    return `🔔 Напоминаем: ${label} в ${time} у тебя урок!\n${tail}`
  }

  const lines = lessons.map(({ date, assignmentText }) => {
    const label = dayLabel(date, now)
    const time = formatMoscowTime(toDate(date))
    return `- ${label} в ${time}${assignmentText ? ` — ${assignmentText}` : ""}`
  })

  return `🔔 Ближайшие уроки:\n${lines.join("\n")}\nНе забудь домашку — пришли фото сюда если готова.`
}

function buildPreLessonMessage(lessonDate, homeworkText) {
  const now = new Date()
  const lessonTime = toDate(lessonDate)
  const diffMs = lessonTime - now
  const diffMinutes = Math.round(diffMs / 60000)

  let timeStr
  if (diffMinutes >= 60) {
    const hours = Math.floor(diffMinutes / 60)
    const mins = diffMinutes % 60
    timeStr = mins > 0 ? `через ${hours} ч ${mins} мин` : `через ${hours} ч`
  } else {
    timeStr = `через ${diffMinutes} мин`
  }

  const lessonTimeFormatted = lessonTime.toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    hour: "2-digit",
    minute: "2-digit",
  })

  return (
    `Урок ${timeStr} (в ${lessonTimeFormatted})! 🕐\n` +
    (homeworkText
      ? `Не забудь домашнее задание: ${homeworkText}\nПришли фото сюда если ещё не отправил(а).`
      : `Удачи на уроке! Если есть домашка — пришли фото.`)
  )
}

module.exports = {
  WELCOME_NO_TOKEN,
  WELCOME_WITH_TOKEN,
  NAME_SAVED,
  PIN_SAVED,
  INVALID_PIN,
  INVALID_TOKEN,
  HOMEWORK_RECEIVED,
  HOMEWORK_SUBMITTED_TO_TEACHER,
  ASSIGNMENT_ADDED,
  EXTRA_LESSON_ASSIGNED,
  ASSIGNMENT_UPDATED,
  ASSIGNMENT_FILES_ADDED,
  MATERIAL_ADDED,
  HOMEWORK_NO_LESSON,
  UNKNOWN_MESSAGE,
  STUDENT_NOT_LINKED,
  HOMEWORK_SAVE_FAILED,
  REGISTRATION_FAILED,
  REMINDER_MIDDAY_SUMMARY,
  buildPreLessonMessage,
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
  CANCELLATION_PROPOSED_TO_STUDENT,
  CANCELLATION_PROPOSED_TO_TEACHER,
  CANCELLATION_CONFIRMED,
  CANCELLATION_REJECTED,
  CANCELLATION_CALLBACK_FAILED,
  CANCELLATION_KEYBOARDS,
}
