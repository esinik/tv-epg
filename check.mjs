// Yayınlamadan önce çıktıyı doğrular. Kaynak site sessizce bozulursa
// (boş guide, tarih kayması) Pages'e bozuk dosya gitmesin diye workflow bunu
// çalıştırır ve hata kodunda build durur.
//
//   node check.mjs public/turkey.json

import { readFileSync } from 'node:fs'

const [, , path = 'public/turkey.json'] = process.argv

// Eşikler gerçek veri içindir; küçük örneklerle denerken ortam değişkeniyle düşür:
//   MIN_CHANNELS=3 MIN_PROGRAMMES=100 node check.mjs public/turkey.json
const MIN_CHANNELS = Number(process.env.MIN_CHANNELS ?? 40)
const MIN_PROGRAMMES = Number(process.env.MIN_PROGRAMMES ?? 1000)
const MIN_FUTURE_HOURS = Number(process.env.MIN_FUTURE_HOURS ?? 24)

const data = JSON.parse(readFileSync(path, 'utf8'))
const errors = []

if (!Array.isArray(data.channels) || data.channels.length < MIN_CHANNELS) {
  errors.push(`kanal sayısı çok düşük: ${data.channels?.length ?? 0} < ${MIN_CHANNELS}`)
}
if (!Array.isArray(data.programmes) || data.programmes.length < MIN_PROGRAMMES) {
  errors.push(`program sayısı çok düşük: ${data.programmes?.length ?? 0} < ${MIN_PROGRAMMES}`)
}

const now = Date.now()
const latest = (data.programmes ?? []).reduce(
  (max, p) => Math.max(max, Date.parse(p.stop) || 0),
  0
)
const futureHours = (latest - now) / 3_600_000
if (futureHours < MIN_FUTURE_HOURS) {
  errors.push(
    `ileriye dönük akış yetersiz: ${futureHours.toFixed(1)} saat < ${MIN_FUTURE_HOURS}`
  )
}

const orphan = (data.programmes ?? []).find(
  (p) => !(data.channels ?? []).some((c) => c.id === p.channel)
)
if (orphan) errors.push(`kanalı olmayan program var: ${orphan.channel}`)

if (errors.length) {
  console.error('DOĞRULAMA BAŞARISIZ:')
  for (const e of errors) console.error(` - ${e}`)
  process.exit(1)
}

console.log(
  `OK: ${data.channels.length} kanal, ${data.programmes.length} program, ` +
    `${futureHours.toFixed(0)} saat ileriye dönük akış`
)
