#!/bin/bash
# digiturk akışını bu Mac'ten (Türkiye IP) çeker, dönüştürür ve repoya işler.
#
#   ./local/run.sh            # normal çalışma (launchd bunu çağırır)
#   ./local/run.sh --no-push  # sadece üret, push etme (deneme için)
#
# Neden Mac'te: digiturk.com.tr GitHub runner'ının ABD IP'sine 403 veriyor,
# Türkiye'den sorunsuz cevap veriyor. Üretilen data/digiturk.json'ı CI her
# çalıştığında taze dsmart verisiyle birleştirip yayınlıyor.
set -uo pipefail

cd "$(dirname "$0")/.."
REPO_DIR="$(pwd)"
LOG_DIR="$HOME/Library/Logs/tv-akisi-epg"
mkdir -p "$LOG_DIR"

# launchd asgari bir PATH ile çalışır; node ve git'i bulabilmesi için genişlet.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

notify() {  # notify "başlık" "mesaj"
  /usr/bin/osascript -e "display notification \"${2//\"/\\\"}\" with title \"${1//\"/\\\"}\"" \
    >/dev/null 2>&1 || true
}

fail() {
  echo "HATA: $1"
  notify "Bugün TV'de — EPG" "$1"
  exit 1
}

command -v node >/dev/null 2>&1 || fail "node bulunamadı (PATH: $PATH)"

# İnternet yoksa sessizce ve anlaşılır şekilde çık — bu makinede bağlantı
# zaman zaman kopuyor, her seferinde yığın izi basmanın anlamı yok.
/usr/bin/curl -sS -m 15 -o /dev/null https://api.github.com || \
  fail "İnternet erişimi yok, atlandı. Müsait olunca elle çalıştır."

echo "== $(date '+%Y-%m-%d %H:%M') digiturk çekimi =="

# 1) iptv-org/epg (ilk seferde klonla, sonra güncelle)
EPG_DIR="$HOME/Library/Application Support/tv-akisi-epg/iptv-org-epg"
if [ -d "$EPG_DIR/.git" ]; then
  git -C "$EPG_DIR" pull --quiet --ff-only || echo "uyarı: epg deposu güncellenemedi, mevcut kopya kullanılıyor"
else
  mkdir -p "$(dirname "$EPG_DIR")"
  git clone --depth 1 --quiet https://github.com/iptv-org/epg.git "$EPG_DIR" || fail "iptv-org/epg klonlanamadı"
fi

( cd "$EPG_DIR" && npm ci --silent ) || fail "epg bağımlılıkları kurulamadı"

# 2) Çek
GUIDE="$REPO_DIR/.local-guide.xml"
rm -f "$GUIDE"
( cd "$EPG_DIR" && npm run grab --- \
    --sites=digiturk.com.tr \
    --lang=tr \
    --days=7 \
    --timeout=20000 \
    --maxConnections=5 \
    --output="$GUIDE" ) || fail "digiturk çekimi başarısız"

[ -s "$GUIDE" ] || fail "guide.xml boş çıktı"

# 3) Dönüştür (CI ile aynı dönüştürücü — id/saat mantığı tek yerde)
npm install --silent >/dev/null 2>&1 || true
node convert.mjs "$GUIDE" data/digiturk.json || fail "dönüştürme başarısız"

SUMMARY=$(node -e '
  const d = require("./data/digiturk.json");
  const now = Date.now();
  const future = d.programmes.filter(p => Date.parse(p.stop) > now).length;
  console.log(`${d.channels.length} kanal, ${d.programmes.length} program (${future} tanesi ileriye dönük)`);
')
echo "  $SUMMARY"

# ATV bu işin bütün sebebi; gelmediyse bilmek isteriz.
if node -e 'const d=require("./data/digiturk.json"); process.exit(d.channels.some(c=>/^atv/i.test(c.name))?0:1)'; then
  ATV="ATV ✓"
else
  ATV="ATV yok ⚠︎"
fi

rm -f "$GUIDE"

if [ "${1:-}" = "--no-push" ]; then
  echo "  (--no-push) data/digiturk.json güncellendi, push edilmedi"
  notify "Bugün TV'de — EPG" "$SUMMARY · $ATV (push edilmedi)"
  exit 0
fi

# 4) Repoya işle. Değişiklik yoksa boş commit atma.
if git diff --quiet -- data/digiturk.json 2>/dev/null; then
  echo "  değişiklik yok"
  notify "Bugün TV'de — EPG" "Veri aynı, push gerekmedi · $ATV"
  exit 0
fi

git add data/digiturk.json
git -c user.name="Ertan Şinik" -c user.email="ertansinik@gmail.com" \
    commit -q -m "digiturk: $(date '+%Y-%m-%d %H:%M') — $SUMMARY" || fail "commit başarısız"

# GH_TOKEN kabuk profilinde tanımlı; launchd profil okumadığı için buradan alıyoruz.
# Token yalnızca bu sürecin belleğine giriyor, ikinci bir dosyaya yazılmıyor.
if [ -z "${GH_TOKEN:-}" ] && [ -f "$HOME/.zshenv" ]; then
  GH_TOKEN=$(grep -m1 '^export GH_TOKEN=' "$HOME/.zshenv" | sed 's/^export GH_TOKEN=//; s/^"//; s/"$//')
  export GH_TOKEN
fi
[ -n "${GH_TOKEN:-}" ] || fail "GH_TOKEN bulunamadı (~/.zshenv içinde tanımlı olmalı)"

git -c credential.helper= -c credential.helper='!gh auth git-credential' \
    push -q origin main || fail "push başarısız (commit yerel olarak duruyor)"

echo "  push tamam"
notify "Bugün TV'de — EPG" "Güncellendi: $SUMMARY · $ATV"
