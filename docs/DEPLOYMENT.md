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

Production-бот должен открывать production-домен. Для preview-деплоев нужны собственный корректный `APP_URL` и отдельная конфигурация тестового бота; не перерегистрировать production webhook на preview.

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
TELEGRAM_WEBHOOK_SECRET=<random-letters-digits-underscore-or-hyphen>
OPENAI_API_KEY=<api-key>
AI_MODEL=gpt-5.4
```

`APP_URL` здесь тоже указывает на **Vercel**: бот использует его для кнопки открытия приложения. `SESSION_SECRET` боту не нужен. Секрет webhook должен состоять из 1–256 символов `A–Z`, `a–z`, `0–9`, `_`, `-`; он должен отличаться от секрета сессии. Например, можно самостоятельно сгенерировать каждый секрет через `openssl rand -hex 32`.

Сервис слушает `0.0.0.0:$PORT`; Railway передаёт `PORT`. В Networking включить публичный домен и направить его на порт сервиса. Получится адрес вида `https://your-bot.up.railway.app`.

Открыть `https://your-bot.up.railway.app/health`: ожидается `{"ok":true}`. Healthcheck проверяет подключение к MongoDB; он не подтверждает работу AI или регистрацию webhook.

## 4. Подключить Telegram

В локальном корневом `.env.local` сохранить действующие ключи и указать:

```dotenv
APP_URL=https://your-app.vercel.app
TELEGRAM_WEBHOOK_URL=https://your-bot.up.railway.app/telegram/webhook
TELEGRAM_BOT_TOKEN=<same-bot-token>
TELEGRAM_WEBHOOK_SECRET=<same-secret-as-on-railway>
```

Когда оба сервиса доступны, выполнить из корня:

```bash
npm run telegram:setup
```

Скрипт регистрирует webhook **на Railway**, кнопку меню **на Vercel** и команды бота. Старый путь `/api/telegram/webhook` удалён из веб-приложения; новый путь — `/telegram/webhook` на Railway. Ожидающие обновления при регистрации не удаляются.

`TELEGRAM_WEBHOOK_URL` нужен только скрипту регистрации; самим сервисам он не нужен. Если запускать скрипт в окружении хостинга, добавить его туда. Регистрация не выполняется автоматически на старте или при каждом деплое. Один бот имеет один webhook, поэтому локальный запуск настройки с другим адресом переключает доставку сообщений.

## 5. Проверить вручную

1. `/start` в Telegram возвращает сообщение с кнопкой на Vercel.
2. Mini App открывается, вход и сохранение профиля работают.
3. Сообщение боту получает AI-ответ; ошибки видны в Mini App.
4. Веб-чат, упражнения и прогресс работают с той же базой.
5. Перезапуск Railway не теряет уже сохранённый прогресс.
6. Запрос без правильного Telegram secret к `/telegram/webhook` возвращает 401; веб больше не обрабатывает Telegram webhook.

Webhook обрабатывает AI синхронно и отвечает после завершения. Telegram повторяет неуспешные доставки; база хранит состояние обновления и предотвращает повторное начисление XP. Если процесс завершится после отправки ответа, но до фиксации доставки в базе, ответ может продублироваться: очередь/outbox пока не реализованы.

## Источники

- [Vercel: настройки монорепозитория и доступ к общим файлам](https://vercel.com/docs/monorepos/monorepo-faq)
- [Railway: автоматическая установка и команды запуска](https://docs.railway.com/builds/build-and-start-commands)
- [Railway: конфигурация в репозитории](https://docs.railway.com/config-as-code/reference)
- [Railway: PORT и healthcheck](https://docs.railway.com/deployments/healthchecks)
- [Telegram: регистрация webhook](https://core.telegram.org/bots/api#setwebhook)
