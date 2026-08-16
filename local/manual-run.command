#!/bin/bash
# Finder'dan çift tıklayınca EPG güncellemesini elle çalıştırır.
# Kurulumda ~/TV-Akisi-EPG-Guncelle.command olarak kopyalanır.
cd "$HOME/Library/Application Support/tv-akisi-epg/repo" || exit 1
./local/run.sh
echo
echo "Bitti. Bu pencereyi kapatabilirsin."
