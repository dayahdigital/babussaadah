// Perhitungan jadwal sholat (tanpa internet) dengan kriteria Kemenag RI:
// Subuh 20°, Isya 18°, Asar mazhab Syafi'i (bayangan 1×), Maghrib saat matahari terbenam,
// ihtiyath 2 menit, Imsak = Subuh − 10 menit, Dhuha saat matahari setinggi 4,5°.
// Rumus posisi matahari mengikuti metode PrayTimes (Hamid Zarrabi-Zadeh, LGPL) yang disederhanakan.

const rad = (d) => d * Math.PI / 180, deg = (r) => r * 180 / Math.PI;
const sin = (d) => Math.sin(rad(d)), cos = (d) => Math.cos(rad(d)), tan = (d) => Math.tan(rad(d));
const arcsin = (x) => deg(Math.asin(x)), arccos = (x) => deg(Math.acos(Math.max(-1, Math.min(1, x))));
const arctan2 = (y, x) => deg(Math.atan2(y, x)), arccot = (x) => deg(Math.atan(1 / x));
const fix = (a, b) => { a = a - b * Math.floor(a / b); return a < 0 ? a + b : a; };

function julian(y, m, d) {
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
}
function posisiMatahari(jd) {
  const D = jd - 2451545.0;
  const g = fix(357.529 + 0.98560028 * D, 360);
  const q = fix(280.459 + 0.98564736 * D, 360);
  const L = fix(q + 1.915 * sin(g) + 0.020 * sin(2 * g), 360);
  const e = 23.439 - 0.00000036 * D;
  const RA = arctan2(cos(e) * sin(L), cos(L)) / 15;
  return { deklinasi: arcsin(sin(e) * sin(L)), persamaan: q / 15 - fix(RA, 24) };
}

export const NAMA_WAKTU = [
  { id: "imsak", nama: "Imsak" }, { id: "subuh", nama: "Subuh", fardhu: true }, { id: "terbit", nama: "Terbit" },
  { id: "dhuha", nama: "Dhuha" }, { id: "zuhur", nama: "Zuhur", fardhu: true }, { id: "asar", nama: "Asar", fardhu: true },
  { id: "maghrib", nama: "Maghrib", fardhu: true }, { id: "isya", nama: "Isya", fardhu: true }
];
export const LOKASI_BAWAAN = { lat: 5.5483, lng: 95.3238, kota: "Banda Aceh" };

// Mengembalikan menit sejak 00:00 waktu setempat (zona WIB = +7) untuk tiap waktu.
export function hitungSholat(tgl, { lat, lng, zona = 7, koreksi = {} } = {}) {
  const [y, m, d] = tgl.split("-").map(Number);
  const jd = julian(y, m, d) - lng / (15 * 24);
  const tengahHari = (t) => fix(12 - posisiMatahari(jd + t).persamaan, 24);
  const sudut = (a, t, pagi) => {
    const dek = posisiMatahari(jd + t).deklinasi;
    const T = arccos((-sin(a) - sin(dek) * sin(lat)) / (cos(dek) * cos(lat))) / 15;
    return tengahHari(t) + (pagi ? -T : T);
  };
  const asar = (faktor, t) => {
    const dek = posisiMatahari(jd + t).deklinasi;
    return sudut(-arccot(faktor + tan(Math.abs(lat - dek))), t, false);
  };
  // dua putaran agar posisi matahari dihitung mendekati jam masing-masing
  let j = { subuh: 5, terbit: 6, dhuha: 6.5, zuhur: 12, asar: 13, maghrib: 18, isya: 18 };
  for (let i = 0; i < 2; i++) {
    const p = Object.fromEntries(Object.entries(j).map(([k, v]) => [k, v / 24]));
    j = {
      subuh: sudut(20, p.subuh, true), terbit: sudut(0.833, p.terbit, true), dhuha: sudut(-4.5, p.dhuha, true),
      zuhur: tengahHari(p.zuhur), asar: asar(1, p.asar), maghrib: sudut(0.833, p.maghrib, false), isya: sudut(18, p.isya, false)
    };
  }
  const geser = zona - lng / 15;
  const ihtiyath = { subuh: 3, terbit: -2, dhuha: 0, zuhur: 2, asar: 1, maghrib: 2, isya: 2 };   // diselaraskan dengan jadwal Kemenag
  const menit = (jam, k) => Math.round((jam + geser) * 60 + (ihtiyath[k] || 0) + (Number(koreksi[k]) || 0));
  const hasil = Object.fromEntries(Object.entries(j).map(([k, v]) => [k, menit(v, k)]));
  hasil.imsak = hasil.subuh - 10 + (Number(koreksi.imsak) || 0);
  return hasil;
}
export const jamDariMenit = (m) => `${String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, "0")}.${String(((m % 60) + 60) % 60).padStart(2, "0")}`;
