const { FieldValue } = require("firebase-admin/firestore")
const { HttpsError } = require("firebase-functions/v2/https")
const logger = require("firebase-functions/logger")
const { db } = require("./firestore")
const { createNotification } = require("./notifier")

const STUDENTS_COLLECTION = "students"
const BALANCE_LEDGER_SUBCOLLECTION = "balanceLedger"

function ledgerRef(studentId) {
  return db.collection(STUDENTS_COLLECTION).doc(studentId).collection(BALANCE_LEDGER_SUBCOLLECTION)
}

async function addPayment(studentId, lessonsCount, note = null) {
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

    const currentBalance = studentSnapshot.data().paidLessonsBalance ?? 0
    const nextBalance = currentBalance + count

    transaction.set(ledgerRef(studentId).doc(), {
      type: "payment",
      amount: count,
      note: note || null,
      lessonId: null,
      createdAt: FieldValue.serverTimestamp(),
    })
    transaction.update(studentRef, { paidLessonsBalance: nextBalance })

    return nextBalance
  })

  logger.info("addPayment: payment recorded", { studentId, lessonsCount: count, newBalance })

  return newBalance
}

// Called from completeLesson (core/lessons.js), not exposed as a callable —
// deducting a balance is a side effect of completing a lesson, never a
// direct user action.
async function deductLessonFromBalance(studentId, lessonId) {
  const studentRef = db.collection(STUDENTS_COLLECTION).doc(studentId)

  const { newBalance, student } = await db.runTransaction(async (transaction) => {
    const studentSnapshot = await transaction.get(studentRef)
    if (!studentSnapshot.exists) {
      return { newBalance: null, student: null }
    }

    const studentData = studentSnapshot.data()
    const currentBalance = studentData.paidLessonsBalance ?? 0
    const nextBalance = currentBalance - 1

    transaction.set(ledgerRef(studentId).doc(), {
      type: "lesson_deduction",
      amount: -1,
      note: null,
      lessonId,
      createdAt: FieldValue.serverTimestamp(),
    })
    transaction.update(studentRef, { paidLessonsBalance: nextBalance })

    return { newBalance: nextBalance, student: studentData }
  })

  if (newBalance === null) {
    logger.warn("deductLessonFromBalance: student not found", { studentId, lessonId })
    return null
  }

  logger.info("deductLessonFromBalance: balance deducted", { studentId, lessonId, newBalance })

  const lowBalanceThreshold = student.lowBalanceThreshold ?? 1
  if (newBalance <= lowBalanceThreshold) {
    const studentName = student.name ?? "Ученик"

    await createNotification({
      target: "teacher",
      studentId,
      type: "low_balance",
      text: `💰 Баланс ${studentName} на исходе — осталось ${newBalance} занятий`,
      lessonId,
    })

    if (student.autoRemindLowBalance === true) {
      const studentText =
        newBalance <= 0
          ? "Пакет занятий закончился. Свяжись, чтобы продлить, когда будет удобно."
          : `Осталось ${newBalance} занятие(-ий) в оплаченном пакете. Дай знать, если нужно продлить — буду рада продолжать с тобой заниматься! 🙂`

      await createNotification({
        target: "student",
        studentId,
        type: "low_balance",
        text: studentText,
        lessonId,
      })
    }
  }

  return newBalance
}

module.exports = { addPayment, deductLessonFromBalance }
