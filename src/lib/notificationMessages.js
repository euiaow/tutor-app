// Frontend (ESM) mirror of functions/core/notificationMessages.js — kept in
// sync by hand, same CommonJS/ESM split this project already uses for
// schedule.js/subjects.js. See that file's own doc comment for the full
// reasoning (params shape, why free-text values stay untranslated, why
// params.timeZone is filled in by the backend automatically). Used by
// StudentDashboard.jsx to render notification.params into text at render
// time instead of reading a pre-built notification.text — see that file's
// AllNotificationsDialog/StudentNotifications for the text/params fallback.

function toJsDate(value) {
  return value?.toDate?.() ?? value ?? null
}

function formatDateTime(value, timeZone, language) {
  const date = toJsDate(value)
  if (!date) return "—"
  const locale = language === "en" ? "en-US" : "ru-RU"
  const datePart = date.toLocaleDateString(locale, { timeZone, day: "numeric", month: "long" })
  const timePart = date.toLocaleTimeString(locale, { timeZone, hour: "2-digit", minute: "2-digit" })
  return `${datePart}, ${timePart}`
}

function dayKey(date, timeZone) {
  return date.toLocaleDateString("en-CA", { timeZone })
}

function dayLabel(date, now, timeZone, language) {
  const isToday = dayKey(date, timeZone) === dayKey(now, timeZone)
  if (language === "en") return isToday ? "today" : "tomorrow"
  return isToday ? "Сегодня" : "Завтра"
}

function formatDurationFromNow(minutes, language) {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (language === "en") {
      return mins > 0 ? `in ${hours}h ${mins}m` : `in ${hours}h`
    }
    return mins > 0 ? `через ${hours} ч ${mins} мин` : `через ${hours} ч`
  }
  return language === "en" ? `in ${minutes} min` : `через ${minutes} мин`
}

const BUILDERS = {
  assignment_added: (p, lang) => {
    const date = formatDateTime(p.lessonDate, p.timeZone, lang)
    const tail = p.assignmentText || (lang === "en" ? "Check your dashboard" : "Проверь личный кабинет")
    return lang === "en"
      ? `📚 The teacher added an assignment for the lesson on ${date}: ${tail}`
      : `📚 Репетитор добавил задание к уроку ${date}: ${tail}`
  },

  assignment_updated: (p, lang) => {
    const date = formatDateTime(p.lessonDate, p.timeZone, lang)
    return lang === "en"
      ? `✏️ The teacher changed the assignment for the lesson on ${date}: ${p.assignmentText}`
      : `✏️ Репетитор изменил задание к уроку ${date}: ${p.assignmentText}`
  },

  material_added: (p, lang) => {
    const date = formatDateTime(p.lessonDate, p.timeZone, lang)
    if (p.fileTitles) {
      const isPlural = p.fileTitles.length > 1
      const titles = p.fileTitles.join(", ")
      if (lang === "en") {
        return `📎 The teacher attached ${isPlural ? "files" : "a file"} to the lesson on ${date}: ${titles}`
      }
      const word = isPlural ? "файлы" : "файл"
      return `📎 Репетитор прикрепил ${word} к уроку ${date}: ${titles}`
    }
    return lang === "en"
      ? `📎 A new material was added for the lesson on ${date}: ${p.materialTitle}`
      : `📎 К уроку ${date} добавлен новый материал: ${p.materialTitle}`
  },

  extra_lesson_assigned: (p, lang) => {
    const date = formatDateTime(p.lessonDate, p.timeZone, lang)
    if (p.groupName) {
      return lang === "en"
        ? `📌 The teacher scheduled an extra group lesson «${p.groupName}»: ${date}`
        : `📌 Репетитор назначил(а) дополнительное групповое занятие «${p.groupName}»: ${date}`
    }
    return lang === "en"
      ? `📌 The teacher scheduled an extra lesson: ${date}`
      : `📌 Репетитор назначил(а) дополнительный урок: ${date}`
  },

  reschedule_proposed_to_student: (p, lang) => {
    const oldDate = formatDateTime(p.oldDate, p.timeZone, lang)
    const newDate = formatDateTime(p.newDate, p.timeZone, lang)
    return lang === "en"
      ? `📅 The teacher suggests moving the lesson from ${oldDate} to ${newDate}`
      : `📅 Репетитор предлагает перенести урок ${oldDate} на ${newDate}`
  },

  reschedule_confirmed: (p, lang) => {
    const newDate = formatDateTime(p.newDate, p.timeZone, lang)
    if (p.groupName) {
      return lang === "en"
        ? `📅 Group lesson «${p.groupName}» rescheduled. New time: ${newDate}`
        : `📅 Групповое занятие «${p.groupName}» перенесено. Новое время: ${newDate}`
    }
    return lang === "en"
      ? `✅ Reschedule confirmed. New time: ${newDate}`
      : `✅ Перенос урока подтверждён. Новое время: ${newDate}`
  },

  reschedule_rejected: (p, lang) => {
    const originalDate = formatDateTime(p.originalDate, p.timeZone, lang)
    return lang === "en"
      ? `❌ Reschedule declined. The lesson stays at ${originalDate}`
      : `❌ Перенос урока отклонён. Урок остаётся ${originalDate}`
  },

  cancellation_proposed_to_student: (p, lang) => {
    const date = formatDateTime(p.lessonDate, p.timeZone, lang)
    return lang === "en"
      ? `🔴 The teacher suggests cancelling the lesson on ${date}`
      : `🔴 Репетитор предлагает отменить урок ${date}`
  },

  cancellation_confirmed: (p, lang) => {
    const date = formatDateTime(p.lessonDate, p.timeZone, lang)
    return lang === "en" ? `❌ The lesson on ${date} has been cancelled` : `❌ Урок ${date} отменён`
  },

  lesson_cancelled_by_teacher: (p, lang) => {
    const date = formatDateTime(p.lessonDate, p.timeZone, lang)
    if (p.groupName) {
      return lang === "en"
        ? `❌ Group lesson «${p.groupName}» on ${date} was cancelled by the teacher.`
        : `❌ Групповое занятие «${p.groupName}» ${date} отменено репетитором.`
    }
    return lang === "en"
      ? `❌ The lesson on ${date} was cancelled by the teacher.`
      : `❌ Урок ${date} отменён репетитором.`
  },

  cancellation_rejected: (_p, lang) =>
    lang === "en" ? "↩️ Cancellation declined. The lesson still stands." : "↩️ Отмена урока отклонена. Урок остаётся в силе.",

  homework_received: (_p, lang) =>
    lang === "en" ? "✅ Homework received! The teacher will see it before the lesson." : "✅ Домашка получена! Репетитор увидит её перед уроком.",

  low_balance: (p, lang) => {
    if (p.newBalance <= 0) {
      return lang === "en"
        ? "Your paid lesson package has run out. Reach out whenever it's convenient to renew it."
        : "Пакет занятий закончился. Свяжись, чтобы продлить, когда будет удобно."
    }
    return lang === "en"
      ? `${p.newBalance} lesson(s) left in your paid package. Let me know if you'd like to renew — I'd love to keep working with you! 🙂`
      : `Осталось ${p.newBalance} занятие(-ий) в оплаченном пакете. Дай знать, если нужно продлить — буду рада продолжать с тобой заниматься! 🙂`
  },

  lesson_reminder_midday: (p, lang) => {
    const now = toJsDate(p.now)
    const lessons = p.lessons ?? []

    if (lessons.length === 1) {
      const { date, assignmentText, groupName } = lessons[0]
      const label = dayLabel(toJsDate(date), now, p.timeZone, lang).toLowerCase()
      const time = formatDateTime(date, p.timeZone, lang).split(", ")[1]
      const tail = assignmentText
        ? lang === "en"
          ? `Assignment: ${assignmentText}\nIf it's ready, send a photo of your homework here in the chat.`
          : `Задание: ${assignmentText}\nЕсли готово — пришли фото домашки сюда в чат.`
        : lang === "en"
          ? "Check whether you have homework — if so, send a photo here in the chat."
          : "Проверь, есть ли домашнее задание — если есть, пришли фото сюда в чат."
      const subject = groupName
        ? lang === "en"
          ? `a group lesson («${groupName}»)`
          : `групповое занятие «${groupName}»`
        : lang === "en"
          ? "a lesson"
          : "урок"
      return lang === "en"
        ? `🔔 Reminder: you have ${subject} ${label} at ${time}!\n${tail}`
        : `🔔 Напоминаем: ${label} в ${time} у тебя ${subject}!\n${tail}`
    }

    const lines = lessons.map(({ date, assignmentText }) => {
      const label = dayLabel(toJsDate(date), now, p.timeZone, lang)
      const time = formatDateTime(date, p.timeZone, lang).split(", ")[1]
      return `- ${label} ${lang === "en" ? "at" : "в"} ${time}${assignmentText ? ` — ${assignmentText}` : ""}`
    })

    return lang === "en"
      ? `🔔 Upcoming lessons:\n${lines.join("\n")}\nDon't forget your homework — send a photo here once it's ready.`
      : `🔔 Ближайшие уроки:\n${lines.join("\n")}\nНе забудь домашку — пришли фото сюда если готова.`
  },

  lesson_reminder_preLesson: (p, lang) => {
    const timeStr = formatDurationFromNow(p.diffMinutes, lang)
    const lessonTimeFormatted = formatDateTime(p.lessonDate, p.timeZone, lang).split(", ")[1]
    const subject = p.groupName
      ? lang === "en"
        ? `Group lesson «${p.groupName}»`
        : `Групповое занятие «${p.groupName}»`
      : lang === "en"
        ? "Lesson"
        : "Урок"
    const head = lang === "en" ? `${subject} ${timeStr} (at ${lessonTimeFormatted})! 🕐\n` : `${subject} ${timeStr} (в ${lessonTimeFormatted})! 🕐\n`
    const tail = p.homeworkText
      ? lang === "en"
        ? `Don't forget your homework: ${p.homeworkText}\nSend a photo here if you haven't yet.`
        : `Не забудь домашнее задание: ${p.homeworkText}\nПришли фото сюда если ещё не отправил(а).`
      : lang === "en"
        ? "Good luck with the lesson! If you have homework, send a photo."
        : "Удачи на уроке! Если есть домашка — пришли фото."
    return head + tail
  },

  lesson_soon: (p, lang) => {
    const lessonTimeFormatted = formatDateTime(p.lessonDate, p.timeZone, lang).split(", ")[1]
    const subject = p.groupName
      ? lang === "en"
        ? `Group lesson «${p.groupName}»`
        : `Групповое занятие «${p.groupName}»`
      : lang === "en"
        ? "Lesson"
        : "Урок"
    const head =
      lang === "en"
        ? `🔔 ${subject} in ${p.diffMinutes} minutes! (at ${lessonTimeFormatted})`
        : `🔔 ${subject} через ${p.diffMinutes} минут! (в ${lessonTimeFormatted})`
    const tail = p.homeworkText
      ? lang === "en"
        ? "\nDon't forget your homework if you haven't sent it yet."
        : "\nНе забудь домашку, если ещё не отправил(а)."
      : ""
    return head + tail
  },
}

export function buildNotificationText(type, params, language) {
  const lang = language === "en" ? "en" : "ru"
  const builder = BUILDERS[type]
  if (!builder) {
    return ""
  }
  return builder(params ?? {}, lang)
}
