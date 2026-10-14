// Kelola pengguna — khusus Super Admin
import {
  db, buatAkunAuth, collection, doc, getDoc, getDocs, updateDoc, writeBatch, serverTimestamp
} from "./firebase.js?v=2.0.2";
import {
  requireAuth, AKSES, PERAN, normUsername, usernameValid, buatEmail, toast, esc
} from "./common.js?v=2.0.2";

const { profil: saya } = await requireAuth(AKSES.pengguna);

const tb = document.getElementById("tbUser");
const mUser = document.getElementById("modalUser");
const mReset = document.getElementById("modalReset");
const fUser = document.getElementById("formUser");
const fReset = document.getElementById("formReset");
let daftar = [];
let dataGuru = [];
let editUid = null;
let resetUid = null;

const superAktif = () => daftar.filter(u => u.role === "superadmin" && u.aktif).length;
const namaGuru = (id) => dataGuru.find(g => g.id === id)?.nama;

async function muat() {
  const [snap, gSnap] = await Promise.all([getDocs(collection(db, "users")), getDocs(collection(db, "guru"))]);
  daftar = snap.docs.map(d => ({ uid: d.id, ...d.data() }))
    .filter(u => !u.dihapus)
    .sort((a, b) => a.nama.localeCompare(b.nama));
  dataGuru = gSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.nama.localeCompare(b.nama));
  tampil();
  sinkronDaftarLogin().catch(ex => console.warn("Sinkron daftar login gagal", ex));
}

// Daftar nama di halaman login diambil dari koleksi "usernames".
// Fungsi ini memastikan nama, peran & status aktif di sana selalu sama dengan data pengguna.
async function sinkronDaftarLogin() {
  const snap = await getDocs(collection(db, "usernames"));
  const b = writeBatch(db);
  let n = 0;
  snap.docs.forEach(d => {
    const m = d.data();
    const u = daftar.find(x => x.uid === m.uid);
    if (!u) return;
    const target = { nama: u.nama, role: u.role, aktif: !!u.aktif };
    if (m.nama !== target.nama || m.role !== target.role || m.aktif !== target.aktif) {
      b.update(d.ref, target);
      n++;
    }
  });
  if (n) await b.commit();
}

// Pilihan teungku: hanya yang belum punya akun (plus yang sedang ditautkan ke akun ini)
function isiPilihanGuru(saatIni = "") {
  const terpakai = new Set(daftar.filter(u => u.role === "guru" && u.guruId && u.guruId !== saatIni).map(u => u.guruId));
  const opsi = dataGuru.filter(g => !terpakai.has(g.id));
  fUser.guruId.innerHTML = `<option value="">— pilih teungku —</option>` +
    opsi.map(g => `<option value="${g.id}">${esc(g.nama)}${g.jabatan ? " · " + esc(g.jabatan) : ""}</option>`).join("");
  fUser.guruId.value = saatIni;
}
const aturBoxGuru = () => {
  const isGuru = fUser.role.value === "guru";
  document.getElementById("boxGuru").hidden = !isGuru;
  fUser.guruId.required = isGuru;
};
fUser.role.addEventListener("change", aturBoxGuru);
// Pilih teungku → isi nama otomatis bila masih kosong
fUser.guruId.addEventListener("change", () => {
  if (!fUser.nama.value.trim()) fUser.nama.value = namaGuru(fUser.guruId.value) || "";
});

function tampil() {
  const q = document.getElementById("cari").value.toLowerCase();
  const rows = daftar.filter(u => (u.nama + " " + u.username).toLowerCase().includes(q));
  tb.innerHTML = rows.length ? rows.map(u => {
    const diriSendiri = u.uid === saya.uid;
    return `<tr>
      <td><strong>${esc(u.nama)}</strong>${diriSendiri ? ' <small style="color:#6b7770">(Anda)</small>' : ""}</td>
      <td>${esc(u.username)}</td>
      <td>${PERAN[u.role] || u.role}${u.role === "guru"
        ? `<br><small style="color:#6b7770">${u.guruId && namaGuru(u.guruId) ? "→ " + esc(namaGuru(u.guruId)) : "⚠ belum ditautkan"}</small>` : ""}</td>
      <td><span class="badge ${u.aktif ? "b-in" : "b-out"}">${u.aktif ? "Aktif" : "Nonaktif"}</span></td>
      <td class="aksi">
        <button class="btn btn-sm btn-sec" data-ubah="${u.uid}">Ubah</button>
        ${diriSendiri ? "" : `
          <button class="btn btn-sm btn-sec" data-reset="${u.uid}">Reset Sandi</button>
          <button class="btn btn-sm btn-sec" data-toggle="${u.uid}">${u.aktif ? "Nonaktifkan" : "Aktifkan"}</button>
          <button class="btn btn-sm btn-red" data-hapus="${u.uid}">Hapus</button>`}
      </td></tr>`;
  }).join("") : `<tr><td colspan="5" class="empty">Tidak ada pengguna.</td></tr>`;
}

function bukaForm(u = null) {
  editUid = u?.uid || null;
  fUser.reset();
  document.getElementById("judulUser").textContent = u ? "Ubah Pengguna" : "Tambah Pengguna";
  document.getElementById("boxSandi").hidden = !!u;
  fUser.password.required = !u;
  fUser.username.disabled = !!u;
  if (u) { fUser.nama.value = u.nama; fUser.username.value = u.username; fUser.role.value = u.role; }
  isiPilihanGuru(u?.guruId || "");
  aturBoxGuru();
  // Super Admin tidak boleh mengubah perannya sendiri (mencegah terkunci)
  fUser.role.disabled = u?.uid === saya.uid;
  mUser.classList.add("open");
}

fUser.addEventListener("submit", async (e) => {
  e.preventDefault();
  const nama = fUser.nama.value.trim();
  const role = fUser.role.value;
  const guruId = role === "guru" ? fUser.guruId.value : null;
  const btn = fUser.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    if (role === "guru" && !guruId) throw new Error("Pilih data teungku yang ditautkan.");
    if (editUid) {
      const lama = daftar.find(x => x.uid === editUid);
      if (lama.role === "superadmin" && role !== "superadmin" && superAktif() <= 1)
        throw new Error("Harus ada minimal satu Super Admin aktif.");
      await updateDoc(doc(db, "users", editUid), {
        nama, ...(editUid === saya.uid ? {} : { role, guruId }), diubah: serverTimestamp()
      });
      toast("Pengguna diperbarui");
    } else {
      const u = normUsername(fUser.username.value);
      if (!usernameValid(u)) throw new Error("Username tidak valid.");
      if ((await getDoc(doc(db, "usernames", u))).exists()) throw new Error("Username sudah dipakai.");
      const email = buatEmail(u);
      const uid = await buatAkunAuth(email, fUser.password.value);
      const b = writeBatch(db);
      b.set(doc(db, "users", uid), {
        uid, username: u, nama, role, guruId, aktif: true, email,
        dibuat: serverTimestamp(), dibuatOleh: saya.username
      });
      b.set(doc(db, "usernames", u), { uid, email, nama, role, aktif: true });
      await b.commit();
      toast(`Pengguna "${u}" dibuat`);
    }
    mUser.classList.remove("open");
    muat();
  } catch (ex) {
    toast(ex.code === "auth/weak-password" ? "Kata sandi minimal 6 karakter." : (ex.message || ex.code), "err");
  } finally { btn.disabled = false; }
});

// Reset sandi: buat akun login baru untuk username yang sama, akun lama dimatikan.
// (Aplikasi tanpa server tidak bisa mengganti sandi orang lain secara langsung.)
fReset.addEventListener("submit", async (e) => {
  e.preventDefault();
  const lama = daftar.find(x => x.uid === resetUid);
  const btn = fReset.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    const email = buatEmail(lama.username);
    const uidBaru = await buatAkunAuth(email, fReset.password.value);
    const { uid, ...data } = lama;
    const b = writeBatch(db);
    b.set(doc(db, "users", uidBaru), { ...data, uid: uidBaru, email, diubah: serverTimestamp() });
    b.update(doc(db, "users", uid), { aktif: false, dihapus: true, digantiOleh: uidBaru });
    b.set(doc(db, "usernames", lama.username), { uid: uidBaru, email, nama: lama.nama, role: lama.role, aktif: !!lama.aktif });
    await b.commit();
    mReset.classList.remove("open");
    toast(`Kata sandi ${lama.username} sudah direset`);
    muat();
  } catch (ex) {
    toast(ex.code === "auth/weak-password" ? "Kata sandi minimal 6 karakter." : (ex.message || ex.code), "err");
  } finally { btn.disabled = false; }
});

tb.addEventListener("click", async (e) => {
  const ds = e.target.dataset;
  const u = daftar.find(x => x.uid === (ds.ubah || ds.reset || ds.toggle || ds.hapus));
  if (!u) return;

  if (ds.ubah) bukaForm(u);

  if (ds.reset) {
    resetUid = u.uid;
    fReset.reset();
    document.getElementById("judulReset").textContent = "Reset Kata Sandi — " + u.username;
    mReset.classList.add("open");
  }

  if (ds.toggle) {
    if (u.aktif && u.role === "superadmin" && superAktif() <= 1)
      return toast("Harus ada minimal satu Super Admin aktif.", "err");
    await updateDoc(doc(db, "users", u.uid), { aktif: !u.aktif });
    toast(u.aktif ? "Pengguna dinonaktifkan" : "Pengguna diaktifkan");
    muat();
  }

  if (ds.hapus) {
    if (u.role === "superadmin" && u.aktif && superAktif() <= 1)
      return toast("Harus ada minimal satu Super Admin aktif.", "err");
    if (!confirm(`Hapus pengguna "${u.username}"? Ia tidak bisa login lagi dan username bisa dipakai ulang.`)) return;
    const b = writeBatch(db);
    b.update(doc(db, "users", u.uid), { aktif: false, dihapus: true });
    b.delete(doc(db, "usernames", u.username));
    await b.commit();
    toast("Pengguna dihapus");
    muat();
  }
});

document.querySelectorAll("[data-tutup]").forEach(b =>
  b.onclick = () => b.closest(".modal").classList.remove("open"));
document.getElementById("btnTambah").onclick = () => bukaForm();
document.getElementById("cari").oninput = tampil;

muat();
