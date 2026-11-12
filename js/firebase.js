// Inisialisasi Firebase (SDK modular v10 via CDN — cocok untuk GitHub Pages)
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  createUserWithEmailAndPassword, updatePassword, reauthenticateWithCredential, EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, getFirestore,
  collection, doc, addDoc as rawAddDoc, setDoc as rawSetDoc, getDoc, getDocs, updateDoc as rawUpdateDoc, deleteDoc, query as rawQuery, where, orderBy, limit,
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

// Semua tulis koleksi operasional diberi unitId dari pilihan unit di perangkat.
// Ini bukan pengganti Rules; Rules tetap memeriksa membership di server.
const KOLEKSI_UNIT = new Set(["guru", "mengajar", "riwayat_jadwal", "absensi", "selfie", "hadir_publik", "izin", "gaji", "kas", "bukti", "ringkasan", "pengumuman", "notifikasi", "log", "config"]);
function unitIdLokal() {
  try {
    const p = JSON.parse(sessionStorage.getItem("profil") || localStorage.getItem("profil") || "{}");
    const aktif = JSON.parse(sessionStorage.getItem("unitAktif") || localStorage.getItem("unitAktif") || "null");
    return aktif || p.activeUnitId || "unit-induk";
  } catch { return "unit-induk"; }
}
function payloadUnit(ref, data) {
  const koleksi = String(ref?.path || "").split("/")[0];
  return KOLEKSI_UNIT.has(koleksi) && data && typeof data === "object" && !("unitId" in data)
    ? { ...data, unitId: unitIdLokal() } : data;
}
export function query(ref, ...constraints) {
  const koleksi = String(ref?.path || "").split("/")[0];
  let scoped = constraints;
  try {
    const profil = JSON.parse(sessionStorage.getItem("profil") || localStorage.getItem("profil") || "{}");
    const unit = JSON.parse(sessionStorage.getItem("unitAktif") || localStorage.getItem("unitAktif") || "null") || profil.activeUnitId || "unit-induk";
    // Unit Induk tetap kompatibel dengan dokumen lama; unit tambahan selalu wajib difilter.
    if (KOLEKSI_UNIT.has(koleksi) && unit !== "unit-induk" && !["superadmin", "pimpinan"].includes(profil.role)) scoped = [...constraints, where("unitId", "==", unit)];
  } catch { /* query lama tetap berjalan */ }
  return rawQuery(ref, ...scoped);
}
export function setDoc(ref, data, options) { return rawSetDoc(ref, payloadUnit(ref, data), options); }
export function addDoc(ref, data) { return rawAddDoc(ref, payloadUnit(ref, data)); }
export function updateDoc(ref, data) { return rawUpdateDoc(ref, payloadUnit(ref, data)); }

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
