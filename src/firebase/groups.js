import {
  arrayRemove,
  arrayUnion,
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore"
import { httpsCallable } from "firebase/functions"
import { db, functions } from "./firebase"
import { normalizeScheduleSlots } from "@/lib/schedule"

// Group lessons Phase 1 — groups live at teachers/{teacherId}/groups/
// {groupId}, a subcollection of the teacher's own doc (not a top-level
// collection like students/curriculumTemplates) — see
// functions/core/tenancy.js's assertOwnsGroup comment for why that means
// no separate teacherId-filtered query is needed the way
// subscribeToStudents needs one.

const createGroupCallable = httpsCallable(functions, "createGroup")
const updateGroupCallable = httpsCallable(functions, "updateGroup")
const deleteGroupCallable = httpsCallable(functions, "deleteGroup")
const proposeGroupRescheduleCallable = httpsCallable(functions, "proposeGroupReschedule")
const cancelGroupLessonCallable = httpsCallable(functions, "cancelGroupLesson")
const completeGroupLessonCallable = httpsCallable(functions, "completeGroupLesson")

function mapGroupDoc(id, data) {
  return {
    id,
    name: data.name ?? "",
    subject: data.subject ?? "",
    memberStudentIds: Array.isArray(data.memberStudentIds) ? data.memberStudentIds : [],
    scheduleSlots: normalizeScheduleSlots(data),
    teacherId: data.teacherId ?? null,
  }
}

export function subscribeToGroups(teacherId, onData, onError) {
  const ref = collection(db, "teachers", teacherId, "groups")
  const groupsQuery = query(ref, orderBy("createdAt", "desc"))

  return onSnapshot(
    groupsQuery,
    (snapshot) => onData(snapshot.docs.map((document) => mapGroupDoc(document.id, document.data()))),
    onError,
  )
}

export async function createGroup(name, subject, memberStudentIds, scheduleSlots) {
  const result = await createGroupCallable({ name, subject, memberStudentIds, scheduleSlots })
  return result.data
}

export async function updateGroup(groupId, { name, subject, memberStudentIds, scheduleSlots }) {
  const result = await updateGroupCallable({ groupId, name, subject, memberStudentIds, scheduleSlots })
  return result.data
}

export async function deleteGroup(groupId) {
  await deleteGroupCallable({ groupId })
}

// Group lessons Phase 2/3 — teachers/{uid}/groups/{groupId}/lessons/
// {lessonId}. Reschedule/cancel/complete all go through callables (they
// each transitively notify every member) the same way individual lessons'
// teacher-only actions do; topic/homework/materials edits are plain client
// writes instead, same "admin content the teacher alone edits" pattern
// students/{id}/lessons already uses (see updateLessonTopic/
// addLessonMaterial in firebase/lessons.js — the difference there is
// addLessonMaterial needs a server-side notification and this doesn't).

function groupLessonDocRef(teacherId, groupId, lessonId) {
  return doc(db, "teachers", teacherId, "groups", groupId, "lessons", lessonId)
}

function mapGroupLessonDoc(id, data) {
  return {
    id,
    status: data.status ?? "upcoming",
    date: data.date?.toDate?.() ?? null,
    rescheduledDate: data.rescheduledDate?.toDate?.() ?? null,
    slotIndex: typeof data.slotIndex === "number" ? data.slotIndex : null,
    subject: data.subject ?? "",
    topic: data.topic ?? "",
    homework: {
      assignment: {
        text: data.homework?.assignment?.text ?? "",
        files: Array.isArray(data.homework?.assignment?.files) ? data.homework.assignment.files : [],
      },
    },
    materials: Array.isArray(data.materials) ? data.materials : [],
    attendees: data.attendees && typeof data.attendees === "object" ? data.attendees : {},
    memberIds: Array.isArray(data.memberIds) ? data.memberIds : [],
    durationMinutes: data.durationMinutes ?? 60,
    teacherId: data.teacherId ?? null,
  }
}

export function subscribeToGroupLessons(teacherId, groupId, onData, onError) {
  const ref = collection(db, "teachers", teacherId, "groups", groupId, "lessons")
  const lessonsQuery = query(ref, where("status", "==", "upcoming"), orderBy("date", "asc"))

  return onSnapshot(
    lessonsQuery,
    (snapshot) => onData(snapshot.docs.map((document) => mapGroupLessonDoc(document.id, document.data()))),
    onError,
  )
}

// Powers the teacher dashboard's "Доход за неделю" second source (Phase 5,
// point 1) — mirrors subscribeToIncomeLessons's own shape (firebase/
// lessons.js): spans "upcoming" and "completed" (a group lesson shouldn't
// drop out of this week's income the moment it's marked done), excludes
// "cancelled", filtered client-side to the current week by finance-
// section.jsx the same way the individual-lesson feed already is. Unlike
// that query, this can't rely on `memberIds array-contains studentId` to
// exclude individual lesson docs (there's no single studentId here) — an
// individual students/{id}/lessons doc also carries `teacherId`, so a plain
// `where("teacherId","==",...)` on this collectionGroup would return a mix
// of both shapes. Filtered client-side instead (`Array.isArray(memberIds)`)
// rather than adding a second Firestore-level filter, which would need a
// new composite index just to tell the two doc shapes apart.
export function subscribeToIncomeGroupLessons(teacherId, onData, onError) {
  const ref = collectionGroup(db, "lessons")
  const incomeQuery = query(ref, where("teacherId", "==", teacherId), where("status", "in", ["upcoming", "completed"]))

  return onSnapshot(
    incomeQuery,
    (snapshot) =>
      onData(
        snapshot.docs
          .filter((document) => Array.isArray(document.data().memberIds))
          .map((document) => mapGroupLessonWithGroupId(document)),
      ),
    onError,
  )
}

export function subscribeToGroupLesson(teacherId, groupId, lessonId, onData, onError) {
  const ref = groupLessonDocRef(teacherId, groupId, lessonId)

  return onSnapshot(
    ref,
    (snapshot) => {
      if (!snapshot.exists()) {
        onData(null)
        return
      }
      onData(mapGroupLessonDoc(snapshot.id, snapshot.data()))
    },
    onError,
  )
}

export async function updateGroupLessonTopic(teacherId, groupId, lessonId, topic) {
  await updateDoc(groupLessonDocRef(teacherId, groupId, lessonId), { topic })
}

export async function updateGroupLessonAssignment(teacherId, groupId, lessonId, { text, files }) {
  await updateDoc(groupLessonDocRef(teacherId, groupId, lessonId), {
    "homework.assignment.text": text,
    "homework.assignment.files": files,
  })
}

export async function addGroupLessonMaterial(teacherId, groupId, lessonId, material) {
  await updateDoc(groupLessonDocRef(teacherId, groupId, lessonId), { materials: arrayUnion(material) })
}

export async function removeGroupLessonMaterial(teacherId, groupId, lessonId, material) {
  await updateDoc(groupLessonDocRef(teacherId, groupId, lessonId), { materials: arrayRemove(material) })
}

export async function proposeGroupReschedule(groupId, lessonId, newDate) {
  const result = await proposeGroupRescheduleCallable({ groupId, lessonId, newDate: newDate.toISOString() })
  return result.data
}

export async function cancelGroupLesson(groupId, lessonId) {
  const result = await cancelGroupLessonCallable({ groupId, lessonId })
  return result.data
}

// attendeeUpdates: { [studentId]: { attendance, homeworkDone, rating } }
export async function completeGroupLesson(groupId, lessonId, attendeeUpdates) {
  const result = await completeGroupLessonCallable({ groupId, lessonId, attendeeUpdates })
  return result.data
}

// Group lessons Phase 4 — student-facing reads. `memberIds` (seeded onto
// every group lesson draft at creation time, see functions/core/groups.js)
// is what makes these collectionGroup("lessons") queries work for an
// unauthenticated student at all: an individual students/{id}/lessons/{id}
// doc never has a `memberIds` field, so `array-contains` on it structurally
// never matches those docs — no separate discriminator needed, confirmed
// in practice per this feature's own spec, not just assumed.

function mapGroupLessonWithGroupId(document) {
  const groupRef = document.ref.parent.parent
  return { ...mapGroupLessonDoc(document.id, document.data()), groupId: groupRef.id }
}

// The student's single nearest upcoming group lesson across every group
// they're a member of — StudentDashboard.jsx compares this against its own
// nearest individual lesson (subscribeToUpcomingLesson, firebase/lessons.js)
// and shows whichever is sooner. Resolves the group's own name with one
// extra one-time read (not worth a live subscription just for a display
// label) whenever the winning lesson changes.
export function subscribeToNearestGroupLesson(studentId, onData, onError) {
  const ref = collectionGroup(db, "lessons")
  const lessonsQuery = query(ref, where("memberIds", "array-contains", studentId), where("status", "==", "upcoming"))

  return onSnapshot(
    lessonsQuery,
    async (snapshot) => {
      let nearestDocument = null
      let nearestDate = null
      for (const document of snapshot.docs) {
        const data = document.data()
        const effectiveDate = data.rescheduledDate?.toDate?.() ?? data.date?.toDate?.() ?? null
        if (!effectiveDate) continue
        if (!nearestDate || effectiveDate < nearestDate) {
          nearestDate = effectiveDate
          nearestDocument = document
        }
      }

      if (!nearestDocument) {
        onData(null)
        return
      }

      const mapped = mapGroupLessonWithGroupId(nearestDocument)
      let groupName = ""
      try {
        const groupSnapshot = await getDoc(nearestDocument.ref.parent.parent)
        groupName = groupSnapshot.exists() ? groupSnapshot.data().name ?? "" : ""
      } catch (error) {
        console.error("Failed to load group name:", error)
      }

      onData({ ...mapped, groupName })
    },
    onError,
  )
}

// Every group lesson (any status) a student is/was a member of — one read,
// reused by StudentDashboard.jsx for both MaterialsLibrary's second source
// (Phase 4, point 4 — materials can be attached before a lesson is
// completed, so this isn't filtered to "completed" only) and LessonHistory's
// second source (Phase 4, point 5 — filtered to status === "completed" by
// the caller). Not a live subscription (matches getAllCompletedLessons's
// own one-time-read shape for the individual-lesson equivalent) since
// neither materials nor history need to update in real time.
export async function getGroupLessonsForStudent(studentId) {
  const ref = collectionGroup(db, "lessons")
  const lessonsQuery = query(ref, where("memberIds", "array-contains", studentId))
  const snapshot = await getDocs(lessonsQuery)
  return snapshot.docs.map((document) => mapGroupLessonWithGroupId(document))
}

// Group programs — teachers/{uid}/groups/{groupId}/programs/{programId}, the
// group's own SHARED progress copy (not a proxy for each member's
// individual one, see functions/core/groups.js's assignGroupProgram
// comment for the full split). Same map shape as curriculum.js's own
// mapProgramDoc for consistency, minus targetScore/examDate — a group has
// no single exam goal of its own.

const assignGroupProgramCallable = httpsCallable(functions, "assignGroupProgram")
const reassignGroupProgramCallable = httpsCallable(functions, "reassignGroupProgram")
const deleteGroupProgramCallable = httpsCallable(functions, "deleteGroupProgram")

function mapGroupProgramDoc(id, data) {
  return {
    id,
    subject: data.subject ?? null,
    templateId: data.templateId ?? null,
    examTypeId: data.examTypeId ?? null,
    topics: Array.isArray(data.topics) ? data.topics : [],
    prototypes: Array.isArray(data.prototypes) ? data.prototypes : [],
    assignedAt: data.assignedAt ?? null,
  }
}

export function subscribeToGroupPrograms(teacherId, groupId, onData, onError) {
  const ref = collection(db, "teachers", teacherId, "groups", groupId, "programs")
  return onSnapshot(
    ref,
    (snapshot) => onData(snapshot.docs.map((document) => mapGroupProgramDoc(document.id, document.data()))),
    onError,
  )
}

// Adds a program to the group AND fans out a real per-student assignment to
// every current member (see the backend comment for why this is the point
// of the whole function) — returns { success, programId } for the group's
// own new program doc.
export async function assignGroupProgram(groupId, templateId) {
  const result = await assignGroupProgramCallable({ groupId, templateId })
  return result.data
}

export async function reassignGroupProgram(groupId, programId, templateId) {
  await reassignGroupProgramCallable({ groupId, programId, templateId })
}

export async function deleteGroupProgram(groupId, programId) {
  await deleteGroupProgramCallable({ groupId, programId })
}

// Manual toggle for the group's own shared checklist — mirrors
// setCurriculumItemCovered (firebase/curriculum.js) exactly (read-modify-
// write on the array, same reason: Firestore can't index into an array
// element by id via a dot path in updateDoc), just against the group's
// program doc instead of a student's.
export async function setGroupCurriculumItemCovered(teacherId, groupId, programId, kind, itemId, covered) {
  const ref = doc(db, "teachers", teacherId, "groups", groupId, "programs", programId)
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) return

  const items = Array.isArray(snapshot.data()[kind]) ? snapshot.data()[kind] : []
  const next = items.map((item) =>
    item.id === itemId ? { ...item, covered, coveredAt: covered ? new Date() : null } : item,
  )
  await updateDoc(ref, { [kind]: next })
}
