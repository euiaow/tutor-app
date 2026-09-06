const { FieldValue } = require("firebase-admin/firestore")
const { HttpsError } = require("firebase-functions/v2/https")
const logger = require("firebase-functions/logger")
const { db } = require("./firestore")
const { createNotification } = require("./notifier")

const STUDENTS_COLLECTION = "students"
const PROGRAMS_SUBCOLLECTION = "programs"
const BALANCE_LEDGER_SUBCOLLECTION = "balanceLedger"

function ledgerRef(studentId) {
  return db.collection(STUDENTS_COLLECTION).doc(studentId).collection(BALANCE_LEDGER_SUBCOLLECTION)
}

function programsRef(studentId) {
  return db.collection(STUDENTS_COLLECTION).doc(studentId).collection(PROGRAMS_SUBCOLLECTION)
}

// A student with 0-1 programs still has one real balance — their own
// paidLessonsBalance, exactly as before per-program balances existed. Once
// there are 2+, that single field stops being the source of truth (see
// assignCurriculumTemplate's 1-to-2 transfer, core/curriculum.js) and every
// payment/deduction must target a specific program's own balance instead —
// this is the one place both addPayment and deductLessonFromBalance resolve
// which of the two applies, so the rule lives in exactly one spot.
async function resolveBalanceTarget(transaction, studentId, programId) {
  const programsSnapshot = await transaction.get(programsRef(studentId))
  const hasMultiplePrograms = programsSnapshot.size >= 2

  if (!hasMultiplePrograms) {
    return { programRef: null, programName: null }
  }

  if (!programId) {
    // Multi-program student but no program specified — genuinely ambiguous,
    // not an error (a legacy/ambiguous lesson has no programId at all, see
    // resolveProgramIdForSlot, core/curriculum.js). Falls back to the
    // student's own balance rather than guessing which program to touch.
    return { programRef: null, programName: null }
  }

  const programDoc = programsSnapshot.docs.find((doc) => doc.id === programId)
  if (!programDoc) {
    return { programRef: null, programName: null }
  }

  return { programRef: programDoc.ref, programName: programDoc.data().name ?? null, programSnapshot: programDoc }
}

async function addPayment(studentId, lessonsCount, note = null, programId = null) {
  if (!studentId || typeof studentId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор ученика")
  }
  const count = Number(lessonsCount)
  if (!Number.isFinite(count) || count <= 0) {
    throw new HttpsError("invalid-argument", "Некорректное количество занятий")
  }

  const studentRef = db.collection(STUDENTS_COLLECTION).doc(studentId)

  const newBalance = await db.runTransaction(async (transaction) => {
    const studentSnapshot = await transaction.get(studentRef)
    if (!studentSnapshot.exists) {
      throw new HttpsError("not-found", "Ученик не найден")
    }
    const student = studentSnapshot.data()

    const { programRef, programName, programSnapshot } = await resolveBalanceTarget(transaction, studentId, programId)

    const ledgerEntry = {
      type: "payment",
      amount: count,
      note: note || null,
      lessonId: null,
      teacherId: student.teacherId ?? null,
      createdAt: FieldValue.serverTimestamp(),
    }

    let nextBalance
    if (programRef) {
      const currentBalance = programSnapshot.data().paidLessonsBalance ?? 0
      nextBalance = currentBalance + count
      ledgerEntry.programId = programId
      ledgerEntry.programName = programName
      transaction.update(programRef, { paidLessonsBalance: nextBalance })
    } else {
      const currentBalance = student.paidLessonsBalance ?? 0
      nextBalance = currentBalance + count
      transaction.update(studentRef, { paidLessonsBalance: nextBalance })
    }

    transaction.set(ledgerRef(studentId).doc(), ledgerEntry)

    return nextBalance
  })

  logger.info("addPayment: payment recorded", { studentId, lessonsCount: count, programId, newBalance })

  return newBalance
}

// Called from completeLesson (core/lessons.js), not exposed as a callable —
// deducting a balance is a side effect of completing a lesson, never a
// direct user action. programId (the lesson's own, resolved at creation
// time — see core/lessons.js's createUpcomingDraft) only actually changes
// anything once the student has 2+ programs; see resolveBalanceTarget above.
async function deductLessonFromBalance(studentId, lessonId, programId = null) {
  const studentRef = db.collection(STUDENTS_COLLECTION).doc(studentId)

  const { newBalance, student, programName } = await db.runTransaction(async (transaction) => {
    const studentSnapshot = await transaction.get(studentRef)
    if (!studentSnapshot.exists) {
      return { newBalance: null, student: null, programName: null }
    }
    const studentData = studentSnapshot.data()

    const { programRef, programName: resolvedProgramName, programSnapshot } = await resolveBalanceTarget(
      transaction,
      studentId,
      programId,
    )

    const ledgerEntry = {
      type: "lesson_deduction",
      amount: -1,
      note: null,
      lessonId,
      teacherId: studentData.teacherId ?? null,
      createdAt: FieldValue.serverTimestamp(),
    }

    let nextBalance
    if (programRef) {
      const currentBalance = programSnapshot.data().paidLessonsBalance ?? 0
      nextBalance = currentBalance - 1
      ledgerEntry.programId = programId
      ledgerEntry.programName = resolvedProgramName
      transaction.update(programRef, { paidLessonsBalance: nextBalance })
    } else {
      const currentBalance = studentData.paidLessonsBalance ?? 0
      nextBalance = currentBalance - 1
      transaction.update(studentRef, { paidLessonsBalance: nextBalance })
    }

    transaction.set(ledgerRef(studentId).doc(), ledgerEntry)

    return { newBalance: nextBalance, student: studentData, programName: programRef ? resolvedProgramName : null }
  })

  if (newBalance === null) {
    logger.warn("deductLessonFromBalance: student not found", { studentId, lessonId })
    return null
  }

  logger.info("deductLessonFromBalance: balance deducted", { studentId, lessonId, programId, newBalance })

  const lowBalanceThreshold = student.lowBalanceThreshold ?? 1
  if (newBalance <= lowBalanceThreshold) {
    const studentName = student.name ?? "Ученик"
    const teacherId = student.teacherId ?? null
    const balanceLabel = programName ? `${studentName} (${programName})` : studentName

    // Teacher and (optional) student low-balance notifications are
    // independent of each other — run together instead of one after the
    // other, same reasoning as core/lessons.js's paired notification sites.
    const notifications = [
      createNotification({
        target: "teacher",
        studentId,
        type: "low_balance",
        text: `💰 Баланс ${balanceLabel} на исходе — осталось ${newBalance} занятий`,
        lessonId,
        teacherId,
      }),
    ]

    if (student.autoRemindLowBalance === true) {
      notifications.push(
        createNotification({
          target: "student",
          studentId,
          type: "low_balance",
          params: { newBalance, programName },
          lessonId,
          teacherId,
        }),
      )
    }

    const results = await Promise.allSettled(notifications)
    for (const result of results) {
      if (result.status === "rejected") {
        logger.error("deductLessonFromBalance: notification failed", { studentId, lessonId, error: result.reason })
      }
    }
  }

  return newBalance
}

module.exports = { addPayment, deductLessonFromBalance }
