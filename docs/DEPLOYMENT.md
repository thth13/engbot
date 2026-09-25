# Деплой: Vercel + Railway

Один GitHub-репозиторий подключается к двум платформам. Vercel запускает `apps/web`, Railway — только `apps/bot`. Общая логика находится в `packages/core`, данные — в одной MongoDB Atlas или replica set.

## 1. Подготовить репозиторий и MongoDB

- Загрузить проект в свой GitHub-репозиторий, включая корневой `package-lock.json`, `apps`, `packages`, `scripts`, `railway.json` и `tsconfig.base.json`.
- `.env.local`, `node_modules`, `.next` и `output` не коммитить: они исключены через `.gitignore`. `.env.example` можно коммитить, он содержит только шаблон.
- Создать MongoDB Atlas или использовать доступный обоим хостингам replica set. Настроить сетевой доступ от Vercel и Railway. Адрес `localhost` из шаблона подходит только локально.
- На обеих платформах указать одинаковые `MONGODB_URI` и `MONGODB_DB`.
- Из корня локального проекта выполнить `npm ci`, заполнить `.env.local` и один раз выполнить `npm run db:indexes` для целевой базы. Повторное выполнение создания индексов допустимо. Эта команда не запускается автоматически при деплое.

## 2. Развернуть веб на Vercel

Импортировать GitHub-репозиторий как новый проект:

| Настройка                                          | Значение                        |
| -------------------------------------------------- | ------------------------------- |
| Framework Preset                                   | Next.js                         |
| Root Directory                                     | `apps/web`                      |
| Include source files outside of the Root Directory | Включено: нужен `packages/core` |
| Node.js Version                                    | 22.x                            |
| Install Command                                    | `cd ../.. && npm ci`            |
| Build Command                                      | `npm run build`                 |
| Output Directory                                   | По умолчанию для Next.js        |

Команды установки и сборки уже заданы в `apps/web/vercel.json`. Сборка выполняется платформой из `apps/web`; Next.js транспилирует общий пакет самостоятельно.

Добавить переменные в Production environment:

```dotenv
APP_URL=https://your-app.vercel.app
MONGODB_URI=<connection-string>
MONGODB_DB=engbot
TELEGRAM_BOT_TOKEN=<bot-token>
TELEGRAM_BOT_USERNAME=<username-without-@>
SESSION_SECRET=<random-string-at-least-32-characters>
OPENAI_API_KEY=<api-key>
AI_MODEL=gpt-5.4
```

`TELEGRAM_BOT_TOKEN` нужен вебу для проверки Telegram initData. Секреты не должны иметь префикс `NEXT_PUBLIC_`.

Для `APP_URL` использовать стабильный production-домен, на котором пользователь открывает Mini App: сервер проверяет Origin запросов. Если адрес стал известен после первого деплоя, обновить переменную и выполнить Redeploy. При смене на свой домен обновить этот адрес также у бота и повторить настройку Telegram.

Production-бот должен открывать production-домен. Для preview-деплоев нужны собственный корректный `APP_URL` и отдельная конфигурация тестового бота; не запускать второй polling-процесс с production-токеном.

## 3. Развернуть бота на Railway

Создать сервис из того же GitHub-репозитория:

| Настройка      | Значение                                     |
| -------------- | -------------------------------------------- |
| Root Directory | Корень репозитория, не `apps/bot`            |
| Config File    | `/railway.json` (определяется автоматически) |
| Builder        | Railpack                                     |
| Build Command  | `true` — пропуск компиляции                  |
| Start Command  | `npm run start:bot`                          |
| Healthcheck    | `/health`                                    |

Корневой `railway.json` уже задаёт Railpack, команды, healthcheck и перезапуск при ошибке. Railpack устанавливает Node.js и npm-зависимости монорепозитория по lockfile. Dockerfile и локальный Docker не нужны. Зависимости веба могут устанавливаться вместе с остальными workspaces, но веб не собирается и не запускается на Railway.

Команда `true` переопределяет автоматический шаг сборки, чтобы Railway не выполнил корневой `npm run build`, предназначенный для Vercel. Затем `npm run start:bot` запускает Node.js-бота через `tsx`, включённый в production-зависимости. Если сервис уже создавался с Dockerfile, удалить старые ручные переопределения Dockerfile/Build/Start в настройках сервиса и выполнить Redeploy с новой конфигурацией.

Добавить переменные:

```dotenv
APP_URL=https://your-app.vercel.app
MONGODB_URI=<same-connection-string>
MONGODB_DB=engbot
TELEGRAM_BOT_TOKEN=<same-bot-token>
OPENAI_API_KEY=<api-key>
AI_MODEL=gpt-5.4
```

`APP_URL` здесь тоже указывает на **Vercel**: бот использует его для кнопки открытия приложения. `SESSION_SECRET` боту не нужен. `TELEGRAM_WEBHOOK_URL` и `TELEGRAM_WEBHOOK_SECRET` удалены; если они остались в Variables Railway, их можно удалить.

Бот сам получает сообщения через исходящие запросы Telegram `getUpdates`. При каждом запуске он удаляет прежний webhook через `deleteWebhook` с `drop_pending_updates: false`, сохраняя очередь. Регистрация адреса не нужна.

HTTP-сервер слушает `0.0.0.0:$PORT` только для внутреннего healthcheck Railway `/health`. Публичный домен бота и HTTPS-туннель не нужны. Healthcheck проверяет готовность polling и MongoDB, но не работу AI.

Оставить **одну реплику**, выключить режим сна сервиса (Serverless/App Sleeping, если включён) и не запускать локальную копию с тем же токеном одновременно. При пересечении процессов во время деплоя возможна временная ошибка 409; бот повторяет запрос. Постоянная ошибка 409 означает, что другой процесс продолжает получать сообщения или снова установил webhook.

## 4. Запуск и настройка Telegram

Для локального запуска достаточно заполнить `.env` или `.env.local` в корне либо в `apps/bot` и выполнить:

```bash
npm run dev:bot
```

Обычный запуск без отслеживания изменений: `npm run start:bot`. На Railway эта команда уже задана в `railway.json`. После успешного отключения старого webhook бот выводит `Telegram long polling started`.

Для настройки кнопки открытия приложения и списка команд выполнить отдельно:

```bash
npm run telegram:setup
```

Этот скрипт использует `APP_URL` и `TELEGRAM_BOT_TOKEN`, читает те же env-файлы, что и бот, и настраивает только меню и команды. Для получения `/start` выполнять его не обязательно. `APP_URL` остаётся адресом веб-приложения на Vercel.

## 5. Проверить вручную

1. `/start` в Telegram возвращает сообщение с кнопкой на Vercel.
2. Mini App открывается, вход и сохранение профиля работают.
3. Сообщение боту получает AI-ответ; ошибки видны в Mini App.
4. Веб-чат, упражнения и прогресс работают с той же базой.
5. Перезапуск Railway не теряет уже сохранённый прогресс.
6. Локальный бот получает `/start` без туннеля; после остановки локального процесса бот на Railway получает сообщения с тем же токеном.

Бот обрабатывает сообщения последовательно и подтверждает обновление следующим запросом `getUpdates` только после завершения. При временной ошибке повторяет запрос/обработку; неправильный токен завершает процесс с ошибкой. Неподдерживаемые форматы обновлений пропускаются с записью их ID в лог. Длительная ошибка обработки одного сообщения задержит следующие сообщения. База предотвращает повторное начисление XP. Если процесс завершится после отправки ответа, но до фиксации доставки в базе, ответ может продублироваться: очередь/outbox пока не реализованы.

## Источники

- [Vercel: настройки монорепозитория и доступ к общим файлам](https://vercel.com/docs/monorepos/monorepo-faq)
- [Railway: автоматическая установка и команды запуска](https://docs.railway.com/builds/build-and-start-commands)
- [Railway: конфигурация в репозитории](https://docs.railway.com/config-as-code/reference)
- [Railway: PORT и healthcheck](https://docs.railway.com/deployments/healthchecks)
- [Telegram: получение обновлений](https://core.telegram.org/bots/api#getupdates)
