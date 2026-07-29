import { collection, onSnapshot, orderBy, query } from "firebase/firestore"
import { httpsCallable } from "firebase/functions"
import { db, functions } from "./firebase"

const addPaymentCallable = httpsCallable(functions, "addPayment")

export async function addPayment(studentId, lessonsCount, note) {
  const result = await addPaymentCallable({ studentId, lessonsCount, note: note || null })
  return result.data.newBalance
}

export function subscribeToBalanceLedger(studentId, onData, onError) {
  const ref = collection(db, "students", studentId, "balanceLedger")
  const ledgerQuery = query(ref, orderBy("createdAt", "desc"))

  return onSnapshot(
    ledgerQuery,
    (snapshot) => {
      const entries = snapshot.docs.map((document) => {
        const data = document.data()
        return {
          id: document.id,
          type: data.type ?? null,
          amount: data.amount ?? 0,
          note: data.note ?? null,
          lessonId: data.lessonId ?? null,
          createdAt: data.createdAt?.toDate?.() ?? null,
        }
      })
      onData(entries)
    },
    onError,
  )
}
