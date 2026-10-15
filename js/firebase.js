// Inisialisasi Firebase (SDK modular v10 via CDN — cocok untuk GitHub Pages)
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  createUserWithEmailAndPassword, updatePassword, reauthenticateWithCredential, EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, getFirestore,
  collection, doc, addDoc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, query, where, orderBy, limit,
  serverTimestamp, writeBatch, onSnapshot, increment, deleteField, arrayUnion, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Cache lokal di HP/komputer: data tetap tampil & perubahan tersimpan sementara saat sinyal hilang,
// lalu otomatis terkirim begitu internet kembali.
let _db;
try {
  _db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
} catch {
  _db = getFirestore(app);
}
export const db = _db;

// Membuat akun login baru TANPA mengeluarkan Super Admin yang sedang login.
// Caranya: memakai instance Firebase kedua yang terpisah, lalu dibuang.
export async function buatAkunAuth(email, password) {
  const app2 = initializeApp(firebaseConfig, "sekunder-" + Date.now());
  try {
    const auth2 = getAuth(app2);
    const cred = await createUserWithEmailAndPassword(auth2, email, password);
    await signOut(auth2);
    return cred.user.uid;
  } finally {
    await deleteApp(app2);
  }
}

export {
  onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword,
  updatePassword, reauthenticateWithCredential, EmailAuthProvider,
  collection, doc, addDoc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, query, where, orderBy, limit,
  serverTimestamp, writeBatch, onSnapshot, increment, deleteField, arrayUnion, Timestamp
};
