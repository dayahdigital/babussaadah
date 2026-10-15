import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "./firebase.js";
import { requireAuth, PERAN, toast, aksi, catatLog, pasangAplikasi, teksVersi, selisihJamPerangkat, jamSiap } from "./common.js";

const { user, profil } = await requireAuth();
document.getElementById("aNama").textContent = profil.nama;
document.getElementById("aUser").textContent = "@" + profil.username;
document.getElementById("aPeran").textContent = PERAN[profil.role] || profil.role;
document.getElementById("btnPasang").onclick = pasangAplikasi;
jamSiap.then(() => {
  const d = Math.round(selisihJamPerangkat() / 1000);
  document.getElementById("infoVersi").textContent = `${teksVersi()} · selisih jam perangkat dengan server: ${Math.abs(d) < 60 ? d + " detik" : Math.round(d / 60) + " menit"}`;
});
document.getElementById("btnNotif").onclick = async () => {
  if (!("Notification" in window)) return toast("Browser ini tidak mendukung notifikasi.", "err");
  const p = await Notification.requestPermission();
  toast(p === "granted" ? "Notifikasi aktif" : "Notifikasi tidak diizinkan. Ubah di pengaturan browser.", p === "granted" ? "ok" : "err");
};

const form = document.getElementById("formSandi");
form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (form.baru.value !== form.baru2.value) return toast("Kata sandi baru tidak sama.", "err");
  aksi(document.getElementById("btnSandi"), async () => {
    try { await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, form.lama.value)); }
    catch (ex) { if (["auth/invalid-credential", "auth/wrong-password"].includes(ex.code)) throw new Error("Kata sandi lama salah."); throw ex; }
    await updatePassword(user, form.baru.value);
    catatLog("Akun", "Ganti kata sandi", "@" + profil.username);
    form.reset();
    toast("Kata sandi berhasil diganti");
  });
});
