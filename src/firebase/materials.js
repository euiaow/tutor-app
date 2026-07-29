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
