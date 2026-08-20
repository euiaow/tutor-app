const crypto = require("crypto")
const { google } = require("googleapis")
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https")
const { onDocumentWritten } = require("firebase-functions/v2/firestore")
const { onSchedule } = require("firebase-functions/v2/scheduler")
const logger = require("firebase-functions/logger")
const { FieldValue } = require("firebase-admin/firestore")
const { db } = require("./core/firestore")
const { createRegistrationToken, cancelRegistrationToken } = require("./core/registration")
const { handleUpdate, TELEGRAM_BOT_TOKEN } = require("./adapters/telegram")
const { handleEvent, VK_GROUP_TOKEN, VK_CONFIRMATION_CODE } = require("./adapters/vk")
const {
  buildOAuthClient,
  getAuthUrl,
  saveTokens,
  getAuthorizedClient,
  isConnected,
  disconnectGoogleCalendar,
  GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET,
} = require("./core/googleAuth")
const {
  syncScheduleSlots,
  deleteLessonEvent,
} = require("./core/googleCalendar")
const { normalizeScheduleSlots } = require("./core/schedule")
const {
  ensureUpcomingLesson,
  getNearestUpcomingLesson,
  syncUpcomingLessonToSchedule,
  updateHomeworkAssignment,
  addLessonMaterial,
  createExtraLesson,
  completeLesson,
  proposeReschedule,
  confirmReschedule,
  cancelReschedule,
  proposeCancellation,
  confirmCancellation,
  cancelLessonDirectly,
  rejectCancellation,
  recordHomeworkSubmission,
} = require("./core/lessons")
const {
  dailyReminderMidday,
  dailyReminderPreLesson,
  dailyReminderTenMin,
} = require("./reminders")
const { createTeacherConnectToken } = require("./core/teacherConnect")
const { deleteStudent, updateStudentSettings } = require("./core/students")
const { addPayment } = require("./core/finance")
const { openCase: openCaseCore, saveDecoration: saveDecorationCore } = require("./core/gamification")
const {
  assignCurriculumTemplate,
  reassignProgram,
  deleteProgram,
  setStudentGoal,
  addPersonalTopic,
  removePersonalTopic,
  markTopicsCovered,
} = require("./core/curriculum")
const { assertOwnsStudent, assertOwnsTemplate } = require("./core/tenancy")
const { generateTeacherSlug, findTeacherBySlug } = require("./core/teachers")

const OAUTH_STATES_COLLECTION = "oauthStates"
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000
const GOOGLE_OAUTH_REGION = "us-central1"
const GOOGLE_OAUTH_CALLBACK_NAME = "googleOAuthCallback"

const APP_URL = "https://princessschool-e678c.web.app/teacher"

// The googleapis client needs the exact redirect URI both when it builds
// the consent-screen URL and when it later exchanges the code for tokens —
// Google rejects the exchange if the two don't match byte-for-byte. Since
// startGoogleOAuth is a callable (no incoming HTTP URL to read), both
// functions derive the same deployed Cloud Functions URL from the project
// id instead of hardcoding it.
function getGoogleOAuthRedirectUri() {
  const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT
  return `https://${GOOGLE_OAUTH_REGION}-${projectId}.cloudfunctions.net/${GOOGLE_OAUTH_CALLBACK_NAME}`
}

// Multi-tenancy Phase 1: this callable had no request.auth check at all
// before — harmless in the single-teacher world (a minted token still needs
// a real completeRegistration call to do anything), but once the token must
// carry a teacherId to stamp onto the resulting student doc, an auth check
// becomes load-bearing rather than optional (there's no uid to read
// otherwise). Added here as a necessary consequence of Phase 1, not scope
// creep.
exports.generateRegistrationLink = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Требуется вход в аккаунт преподавателя")
  }

  const { studentName } = request.data ?? {}

  try {
    const token = await createRegistrationToken(studentName, request.auth.uid)
    return { token }
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error
    }

    logger.error("Failed to generate registration link", error)
    throw new HttpsError("internal", "Не удалось создать ссылку на регистрацию")
  }
})

// Multi-tenancy Phase 2: same missing-auth-check gap as
// generateRegistrationLink above, plus an explicit ownership check (this
// function is named directly in the Phase 2 spec) — a teacher may only
// cancel their own invite links, never another teacher's.
exports.cancelRegistrationToken = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Требуется вход в аккаунт преподавателя")
  }

  const { token } = request.data ?? {}

  try {
    await cancelRegistrationToken(token, request.auth.uid)
    return { success: true }
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error
    }

    logger.error("Failed to cancel registration token", error)
    throw new HttpsError("internal", "Не удалось удалить ссылку регистрации")
  }
})

exports.deleteStudent = onCall(
  { secrets: [GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Требуется вход в аккаунт преподавателя")
    }

    const { studentId } = request.data ?? {}

    try {
      await assertOwnsStudent(studentId, request.auth.uid)
      await deleteStudent(studentId)
      return { success: true }
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error
      }

      logger.error("Failed to delete student", error)
      throw new HttpsError("internal", "Не удалось удалить ученика")
    }
  },
)

exports.updateHomeworkAssignment = onCall(
  { secrets: [TELEGRAM_BOT_TOKEN, VK_GROUP_TOKEN] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Требуется вход в аккаунт преподавателя")
    }

    const { studentId, lessonId, text, files } = request.data ?? {}

    try {
      await assertOwnsStudent(studentId, request.auth.uid)
      await updateHomeworkAssignment(studentId, lessonId, { text, files })
      return { success: true }
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error
      }

      logger.error("Failed to update homework assignment", error)
      throw new HttpsError("internal", "Не удалось сохранить задание")
    }
  },
)

exports.addLessonMaterial = onCall(
  { secrets: [TELEGRAM_BOT_TOKEN, VK_GROUP_TOKEN] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Требуется вход в аккаунт преподавателя")
    }

    const { studentId, lessonId, material } = request.data ?? {}

    try {
      await assertOwnsStudent(studentId, request.auth.uid)
      await addLessonMaterial(studentId, lessonId, material)
      return { success: true }
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error
      }

      logger.error("Failed to add lesson material", error)
      throw new HttpsError("internal", "Не удалось добавить материал")
    }
  },
)

exports.createExtraLesson = onCall(
  { secrets: [GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, TELEGRAM_BOT_TOKEN, VK_GROUP_TOKEN] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Требуется вход в аккаунт преподавателя")
    }

    const { studentId, date } = request.data ?? {}

    try {
      await assertOwnsStudent(studentId, request.auth.uid)
      const result = await createExtraLesson(studentId, new Date(date))
      return { success: true, ...result }
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error
      }

      logger.error("Failed to create extra lesson", error)
      throw new HttpsError("internal", "Не удалось создать внеплановый урок")
    }
  },
)

// Student-facing (no request.auth, trusts studentId from the request body —
// see CLAUDE.md architecture note) alternative to submitting homework via a
// bot: the client uploads the file to Storage itself, then calls this to
// record it in the same homework.submission.files the bots write to.
exports.submitHomeworkFile = onCall(
  { secrets: [TELEGRAM_BOT_TOKEN, VK_GROUP_TOKEN] },
  async (request) => {
    const { studentId, fileUrl } = request.data ?? {}

    if (!studentId || typeof studentId !== "string") {
      throw new HttpsError("invalid-argument", "Не указан идентификатор ученика")
    }
    if (!fileUrl || typeof fileUrl !== "string") {
      throw new HttpsError("invalid-argument", "Не указан файл")
    }

    try {
      const lessonId = await recordHomeworkSubmission(studentId, fileUrl)
      return { success: true, lessonId }
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error
      }

      logger.error("Failed to record homework submission", error)
      throw new HttpsError("internal", "Не удалось сохранить домашнее задание")
    }
  },
)

// Gamification (sticker cases) — student-facing, no request.auth by design,
// same shape as submitHomeworkFile above (studentId trusted from the
// request body).
exports.openCase = onCall(async (request) => {
  const { studentId, setId } = request.data ?? {}

  try {
    return await openCaseCore(studentId, setId)
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error
    }

    logger.error("Failed to open case", error)
    throw new HttpsError("internal", "Не удалось открыть кейс")
  }
})

exports.saveDecoration = onCall(async (request) => {
  const { studentId, zone, itemId } = request.data ?? {}

  try {
    return await saveDecorationCore(studentId, zone, itemId)
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error
    }

    logger.error("Failed to save decoration", error)
    throw new HttpsError("internal", "Не удалось сохранить украшение")
  }
})

exports.addPayment = onCall(
  { secrets: [TELEGRAM_BOT_TOKEN, VK_GROUP_TOKEN] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Требуется вход в аккаунт преподавателя")
    }

    const { studentId, lessonsCount, note } = request.data ?? {}

    try {
      await assertOwnsStudent(studentId, request.auth.uid)
      const newBalance = await addPayment(studentId, lessonsCount, note)
      return { success: true, newBalance }
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error
      }

      logger.error("Failed to add payment", error)
      throw new HttpsError("internal", "Не удалось добавить оплату")
    }
  },
)

exports.assignCurriculumTemplate = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Требуется вход в аккаунт преподавателя")
  }

  const { studentId, templateId } = request.data ?? {}

  try {
    await assertOwnsStudent(studentId, request.auth.uid)
    await assertOwnsTemplate(templateId, request.auth.uid)
    return await assignCurriculumTemplate(studentId, templateId)
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error
    }

    logger.error("Failed to assign curriculum template", error)
    throw new HttpsError("internal", "Не удалось назначить программу")
  }
})

// Block 4 — replaces one already-assigned program's template-derived
// content in place (see core/curriculum.js's own comment on why this is
// separate from assignCurriculumTemplate, which only ever adds a new one).
exports.reassignProgram = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Требуется вход в аккаунт преподавателя")
  }

  const { studentId, programId, templateId } = request.data ?? {}

  try {
    await assertOwnsStudent(studentId, request.auth.uid)
    await assertOwnsTemplate(templateId, request.auth.uid)
    return await reassignProgram(studentId, programId, templateId)
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error
    }

    logger.error("Failed to reassign program", error)
    throw new HttpsError("internal", "Не удалось заменить программу")
  }
})

exports.deleteProgram = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Требуется вход в аккаунт преподавателя")
  }

  const { studentId, programId } = request.data ?? {}

  try {
    await assertOwnsStudent(studentId, request.auth.uid)
    return await deleteProgram(studentId, programId)
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error
    }

    logger.error("Failed to delete program", error)
    throw new HttpsError("internal", "Не удалось удалить программу")
  }
})

// Student-facing, no request.auth check — same trust model (studentId
// knowledge) as the rest of the Student Dashboard's callables. Block 4:
// programId is now required — a goal belongs to one specific program, not
// to the student as a whole.
exports.setStudentGoal = onCall(async (request) => {
  const { studentId, programId, targetScore, examDate } = request.data ?? {}

  try {
    return await setStudentGoal(studentId, programId, targetScore, examDate)
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error
    }

    logger.error("Failed to set student goal", error)
    throw new HttpsError("internal", "Не удалось сохранить цель")
  }
})

// Student-facing, no request.auth check — same trust model as
// setStudentGoal above (studentId knowledge). Multi-tenancy Phase 4a.
exports.updateStudentSettings = onCall(async (request) => {
  const { studentId, timezone, colorTheme, language } = request.data ?? {}

  try {
    return await updateStudentSettings(studentId, { timezone, colorTheme, language })
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error
    }

    logger.error("Failed to update student settings", error)
    throw new HttpsError("internal", "Не удалось сохранить настройки")
  }
})

// Teacher-only (unlike setStudentGoal above) — editing a student's program
// is a teacher action, not a student one.
exports.addPersonalTopic = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Требуется вход в аккаунт преподавателя")
  }

  const { studentId, programId, title, minScoreRequired, type } = request.data ?? {}

  try {
    await assertOwnsStudent(studentId, request.auth.uid)
    return await addPersonalTopic(studentId, programId, { title, minScoreRequired, type })
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error
    }

    logger.error("Failed to add personal topic", error)
    throw new HttpsError("internal", "Не удалось добавить тему")
  }
})

exports.removePersonalTopic = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Требуется вход в аккаунт преподавателя")
  }

  const { studentId, programId, itemId, type } = request.data ?? {}

  try {
    await assertOwnsStudent(studentId, request.auth.uid)
    return await removePersonalTopic(studentId, programId, { itemId, type })
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error
    }

    logger.error("Failed to remove personal topic", error)
    throw new HttpsError("internal", "Не удалось удалить тему")
  }
})

exports.markTopicsCovered = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Требуется вход в аккаунт преподавателя")
  }

  const { studentId, lessonId, programId, topicIds, prototypeIds, rating } = request.data ?? {}

  try {
    await assertOwnsStudent(studentId, request.auth.uid)
    return await markTopicsCovered(studentId, lessonId, programId, { topicIds, prototypeIds, rating })
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error
    }

    logger.error("Failed to mark topics covered", error)
    throw new HttpsError("internal", "Не удалось отметить пройденный материал")
  }
})

exports.ensureUpcomingLesson = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Требуется вход в аккаунт преподавателя")
  }

  const { studentId } = request.data ?? {}

  if (!studentId || typeof studentId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор ученика")
  }

  try {
    await assertOwnsStudent(studentId, request.auth.uid)
    const lessonId = await ensureUpcomingLesson(studentId)
    return { lessonId }
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error
    }

    logger.error("Failed to ensure upcoming lesson", error)
    throw new HttpsError("internal", "Не удалось подготовить урок")
  }
})

exports.getNearestUpcomingLesson = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Требуется вход в аккаунт преподавателя")
  }

  const { studentId } = request.data ?? {}

  if (!studentId || typeof studentId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор ученика")
  }

  try {
    // Only the id crosses the wire — the client re-subscribes to the full
    // lesson doc via subscribeToLesson, which already knows how to decode
    // Firestore Timestamps; returning the raw lesson object here would mean
    // hand-rolling that decoding a second time for no benefit.
    await assertOwnsStudent(studentId, request.auth.uid)
    const lesson = await getNearestUpcomingLesson(studentId)
    return { lessonId: lesson?.id ?? null }
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error
    }

    logger.error("Failed to get nearest upcoming lesson", error)
    throw new HttpsError("internal", "Не удалось найти ближайший урок")
  }
})

exports.completeLesson = onCall(
  { secrets: [TELEGRAM_BOT_TOKEN, VK_GROUP_TOKEN] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Требуется вход в аккаунт преподавателя")
    }

    const { studentId, lessonId, attendance, homeworkDone, rating } = request.data ?? {}

    try {
      await assertOwnsStudent(studentId, request.auth.uid)
      await completeLesson(studentId, lessonId, { attendance, homeworkDone, rating })
      return { success: true }
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error
      }

      logger.error("Failed to complete lesson", error)
      throw new HttpsError("internal", "Не удалось сохранить итоги урока")
    }
  },
)

// Reachable from both dashboards, same reasoning as confirmCancellation
// below: the teacher proposing from TeacherDashboard (Firebase Auth
// session) and, as of the student-portal reschedule/cancel buttons, the
// student proposing from StudentDashboard (no Firebase Auth session to
// check). initiator defaults to "teacher" so existing teacher-side callers
// that don't pass it keep working unchanged.
exports.proposeReschedule = onCall(
  { secrets: [TELEGRAM_BOT_TOKEN, VK_GROUP_TOKEN] },
  async (request) => {
    const { studentId, lessonId, proposedDate, initiator } = request.data ?? {}
    const role = initiator === "student" ? "student" : "teacher"

    if (role === "teacher" && !request.auth) {
      throw new HttpsError("unauthenticated", "Требуется вход в аккаунт преподавателя")
    }

    try {
      if (role === "teacher") {
        await assertOwnsStudent(studentId, request.auth.uid)
      }
      const date = new Date(proposedDate)
      const rescheduleStatus = await proposeReschedule(studentId, lessonId, date, role)
      return { rescheduleStatus }
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error
      }

      logger.error("Failed to propose reschedule", error)
      throw new HttpsError("internal", "Не удалось предложить перенос урока")
    }
  },
)

// confirmedBy defaults to "teacher" for the same backward-compatibility
// reason as proposeReschedule's initiator default.
exports.confirmReschedule = onCall(
  { secrets: [TELEGRAM_BOT_TOKEN, VK_GROUP_TOKEN, GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET] },
  async (request) => {
    const { studentId, lessonId, confirmedBy } = request.data ?? {}
    const role = confirmedBy === "student" ? "student" : "teacher"

    if (role === "teacher" && !request.auth) {
      throw new HttpsError("unauthenticated", "Требуется вход в аккаунт преподавателя")
    }

    try {
      if (role === "teacher") {
        await assertOwnsStudent(studentId, request.auth.uid)
      }
      await confirmReschedule(studentId, lessonId, role)
      return { success: true }
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error
      }

      logger.error("Failed to confirm reschedule", error)
      throw new HttpsError("internal", "Не удалось подтвердить перенос урока")
    }
  },
)

// No role param (mirrors rejectCancellation) — rejecting/cancelling a
// reschedule proposal isn't gated by request.auth at all, since either side
// (teacher web or student web) may decline the other's proposal.
exports.cancelReschedule = onCall(
  { secrets: [TELEGRAM_BOT_TOKEN, VK_GROUP_TOKEN] },
  async (request) => {
    const { studentId, lessonId } = request.data ?? {}

    try {
      await cancelReschedule(studentId, lessonId)
      return { success: true }
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error
      }

      logger.error("Failed to cancel reschedule", error)
      throw new HttpsError("internal", "Не удалось отменить перенос урока")
    }
  },
)

// Same both-dashboards reasoning as proposeReschedule.
exports.proposeCancellation = onCall(
  { secrets: [TELEGRAM_BOT_TOKEN, VK_GROUP_TOKEN] },
  async (request) => {
    const { studentId, lessonId, initiator } = request.data ?? {}
    const role = initiator === "student" ? "student" : "teacher"

    if (role === "teacher" && !request.auth) {
      throw new HttpsError("unauthenticated", "Требуется вход в аккаунт преподавателя")
    }

    try {
      if (role === "teacher") {
        await assertOwnsStudent(studentId, request.auth.uid)
      }
      const cancellationStatus = await proposeCancellation(studentId, lessonId, role)
      return { cancellationStatus }
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error
      }

      logger.error("Failed to propose cancellation", error)
      throw new HttpsError("internal", "Не удалось предложить отмену урока")
    }
  },
)

// Unlike confirmReschedule/cancelReschedule (teacher-web-only, always gated
// by request.auth), this is reachable from both dashboards: the teacher
// confirming a student-initiated cancellation (cancellationStatus ===
// "pending_teacher") and the student confirming a teacher-initiated one
// (cancellationStatus === "pending_student") from the student portal, which
// has no Firebase Auth session to check. Only the teacher path is gated.
exports.confirmCancellation = onCall(
  { secrets: [TELEGRAM_BOT_TOKEN, VK_GROUP_TOKEN, GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET] },
  async (request) => {
    const { studentId, lessonId, confirmedBy } = request.data ?? {}

    if (confirmedBy === "teacher" && !request.auth) {
      throw new HttpsError("unauthenticated", "Требуется вход в аккаунт преподавателя")
    }

    try {
      if (confirmedBy === "teacher") {
        await assertOwnsStudent(studentId, request.auth.uid)
      }
      await confirmCancellation(studentId, lessonId, confirmedBy)
      return { success: true }
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error
      }

      logger.error("Failed to confirm cancellation", error)
      throw new HttpsError("internal", "Не удалось подтвердить отмену урока")
    }
  },
)

// Teacher-web-only (always request.auth-gated, no dual-actor role param —
// there's no "student initiates a direct cancellation" concept, this is a
// one-way teacher action by design).
exports.cancelLessonDirectly = onCall(
  { secrets: [TELEGRAM_BOT_TOKEN, VK_GROUP_TOKEN, GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Требуется вход в аккаунт преподавателя")
    }

    const { studentId, lessonId } = request.data ?? {}

    try {
      await assertOwnsStudent(studentId, request.auth.uid)
      await cancelLessonDirectly(studentId, lessonId)
      return { success: true }
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error
      }

      logger.error("Failed to cancel lesson directly", error)
      throw new HttpsError("internal", "Не удалось отменить урок")
    }
  },
)

// Same both-dashboards reasoning as confirmCancellation — reject carries no
// role param (mirrors cancelReschedule), so it isn't gated by request.auth
// at all; either side may decline a cancellation proposal.
exports.rejectCancellation = onCall(
  { secrets: [TELEGRAM_BOT_TOKEN, VK_GROUP_TOKEN] },
  async (request) => {
    const { studentId, lessonId } = request.data ?? {}

    try {
      await rejectCancellation(studentId, lessonId)
      return { success: true }
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error
      }

      logger.error("Failed to reject cancellation", error)
      throw new HttpsError("internal", "Не удалось отклонить отмену урока")
    }
  },
)

// Teacher-only (request.auth-gated) — mints a short-lived token the teacher
// redeems from inside Telegram/VK to link that chat for notifications (see
// core/teacherConnect.js). No secrets needed: this never sends a bot
// message itself, it just writes a token doc and returns a link/code.
exports.generateTeacherConnectToken = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Требуется вход в аккаунт преподавателя")
  }

  const { platform } = request.data ?? {}

  try {
    return await createTeacherConnectToken(request.auth.uid, platform)
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error
    }

    logger.error("Failed to generate teacher connect token", error)
    throw new HttpsError("internal", "Не удалось создать ссылку подключения")
  }
})

// Multi-tenancy Phase 3: called once from App.jsx's TeacherRoute bootstrap,
// only when teachers/{uid} doesn't exist yet — needs admin-SDK read access
// across every teacher's doc to check slug uniqueness, which the per-teacher
// Firestore Rules (Phase 2) deliberately don't grant a single signed-in
// teacher via a direct client query.
exports.generateTeacherSlug = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Требуется вход в аккаунт преподавателя")
  }

  const { name } = request.data ?? {}

  try {
    const slug = await generateTeacherSlug(name || request.auth.uid)
    return { slug }
  } catch (error) {
    logger.error("Failed to generate teacher slug", error)
    throw new HttpsError("internal", "Не удалось сгенерировать адрес страницы")
  }
})

// Public — no request.auth. Backs the /app/:slug landing page: a
// prospective student has no Firebase Auth session at all. Only the
// minimal public fields cross the wire (see core/teachers.js's
// findTeacherBySlug), never the full teachers/{uid} profile.
exports.getTeacherBySlug = onCall(async (request) => {
  const { slug } = request.data ?? {}

  try {
    const teacher = await findTeacherBySlug(slug)
    return { teacher }
  } catch (error) {
    logger.error("Failed to look up teacher by slug", error)
    throw new HttpsError("internal", "Не удалось найти страницу")
  }
})

// 9:00 Moscow time — reminds students about every upcoming lesson between
// now and the end of tomorrow (Moscow calendar day), one combined message
// per student. timeZone is set explicitly rather than hand-converting to a
// UTC cron expression, so the fire time stays correct even if Moscow's
// offset rules ever change.
exports.dailyReminderMidday = onSchedule(
  { schedule: "0 9 * * *", timeZone: "Europe/Moscow", secrets: [TELEGRAM_BOT_TOKEN, VK_GROUP_TOKEN] },
  async () => {
    await dailyReminderMidday()
  },
)

// Every hour on the hour — reminds students whose lesson starts within the
// next 2 hours. Hourly cadence needs no explicit timeZone: the top of every
// hour is the same instant regardless of which zone the cron string is read
// in.
exports.dailyReminderPreLesson = onSchedule(
  { schedule: "0 * * * *", secrets: [TELEGRAM_BOT_TOKEN, VK_GROUP_TOKEN] },
  async () => {
    await dailyReminderPreLesson()
  },
)

// Every 5 minutes — reminds students whose lesson starts within the next 15
// minutes (see dailyReminderTenMin's own comment for why 15, not 10). A
// third, independent reminder tier alongside the two above.
exports.dailyReminderTenMin = onSchedule(
  { schedule: "*/5 * * * *", secrets: [TELEGRAM_BOT_TOKEN, VK_GROUP_TOKEN] },
  async () => {
    await dailyReminderTenMin()
  },
)

// Both secrets are needed even though this is the Telegram webhook: a
// homework submission here can trigger a teacher notification, and the
// teacher's contact platform (integrations/teacherContact) may be VK.
exports.telegramWebhook = onRequest({ secrets: [TELEGRAM_BOT_TOKEN, VK_GROUP_TOKEN] }, async (req, res) => {
  // Wait for the update to finish processing before acknowledging, so a
  // Cloud Functions instance freeze right after the response can't drop
  // an in-flight Firestore write or Telegram reply. Telegram tolerates a
  // webhook response taking a few seconds.
  try {
    await handleUpdate(req.body)
  } catch (error) {
    logger.error("Unhandled error while processing Telegram update", error)
  }

  res.status(200).send("OK")
})

// Same reasoning as telegramWebhook above: a homework submission received
// here may need to notify the teacher on Telegram.
exports.vkWebhook = onRequest(
  { secrets: [VK_GROUP_TOKEN, VK_CONFIRMATION_CODE, TELEGRAM_BOT_TOKEN] },
  async (req, res) => {
    // Same fix as telegramWebhook: process the event fully, then respond,
    // so an instance freeze right after the response can't drop an
    // in-flight Firestore write or VK reply.
    let responseBody = "ok"

    try {
      responseBody = await handleEvent(req.body)
    } catch (error) {
      logger.error("Unhandled error while processing VK event", error)
    }

    res.status(200).send(responseBody)
  },
)

exports.startGoogleOAuth = onCall(
  { secrets: [GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Требуется вход в аккаунт преподавателя")
    }

    logger.info("Google Calendar authUrl requested", { uid: request.auth.uid })

    const state = crypto.randomBytes(24).toString("base64url")

    await db
      .collection(OAUTH_STATES_COLLECTION)
      .doc(state)
      .set({ teacherId: request.auth.uid, createdAt: FieldValue.serverTimestamp() })

    const authUrl = getAuthUrl(getGoogleOAuthRedirectUri(), state)

    return { authUrl }
  },
)

exports.googleOAuthCallback = onRequest(
  { secrets: [GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET] },
  async (req, res) => {
    const { code, state } = req.query

    logger.info("Google OAuth callback received", { hasCode: Boolean(code), hasState: Boolean(state) })

    if (!code || !state || typeof state !== "string") {
      logger.warn("Google OAuth callback missing code or state")
      res.status(400).send("Отсутствует code или state")
      return
    }

    const stateRef = db.collection(OAUTH_STATES_COLLECTION).doc(state)
    const stateSnapshot = await stateRef.get()

    if (!stateSnapshot.exists) {
      logger.warn("Google OAuth callback with unknown state")
      res.status(400).send("Недействительный state")
      return
    }

    const { createdAt, teacherId } = stateSnapshot.data()
    await stateRef.delete()

    const ageMs = Date.now() - (createdAt?.toMillis() ?? 0)
    if (!createdAt || ageMs > OAUTH_STATE_TTL_MS) {
      logger.warn("Google OAuth callback with expired state", { ageMs })
      res.status(400).send("Срок действия state истёк, начните подключение заново")
      return
    }

    if (!teacherId) {
      logger.error("Google OAuth callback: oauthStates doc has no teacherId (pre-multi-tenancy state?)")
      res.status(400).send("Не удалось определить преподавателя для подключения")
      return
    }

    try {
      const client = buildOAuthClient(getGoogleOAuthRedirectUri())
      const { tokens } = await client.getToken(String(code))

      await saveTokens(teacherId, tokens)

      logger.info("Google Calendar connected successfully", { teacherId })
    } catch (error) {
      logger.error("Failed to exchange Google OAuth code for tokens", error)
      res.status(500).send("Не удалось подключить Google Calendar")
      return
    }

    res.redirect(302, APP_URL)
  },
)

exports.getGoogleCalendarStatus = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Требуется вход в аккаунт преподавателя")
  }

  const connected = await isConnected(request.auth.uid)

  return { connected }
})

exports.disconnectGoogleCalendar = onCall(
  { secrets: [GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Требуется вход в аккаунт преподавателя")
    }

    try {
      await disconnectGoogleCalendar(request.auth.uid)
      return { success: true }
    } catch (error) {
      logger.error("Failed to disconnect Google Calendar", error)
      throw new HttpsError("internal", "Не удалось отключить Google Calendar")
    }
  },
)

// The `calendar/embed` widget only supports one flat color for the whole
// calendar (via &color=, not per-event) — it does accept an arbitrary hex
// (confirmed: the first pick here, "#f691b2", did render, just too dark/
// saturated per feedback). These two are soft, light pastels matching the
// app's own pink/amber teacher themes, so the widget at least isn't a jarring
// bright block — it still can't reflect per-event subject colors (see
// systemPatterns.md — that would need a custom-built calendar view, not
// this widget).
const CALENDAR_EMBED_COLORS = {
  pink: "#fce7f3", // light pastel pink
  amber: "#fef3c7", // light pastel amber
}

exports.getCalendarEmbedInfo = onCall(
  { secrets: [GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Требуется вход в аккаунт преподавателя")
    }

    logger.info("getCalendarEmbedInfo called", { uid: request.auth?.uid })

    try {
      const client = await getAuthorizedClient(request.auth.uid)
      const oauth2 = google.oauth2({ version: "v2", auth: client })
      const { data } = await oauth2.userinfo.get()

      if (!data.email) {
        throw new Error("Google userinfo did not return an email")
      }

      const teacherSnapshot = await db.collection("teachers").doc(request.auth.uid).get()
      const colorTheme = teacherSnapshot.exists ? teacherSnapshot.data().colorTheme : null
      const embedColor = CALENDAR_EMBED_COLORS[colorTheme] ?? CALENDAR_EMBED_COLORS.pink

      const embedUrl = `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(data.email)}&ctz=${encodeURIComponent("Europe/Moscow")}&color=${encodeURIComponent(embedColor)}`

      logger.info("Google Calendar embed URL built", { uid: request.auth.uid })

      return { embedUrl }
    } catch (error) {
      logger.error("Failed to build Google Calendar embed URL", error)
      throw new HttpsError("failed-precondition", "Не удалось получить Google Calendar")
    }
  },
)

function isSlotEqual(a, b) {
  return (
    a.dayOfWeek === b.dayOfWeek &&
    a.time === b.time &&
    (a.durationMinutes ?? 60) === (b.durationMinutes ?? 60) &&
    // A timeZone-only change (e.g. re-saving a legacy slot after the
    // teacher's own timezone preference changed, or after the per-slot
    // anchor feature was added) must NOT be treated as "no change" — same
    // dayOfWeek/time/duration but a different anchor means a genuinely
    // different real-world instant, and syncUpcomingLessonToSchedule needs
    // to actually run to recompute the already-created upcoming lesson's
    // `date`. Found via a real timezone bug report: a student's slots had
    // no timeZone stamp at all (fell back to getNextLessonDateForSlot's
    // Europe/Moscow default), and even after intending to fix it, this
    // comparison silently skipped the recompute since day/time/duration
    // alone hadn't changed.
    (a.timeZone ?? null) === (b.timeZone ?? null)
  )
}

function isScheduleSlotsEqual(slotsA, slotsB) {
  if (slotsA.length !== slotsB.length) return false
  return slotsA.every((slot, index) => isSlotEqual(slot, slotsB[index]))
}

// Reacts to every students/{studentId} write (creation via registration,
// or a schedule edit from the dashboard) rather than requiring each call
// site that writes scheduleSlots to remember to also call
// ensureUpcomingLesson itself — updateStudentSchedule is a plain
// client-side updateDoc today, not a callable, so a Firestore trigger is
// the only place guaranteed to see every schedule write regardless of
// where it came from.
exports.syncUpcomingLessonOnScheduleChange = onDocumentWritten(
  { document: "students/{studentId}" },
  async (event) => {
    const { studentId } = event.params
    const beforeSnapshot = event.data.before
    const afterSnapshot = event.data.after
    const before = beforeSnapshot.exists ? beforeSnapshot.data() : null
    const after = afterSnapshot.exists ? afterSnapshot.data() : null

    if (!after) {
      return
    }

    const beforeSlots = normalizeScheduleSlots(before)
    const afterSlots = normalizeScheduleSlots(after)

    if (isScheduleSlotsEqual(beforeSlots, afterSlots)) {
      return
    }

    try {
      await syncUpcomingLessonToSchedule(studentId)
    } catch (error) {
      logger.error("syncUpcomingLessonOnScheduleChange: failed", { studentId, error })
    }
  },
)

exports.syncStudentScheduleToGoogleCalendar = onDocumentWritten(
  { document: "students/{studentId}", secrets: [GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET] },
  async (event) => {
    const { studentId } = event.params
    const beforeSnapshot = event.data.before
    const afterSnapshot = event.data.after
    const before = beforeSnapshot.exists ? beforeSnapshot.data() : null
    const after = afterSnapshot.exists ? afterSnapshot.data() : null

    if (!after) {
      // Student doc deleted — deleteStudent already cleans up calendar
      // events directly, nothing to do here.
      return
    }

    const beforeSlots = normalizeScheduleSlots(before)
    const afterSlots = normalizeScheduleSlots(after)

    // This trigger writes googleEventIds back onto the same document, which
    // fires it again. Without this guard that self-write would recurse
    // forever (schedule stays the same each time, only googleEventIds
    // changes) — bail out immediately whenever the slots didn't change,
    // regardless of what else changed in the document.
    if (isScheduleSlotsEqual(beforeSlots, afterSlots)) {
      logger.info("Google Calendar sync: skip, schedule unchanged", { studentId, action: "skip" })
      return
    }

    if (!after.teacherId) {
      // Multi-tenancy Phase 1: legacy student doc predating the teacherId
      // backfill (Phase 5) — skip rather than sync against no known
      // teacher's calendar. Loud on purpose: this should only ever fire for
      // pre-Phase-5 data, never for a newly created student.
      logger.warn("Google Calendar sync: skip, student has no teacherId (pre-Phase-5 legacy doc)", { studentId })
      return
    }

    if (afterSlots.length === 0) {
      const existingEventIds = before?.googleEventIds ?? {}
      const legacyEventId = before?.googleEventId ?? null
      const eventIdsToDelete = [...Object.values(existingEventIds), ...(legacyEventId ? [legacyEventId] : [])]

      if (eventIdsToDelete.length === 0) {
        logger.info("Google Calendar sync: skip, no schedule and no events", { studentId, action: "skip" })
        return
      }

      logger.info("Google Calendar sync: deleting events", { studentId, action: "delete", count: eventIdsToDelete.length })

      for (const eventId of eventIdsToDelete) {
        try {
          await deleteLessonEvent(after.teacherId, eventId)
        } catch (error) {
          logger.error("Google Calendar sync: delete failed", { studentId, action: "delete", eventId, error })
        }
      }

      await afterSnapshot.ref.update({ googleEventIds: FieldValue.delete(), googleEventId: FieldValue.delete() })
      return
    }

    try {
      await syncScheduleSlots(after.teacherId, studentId, after, afterSnapshot.ref)
      logger.info("Google Calendar sync: slots synced", { studentId, slotCount: afterSlots.length })
    } catch (error) {
      logger.error("Google Calendar sync: failed", { studentId, error })
    }
  },
)
