// XMLTV (iptv-org/epg çıktısı) -> "Bugün TV'de" uygulamasının beklediği JSON.
//
//   node convert.mjs guide.xml public/turkey.json
//
// Çıktı şekli (lib/features/schedule/data/iptv_org_source.dart ile birebir):
// {
//   "generatedAt": "2026-08-06T03:12:00+03:00",
//   "channels":   [{"id","name","logo","category"}],
//   "programmes": [{"channel","title","desc","start","stop","category","image"}]
// }

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { XMLParser } from 'fast-xml-parser'

const [, , inputPath = 'guide.xml', outputPath = 'public/turkey.json'] = process.argv

/** Kanal id'sini uygulamadaki IdUtils.canonical ile aynı biçime indirger. */
export function canonicalId(raw) {
  let s = String(raw ?? '').trim().toLowerCase()
  s = s.replace(/@.*$/, '') // "trt1.tr@SD" -> "trt1.tr"  (SD/HD/FHD varyantları)
  s = s.replace(/\.(tr|com|net)$/, '') // "trt1.tr" -> "trt1"
  s = s.replace(/[\s._-]/g, '') // "kanal d" -> "kanald"
  return s
}

/**
 * Kaynakta `xmltv_id` boş olan kanallara grabber sitenin iç id'sini veriyor
 * ("58d29bb0eefad3db9c6062bf" gibi). Bunlar okunaksız ve `channels.overrides.json`
 * ile eşleşmiyor; böyle id'leri kanal adından türetiyoruz ("BBC Earth" -> "bbcearth").
 */
const isOpaqueId = (id) => /^[0-9a-f]{20,}$/.test(id)

/** "20260806193000 +0300" -> "2026-08-06T19:30:00+03:00" */
export function xmltvToIso(value) {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?$/.exec(
    String(value ?? '').trim()
  )
  if (!m) return null
  const [, y, mo, d, h, mi, s = '00', off] = m
  // Kaynak saat dilimi vermezse Türkiye saati varsayılır (yayıncılar TR saatiyle yayınlar).
  const offset = off ? `${off.slice(0, 3)}:${off.slice(3)}` : '+03:00'
  return `${y}-${mo}-${d}T${h}:${mi}:${s}${offset}`
}

const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v])

/** XMLTV alanları düz metin, {#text} veya dizi olabilir; ilk dolu değeri döndürür. */
function text(node) {
  for (const item of asArray(node)) {
    if (typeof item === 'string' || typeof item === 'number') {
      const s = String(item).trim()
      if (s) return s
    } else if (item && typeof item === 'object') {
      const s = String(item['#text'] ?? '').trim()
      if (s) return s
    }
  }
  return null
}

function iconSrc(node) {
  for (const item of asArray(node)) {
    const src = item?.['@_src']
    if (src) return String(src)
  }
  return null
}

function loadOverrides() {
  const path = 'channels.overrides.json'
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (err) {
    console.warn(`channels.overrides.json okunamadı, yok sayılıyor: ${err.message}`)
    return {}
  }
}

function main() {
  const xml = readFileSync(inputPath, 'utf8')
  // processEntities'in varsayılan sınırı 1000 toplam genişletme; 7 günlük rehberde
  // program başlıklarındaki &amp; / &#39; gibi varlıklar bunu kolayca aşıyor.
  // Sınırı yükseltiyoruz ama kapatmıyoruz: XMLTV üçüncü taraf bir siteden geliyor,
  // "XML bomb" koruması sonsuza açılmasın.
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    // htmlEntities olmadan "&#252;" gibi sayısal varlıklar metinde ham kalıyor
    // (Türkçe karakterler bazı kaynaklarda böyle geliyor).
    htmlEntities: true,
    processEntities: {
      enabled: true,
      maxTotalExpansions: 5_000_000,
      maxEntityCount: 100_000,
    },
  })
  const tv = parser.parse(xml)?.tv
  if (!tv) throw new Error(`${inputPath} içinde <tv> kökü bulunamadı`)

  const overrides = loadOverrides()

  // --- kanallar: id bazında tekilleştir, ilk gelen kazanır, eksikleri doldur ---
  const channels = new Map()
  const idMap = new Map() // XMLTV'deki id -> yayınlanan id (programlar için de gerekli)
  let renamed = 0
  for (const raw of asArray(tv.channel)) {
    const sourceId = canonicalId(raw['@_id'])
    if (!sourceId) continue
    const name = text(raw['display-name']) ?? sourceId

    // Opak id'yi ada çevir; ad başka bir kanalda kullanılıyorsa opak id'de kal.
    let id = sourceId
    if (isOpaqueId(sourceId)) {
      const slug = canonicalId(name)
      if (slug && !channels.has(slug)) {
        id = slug
        renamed++
      }
    }
    idMap.set(sourceId, id)

    const logo = iconSrc(raw.icon)
    const existing = channels.get(id)
    if (existing) {
      existing.logo ??= logo
      continue
    }
    channels.set(id, { id, name, logo, category: null })
  }

  // --- programlar: kanal + başlangıç bazında tekilleştir ---
  const programmes = new Map()
  let skipped = 0
  for (const raw of asArray(tv.programme)) {
    const sourceChannel = canonicalId(raw['@_channel'])
    const channel = idMap.get(sourceChannel) ?? sourceChannel
    const start = xmltvToIso(raw['@_start'])
    const stop = xmltvToIso(raw['@_stop'])
    const title = text(raw.title)
    if (!channel || !start || !stop || !title) {
      skipped++
      continue
    }
    if (new Date(stop) <= new Date(start)) {
      skipped++
      continue
    }
    const key = `${channel}|${start}`
    if (programmes.has(key)) continue
    programmes.set(key, {
      channel,
      title,
      desc: text(raw.desc),
      start,
      stop,
      category: text(raw.category),
      image: iconSrc(raw.icon),
    })
  }

  // Programı olmayan kanalı listeleme (grabber boş kanal da üretebiliyor).
  const withProgrammes = new Set([...programmes.values()].map((p) => p.channel))
  const channelList = [...channels.values()]
    .filter((c) => withProgrammes.has(c.id))
    .map((c) => ({ ...c, ...(overrides[c.id] ?? {}) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'))

  const programmeList = [...programmes.values()]
    .filter((p) => withProgrammes.has(p.channel))
    .sort((a, b) => a.channel.localeCompare(b.channel) || a.start.localeCompare(b.start))

  const output = {
    generatedAt: new Date().toISOString(),
    channels: channelList,
    programmes: programmeList,
  }

  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, JSON.stringify(output), 'utf8')

  console.log(
    `${outputPath}: ${channelList.length} kanal, ${programmeList.length} program` +
      (skipped ? ` (${skipped} kayıt atlandı)` : '') +
      (renamed ? `, ${renamed} kanalın id'si adından türetildi` : '')
  )
}

main()
