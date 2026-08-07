# tv-epg — kurulum rehberi

Bu klasör, "Bugün TV'de" uygulamasının yayın akışı verisini üreten otomatik sistemdir.
**Ayrı bir GitHub reposu olacak şekilde hazırlandı.**

---

## Önce: bu ne işe yarıyor?

Uygulama açıldığında internetten bir JSON dosyası indiriyor; içinde kanallar ve
programlar var. Birinin bu dosyayı **düzenli olarak üretip bir adreste yayınlaması**
gerekiyor. Kendi sunucunu kiralamadan bunu yapmanın ücretsiz yolu:

- **GitHub Actions** — GitHub'ın sunucusunda çalışan zamanlanmış görev. Senin bilgisayarın
  kapalıyken de çalışır. Public repolarda ücretsiz.
- **GitHub Pages** — üretilen dosyanın yayınlandığı ücretsiz statik adres.

Akış şöyle:

```
   GitHub Actions  (günde 2 kez, otomatik)
        │
        │  1. iptv-org/epg'yi indirir, TV operatörü sitelerinden
        │     7 günlük akışı çeker                        →  guide.xml
        │  2. convert.mjs bunu uygulamanın formatına çevirir →  turkey.json
        │  3. check.mjs dosyayı kontrol eder (bozuksa durur)
        ▼
   GitHub Pages
   https://esinik.github.io/tv-epg/turkey.json
        ▼
   Uygulama  (açılışta indirir, çevrimdışı için önbelleğe alır)
```

Sen sadece **bir kez kurulum** yapıyorsun; sonrası kendi kendine dönüyor.

---

## Kurulum — 6 adım (~10 dakika)

### Adım 1 — GitHub'da boş bir repo aç

<https://github.com/new> adresine git:

- **Repository name:** `tv-epg`
- **Public** seç (Actions ve Pages public repoda ücretsiz)
- "Add a README file" kutusunu **işaretleme** (boş repo lazım)
- **Create repository**

### Adım 2 — Bu klasörü o repoya gönder

Terminalde, `tv_akisi` proje klasöründeyken:

```bash
cd pipeline
git init
git add -A
git commit -m "EPG pipeline"
git branch -M main
git remote add origin https://github.com/esinik/tv-epg.git
git push -u origin main
```

Push bittiğinde GitHub'daki repoyu yenile — `convert.mjs`, `check.mjs`, `.github` gibi
dosyaları görüyor olmalısın.

### Adım 3 — Pages'i aç

Repo sayfasında: **Settings** (üst menü) → sol menüde **Pages** →
**Build and deployment** başlığı altında **Source** açılır listesinden **GitHub Actions**
seç.

> Ayrı bir "Save" düğmesi yok; seçtiğin anda kaydedilir.

### Adım 4 — İlk çalıştırmayı elle tetikle

Cron'u beklemene gerek yok:

**Actions** sekmesi → sol listede **build-epg** → sağ üstte **Run workflow** düğmesi →
açılan küçük kutuda tekrar **Run workflow**.

Ne göreceksin:

- Listede sarı nokta 🟡 belirir = çalışıyor (TV sitelerinden veri çekmek **3–6 dakika**
  sürer, normal)
- Yeşil tik ✅ = bitti, dosya yayınlandı
- Kırmızı çarpı ❌ = bir sorun var → aşağıdaki "Ters giderse" bölümüne bak

### Adım 5 — Adresi kontrol et

Tarayıcıda aç:

```
https://esinik.github.io/tv-epg/turkey.json
```

Ekranı dolduran bir JSON metni görüyorsan tamamdır. (İlk Pages yayını bazen 1–2 dakika
gecikir; 404 görürsen biraz bekleyip yenile.)

`https://esinik.github.io/tv-epg/` adresi de küçük bir açıklama sayfası gösterir.

### Adım 6 — Adresi uygulamaya yaz

`lib/features/schedule/presentation/epg_providers.dart` dosyasında tek satır:

```dart
const iptvOrgEndpoint = 'https://esinik.github.io/tv-epg/turkey.json';
```

Uygulamayı çalıştır — Kanallar sekmesi artık dolu gelmeli.

---

## Kurulumdan sonra

Sistem günde iki kez kendi kendine çalışır: **03:00 ve 15:00** (Türkiye saati).
Workflow dosyasındaki satır bunu belirler:

```yaml
- cron: "0 0,12 * * *"    # UTC 00:00 ve 12:00 = TR 03:00 ve 15:00
```

GitHub cron'u her zaman UTC olarak yorumlar, o yüzden 3 saat geri yazılmış durumda.
Sıklığı değiştirmek istersen `.github/workflows/build-epg.yml` içinden düzenle.

> ⚠️ **GitHub'ın bir kuralı:** bir repoda **60 gün** hiç hareket olmazsa zamanlanmış
> görevleri otomatik durdurur ve sana e-posta atar. Repoya ara sıra bir commit atmak ya da
> Actions'tan elle bir kez çalıştırmak sayacı sıfırlar.

---

## Ters giderse

**Actions'ta kırmızı çarpı var.** Çalışmaya tıkla, hangi adımın kırmızı olduğuna bak:

| Kırmızı olan adım | Anlamı | Ne yapmalı |
|---|---|---|
| `iptv-org/epg ile XMLTV üret` | Kaynak site yapısını değiştirmiş veya erişilemiyor | `build-epg.yml` içindeki `--sites=` listesinden sorunlu siteyi çıkar, tek siteyle dene |
| `Çıktıyı doğrula` | Veri geldi ama beklenenden az | Aynı çalışmanın altındaki **Artifacts → guide-xml** dosyasını indir, ham veriye bak |
| `deploy` | Pages ayarı eksik | Adım 3'ü kontrol et: Source **GitHub Actions** mı? |

Doğrulama adımı bilerek sert: bozuk dosya yayınlanmaz, Pages'teki **eski çalışan dosya**
yerinde kalır. Uygulama da offline-first olduğu için kullanıcı bunu fark etmez.

**Adres 404 veriyor.** Pages'in ilk yayını birkaç dakika sürebilir. Hâlâ 404 ise:
Settings → Pages'te en üstte yeşil "Your site is live at..." yazısı var mı?

**Uygulamada liste boş.** Önce adresi tarayıcıda aç. JSON geliyorsa sorun uygulamadaki
sabitte (Adım 6). JSON gelmiyorsa Actions'a bak.

---

## Dosyalar ne yapıyor

| Dosya | İşi |
|---|---|
| `.github/workflows/build-epg.yml` | Zamanlama + tüm adımlar. GitHub bu dosyayı okuyup çalıştırıyor |
| `convert.mjs` | XMLTV → uygulamanın JSON formatı |
| `check.mjs` | Yayın öncesi kalite kontrolü |
| `channels.overrides.json` | Kanal adı/kategori düzeltmeleri |
| `public/index.html` | Adresin kök sayfası (açıklama metni) |

---

## Ayarlamak isteyebileceklerin

**Hangi siteler.** `build-epg.yml` içindeki `--sites=` satırı. iptv-org/epg'nin çalışan
Türkiye kaynakları:

| Site | Kanal |
|---|---|
| `turksatkablo.com.tr` | 177 |
| `tvplus.com.tr` | 150 |
| `digiturk.com.tr` | 112 |
| `dsmart.com.tr` | 100 |

Şu an ilk ikisi kullanılıyor. Tek site yetmiyor: bazı kanalların (Star, NOW gibi) tek bir
sitede `xmltv_id` alanı boş olduğu için o kanallar atlanıyor; ikinci site boşlukları
dolduruyor. Site eklemek kanal sayısını artırır ama çalışma süresini ve hata olasılığını da
artırır.

**Kaç günlük akış.** `--days=7`. Uygulamadaki gün seçici ±7 gün gösteriyor, 7 yeterli.

**Kanal adı / kategori.** XMLTV kategori bilgisi taşımıyor ve kanal adları kaynağa göre
değişiyor ("Atv", "ATV", "atv HD"). `channels.overrides.json` bunları düzeltir:

```json
{ "trt1": { "name": "TRT 1", "category": "ulusal" } }
```

Geçerli kategoriler: `ulusal, haber, spor, cocuk, muzik, belgesel, eglence, other`.

**Kanal id'leri.** `convert.mjs` içindeki `canonicalId()`, uygulamadaki
`IdUtils.canonical` ile aynı sonucu üretir:

```
TRT1.tr@SD  →  trt1
KanalD.tr   →  kanald
```

İki kaynak aynı kanalı çok farklı adlandırırsa uygulamadaki
`lib/features/schedule/data/id_utils.dart` içindeki alias haritasına ekle.

---

## Kendi bilgisayarında denemek (isteğe bağlı)

Actions'a hiç dokunmadan, veriyi yerelde üretip görmek istersen:

```bash
npm install
git clone --depth 1 https://github.com/iptv-org/epg.git .epg
cd .epg && npm ci
npm run grab --- --sites=turksatkablo.com.tr --lang=tr --days=2 --output=../guide.xml
cd ..
node convert.mjs guide.xml public/turkey.json
node check.mjs public/turkey.json
```

Node.js kurulu olmalı (`node --version` ile kontrol et; yoksa `brew install node`).
