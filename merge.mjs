// Birden fazla turkey.json'ı tek dosyada birleştirir.
//
//   node merge.mjs out.json birincil.json [ikincil.json ...]
//
// Neden gerekli: dsmart GitHub runner'ından erişilebiliyor ama ATV'yi hiç
// içermiyor; digiturk ATV dahil 112 kanal veriyor ama yalnızca Türkiye IP'sinden.
// Bu yüzden digiturk verisi Mac'te üretilip repoya işleniyor (data/digiturk.json),
// CI de her çalıştığında taze dsmart verisiyle onu birleştiriyor.
//
// Öncelik soldan sağa: aynı kanal+başlangıç için ilk dosya kazanır, sonrakiler
// yalnızca eksikleri doldurur. Böylece taze dsmart verisi, günlerdir
// güncellenmemiş olabilecek digiturk kopyasının önüne geçer.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'

const args = process.argv.slice(2)
// --drop-past-days=N : bitişi N günden eski programları at (yerel dosyayı
// önceki koşumla birleştirirken geçmişin sonsuza kadar birikmesini engeller)
let dropPastDays = null
const outputAndInputs = args.filter((a) => {
  const m = /^--drop-past-days=(\d+)$/.exec(a)
  if (m) {
    dropPastDays = Number(m[1])
    return false
  }
  return true
})
const [outputPath, ...inputs] = outputAndInputs

if (!outputPath || inputs.length === 0) {
  console.error('kullanım: node merge.mjs <çıktı.json> <girdi1.json> [girdi2.json ...]')
  process.exit(1)
}

// İki kaynak aynı kanala farklı gerçek id verebiliyor (dsmart "cnbceuropeuk",
// digiturk "cnbce"). Alias tablosu bunları tek id'de toplar; olmazsa kanal
// listede iki kez görünür.
let aliases = {}
if (existsSync('channel-aliases.json')) {
  try {
    aliases = JSON.parse(readFileSync('channel-aliases.json', 'utf8'))
  } catch (err) {
    console.warn(`channel-aliases.json okunamadı: ${err.message}`)
  }
}
const alias = (id) => aliases[id] ?? id

const channels = new Map()
const programmes = new Map()
const stats = []

for (const path of inputs) {
  if (!existsSync(path)) {
    console.log(`${path}: yok, atlanıyor`)
    continue
  }

  let data
  try {
    data = JSON.parse(readFileSync(path, 'utf8'))
  } catch (err) {
    // Bozuk bir yan dosya yüzünden yayın durmasın; birincil dosya zaten
    // check.mjs tarafından doğrulanıyor.
    console.warn(`${path}: okunamadı (${err.message}), atlanıyor`)
    continue
  }

  let newChannels = 0
  let newProgrammes = 0

  for (const c of data.channels ?? []) {
    if (!c?.id) continue
    const id = alias(c.id)
    const existing = channels.get(id)
    if (!existing) {
      channels.set(id, { ...c, id })
      newChannels++
    } else {
      // Eksik alanları doldur (logo/kategori bir kaynakta olmayabilir)
      existing.logo ??= c.logo ?? null
      existing.category ??= c.category ?? null
    }
  }

  for (const p of data.programmes ?? []) {
    if (!p?.channel || !p?.start) continue
    const channel = alias(p.channel)
    const key = `${channel}|${p.start}`
    if (!programmes.has(key)) {
      programmes.set(key, { ...p, channel })
      newProgrammes++
    }
  }

  stats.push(`${path}: +${newChannels} kanal, +${newProgrammes} program`)
}

if (dropPastDays !== null) {
  const cutoff = Date.now() - dropPastDays * 86_400_000
  let dropped = 0
  for (const [key, p] of programmes) {
    if ((Date.parse(p.stop) || 0) < cutoff) {
      programmes.delete(key)
      dropped++
    }
  }
  if (dropped) console.log(`  ${dropped} eski program budandı (>${dropPastDays} gün)`)
}

// Programı olmayan kanalı yayınlama (uygulamada boş satır olarak görünür).
const withProgrammes = new Set([...programmes.values()].map((p) => p.channel))
const channelList = [...channels.values()]
  .filter((c) => withProgrammes.has(c.id))
  .sort((a, b) => a.name.localeCompare(b.name, 'tr'))

const programmeList = [...programmes.values()]
  .filter((p) => withProgrammes.has(p.channel))
  .sort((a, b) => a.channel.localeCompare(b.channel) || a.start.localeCompare(b.start))

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(
  outputPath,
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    channels: channelList,
    programmes: programmeList,
  }),
  'utf8'
)

for (const line of stats) console.log('  ' + line)
console.log(`${outputPath}: ${channelList.length} kanal, ${programmeList.length} program`)
