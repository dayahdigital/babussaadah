import { auth, db, onAuthStateChanged, signInWithEmailAndPassword, signOut, doc, getDoc } from "./firebase.js";
import { normUsername, usernameValid, ambilProfil } from "./common.js";

const form = document.getElementById("formLogin");
const err = document.getElementById("err");
const btn = document.getElementById("btnMasuk");
let sedangLogin = false;

if (new URLSearchParams(location.search).has("nonaktif"))
  err.textContent = "Akun Anda nonaktif. Hubungi Super Admin.";

// Tampilkan tautan setup bila belum ada Super Admin sama sekali
getDoc(doc(db, "config", "setup"))
  .then(s => { if (!s.exists()) document.getElementById("infoSetup").hidden = false; })
  .catch(() => {});

// Sudah login sebelumnya? langsung ke dashboard
onAuthStateChanged(auth, async (user) => {
  if (!user || sedangLogin) return;
  const p = await ambilProfil(user.uid).catch(() => null);
  if (p?.aktif) location.replace("dashboard.html");
  else await signOut(auth);
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  err.textContent = "";
  const u = normUsername(form.username.value);
  if (!usernameValid(u)) { err.textContent = "Username tidak valid."; return; }

  sedangLogin = true;
  btn.disabled = true; btn.textContent = "Memproses...";
  try {
    const map = await getDoc(doc(db, "usernames", u));
    if (!map.exists()) throw { code: "auth/invalid-credential" };
    const cred = await signInWithEmailAndPassword(auth, map.data().email, form.password.value);
    const p = await ambilProfil(cred.user.uid);
    if (!p || !p.aktif) {
      await signOut(auth);
      err.textContent = "Akun Anda nonaktif. Hubungi Super Admin.";
      return;
    }
    location.replace("dashboard.html");
  } catch (ex) {
    err.textContent = ["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"].includes(ex.code)
      ? "Username atau kata sandi salah."
      : ex.code === "auth/too-many-requests"
        ? "Terlalu banyak percobaan. Coba lagi beberapa menit lagi."
        : "Gagal masuk: " + (ex.code || ex.message);
  } finally {
    sedangLogin = false;
    btn.disabled = false; btn.textContent = "Masuk";
  }
});
