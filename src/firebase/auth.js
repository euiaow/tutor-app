import { signInWithEmailAndPassword, signOut } from "firebase/auth"
import { auth } from "./firebase"

export { auth }

export async function signInTeacher(email, password) {
  await signInWithEmailAndPassword(auth, email, password)
}

export async function signOutTeacher() {
  await signOut(auth)
}
