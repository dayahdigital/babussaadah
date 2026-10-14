// Jadwal mengajar: teungku memilih sesi (Pagi/Malam) per hari beserta kitab, materi, kelas.
// Teungku hanya mengatur jadwalnya sendiri; Admin & Super Admin bisa mengatur semua teungku.
// Jadwal ini dipakai absensi (siapa terjadwal di sesi apa) dan tampil di halaman publik.
import { db, collection, getDocs, getDoc, doc, setDoc, deleteDoc, query, where, serverTimestamp } from "./firebase.js?v=2.0.1";
import {
  requireAuth, AKSES, toast, esc, ambilConfigAbsensi, ambilJadwal, idJadwal, HARI, SEMUA_HARI, jamSesi
} from "./common.js?v=2.0.1";

const { profil } = await requireAuth(AKSES.jadwal);
const isGuru = profil.role === "guru";

const tb = document.getElementById("tbJadwal");
const sel = document.getElementById("pilihGuru");
const modal = document.getElementById("modal");
const form = document.getElementById("formJadwal");
const cfg = await ambilConfigAbsensi();
const [pagi, malam] = cfg.sesi;
document.getElementById("thPagi").textContent = `${pagi.nama} (${jamSesi(pagi)})`;
document.getElementById("thMalam").textContent = `${malam.nama} (${jamSesi(malam)})`;

let guruList = [];
let guruId = null;
let entri = {};          // id jadwal → data
let edit = null;         // { sesi, hari }

// Daftar teungku
if (isGuru) {
  if (!profil.guruId) {
    tb.innerHTML = `<tr><td colspan="3" class="empty">Akun Anda belum ditautkan ke data teungku. Hubungi Super Admin.</td></tr>`;
    throw new Error("guruId kosong");
  }
  const g = await getDoc(doc(db, "guru", profil.guruId));
  guruList = [{ id: profil.guruId, ...(g.data() || { nama: profil.nama }) }];
  guruId = profil.guruId;
  document.getElementById("keterangan").textContent =
    "Pilih sesi yang Anda ajar setiap hari, lalu isi kitab dan materinya. Tombol Hadir di menu Absen Saya mengikuti jadwal ini.";
} else {
  const snap = await getDocs(query(collection(db, "guru"), where("aktif", "==", true)));
  guruList = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.nama.localeCompare(b.nama));
  document.getElementById("pilihGuruWrap").hidden = false;
  sel.innerHTML = guruList.length
    ? guruList.map(g => `<option value="${g.id}">${esc(g.nama)}</option>`).join("")
    : `<option value="">Belum ada teungku aktif</option>`;
  guruId = guruList[0]?.id || null;
  sel.onchange = () => { guruId = sel.value; muat(); };
  document.getElementById("keterangan").textContent =
    "Pilih teungku untuk melihat atau mengubah jadwalnya. Teungku juga bisa mengatur jadwalnya sendiri.";
}
const guruNow = () => guruList.find(g => g.id === guruId);

// Saran nama kitab dari semua jadwal yang sudah ada
ambilJadwal().then(semua => {
  const kitab = [...new Set(semua.map(e => e.kitab).filter(Boolean))].sort();
  document.getElementById("daftarKitab").innerHTML = kitab.map(k => `<option value="${esc(k)}">`).join("");
}).catch(() => {});

async function muat() {
  if (!guruId) { tb.innerHTML = `<tr><td colspan="3" class="empty">Belum ada teungku.</td></tr>`; return; }
  const list = await ambilJadwal(guruId);
  entri = Object.fromEntries(list.map(e => [e.id, e]));
  document.getElementById("judulJadwal").textContent =
    `Jadwal ${guruNow()?.nama || ""} · ${list.length} sesi per minggu`;
  tampil();
}

function sel_(s, h) {
  if (!s.hari.includes(h)) return `<td class="off-cell">Tidak ada sesi</td>`;
  const e = entri[idJadwal(guruId, s.id, h)];
  return e
    ? `<td><div class="slot isi" data-sesi="${s.id}" data-hari="${h}" role="button" tabindex="0">
         <b>📖 ${esc(e.kitab)}</b>
         ${e.materi ? `<span>${esc(e.materi)}</span>` : ""}
         ${e.kelas ? `<small>${esc(e.kelas)}</small>` : ""}
       </div></td>`
    : `<td><button class="slot kosong" data-sesi="${s.id}" data-hari="${h}">+ Pilih sesi ini</button></td>`;
}

function tampil() {
  tb.innerHTML = SEMUA_HARI.map(h => `<tr><th class="hari">${HARI[h]}</th>${sel_(pagi, h)}${sel_(malam, h)}</tr>`).join("");
}

function buka(sesiId, hari) {
  edit = { sesi: sesiId, hari: Number(hari) };
  const s = cfg.sesi.find(x => x.id === sesiId);
  const e = entri[idJadwal(guruId, sesiId, edit.hari)];
  document.getElementById("judulModal").textContent = `${HARI[edit.hari]} · ${s.nama} (${jamSesi(s)})`;
  form.kitab.value = e?.kitab || "";
  form.materi.value = e?.materi || "";
  form.kelas.value = e?.kelas || "";
  document.getElementById("btnHapus").hidden = !e;
  modal.classList.add("open");
  setTimeout(() => form.kitab.focus(), 50);
}

tb.addEventListener("click", (e) => {
  const el = e.target.closest("[data-sesi]");
  if (el) buka(el.dataset.sesi, el.dataset.hari);
});
tb.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.dataset?.sesi) buka(e.target.dataset.sesi, e.target.dataset.hari);
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    await setDoc(doc(db, "mengajar", idJadwal(guruId, edit.sesi, edit.hari)), {
      guruId, namaGuru: guruNow()?.nama || profil.nama,
      sesi: edit.sesi, hari: edit.hari,
      kitab: form.kitab.value.trim(), materi: form.materi.value.trim(), kelas: form.kelas.value.trim(),
      diubahOleh: profil.username, diubah: serverTimestamp()
    });
    modal.classList.remove("open");
    toast("Jadwal tersimpan");
    muat();
  } catch (ex) { toast("Gagal menyimpan: " + (ex.code || ex.message), "err"); }
  finally { btn.disabled = false; }
});

document.getElementById("btnHapus").onclick = async () => {
  if (!confirm("Hapus jadwal di sesi ini? Sesi ini tidak akan muncul lagi di absensi Anda.")) return;
  try {
    await deleteDoc(doc(db, "mengajar", idJadwal(guruId, edit.sesi, edit.hari)));
    modal.classList.remove("open");
    toast("Jadwal dihapus");
    muat();
  } catch (ex) { toast("Gagal: " + (ex.code || ex.message), "err"); }
};
document.getElementById("btnBatal").onclick = () => modal.classList.remove("open");

muat();
