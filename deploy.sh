#!/usr/bin/env bash
# Скрипт деплоя Finan с локальной машины (Git Bash / Linux / macOS).
# Запуск: ./deploy.sh "feat: мои изменения"
# Первый аргумент — сообщение коммита (обязательно).

set -euo pipefail

REMOTE_USER_HOST="root@2.27.20.37"
# Каталог статики на сервере (куда копируется собранный Vite-клиент).
REMOTE_DIST_PATH="/var/www/finan/client/dist"
# Корень репозитория на сервере (рядом с server/ лежит server-update.sh после git pull).
REMOTE_REPO_ROOT="/var/www/finan"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ "${1:-}" = "" ]; then
  echo "Укажите сообщение коммита. Пример: ./deploy.sh \"feat: мои изменения\""
  exit 1
fi

COMMIT_MSG="$1"

# Шаг 1: зафиксировать все изменения и отправить в origin main (сервер подтянет их через git pull).
git add .
git commit -m "$COMMIT_MSG"
git push origin main

# Шаг 2: на сервере — pull, зависимости, сборка API, перезапуск PM2 (см. server-update.sh).
ssh "$REMOTE_USER_HOST" "cd ${REMOTE_REPO_ROOT} && bash ./server-update.sh"

# Шаг 3: собрать фронтенд локально (артефакты в client/dist).
cd "$SCRIPT_DIR/client"
npm install
npm run build

# Шаг 4: убедиться, что на сервере есть каталог для статики (удобно при первом деплое).
ssh "$REMOTE_USER_HOST" "mkdir -p ${REMOTE_DIST_PATH}"

# Шаг 5: загрузить собранный клиент на сервер по SCP (содержимое dist/ в целевой каталог).
scp -r "$SCRIPT_DIR/client/dist/." "${REMOTE_USER_HOST}:${REMOTE_DIST_PATH}/"

echo "Готово: коммит отправлен, сервер обновлён, client/dist скопирован на ${REMOTE_USER_HOST}:${REMOTE_DIST_PATH}"
