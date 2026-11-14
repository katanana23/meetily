#!/usr/bin/env bash
# Тест scripts/migrate-from-aid.sh на подставном HOME с вымышленными данными.
# Случаи из таблицы PR: первый прогон, повторный прогон, нет старых данных, прерывание,
# цель уже создана приложением, приложение запущено, архив старого.
# Запуск: bash scripts/test-migrate-from-aid.sh (macOS и Linux; нужны python3 и bash).

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$HERE/migrate-from-aid.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
NO_APP="$WORK/no-app.sh"
printf '#!/bin/sh\nexit 1\n' > "$NO_APP"; chmod +x "$NO_APP"
APP_RUNS="$WORK/app-runs.sh"
printf '#!/bin/sh\n[ "$2" = Shade ]\n' > "$APP_RUNS"; chmod +x "$APP_RUNS"

PASS=0
ok() { PASS=$((PASS + 1)); printf 'ok   %s\n' "$1"; }
no() { printf 'FAIL %s\n' "$1" >&2; exit 1; }
check() { if eval "$2"; then ok "$1"; else no "$1"; fi; }

run() { # HOME [ключи...] -> вывод в $WORK/out, код в RC
  local home="$1"; shift
  set +e
  HOME="$home" SHADE_MIGRATE_PGREP="${PGREP_STUB:-$NO_APP}" bash "$SCRIPT" "$@" >"$WORK/out" 2>&1
  RC=$?
  set -e
}

# Вымышленные старые данные: две встречи, одна в корзине, одна с папкой вне записей.
seed() {
  local h="$1"
  local as="$h/Library/Application Support"
  local data="$as/io.github.katanana23.aid-meetings"
  local rec="$h/Movies/aid-meetings-recordings"
  local trash="$rec/Корзина ShadeNotes"
  mkdir -p "$data/models/parakeet/m" "$as/Aid Meetings" "$rec/Meeting A" "$trash/Meeting B" \
    "$h/Library/WebKit/io.github.katanana23.aid-meetings/WebsiteData/Default/h1/h1/LocalStorage" \
    "$h/Library/Caches/io.github.katanana23.aid-meetings" "$h/Other"
  printf 'model' > "$data/models/parakeet/m/encoder.onnx"
  printf '{"status":{"completed":true}}' > "$data/onboarding-status.json"
  printf '{}' > "$data/recording_preferences.json"
  printf '{"enabled":true}' > "$as/Aid Meetings/notifications.json"
  printf 'audio' > "$rec/Meeting A/audio.mp4"
  printf 'audio' > "$trash/Meeting B/audio.mp4"
  printf '{"trashedAt":1,"name":"B","meetingId":"m-b","from":"%s/Meeting B","title":"B"}' "$rec" > "$trash/Meeting B/trashed.json"
  printf 'cache' > "$h/Library/Caches/io.github.katanana23.aid-meetings/c"
  mkdir -p "$h/Other/Meeting C"
  python3 -I - "$data/meeting_minutes.sqlite" "$rec" "$h/Other" \
    "$h/Library/WebKit/io.github.katanana23.aid-meetings/WebsiteData/Default/h1/h1/LocalStorage/localstorage.sqlite3" <<'PY'
import json, sqlite3, sys
db, rec, other, ls = sys.argv[1:]
c = sqlite3.connect(db)
c.execute('CREATE TABLE meetings (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, folder_path TEXT)')
c.executemany('INSERT INTO meetings VALUES (?,?,?,?,?)', [
    ('m-a', 'A', '1', '1', rec + '/Meeting A'),
    ('m-b', 'B', '1', '1', rec + '/Корзина ShadeNotes/Meeting B'),
    ('m-c', 'C', '1', '1', other + '/Meeting C'),
])
c.commit(); c.close()
c = sqlite3.connect(ls)
c.execute('CREATE TABLE ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB NOT NULL ON CONFLICT FAIL)')
items = {
    'aid.meetingTrash.v1': json.dumps([{'id': 'm-a', 'title': 'A', 'folder': rec + '/Meeting A', 'trashedFolder': None, 'at': 1}]),
    'aid.recordingMarks.v1': json.dumps({'kept': ['m-a']}),
    'aid.micAccess.v1': 'granted',
    'aid-meetings.theme': 'dark',
    'primaryLanguage': 'ru',
}
c.executemany('INSERT INTO ItemTable VALUES (?, ?)', [(k, v.encode('utf-16-le')) for k, v in items.items()])
c.commit(); c.close()
PY
}

snapshot() { # хеш всех файлов дерева (имена и содержимое)
  python3 -I - "$1" <<'PY'
import hashlib, os, sys
h = hashlib.sha256()
for root, dirs, files in sorted(os.walk(sys.argv[1])):
    dirs.sort()
    for f in sorted(files):
        p = os.path.join(root, f)
        h.update(os.path.relpath(p, sys.argv[1]).encode())
        h.update(open(p, 'rb').read())
print(h.hexdigest())
PY
}

q() { python3 -I -c "$1" "${@:2}"; }

# --- 1. Первый прогон ---------------------------------------------------------------
H="$WORK/h1"; seed "$H"
OLD_SNAP="$(snapshot "$H/Movies/aid-meetings-recordings")$(snapshot "$H/Library/Application Support/io.github.katanana23.aid-meetings")"
run "$H"
cat "$WORK/out"
NEW_AS="$H/Library/Application Support/io.github.katanana23.shade"
NEW_REC="$H/Movies/Shade"
check "первый прогон: выход 0" '[ "$RC" = 0 ]'
check "первый прогон: проверка прошла" 'grep -q "всё сходится" "$WORK/out"'
check "база перенесена с меткой" '[ -f "$NEW_AS/meeting_minutes.sqlite" ] && [ -f "$NEW_AS/.shade-migrated" ]'
check "модели перенесены" '[ "$(cat "$NEW_AS/models/parakeet/m/encoder.onnx")" = model ]'
check "folder_path: запись и корзина на новых путях, чужая папка не тронута" '[ "$(q "import sqlite3,sys; print(\"|\".join(r[0] for r in sqlite3.connect(sys.argv[1]).execute(\"select folder_path from meetings order by id\")))" "$NEW_AS/meeting_minutes.sqlite")" = "$NEW_REC/Meeting A|$NEW_REC/Корзина Shade/Meeting B|$H/Other/Meeting C" ]'
check "корзина переименована" '[ -d "$NEW_REC/Корзина Shade/Meeting B" ] && [ ! -e "$NEW_REC/Корзина ShadeNotes" ]'
check "метка корзины: from на новом пути" 'grep -q "\"from\": *\"$NEW_REC/Meeting B\"" "$NEW_REC/Корзина Shade/Meeting B/trashed.json"'
check "настройки уведомлений перенесены" '[ -f "$H/Library/Application Support/Shade/notifications.json" ]'
check "кеш перенесён" '[ -f "$H/Library/Caches/io.github.katanana23.shade/c" ]'
LS_NEW="$H/Library/WebKit/io.github.katanana23.shade/WebsiteData/Default/h1/h1/LocalStorage/localstorage.sqlite3"
KEYS="$(q "import sqlite3,sys; print(','.join(sorted(k for (k,) in sqlite3.connect(sys.argv[1]).execute('select key from ItemTable'))))" "$LS_NEW")"
check "localStorage: ключи shade.*, без aid.* и micAccess" '[ "$KEYS" = "primaryLanguage,shade.meetingTrash.v1,shade.recordingMarks.v1,shade.theme" ]'
check "localStorage: путь в корзине и тема" '[ "$(q "import sqlite3,sys,json; c=sqlite3.connect(sys.argv[1]); g=lambda k: bytes(c.execute(\"select value from ItemTable where key=?\",(k,)).fetchone()[0]).decode(\"utf-16-le\"); print(json.loads(g(\"shade.meetingTrash.v1\"))[0][\"folder\"], g(\"shade.theme\"))" "$LS_NEW")" = "$NEW_REC/Meeting A dark" ]'
check "старое не тронуто" '[ "$(snapshot "$H/Movies/aid-meetings-recordings")$(snapshot "$H/Library/Application Support/io.github.katanana23.aid-meetings")" = "$OLD_SNAP" ]'
check "временных папок не осталось" '[ -z "$(find "$H" -name "*.shade-migrating*")" ]'

# --- 2. Повторный прогон -------------------------------------------------------------
BEFORE="$(snapshot "$H")"
run "$H"
check "повторный прогон: выход 0, всё уже перенесено" '[ "$RC" = 0 ] && [ "$(grep -c "уже перенесено" "$WORK/out")" = 5 ] && grep -q "всё сходится" "$WORK/out"'
check "повторный прогон: дерево не изменилось" '[ "$(snapshot "$H")" = "$BEFORE" ]'

# --- 3. Нет старых данных ------------------------------------------------------------
E="$WORK/empty"; mkdir -p "$E"
run "$E"
check "нет старых данных: выход 0" '[ "$RC" = 0 ]'
check "нет старых данных: ничего не создано" '[ -z "$(find "$E" -mindepth 1)" ]'

# --- 4. Прерывание на середине ------------------------------------------------------
I="$WORK/int"; seed "$I"
set +e
HOME="$I" SHADE_MIGRATE_PGREP="$NO_APP" SHADE_MIGRATE_STOP_AFTER_COPY=recordings bash "$SCRIPT" >"$WORK/out" 2>&1; RC=$?
set -e
check "прерывание: скрипт оборвался" '[ "$RC" = 3 ]'
check "прерывание: записи только во временной папке, цели нет" '[ -d "$I/Movies/Shade.shade-migrating" ] && [ ! -e "$I/Movies/Shade" ]'
check "прерывание: старые записи целы" '[ -f "$I/Movies/aid-meetings-recordings/Meeting A/audio.mp4" ]'
run "$I"
check "после прерывания: повторный прогон доводит до конца" '[ "$RC" = 0 ] && [ -f "$I/Movies/Shade/.shade-migrated" ] && grep -q "всё сходится" "$WORK/out"'
check "после прерывания: неполная копия отложена, не удалена" '[ -n "$(find "$I/Movies" -maxdepth 1 -name "Shade.shade-migrating.stale-*")" ]'

# --- 5. Цель уже создана приложением ------------------------------------------------
P="$WORK/pre"; seed "$P"
mkdir -p "$P/Library/Application Support/io.github.katanana23.shade"; printf 'fresh' > "$P/Library/Application Support/io.github.katanana23.shade/meeting_minutes.sqlite"
run "$P"
check "цель без метки: отложена, перенос прошёл" '[ "$RC" = 0 ] && [ -n "$(find "$P/Library/Application Support" -maxdepth 1 -name "io.github.katanana23.shade.pre-migration-*")" ] && [ -f "$P/Library/Application Support/io.github.katanana23.shade/.shade-migrated" ]'

# --- 6. Приложение запущено --------------------------------------------------------
R="$WORK/run"; seed "$R"
PGREP_STUB="$APP_RUNS" run "$R"
check "приложение запущено: отказ" '[ "$RC" = 1 ] && grep -q "запущено приложение" "$WORK/out"'
check "приложение запущено: ничего не создано" '[ ! -e "$R/Movies/Shade" ] && [ ! -e "$R/Library/Application Support/io.github.katanana23.shade" ]'

# --- 7. Архив старого ---------------------------------------------------------------
A="$WORK/arc"; seed "$A"
run "$A" --archive-old
check "архив без переноса: отказ, старое на месте" '[ "$RC" = 1 ] && [ -d "$A/Movies/aid-meetings-recordings" ]'
run "$A"; run "$A" --archive-old
check "архив после переноса: старое в _to_delete" '[ "$RC" = 0 ] && [ -d "$A/Movies/_to_delete/aid-meetings-recordings" ] && [ -d "$A/Library/Application Support/_to_delete/io.github.katanana23.aid-meetings" ] && [ ! -e "$A/Movies/aid-meetings-recordings" ]'
check "архив: новое на месте" '[ -f "$A/Movies/Shade/Meeting A/audio.mp4" ]'
run "$A"
check "после архива: повторный прогон спокоен" '[ "$RC" = 0 ] && grep -q "всё сходится" "$WORK/out"'

printf '\nВсе проверки прошли: %s\n' "$PASS"
