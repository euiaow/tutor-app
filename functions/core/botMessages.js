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

// showMenuButtonHint is Telegram-only (the "кнопка меню" is a Telegram
// client feature VK has no equivalent of) — telegram.js passes true,
// vk.js leaves it false, same shared message otherwise.
function PIN_SAVED(url, showMenuButtonHint = false) {
  const menuButtonHint = showMenuButtonHint
    ? "\nОткрой личный кабинет через кнопку меню внизу чата 📱"
    : ""

  return `Готово! Ты зарегистрирован(а) 🎉
Вот ссылка на твой личный кабинет: ${url}
${menuButtonHint}
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

// Multi-tenancy Phase 3: self-service signup now always needs a specific
// teacher's slug ("/start signup_{slug}" on Telegram, "регистрация-{slug}"
// on VK) — these two cover the cases where that slug is missing or wrong,
// distinct from INVALID_TOKEN above (which is about an already-issued,
// already-used registration token, not a signup slug).
function SIGNUP_LINK_INVALID() {
  return "Ссылка недействительна, обратитесь к вашему репетитору."
}

function SIGNUP_NEEDS_TEACHER_LINK() {
  return "Уточните у репетитора точную ссылку или код для регистрации."
}

function HOMEWORK_RECEIVED() {
  return "✅ Домашка получена! Репетитор увидит её перед уроком."
}

function HOMEWORK_SUBMITTED_TO_TEACHER(studentName, lessonDate, timeZone) {
  return `📝 ${studentName} прислал(а) домашнее задание к уроку ${formatMoscowDateTime(lessonDate, timeZone)}`
}

function ASSIGNMENT_ADDED(lessonDate, assignmentText, timeZone) {
  const tail = assignmentText ? assignmentText : "Проверь личный кабинет"
  return `📚 Репетитор добавил задание к уроку ${formatMoscowDateTime(lessonDate, timeZone)}: ${tail}`
}

function MATERIAL_ADDED(lessonDate, materialTitle, timeZone) {
  return `📎 К уроку ${formatMoscowDateTime(lessonDate, timeZone)} добавлен новый материал: ${materialTitle}`
}

function EXTRA_LESSON_ASSIGNED(lessonDate, timeZone) {
  return `📌 Репетитор назначил(а) дополнительный урок: ${formatMoscowDateTime(lessonDate, timeZone)}`
}

function ASSIGNMENT_UPDATED(lessonDate, assignmentText, timeZone) {
  return `✏️ Репетитор изменил задание к уроку ${formatMoscowDateTime(lessonDate, timeZone)}: ${assignmentText}`
}

function ASSIGNMENT_FILES_ADDED(lessonDate, fileTitles, timeZone) {
  const word = fileTitles.length > 1 ? "файлы" : "файл"
  return `📎 Репетитор прикрепил ${word} к уроку ${formatMoscowDateTime(lessonDate, timeZone)}: ${fileTitles.join(", ")}`
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

function TEACHER_CONNECTED() {
  return "Вы подключены как репетитор! Теперь будете получать уведомления сюда."
}

function TEACHER_CONNECT_INVALID() {
  return "Ссылка недействительна или устарела, сгенерируйте новую в панели"
}

// timeZone defaults to Europe/Moscow purely as a technical safety net for a
// recipient with no timezone saved on their profile yet (see
// lib/timezone.js's identical default on the frontend) — every real caller
// now passes the actual recipient's own resolved timezone (createNotification
// in core/notifier.js resolves it per-target before calling any of these).
function formatMoscowDateTime(date, timeZone = "Europe/Moscow") {
  if (!date) {
    return "—"
  }

  const datePart = date.toLocaleDateString("ru-RU", { timeZone, day: "numeric", month: "long" })
  const timePart = date.toLocaleTimeString("ru-RU", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  })

  return `${datePart}, ${timePart}`
}

function RESCHEDULE_PROPOSED_TO_STUDENT(oldDate, newDate, timeZone) {
  return `📅 Репетитор предлагает перенести урок ${formatMoscowDateTime(oldDate, timeZone)} на ${formatMoscowDateTime(newDate, timeZone)}`
}

function RESCHEDULE_PROPOSED_TO_TEACHER(studentName, oldDate, newDate, timeZone) {
  return `📅 ${studentName} просит перенести урок ${formatMoscowDateTime(oldDate, timeZone)} на ${formatMoscowDateTime(newDate, timeZone)}`
}

function RESCHEDULE_CONFIRMED(newDate, timeZone) {
  return `✅ Перенос урока подтверждён. Новое время: ${formatMoscowDateTime(newDate, timeZone)}`
}

function RESCHEDULE_REJECTED(originalDate, timeZone) {
  return `❌ Перенос урока отклонён. Урок остаётся ${formatMoscowDateTime(originalDate, timeZone)}`
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

// Teacher-side equivalent of RESCHEDULE_KEYBOARDS, used when a *student*
// proposes a reschedule (target: teacher). Unlike the student-facing
// keyboards, Telegram's callback_data here MUST carry studentId too, not
// just lessonId — student-side buttons resolve studentId from the chat
// itself (findStudentIdByChatIdentity), but the teacher's chat has no
// student doc to resolve through. Kept prefix short ("t_confirm_resch_" not
// "teacher_confirm_reschedule_") to stay under Telegram's 64-byte
// callback_data limit once both a lessonId and a studentId are appended.
function RESCHEDULE_KEYBOARDS_FOR_TEACHER(lessonId, studentId) {
  return {
    telegram: {
      inline_keyboard: [
        [
          { text: "✅ Подтвердить", callback_data: `t_confirm_resch_${lessonId}_${studentId}` },
          { text: "❌ Отклонить", callback_data: `t_cancel_resch_${lessonId}_${studentId}` },
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
              payload: JSON.stringify({ action: "teacher_confirm_reschedule", studentId, lessonId }),
            },
            color: "positive",
          },
          {
            action: {
              type: "callback",
              label: "❌ Отклонить",
              payload: JSON.stringify({ action: "teacher_cancel_reschedule", studentId, lessonId }),
            },
            color: "negative",
          },
        ],
      ],
    },
  }
}

function CANCELLATION_PROPOSED_TO_STUDENT(lessonDate, timeZone) {
  return `🔴 Репетитор предлагает отменить урок ${formatMoscowDateTime(lessonDate, timeZone)}`
}

function CANCELLATION_PROPOSED_TO_TEACHER(studentName, lessonDate, timeZone) {
  return `🔴 ${studentName} просит отменить урок ${formatMoscowDateTime(lessonDate, timeZone)}`
}

function CANCELLATION_CONFIRMED(lessonDate, timeZone) {
  return `❌ Урок ${formatMoscowDateTime(lessonDate, timeZone)} отменён`
}

// One-way teacher cancellation (cancelLessonDirectly) — a plain
// announcement, not a proposal, so unlike CANCELLATION_PROPOSED_TO_STUDENT
// this never gets a reply keyboard attached.
function LESSON_CANCELLED_BY_TEACHER(lessonDate, timeZone) {
  return `❌ Урок ${formatMoscowDateTime(lessonDate, timeZone)} отменён репетитором.`
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

// Teacher-side equivalent of CANCELLATION_KEYBOARDS — see
// RESCHEDULE_KEYBOARDS_FOR_TEACHER's comment for why Telegram's
// callback_data needs both ids and a short prefix here.
function CANCELLATION_KEYBOARDS_FOR_TEACHER(lessonId, studentId) {
  return {
    telegram: {
      inline_keyboard: [
        [
          { text: "✅ Подтвердить отмену", callback_data: `t_confirm_cxl_${lessonId}_${studentId}` },
          { text: "❌ Отклонить", callback_data: `t_reject_cxl_${lessonId}_${studentId}` },
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
              payload: JSON.stringify({ action: "teacher_confirm_cancel", studentId, lessonId }),
            },
            color: "positive",
          },
          {
            action: {
              type: "callback",
              label: "❌ Отклонить",
              payload: JSON.stringify({ action: "teacher_reject_cancel", studentId, lessonId }),
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

function moscowDayKey(date, timeZone = "Europe/Moscow") {
  return date.toLocaleDateString("en-CA", { timeZone })
}

function dayLabel(date, now, timeZone = "Europe/Moscow") {
  return moscowDayKey(date, timeZone) === moscowDayKey(now, timeZone) ? "Сегодня" : "Завтра"
}

function formatMoscowTime(date, timeZone = "Europe/Moscow") {
  return date.toLocaleTimeString("ru-RU", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  })
}

// lessons: [{ date, assignmentText }], sorted ascending, all falling within
// "the rest of today + all of tomorrow" (see reminders.js) — so dayLabel
// only ever needs to distinguish those two days. timeZone is the
// *recipient's* own saved timezone (reminders.js resolves it from
// students/{id}.timezone, falling back to Europe/Moscow) — the reminder
// text should read in the student's own local time, not the tutor's.
function REMINDER_MIDDAY_SUMMARY(lessons, now, timeZone = "Europe/Moscow") {
  if (lessons.length === 1) {
    const { date, assignmentText } = lessons[0]
    const label = dayLabel(date, now, timeZone).toLowerCase()
    const time = formatMoscowTime(toDate(date), timeZone)
    const tail = assignmentText
      ? `Задание: ${assignmentText}\nЕсли готово — пришли фото домашки сюда в чат.`
      : "Проверь, есть ли домашнее задание — если есть, пришли фото сюда в чат."
    return `🔔 Напоминаем: ${label} в ${time} у тебя урок!\n${tail}`
  }

  const lines = lessons.map(({ date, assignmentText }) => {
    const label = dayLabel(date, now, timeZone)
    const time = formatMoscowTime(toDate(date), timeZone)
    return `- ${label} в ${time}${assignmentText ? ` — ${assignmentText}` : ""}`
  })

  return `🔔 Ближайшие уроки:\n${lines.join("\n")}\nНе забудь домашку — пришли фото сюда если готова.`
}

function buildPreLessonMessage(lessonDate, homeworkText, timeZone = "Europe/Moscow") {
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
    timeZone,
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

function buildTenMinuteReminderMessage(homeworkText) {
  return "🔔 Урок через 10 минут!" + (homeworkText ? "\nНе забудь домашку, если ещё не отправил(а)." : "")
}

module.exports = {
  WELCOME_NO_TOKEN,
  WELCOME_WITH_TOKEN,
  NAME_SAVED,
  PIN_SAVED,
  INVALID_PIN,
  INVALID_TOKEN,
  SIGNUP_LINK_INVALID,
  SIGNUP_NEEDS_TEACHER_LINK,
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
  TEACHER_CONNECTED,
  TEACHER_CONNECT_INVALID,
  REMINDER_MIDDAY_SUMMARY,
  buildPreLessonMessage,
  buildTenMinuteReminderMessage,
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
  RESCHEDULE_KEYBOARDS_FOR_TEACHER,
  CANCELLATION_PROPOSED_TO_STUDENT,
  CANCELLATION_PROPOSED_TO_TEACHER,
  CANCELLATION_CONFIRMED,
  LESSON_CANCELLED_BY_TEACHER,
  CANCELLATION_REJECTED,
  CANCELLATION_CALLBACK_FAILED,
  CANCELLATION_KEYBOARDS,
  CANCELLATION_KEYBOARDS_FOR_TEACHER,
}
