import { getDownloadURL, ref, uploadBytes } from "firebase/storage"
import { storage } from "./firebase"

export async function uploadMaterial(file, studentId) {
  const path = `materials/${studentId}/${Date.now()}_${file.name}`
  const storageRef = ref(storage, path)

  await uploadBytes(storageRef, file)
  const url = await getDownloadURL(storageRef)

  return { title: file.name, url, type: file.type }
}
