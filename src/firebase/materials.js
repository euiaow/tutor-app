import { getDownloadURL, ref, uploadBytes } from "firebase/storage"
import { storage } from "./firebase"

export async function uploadMaterial(file, studentId) {
  const path = `materials/${studentId}/${Date.now()}_${file.name}`
  const storageRef = ref(storage, path)

  await uploadBytes(storageRef, file)
  const url = await getDownloadURL(storageRef)

  return { title: file.name, url, type: file.type }
}

// Same materials/{studentId}/ bucket path the bots' uploadHomeworkFile
// writes to (functions/core/lessons.js) so teacher-facing views never need
// to distinguish where a homework file came from.
export async function uploadHomeworkSubmissionFile(file, studentId) {
  const path = `materials/${studentId}/homework_${Date.now()}_${file.name}`
  const storageRef = ref(storage, path)

  await uploadBytes(storageRef, file)
  return getDownloadURL(storageRef)
}

// A group lesson has no single studentId to key a Storage path on — reuses
// the same `materials/` bucket root and object shape as uploadMaterial
// above, just under `group_{groupId}` instead of a real student id (the
// `group_` prefix guarantees it can never collide with an actual student
// doc id). Whatever Storage rule already scopes writes under `materials/`
// needs to cover this path too — check it if group material uploads
// permission-deny in practice, same as any other Console-managed rule gap
// in this project (see techContext.md).
export async function uploadGroupMaterial(file, groupId) {
  const path = `materials/group_${groupId}/${Date.now()}_${file.name}`
  const storageRef = ref(storage, path)

  await uploadBytes(storageRef, file)
  const url = await getDownloadURL(storageRef)

  return { title: file.name, url, type: file.type }
}
