#!/usr/bin/env bash
# Перенос данных со старых имён (Aid Meetings, ShadeNotes) на Shade. macOS.
#
#   scripts/migrate-from-aid.sh               перенести и проверить
#   scripts/migrate-from-aid.sh --check       только проверить перенесённое
#   scripts/migrate-from-aid.sh --archive-old старые папки -> _to_delete рядом с ними
#
# Что переносится (старое -> новое):
#   ~/Library/Application Support/io.github.katanana23.aid-meetings -> .../io.github.katanana23.shade
#       база meeting_minutes.sqlite (folder_path правится), модели, настройки
#   ~/Library/Application Support/Aid Meetings -> .../Shade        (notifications.json, свои шаблоны)
#   ~/Movies/aid-meetings-recordings -> ~/Movies/Shade             (записи; «Корзина ShadeNotes» -> «Корзина Shade»,
#                                                                   поле from в trashed.json правится)
#   ~/Library/WebKit/io.github.katanana23.aid-meetings -> .../io.github.katanana23.shade
#   ~/Library/WebKit/ShadeNotes -> ~/Library/WebKit/Shade          (хранилище окна при tauri dev)
#       localStorage: aid.* -> shade.*, aid-meetings.theme -> shade.theme, пути записей правятся;
#       aid.micAccess.v1 не переносится: для macOS это новое приложение, доступ проверится заново
#   ~/Library/Caches/io.github.katanana23.aid-meetings, ~/Library/Caches/ShadeNotes -> ... (как есть)
#   ~/Library/Preferences/io.github.katanana23.aid-meetings.plist  (если есть)
#
# Как переносится каждая папка: клон APFS (cp -c, место почти не занимает) во временную
# <цель>.shade-migrating, сверка diff -rq со старой, правка путей в копии, проверка,
# метка .shade-migrated и только потом mv во что-то с новым именем. Старое не удаляется.
#   Повторный запуск: цели с меткой пропускаются, итоговая проверка проходит снова.
#   Прерывание: остаётся только <цель>.shade-migrating; следующий запуск откладывает её
#   в <цель>.shade-migrating.stale-<время> и копирует заново.
#   Цель без метки (новое приложение запускали до переноса): откладывается в
#   <цель>.pre-migration-<время>, перенос идёт дальше.
#   Приложение запущено: отказ, ничего не тронуто.
#
# Только папка записей по умолчанию. Если в настройках выбрана своя папка, её записи
# остаются на месте и пути к ним в базе не меняются (скрипт об этом скажет).
#
# Для теста (scripts/test-migrate-from-aid.sh): HOME подменяется, SHADE_MIGRATE_PGREP
# заменяет pgrep, SHADE_MIGRATE_STOP_AFTER_COPY=<метка> обрывает работу после копии.

set -euo pipefail

L="$HOME/Library"
AS="$L/Application Support"
OLD_ID="io.github.katanana23.aid-meetings"
NEW_ID="io.github.katanana23.shade"
OLD_REC="$HOME/Movies/aid-meetings-recordings"
NEW_REC="$HOME/Movies/Shade"
OLD_TRASH="Корзина ShadeNotes"
NEW_TRASH="Корзина Shade"
STAMP=".shade-migrated"
TMP_SUFFIX=".shade-migrating"
TS="$(date +%Y%m%d-%H%M%S)"
PGREP="${SHADE_MIGRATE_PGREP:-pgrep}"

# метка|старое|новое|вид
PAIRS=(
  "data|$AS/$OLD_ID|$AS/$NEW_ID|appdata"
  "config|$AS/Aid Meetings|$AS/Shade|plain"
  "recordings|$OLD_REC|$NEW_REC|recordings"
  "webkit|$L/WebKit/$OLD_ID|$L/WebKit/$NEW_ID|webkit"
  "webkit-dev|$L/WebKit/ShadeNotes|$L/WebKit/Shade|webkit"
  "caches|$L/Caches/$OLD_ID|$L/Caches/$NEW_ID|plain"
  "caches-dev|$L/Caches/ShadeNotes|$L/Caches/Shade|plain"
  "prefs|$L/Preferences/$OLD_ID.plist|$L/Preferences/$NEW_ID.plist|file"
)

say() { printf '%s\n' "$*"; }
fail() { printf 'ОШИБКА: %s\n' "$*" >&2; exit 1; }

export OLD_REC NEW_REC OLD_TRASH NEW_TRASH

py() { python3 -I - "$@"; }

refuse_if_running() {
  local name
  for name in Shade ShadeNotes; do
    if "$PGREP" -x "$name" >/dev/null 2>&1; then
      fail "запущено приложение «$name». Закройте его (и tauri dev) и запустите скрипт снова. Ничего не тронуто."
    fi
  done
}

clone_copy() {
  # cp -c: клон APFS, место почти не занимает. Где клонов нет (другая ФС, Linux), обычная копия.
  if [ "$(uname)" = Darwin ] && cp -cRp "$1" "$2" 2>/dev/null; then return 0; fi
  rm -rf "$2" 2>/dev/null || true   # неполный клон: только что созданная копия, не данные
  cp -Rp "$1" "$2"
}

fix_appdata() { # $1 = копия папки данных
  local db="$1/meeting_minutes.sqlite"
  if [ -f "$db" ]; then
    py "$db" <<'PY'
import os, sqlite3, sys
OLD, NEW = os.environ['OLD_REC'], os.environ['NEW_REC']
MAP = [(OLD + '/' + os.environ['OLD_TRASH'], NEW + '/' + os.environ['NEW_TRASH']), (OLD, NEW)]
def remap(p):
    for a, b in MAP:
        if p == a or p.startswith(a + '/'):
            return b + p[len(a):]
    return p
c = sqlite3.connect(sys.argv[1])
ok = c.execute('PRAGMA integrity_check').fetchone()[0]
if ok != 'ok':
    sys.exit(f'база повреждена: {ok}')
rows = c.execute('SELECT id, folder_path FROM meetings').fetchall()
changed = 0
for mid, fp in rows:
    if fp and remap(fp) != fp:
        c.execute('UPDATE meetings SET folder_path = ? WHERE id = ?', (remap(fp), mid))
        changed += 1
c.commit()
left = c.execute("SELECT count(*) FROM meetings WHERE folder_path = ? OR folder_path LIKE ? ESCAPE '\\'",
                 (OLD, OLD.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '/%')).fetchone()[0]
other = sum(1 for _, fp in rows if fp and not (fp == OLD or fp.startswith(OLD + '/')))
c.execute('PRAGMA wal_checkpoint(TRUNCATE)')
c.close()
if left:
    sys.exit(f'в базе остались старые пути: {left}')
print(f'  база: встреч {len(rows)}, путей исправлено {changed}' + (f', вне папки по умолчанию {other} (не тронуты)' if other else ''))
PY
  fi
  # пути в настройках (recording_preferences.json и др.)
  py "$1" <<'PY'
import json, os, sys
OLD, NEW = os.environ['OLD_REC'], os.environ['NEW_REC']
def remap(v):
    if isinstance(v, str):
        return NEW + v[len(OLD):] if (v == OLD or v.startswith(OLD + '/')) else v
    if isinstance(v, list):
        return [remap(x) for x in v]
    if isinstance(v, dict):
        return {k: remap(x) for k, x in v.items()}
    return v
for name in sorted(os.listdir(sys.argv[1])):
    p = os.path.join(sys.argv[1], name)
    if not name.endswith('.json') or not os.path.isfile(p):
        continue
    try:
        data = json.load(open(p, encoding='utf-8'))
    except Exception:
        continue
    new = remap(data)
    if new != data:
        json.dump(new, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
        print(f'  {name}: путь к записям исправлен')
    if name == 'recording_preferences.json' and isinstance(new, dict):
        sf = new.get('save_folder')
        if isinstance(sf, str) and sf and not (sf == NEW or sf.startswith(NEW + '/')):
            print(f'  внимание: выбрана своя папка записей ({sf}); её записи и корзина остаются на месте')
PY
}

fix_recordings() { # $1 = копия папки записей
  if [ -d "$1/$OLD_TRASH" ]; then
    [ -e "$1/$NEW_TRASH" ] && fail "в папке записей уже есть и «$OLD_TRASH», и «$NEW_TRASH»: разберите вручную"
    mv "$1/$OLD_TRASH" "$1/$NEW_TRASH"
    say "  корзина: «$OLD_TRASH» -> «$NEW_TRASH»"
  fi
  if [ -d "$1/$NEW_TRASH" ]; then
    py "$1/$NEW_TRASH" <<'PY'
import json, os, sys
OLD, NEW = os.environ['OLD_REC'], os.environ['NEW_REC']
MAP = [(OLD + '/' + os.environ['OLD_TRASH'], NEW + '/' + os.environ['NEW_TRASH']), (OLD, NEW)]
def remap(p):
    for a, b in MAP:
        if p == a or p.startswith(a + '/'):
            return b + p[len(a):]
    return p
n = 0
for d in sorted(os.listdir(sys.argv[1])):
    m = os.path.join(sys.argv[1], d, 'trashed.json')
    if not os.path.isfile(m):
        continue
    data = json.load(open(m, encoding='utf-8'))
    if isinstance(data.get('from'), str) and remap(data['from']) != data['from']:
        data['from'] = remap(data['from'])
        json.dump(data, open(m, 'w', encoding='utf-8'), ensure_ascii=False)
        n += 1
print(f'  корзина: меток исправлено {n}')
PY
  fi
}

fix_webkit() { # $1 = копия хранилища WebKit
  py "$1" <<'PY'
import os, re, sqlite3, sys
OLD, NEW = os.environ['OLD_REC'], os.environ['NEW_REC']
PAIRS = [(OLD + '/' + os.environ['OLD_TRASH'], NEW + '/' + os.environ['NEW_TRASH']), (OLD, NEW)]
DROP = {'aid.micAccess.v1'}
def new_key(k):
    if k == 'aid-meetings.theme':
        return 'shade.theme'
    if k.startswith('aid.'):
        return 'shade.' + k[4:]
    return None
def fix_text(s):
    for a, b in PAIRS:
        s = re.sub(re.escape(a) + r'(?=[/"\\]|$)', lambda _m: b, s)
    return s
stores = []
for root, _, files in os.walk(sys.argv[1]):
    if 'localstorage.sqlite3' in files:
        stores.append(os.path.join(root, 'localstorage.sqlite3'))
for path in stores:
    c = sqlite3.connect(path)
    keys = dict(c.execute('SELECT key, value FROM ItemTable').fetchall())
    renamed = []
    for k, v in keys.items():
        nk = new_key(k)
        if nk is None:
            continue
        if k in DROP:
            c.execute('DELETE FROM ItemTable WHERE key = ?', (k,))
            renamed.append(f'{k} (не перенесён)')
            continue
        text = bytes(v).decode('utf-16-le') if isinstance(v, (bytes, bytearray, memoryview)) else str(v)
        value = fix_text(text).encode('utf-16-le')
        if nk not in keys:
            c.execute('INSERT INTO ItemTable (key, value) VALUES (?, ?)', (nk, value))
        c.execute('DELETE FROM ItemTable WHERE key = ?', (k,))
        renamed.append(f'{k} -> {nk}')
    c.commit()
    left = [k for (k,) in c.execute('SELECT key FROM ItemTable') if new_key(k)]
    c.execute('PRAGMA wal_checkpoint(TRUNCATE)')
    c.close()
    if left:
        sys.exit(f'в {path} остались старые ключи: {left}')
    if renamed:
        print('  localStorage: ' + ', '.join(renamed))
PY
}

migrate_one() { # метка старое новое вид
  local label="$1" src="$2" dst="$3" kind="$4" tmp="$3$TMP_SUFFIX"
  say "[$label] $src"
  if [ ! -e "$src" ]; then
    if [ -e "$dst" ]; then say "  старого нет, новое на месте"; else say "  старого нет, пропуск"; fi
    return 0
  fi
  if [ "$kind" = file ]; then
    if [ -e "$dst" ] && cmp -s "$src" "$dst"; then say "  уже перенесено"; return 0; fi
    [ -e "$dst" ] && mv "$dst" "$dst.pre-migration-$TS" && say "  новое уже было: отложено в $dst.pre-migration-$TS"
    cp -p "$src" "$tmp" && cmp -s "$src" "$tmp" || fail "копия $src не совпала"
    mv "$tmp" "$dst"
    say "  перенесено -> $dst"
    return 0
  fi
  if [ -e "$dst/$STAMP" ]; then say "  уже перенесено"; return 0; fi
  if [ -e "$tmp" ]; then
    mv "$tmp" "$tmp.stale-$TS"
    say "  прошлый перенос прерван: неполная копия отложена в $tmp.stale-$TS"
  fi
  if [ -e "$dst" ]; then
    mv "$dst" "$dst.pre-migration-$TS"
    say "  новое уже было без метки переноса (приложение запускали раньше): отложено в $dst.pre-migration-$TS"
  fi
  clone_copy "$src" "$tmp"
  diff -rq "$src" "$tmp" >/dev/null || fail "копия $src не совпала со старой; цель не создана, старое не тронуто"
  if [ "${SHADE_MIGRATE_STOP_AFTER_COPY:-}" = "$label" ]; then
    say "  (тест) обрыв после копии"; exit 3
  fi
  case "$kind" in
    appdata) fix_appdata "$tmp" ;;
    recordings) fix_recordings "$tmp" ;;
    webkit) fix_webkit "$tmp" ;;
  esac
  printf '{"from":"%s","at":"%s"}\n' "$src" "$TS" > "$tmp/$STAMP"
  mv "$tmp" "$dst"
  say "  перенесено -> $dst"
}

verify() {
  say ""
  say "Проверка"
  local olddb="$AS/$OLD_ID/meeting_minutes.sqlite"
  [ -f "$olddb" ] || olddb="$AS/_to_delete/$OLD_ID/meeting_minutes.sqlite"
  py "$AS/$NEW_ID" "$olddb" "$NEW_REC" "$L/WebKit/$NEW_ID" "$L/WebKit/Shade" <<'PY'
import json, os, sqlite3, sys
new_dir, old_db, new_rec = sys.argv[1], sys.argv[2], sys.argv[3]
OLD, OLD_TRASH = os.environ['OLD_REC'], os.environ['OLD_TRASH']
problems = []
def ro(path):
    return sqlite3.connect(f'file:{path}?mode=ro', uri=True)
db = os.path.join(new_dir, 'meeting_minutes.sqlite')
if os.path.isfile(db):
    c = ro(db)
    if c.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
        problems.append('база повреждена')
    rows = c.execute('SELECT folder_path FROM meetings').fetchall()
    c.close()
    n = len(rows)
    stale = sum(1 for (fp,) in rows if fp and (fp == OLD or fp.startswith(OLD + '/')))
    found = sum(1 for (fp,) in rows if fp and os.path.isdir(fp))
    line = f'  встреч {n}, папки записей на месте у {found}, старых путей {stale}'
    if os.path.isfile(old_db):
        oc = ro(old_db)
        orows = oc.execute('SELECT folder_path FROM meetings').fetchall()
        oc.close()
        ofound = sum(1 for (fp,) in orows if fp and os.path.isdir(fp))
        line += f' (в старой базе встреч {len(orows)}, папок на месте {ofound})'
        if len(orows) != n:
            problems.append(f'встреч в новой базе {n}, в старой {len(orows)}')
        if found < ofound:
            problems.append(f'папок записей нашлось меньше, чем у старой базы: {found} из {ofound}')
    if stale:
        problems.append(f'старых путей в базе: {stale}')
    print(line)
else:
    print('  базы нет (старых данных не было или приложение ещё не запускалось)')
models = os.path.join(new_dir, 'models')
if os.path.isdir(models):
    size = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(models) for f in fs)
    print(f'  модели: {size / 1e9:.2f} ГБ')
ob = os.path.join(new_dir, 'onboarding-status.json')
if os.path.isfile(ob):
    st = json.load(open(ob, encoding='utf-8')).get('status', {})
    print(f"  первый запуск пройден: {'да' if st.get('completed') else 'нет'}")
trash = os.path.join(new_rec, os.environ['NEW_TRASH'])
if os.path.isdir(os.path.join(new_rec, OLD_TRASH)):
    problems.append(f'в {new_rec} осталась «{OLD_TRASH}»')
if os.path.isdir(trash):
    marks = [os.path.join(trash, d, 'trashed.json') for d in os.listdir(trash)]
    marks = [m for m in marks if os.path.isfile(m)]
    bad = [m for m in marks if str(json.load(open(m, encoding='utf-8')).get('from', '')).startswith(OLD + '/')]
    print(f'  корзина на диске: {len(marks)}, старых путей в метках {len(bad)}')
    if bad:
        problems.append('старые пути в метках корзины')
for wk in sys.argv[4:]:
    for root, _, files in os.walk(wk):
        if 'localstorage.sqlite3' not in files:
            continue
        c = ro(os.path.join(root, 'localstorage.sqlite3'))
        keys = [k for (k,) in c.execute('SELECT key FROM ItemTable')]
        old = [k for k in keys if k.startswith('aid.') or k == 'aid-meetings.theme']
        stale = 0
        for (v,) in c.execute("SELECT value FROM ItemTable WHERE key LIKE 'shade.%'"):
            if OLD in bytes(v).decode('utf-16-le', 'replace'):
                stale += 1
        c.close()
        mine = sorted(k for k in keys if k.startswith('shade.'))
        origin = os.path.relpath(root, wk).split(os.sep)
        origin = origin[-2][:8] if len(origin) >= 2 else '?'
        print(f"  localStorage {os.path.basename(wk)} {origin}…: {', '.join(mine) or 'своих ключей нет'}")
        if old:
            problems.append(f'старые ключи localStorage: {old}')
        if stale:
            problems.append('старые пути в localStorage')
if problems:
    print('НЕ ПРОШЛО: ' + '; '.join(problems))
    sys.exit(1)
print('  всё сходится')
PY
}

archive_old() {
  local entry label src dst kind parent
  for entry in "${PAIRS[@]}"; do
    IFS='|' read -r label src dst kind <<<"$entry"
    if [ ! -e "$src" ]; then continue; fi
    if [ "$kind" = file ]; then
      cmp -s "$src" "$dst" 2>/dev/null || fail "[$label] $dst не совпадает со старым: старое не трогаю"
    else
      [ -e "$dst/$STAMP" ] || fail "[$label] $dst без метки переноса: сначала перенос и проверка"
    fi
  done
  verify
  for entry in "${PAIRS[@]}"; do
    IFS='|' read -r label src dst kind <<<"$entry"
    [ -e "$src" ] || continue
    parent="$(dirname "$src")/_to_delete"
    mkdir -p "$parent"
    local target="$parent/$(basename "$src")"
    [ -e "$target" ] && target="$target-$TS"
    mv "$src" "$target"
    say "[$label] старое -> $target"
  done
  say "Ничего не удалено. Удалить папки _to_delete можно вручную, когда новое приложение проверено."
}

main() {
  local mode="${1:-migrate}" entry label src dst kind
  refuse_if_running
  case "$mode" in
    migrate)
      for entry in "${PAIRS[@]}"; do
        IFS='|' read -r label src dst kind <<<"$entry"
        migrate_one "$label" "$src" "$dst" "$kind"
      done
      verify ;;
    --check) verify ;;
    --archive-old) archive_old ;;
    *) fail "неизвестный ключ $mode (есть --check и --archive-old)" ;;
  esac
}

main "$@"
