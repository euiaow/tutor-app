# Локальная настройка

Что реально нужно, чтобы запустить проект с нуля на новом устройстве
после `git clone`. Основано на фактической проверке репозитория на
момент написания (не предположениях) — что именно проверялось и что
нашлось, описано в каждом разделе ниже.

---

## 1. Что исключено из репозитория (`.gitignore`)

⚠️ **Найдена реальная проблема**: `.gitignore` в корне репозитория
содержит **незакрытые маркеры конфликта слияния git**
(`<<<<<<< HEAD`, `=======`, `>>>>>>> 179c41f...`) — это не какой-то
particular паттерн, а буквально нерешённый merge conflict, оставленный в
файле как есть. Практического вреда сейчас нет (git читает содержимое
между маркерами как обычные строки-паттерны, конфликт никого не ломает),
но это стоит когда-нибудь вручную разрешить — сейчас в файле фактически
слиты оба варианта `.gitignore` целиком (один — компактный, под Node/Vite-
проект; другой — стандартный полный `VisualStudio.gitignore` от GitHub,
явно попавший сюда по ошибке при какой-то операции слияния).

Из значимого для секретов — оба варианта содержат нужные строки, так что
исключение фактически работает:

- `*.env`, `*.env.local` — **исключены** (это единственные паттерны,
  прямо относящиеся к секретам/конфигурации)
- `node_modules`, `dist`, `dist-ssr` — исключены (сборочные артефакты)
- `.vscode/*` (кроме `extensions.json`), `.idea` — исключены (настройки IDE)
- Больших логов/кэшей/бинарников не найдено — ничего специфичного для
  ключей API/токенов ботов в `.gitignore`, кроме `.env*`, нет — потому что
  все такие секреты живут не в файлах в репозитории вообще (см. раздел 4).

`.firebase/hosting.*.cache` в `.gitignore` не упомянут отдельно, но и не
нужен — он не хранит секретов, просто локальный кэш деплоя (см.
`CLAUDE.md`/memory bank проекта — этот файл всегда «modified» в `git
status`, это нормально).

---

## 2. `.env` — существует ли физически и что в нём

Проверено: да, `.env` **физически существует** в корне проекта прямо
сейчас (не закоммичен — см. раздел 1). Содержит 7 переменных. Ниже —
только **имена**, без значений (значения не попадают в документацию,
даже несмотря на то что конфигурация клиентского Firebase технически не
секретна сама по себе — `apiKey` веб-приложения Firebase не даёт доступа
ни к чему без правил безопасности; но публиковать её в доке всё равно не
стоит):

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_measurementId
```

Обратите внимание на последнюю: `VITE_measurementId`, а не
`VITE_FIREBASE_MEASUREMENT_ID` — нестандартное именование (нижний регистр,
без префикса `FIREBASE_`), но это то, что реально стоит в файле и то, что
реально читает `src/firebase/firebase.js` (см. ниже) — если будете
пересоздавать `.env` вручную, назовите переменную именно так, иначе
`measurementId` в конфиге Firebase окажется `undefined`.

`functions/.env` — **не существует** физически. Это ожидаемо: секреты
бэкенда управляются не через `.env`, а через Google Secret Manager (см.
раздел 5).

---

## 3. Как конфигурация Firebase попадает в код

Проверено `src/firebase/firebase.js` — конфигурация **не захардкожена**,
читается целиком через `import.meta.env.VITE_*` (Vite):

```js
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_measurementId,
}
```

**Вывод: без `.env` фронтенд не запустится осмысленно.** `npm run dev`
технически стартует и без файла, но `initializeApp` получит объект из
одних `undefined`, и любое обращение к Firestore/Auth/Storage/Functions
упадёт сразу же. `.env` обязателен для локального запуска.

Также стоит знать: никакого локального эмулятора Firebase в проекте не
настроено (`firebase.json` не содержит секции `emulators`) — `npm run
dev` подключается к **боевому** проекту `princessschool-e678c`
(Firestore/Auth/Storage), не к песочнице. Будьте аккуратны при
экспериментах локально — это не изолированная среда.

---

## 4. Пошагово: чистое новое устройство

### 4.1. Только фронтенд (99% задач — правки UI, компонентов, страниц)

```bash
git clone <URL репозитория>
cd tutor-app
```

Скопируйте `.env` вручную с исходного устройства (по защищённому каналу —
это не в репозитории и не должно туда попасть) в корень `tutor-app/`. Файл
должен содержать переменные, перечисленные в разделе 2 выше (7 штук,
включая нестандартную `VITE_measurementId`).

```bash
npm install
npm run dev
```

Откроется Vite dev-сервер (по умолчанию `http://localhost:5173`),
подключённый напрямую к боевым Firebase-сервисам проекта.

Версии, на которых проверялось: Node.js `v22.16.0`, npm `10.9.2` — в
`package.json` жёстко заданной минимальной версии Node нет, но `functions/
package.json` требует Node 22 (`engines.node: "22"`), так что для
единообразия имеет смысл держать и фронтенд-окружение на Node 22.

`npm run lint` (ESLint, flat config) и `npm run build` (продакшен-сборка
в `dist/`) работают из того же `npm install` — секретов не требуют.

### 4.2. Только правки кода `functions/` без деплоя (проверка, что билд не падает)

```bash
cd functions
npm install
node -e "require('./index.js')"
```

Секретов и `firebase login` для этого не нужно — `require()` просто
проверяет, что модуль синтаксически корректен и не падает при загрузке
(реальные вызовы `defineSecret(...).value()` происходят только внутри
хендлеров, при живом вызове функции, не при загрузке модуля).

### 4.3. Деплой / управление Cloud Functions с нового устройства

Нужно **только** если планируется реально задеплоить `functions/` или
`hosting`, либо смотреть продовые логи (`firebase functions:log`),
управлять секретами и т.п. Не нужно для обычной фронтенд-разработки.

```bash
npm install -g firebase-tools   # либо просто npx firebase ... без глобальной установки
firebase login
```

`firebase login` откроет браузер для входа в Google-аккаунт. Дальше
доступ определяется ролью этого аккаунта на самом проекте Firebase/GCP
(`princessschool-e678c`, см. `.firebaserc`) — нужна как минимум роль,
дающая право деплоить функции и хостинг (`Firebase Admin`/`Editor`/
`Owner` на уровне GCP-проекта, либо более узкие роли Cloud Functions
Admin + Firebase Hosting Admin). Это настраивается в Google Cloud
Console → IAM для проекта `princessschool-e678c`, а не в коде и не в
файлах репозитория — новому устройству просто нужен аккаунт с уже выданным
доступом, никакой локальный файл-ключ для этого не требуется (никаких
`serviceAccountKey.json`-файлов в репозитории нет и они не нужны для
`firebase login`-флоу).

Дальше — обычные команды деплоя:

```bash
firebase deploy --only hosting
firebase deploy --only functions:<имяФункции>   # по одной функции — см. предупреждение ниже
```

⚠️ Известная особенность этого проекта (см. `techContext.md` в memory bank):
`firebase deploy --only functions` пачкой часто падает частично с
ошибкой `Quota exceeded for total allowable CPU per project per region`
— это квота Cloud Run, а не проблема с кодом или окружением нового
устройства. Рабочий обход — передеплоивать упавшие функции по одной.

### 4.4. Секреты ботов и Google OAuth — НЕ нужны для локального запуска вообще

Секреты Cloud Functions (полный список и назначение каждого — см.
`docs/BACKEND_CATALOG.md`, раздел «Firebase Secrets»):

- `TELEGRAM_BOT_TOKEN`
- `VK_GROUP_TOKEN`
- `VK_CONFIRMATION_CODE`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`

Все пять хранятся **в Google Secret Manager** (через `defineSecret(...)`
в коде функций — `functions/adapters/telegram.js`,
`functions/adapters/vk.js`, `functions/core/googleAuth.js`), не в
`.env`-файлах, не в репозитории и не на диске в принципе. Cloud
Functions v2 монтирует их значения только во время реального выполнения
задеплоенной функции в облаке — ни при `npm install`, ни при `npm run
dev`, ни при локальной проверке `functions/` (раздел 4.2) эти значения
нигде не участвуют и не нужны.

Единственный сценарий, где эти секреты вообще всплывают для человека —
если нужно **посмотреть или изменить их значение** в самом Secret
Manager (Google Cloud Console → Security → Secret Manager, проект
`princessschool-e678c`) или явно передеплоить функцию после смены
секрета (`firebase deploy --only functions:<name>` — сам деплой не
печатает и не требует ввода значения секрета, только ссылается на него
по имени).
