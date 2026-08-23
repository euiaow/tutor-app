import { collection, collectionGroup, getDocs, onSnapshot, orderBy, query, where } from "firebase/firestore"
import { httpsCallable } from "firebase/functions"
import { db, functions } from "./firebase"
import { normalizeScheduleSlots } from "@/lib/schedule"
import { getProgramsForStudent, setCurriculumItemCovered } from "@/firebase/curriculum"

// Group lessons Phase 1 — groups live at teachers/{teacherId}/groups/
// {groupId}, a subcollection of the teacher's own doc (not a top-level
// collection like students/curriculumTemplates) — see
// functions/core/tenancy.js's assertOwnsGroup comment for why that means
// no separate teacherId-filtered query is needed the way
// subscribeToStudents needs one.

const createGroupCallable = httpsCallable(functions, "createGroup")
const updateGroupCallable = httpsCallable(functions, "updateGroup")
const deleteGroupCallable = httpsCallable(functions, "deleteGroup")
const rescheduleGroupLessonCallable = httpsCallable(functions, "rescheduleGroupLesson")
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
    programTemplateId: data.programTemplateId ?? null,
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

// Group lessons — rearchitected (see activeContext.md / core/groups.js):
// a group lesson is no longer its own doc under teachers/{uid}/groups/
// {groupId}/lessons — it's fanned out as one real students/{id}/lessons
// mirror doc per member, tagged isGroupLesson/groupId/groupLessonKey. The
// teacher's normal lesson feeds (subscribeToUpcomingLessons, etc. —
// firebase/lessons.js) already pick these up automatically; the only thing
// still needed here is a way to load every mirror of ONE occurrence at once
// (getGroupLessonMirrors, keyed by groupLessonKey) for GroupLessonDialog,
// plus the group-level teacher actions (reschedule/
// cancel/complete/create-extra) that fan a single decision out to all of
// them server-side. Per-mirror topic/homework/material edits are NOT
// special here any more — GroupLessonDialog calls the exact same
// updateLessonTopic/updateHomeworkAssignment/addLessonMaterial/
// removeLessonMaterial (firebase/lessons.js) already used for an individual
// lesson, once per member.

function mapGroupLessonMirror(document) {
  const data = document.data()
  return {
    id: document.id,
    studentId: document.ref.parent.parent.id,
    status: data.status ?? "upcoming",
    date: data.date?.toDate?.() ?? null,
    rescheduledDate: data.rescheduledDate?.toDate?.() ?? null,
    topic: data.topic ?? "",
    subject: data.subject ?? "",
    homework: {
      assignment: {
        text: data.homework?.assignment?.text ?? "",
        files: Array.isArray(data.homework?.assignment?.files) ? data.homework.assignment.files : [],
      },
      // Group lessons have no per-occurrence student submission of their
      // own (each member submits to their own mirror, read the normal
      // individual way) — present as empty rather than omitted so
      // UpcomingLessonCard's unconditional `homework.submission.files`
      // read doesn't need a group-aware guard of its own.
      submission: { files: [], submittedAt: null },
    },
    materials: Array.isArray(data.materials) ? data.materials : [],
    attendance: data.attendance ?? null,
    homeworkDone: Boolean(data.homeworkDone),
    rating: data.rating ?? null,
    durationMinutes: data.durationMinutes ?? 60,
    teacherId: data.teacherId ?? null,
    groupId: data.groupId ?? null,
    groupLessonKey: data.groupLessonKey ?? null,
    groupSlotIndex: typeof data.groupSlotIndex === "number" ? data.groupSlotIndex : null,
    groupName: data.groupName ?? "",
    isGroupLesson: true,
    isExtraLesson: Boolean(data.isExtraLesson),
    // Reschedule/cancel are always teacher-direct for a group lesson (see
    // core/lessons.js's assertNotGroupMirror) — a mirror can never actually
    // have any of these set, but UpcomingLessonCard reads them
    // unconditionally, same reasoning as `submission` above.
    rescheduled: false,
    rescheduleStatus: null,
    rescheduleProposedDate: null,
    cancellationStatus: null,
  }
}

// Every member's mirror doc for one group lesson occurrence, one-time read
// — GroupLessonDialog loads these when it opens (keyed by groupLessonKey,
// passed in from whichever row/card the teacher clicked) to show the
// shared topic/assignment editor plus each member's own attendance/
// homework/rating controls. teacherId is included in the query for the
// same "provably scoped" reason subscribeToUpcomingGroupLessonOccurrences
// above needs it.
export async function getGroupLessonMirrors(teacherId, groupLessonKey) {
  const ref = collectionGroup(db, "lessons")
  const mirrorsQuery = query(ref, where("teacherId", "==", teacherId), where("groupLessonKey", "==", groupLessonKey))
  const snapshot = await getDocs(mirrorsQuery)
  return snapshot.docs.map(mapGroupLessonMirror)
}

// Every upcoming occurrence of one group, one row per groupLessonKey (not
// per member) — powers the group row's own "Следующие уроки" list
// (groups-section.jsx), which shows one entry per class session, not one
// per attendee. teacherId is included in the query itself (not just
// groupId) for the same reason subscribeToUpcomingLessons (firebase/
// lessons.js) already includes it — a collectionGroup query's security rule
// check needs the query provably scoped on the same field it checks.
export function subscribeToUpcomingGroupLessonOccurrences(teacherId, groupId, onData, onError) {
  const ref = collectionGroup(db, "lessons")
  const occurrencesQuery = query(
    ref,
    where("teacherId", "==", teacherId),
    where("groupId", "==", groupId),
    where("status", "==", "upcoming"),
  )

  return onSnapshot(
    occurrencesQuery,
    (snapshot) => {
      const byKey = new Map()
      for (const document of snapshot.docs) {
        const mirror = mapGroupLessonMirror(document)
        const existing = byKey.get(mirror.groupLessonKey)
        if (existing) {
          existing.memberIds.push(mirror.studentId)
        } else {
          byKey.set(mirror.groupLessonKey, { ...mirror, memberIds: [mirror.studentId] })
        }
      }
      onData([...byKey.values()].sort((a, b) => (a.date?.getTime?.() ?? 0) - (b.date?.getTime?.() ?? 0)))
    },
    onError,
  )
}

export async function rescheduleGroupLesson(groupId, groupLessonKey, newDate) {
  const result = await rescheduleGroupLessonCallable({ groupId, groupLessonKey, newDate: newDate.toISOString() })
  return result.data
}

export async function cancelGroupLesson(groupId, groupLessonKey) {
  const result = await cancelGroupLessonCallable({ groupId, groupLessonKey })
  return result.data
}

// attendeeUpdates: { [studentId]: { attendance, homeworkDone, rating } }
export async function completeGroupLesson(groupId, groupLessonKey, attendeeUpdates) {
  const result = await completeGroupLessonCallable({ groupId, groupLessonKey, attendeeUpdates })
  return result.data
}

// Group programs — rearchitected (session 28): a group's program is no
// longer a separate stored copy under teachers/{uid}/groups/{groupId}/
// programs. A student who's individually assigned a subject AND is a
// member of a group teaching that same subject used to end up with two
// silently-diverging program docs, and marking a topic covered "for the
// group" never reached the student's own progress at all — both fixed by
// removing the duplicate storage entirely. The group now just remembers
// `programTemplateId` (see mapGroupDoc); assigning it links or creates one
// real program per member (functions/core/groups.js), and everything
// displayed here is computed at read time from those real member programs
// — getGroupProgramView below, not a stored doc.

const assignGroupProgramCallable = httpsCallable(functions, "assignGroupProgram")
const reassignGroupProgramCallable = httpsCallable(functions, "reassignGroupProgram")
const deleteGroupProgramCallable = httpsCallable(functions, "deleteGroupProgram")

// Adds a program to the group AND fans out a real per-student assignment to
// every current member — reusing a member's existing program for the same
// subject if they already have one (see the backend comment for the full
// dedup rule), rather than always creating a second, diverging copy.
export async function assignGroupProgram(groupId, templateId) {
  const result = await assignGroupProgramCallable({ groupId, templateId })
  return result.data
}

export async function reassignGroupProgram(groupId, templateId) {
  await reassignGroupProgramCallable({ groupId, templateId })
}

export async function deleteGroupProgram(groupId) {
  await deleteGroupProgramCallable({ groupId })
}

// Takes just the subject + member id list (not the whole group doc) so it
// works equally from groups-section.jsx (which has the live group) and
// GroupLessonDialog (which, opened from the collapsed dashboard card, may
// only have a minimal {id,name,subject} stand-in -- see upcoming-lesson-
// card.jsx's groupStub -- plus whichever members actually attended this
// specific occurrence, from its own loaded mirrors). Returns null if no
// member currently has a program for this subject at all (never assigned,
// or every link was since removed).
export async function getGroupProgramView(subject, memberStudentIds) {
  if (!subject || !Array.isArray(memberStudentIds) || memberStudentIds.length === 0) return null

  const memberPrograms = await Promise.all(
    memberStudentIds.map(async (studentId) => {
      const programs = await getProgramsForStudent(studentId)
      const program = programs.find((p) => p.subject === subject) ?? null
      return { studentId, program }
    }),
  )
  const linked = memberPrograms.filter((entry) => entry.program)
  if (linked.length === 0) return null

  const base = linked[0].program
  function aggregate(kind) {
    return base[kind].map((item) => ({
      id: item.id,
      title: item.title,
      minScoreRequired: item.minScoreRequired,
      covered: linked.every(({ program }) => program[kind].find((i) => i.id === item.id)?.covered),
    }))
  }

  return {
    templateId: base.templateId,
    subject,
    topics: aggregate("topics"),
    prototypes: aggregate("prototypes"),
    memberPrograms: linked,
  }
}

// Fans a manual "covered" toggle out to every member's own program at once
// — reuses setCurriculumItemCovered (firebase/curriculum.js) verbatim, once
// per member, instead of a separate group-specific write path. `memberPrograms`
// is the same array getGroupProgramView returned (each entry already knows
// its own studentId + program.id).
export async function setGroupCurriculumItemCovered(memberPrograms, kind, itemId, covered) {
  await Promise.all(
    memberPrograms.map(({ studentId, program }) => setCurriculumItemCovered(studentId, program.id, kind, itemId, covered)),
  )
}

const createExtraGroupLessonCallable = httpsCallable(functions, "createExtraGroupLesson")

export async function createExtraGroupLesson(groupId, date) {
  const result = await createExtraGroupLessonCallable({ groupId, date: date.toISOString() })
  return result.data.groupLessonKey
}
