#!/usr/bin/env bash
# Скрипт обновления бэкенда на сервере. Вызывается по SSH из deploy.sh или вручную на машине.
# Ожидается расположение репозитория: /var/www/finan (внутри — каталог server/).

set -euo pipefail

# Шаг 1: перейти в каталог Node-сервера Finan.
cd /var/www/finan/server

# Шаг 2: получить последние изменения с ветки main.
git pull origin main

# Шаг 3: установить/обновить зависимости npm.
npm install

# Шаг 4: собрать TypeScript и прочие шаги сборки проекта.
npm run build

# Шаг 5: перезапустить процесс в PM2 (имя процесса — finan-server).
pm2 restart finan-server

echo "server-update.sh: сервер Finan обновлён и перезапущен."
