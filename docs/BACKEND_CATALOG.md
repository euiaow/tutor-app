# Каталог бэкенда

Справочник всех Cloud Functions, реально экспортируемых из `functions/index.js`
(это единственный файл, где `exports.*` — все остальные модули в
`functions/core/`/`functions/adapters/` экспортируют обычные JS-функции,
которые `index.js` оборачивает в `onCall`/`onRequest`/`onSchedule`/
`onDocumentWritten`). 36 функций, сгруппированы по смысловому домену.
Только контракт — вход/выход/побочные эффекты, без построчного пересказа.

Легенда типов: **callable** = `onCall` (вызывается через Firebase SDK
`httpsCallable`), **HTTP** = `onRequest` (обычный HTTP-эндпоинт, нет
Firebase Auth SDK-обёртки), **scheduled** = `onSchedule` (Cloud Scheduler
cron), **trigger** = `onDocumentWritten` (реагирует на запись в Firestore).

Про авторизацию: у студентов нет Firebase Auth вообще — везде, где написано
«студенческий путь без auth», это осознанная архитектура (см. `CLAUDE.md`),
а не недосмотр. `request.auth`-проверка означает «требуется вход
преподавателя через Firebase Auth».

---

## 1. Регистрация и боты

### `generateRegistrationLink` — callable
Создаёт одноразовый токен регистрации ученика с заранее известным именем.
- **Параметры**: `{ studentName: string }`
- **Firestore**: пишет `registrationTokens/{token}`
- **Вызывающая сторона**: `src/firebase/registration.js` ← `RegistrationLinkDialog` (кнопка «Добавить ученика», панель учителя)
- **Auth**: без проверки `request.auth` (не гейтится — исторически не защищена, вызывается только из панели учителя на практике)
- **Secrets**: нет

### `cancelRegistrationToken` — callable
Удаляет неиспользованный токен регистрации.
- **Параметры**: `{ token: string }`
- **Firestore**: удаляет `registrationTokens/{token}`
- **Вызывающая сторона**: `src/firebase/registration.js` ← `PendingRegistrations`/`CancelRegistrationDialog` («Ожидают регистрации»)
- **Auth**: без проверки
- **Secrets**: нет

### `generateTeacherConnectToken` — callable
Выпускает короткоживущий токен (TTL 10 мин, проверяется инлайн) для
привязки Telegram/VK чата учителя к `integrations/teacherContact`.
- **Параметры**: `{ platform: "telegram" | "vk" }`
- **Возвращает**: `{ deepLink }` для Telegram, `{ code }` для VK
- **Firestore**: пишет `teacherConnectTokens/{token}`
- **Вызывающая сторона**: `src/firebase/teacherConnect.js` ← `teacher-bot-connect.jsx` (поповер «Подключить» в колокольчике уведомлений учителя)
- **Auth**: `request.auth` обязателен
- **Secrets**: нет

### `telegramWebhook` — HTTP
Единая точка входа для всех обновлений Telegram Bot API — регистрация,
шаги диалога, домашка фото/документом, нажатия inline-кнопок
(подтверждение/отклонение переноса и отмены, включая учительские кнопки),
запрос на перенос текстом.
- **Вход**: тело запроса Telegram (`req.body`), обрабатывается `adapters/telegram.js:handleUpdate`
- **Firestore**: читает/пишет `students`, `students/{id}/lessons`,
  `telegramSessions`, `registrationTokens`, `teacherConnectTokens`,
  `notifications` (косвенно, через `createNotification`), в зависимости
  от типа апдейта
- **Вызывающая сторона**: внешний webhook Telegram Bot API (настраивается один раз через `setWebhook`)
- **Auth**: нет (публичный HTTP-эндпоинт, доверие — по факту знания URL/структуры апдейта Telegram)
- **Secrets**: `TELEGRAM_BOT_TOKEN`, `VK_GROUP_TOKEN` (второй нужен, т.к. домашка, отправленная сюда, может уведомить учителя, а его канал — VK)

### `vkWebhook` — HTTP
То же самое для VK Callback API — `confirmation`, `message_new`,
`message_event` (нажатия callback-кнопок).
- **Вход**: тело запроса VK (`req.body`), обрабатывается `adapters/vk.js:handleEvent`; отвечает строкой `"ok"` (или кодом подтверждения для `type: "confirmation"`) — обязательный формат ответа для VK
- **Firestore**: то же самое множество коллекций, что и `telegramWebhook`, плюс `vkProcessedMessages` (идемпотентность на повторную доставку)
- **Вызывающая сторона**: внешний webhook VK Callback API
- **Auth**: нет (подтверждение через `VK_CONFIRMATION_CODE`, отдаётся в ответ на `type: "confirmation"`)
- **Secrets**: `VK_GROUP_TOKEN`, `VK_CONFIRMATION_CODE`, `TELEGRAM_BOT_TOKEN`

---

## 2. Уроки и расписание

### `ensureUpcomingLesson` — callable
Find-or-create: гарантирует, что у каждого слота расписания ученика есть
черновик `status: "upcoming"`; создаёт недостающие.
- **Параметры**: `{ studentId: string }`
- **Возвращает**: `{ lessonId }`
- **Firestore**: читает `students/{id}` (расписание), пишет новые `students/{id}/lessons/{lessonId}`
- **Вызывающая сторона**: `src/firebase/lessons.js` ← `HomeworkLessonDialog` (когда открыт без явного `lessonId`)
- **Auth**: `request.auth` обязателен
- **Secrets**: нет

### `getNearestUpcomingLesson` — callable
Read-only: ближайший урок ученика по эффективной дате, включая
внеплановые (`isExtraLesson`) — в отличие от `ensureUpcomingLesson`,
ничего не создаёт.
- **Параметры**: `{ studentId: string }`
- **Возвращает**: `{ lessonId: string | null }`
- **Firestore**: только чтение `students/{id}/lessons`
- **Вызывающая сторона**: `src/firebase/lessons.js` ← `HomeworkLessonDialog`
- **Auth**: `request.auth` обязателен
- **Secrets**: нет

### `completeLesson` — callable
Завершает урок: посещение/домашка/оценка, списывает занятие с баланса,
готовит следующий черновик слота.
- **Параметры**: `{ studentId, lessonId, attendance, homeworkDone, rating }`
- **Firestore**: обновляет `students/{id}/lessons/{lessonId}` (`status: "completed"`, …), пишет `students/{id}/balanceLedger/{entryId}` (через `deductLessonFromBalance`), может создать новый `students/{id}/lessons/{lessonId}` (через `ensureUpcomingLesson`), пишет `notifications/` при низком балансе
- **Вызывающая сторона**: `src/firebase/lessons.js` ← `HomeworkLessonDialog` («Сохранить и завершить урок»)
- **Auth**: `request.auth` обязателен
- **Secrets**: `TELEGRAM_BOT_TOKEN`, `VK_GROUP_TOKEN` (низкобалансовое уведомление)

### `createExtraLesson` — callable
Создаёт внеплановый урок (`isExtraLesson: true`, вне сетки расписания) +
разовое событие в Google Calendar.
- **Параметры**: `{ studentId, date }` (ISO-строка)
- **Возвращает**: `{ success, lessonId }`
- **Firestore**: пишет `students/{id}/lessons/{lessonId}`, `notifications/`
- **Внешнее**: создаёт событие в Google Calendar (`createExtraLessonEvent`)
- **Вызывающая сторона**: `src/firebase/lessons.js` ← `ExtraLessonDialog`
- **Auth**: `request.auth` обязателен
- **Secrets**: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `TELEGRAM_BOT_TOKEN`, `VK_GROUP_TOKEN`

### `updateHomeworkAssignment` — callable
Сохраняет текст/файлы задания к уроку, шлёт типизированное уведомление
ученику (`assignment_added`/`assignment_updated`/`material_added` —
только если что-то реально изменилось).
- **Параметры**: `{ studentId, lessonId, text, files }`
- **Firestore**: обновляет `students/{id}/lessons/{lessonId}.homework.assignment`, пишет `notifications/`
- **Вызывающая сторона**: `src/firebase/lessons.js` ← `HomeworkLessonDialog` (блок «Задание»)
- **Auth**: `request.auth` обязателен
- **Secrets**: `TELEGRAM_BOT_TOKEN`, `VK_GROUP_TOKEN`

### `addLessonMaterial` — callable
Прикрепляет один материал к уроку, шлёт `material_added` ученику.
- **Параметры**: `{ studentId, lessonId, material: {title, url, type} }`
- **Firestore**: обновляет `students/{id}/lessons/{lessonId}.materials` (`arrayUnion`), пишет `notifications/`
- **Вызывающая сторона**: `src/firebase/lessons.js` ← `HomeworkLessonDialog` (блок «Дополнительные материалы»)
- **Auth**: `request.auth` обязателен
- **Secrets**: `TELEGRAM_BOT_TOKEN`, `VK_GROUP_TOKEN`

### `submitHomeworkFile` — callable
Студенческий путь без auth: клиент сам грузит файл в Storage, эта функция
только записывает ссылку в `homework.submission.files` ближайшего урока.
- **Параметры**: `{ studentId, fileUrl }`
- **Возвращает**: `{ success, lessonId }`
- **Firestore**: обновляет `students/{id}/lessons/{lessonId}.homework.submission`, пишет `notifications/` (`homework_submitted` учителю, `homework_received` ученику)
- **Вызывающая сторона**: `src/firebase/lessons.js` ← `StudentDashboard` (загрузка домашки с сайта)
- **Auth**: нет (студенческий путь по конструкции)
- **Secrets**: `TELEGRAM_BOT_TOKEN`, `VK_GROUP_TOKEN`

### `proposeReschedule` — callable
Предлагает перенос урока на новую дату; шлёт интерактивную клавиатуру
(подтвердить/отклонить) той стороне, которая не инициировала.
- **Параметры**: `{ studentId, lessonId, proposedDate (ISO), initiator?: "teacher"|"student" }`
- **Возвращает**: `{ rescheduleStatus }`
- **Firestore**: обновляет `students/{id}/lessons/{lessonId}` (`rescheduleStatus`/`rescheduleInitiator`/`rescheduleProposedDate`, `proposalMessage` или `teacherProposalMessage`), пишет `notifications/`
- **Вызывающая сторона**: `src/firebase/lessons.js` ← `RescheduleDialog` (учитель, `initiator` не передан → по умолчанию `"teacher"`) и `StudentDashboard` («Перенести урок», `initiator: "student"`)
- **Auth**: обязателен только если фактическая роль — `"teacher"`
- **Secrets**: `TELEGRAM_BOT_TOKEN`, `VK_GROUP_TOKEN`

### `confirmReschedule` — callable
Подтверждает предложенный перенос: двигает `date`, обновляет событие
Google Calendar, удаляет использованное бот-сообщение с кнопками
(кросс-канально).
- **Параметры**: `{ studentId, lessonId, confirmedBy?: "teacher"|"student" }`
- **Firestore**: обновляет `students/{id}/lessons/{lessonId}`, пишет `notifications/`
- **Внешнее**: обновляет событие Google Calendar
- **Вызывающая сторона**: `src/firebase/lessons.js` ← `UpcomingLessonCard`/`notifications-list.jsx` (учитель), `StudentDashboard` (ученик); **а также напрямую** (не через callable, вызовом одноимённой core-функции) из `adapters/telegram.js`/`adapters/vk.js` при нажатии кнопки в боте
- **Auth**: обязателен только для роли `"teacher"`
- **Secrets**: `TELEGRAM_BOT_TOKEN`, `VK_GROUP_TOKEN`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`

### `cancelReschedule` — callable
Отклоняет предложенный перенос (без роли — любая сторона может отклонить
предложение другой).
- **Параметры**: `{ studentId, lessonId }`
- **Firestore**: сбрасывает `rescheduleStatus`/`rescheduleInitiator`/`rescheduleProposedDate` на `null`, пишет `notifications/`
- **Вызывающая сторона**: те же UI-места, что и `confirmReschedule`, плюс боты напрямую
- **Auth**: нет
- **Secrets**: `TELEGRAM_BOT_TOKEN`, `VK_GROUP_TOKEN`

### `proposeCancellation` — callable
Предлагает отмену урока (двусторонний флоу, требует подтверждения другой
стороны) — не путать с `cancelLessonDirectly`.
- **Параметры**: `{ studentId, lessonId, initiator?: "teacher"|"student" }`
- **Возвращает**: `{ cancellationStatus }`
- **Firestore**: обновляет `students/{id}/lessons/{lessonId}` (`cancellationStatus`/`cancellationInitiator`, `proposalMessage`/`teacherProposalMessage`), пишет `notifications/`
- **Вызывающая сторона**: `CancelLessonDialog` (учитель, без флажка «Отменить сразу»), `StudentDashboard` («Отменить урок»)
- **Auth**: обязателен только для роли `"teacher"`
- **Secrets**: `TELEGRAM_BOT_TOKEN`, `VK_GROUP_TOKEN`

### `confirmCancellation` — callable
Подтверждает отмену: помечает урок `status: "cancelled"` (документ **не**
удаляется — попадает в историю), удаляет событие Google Calendar.
- **Параметры**: `{ studentId, lessonId, confirmedBy }`
- **Firestore**: обновляет `students/{id}/lessons/{lessonId}`, пишет `notifications/`
- **Внешнее**: удаляет событие Google Calendar
- **Вызывающая сторона**: те же места, что и `confirmReschedule`, плюс боты напрямую
- **Auth**: обязателен только для роли `"teacher"`
- **Secrets**: `TELEGRAM_BOT_TOKEN`, `VK_GROUP_TOKEN`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`

### `cancelLessonDirectly` — callable
Односторонняя отмена учителем без запроса подтверждения у ученика —
только объявление. `status: "cancelled"`, документ сохраняется.
- **Параметры**: `{ studentId, lessonId }`
- **Firestore**: обновляет `students/{id}/lessons/{lessonId}`, пишет `notifications/`
- **Внешнее**: удаляет событие Google Calendar
- **Вызывающая сторона**: `CancelLessonDialog` (флажок «Отменить сразу, без подтверждения ученика»)
- **Auth**: `request.auth` обязателен (только учитель, ученик не может отменить односторонне)
- **Secrets**: `TELEGRAM_BOT_TOKEN`, `VK_GROUP_TOKEN`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`

### `rejectCancellation` — callable
Отклоняет предложенную отмену (без роли, любая сторона).
- **Параметры**: `{ studentId, lessonId }`
- **Firestore**: сбрасывает `cancellationStatus`/`cancellationInitiator`, пишет `notifications/`
- **Вызывающая сторона**: те же UI-места, что и `cancelLessonDirectly`-соседи, плюс боты напрямую
- **Auth**: нет
- **Secrets**: `TELEGRAM_BOT_TOKEN`, `VK_GROUP_TOKEN`

### `syncUpcomingLessonOnScheduleChange` — trigger (`students/{studentId}`)
Реагирует на любую запись в `students/{id}`; если `scheduleSlots`
реально изменились — пересобирает upcoming-черновики под новую сетку
слотов.
- **Firestore**: читает before/after документа, пишет/удаляет `students/{id}/lessons/*`
- **Вызывающая сторона**: срабатывает от прямой клиентской записи `updateStudentSchedule` (`src/firebase/students.js`) или от создания ученика при регистрации — никогда не вызывается напрямую
- **Auth**: н/п (триггер)
- **Secrets**: нет

---

## 3. Учебные планы и прогресс

### `assignCurriculumTemplate` — callable
Копирует темы/прототипы шаблона в `curriculumProgress/main` ученика
(полная перезапись, не слияние).
- **Параметры**: `{ studentId, templateId }`
- **Firestore**: читает `curriculumTemplates/{templateId}`, пишет `students/{id}/curriculumProgress/main`, обновляет `students/{id}.curriculumSourceTemplateId`
- **Вызывающая сторона**: `src/firebase/curriculum.js` ← `StudentProfileSection`/`student-row.jsx` (блок назначения программы)
- **Auth**: `request.auth` обязателен
- **Secrets**: нет

### `setStudentGoal` — callable
Студенческий путь без auth: сохраняет целевой балл и дату экзамена
(Exam Radar).
- **Параметры**: `{ studentId, targetScore, examDate }`
- **Firestore**: обновляет `students/{id}.targetScore`/`.examDate`
- **Вызывающая сторона**: `src/firebase/students.js` ← `StudentDashboard` (форма цели Exam Radar)
- **Auth**: нет (студенческий путь)
- **Secrets**: нет

### `addPersonalTopic` — callable
Добавляет одну тему/прототип напрямую в `curriculumProgress/main`,
независимо от исходного шаблона; создаёт документ прогресса на лету, если
его ещё не было.
- **Параметры**: `{ studentId, title, minScoreRequired, type: "topic"|"prototype" }`
- **Возвращает**: `{ success, id }`
- **Firestore**: пишет/обновляет `students/{id}/curriculumProgress/main`
- **Вызывающая сторона**: `src/firebase/curriculum.js` ← `student-row.jsx` (диалог личной программы)
- **Auth**: `request.auth` обязателен (в отличие от `setStudentGoal` — это учительское действие)
- **Secrets**: нет

### `removePersonalTopic` — callable
Удаляет один элемент из `curriculumProgress/main` по id (не трогает уже
завершённые уроки, где эта тема отмечена пройденной — история не
переписывается).
- **Параметры**: `{ studentId, itemId, type: "topic"|"prototype" }`
- **Firestore**: обновляет `students/{id}/curriculumProgress/main`
- **Вызывающая сторона**: `src/firebase/curriculum.js` ← `student-row.jsx`
- **Auth**: `request.auth` обязателен
- **Secrets**: нет

### `markTopicsCovered` — callable
Отмечает темы/прототипы пройденными по итогам конкретного урока;
дублирует снимок `{id, title}` на сам документ урока. Silent no-op, если
у ученика вообще нет назначенной программы.
- **Параметры**: `{ studentId, lessonId, topicIds, prototypeIds, rating }`
- **Firestore**: транзакционно обновляет `students/{id}/curriculumProgress/main` и `students/{id}/lessons/{lessonId}.coveredTopics`/`.coveredPrototypes`
- **Вызывающая сторона**: `src/firebase/curriculum.js` ← `HomeworkLessonDialog` (чеклист «Пройденный материал» при завершении урока)
- **Auth**: `request.auth` обязателен
- **Secrets**: нет

---

## 4. Финансы

### `addPayment` — callable
Регистрирует оплату (в занятиях, не в валюте): пишет запись в журнал и
атомарно увеличивает кэш баланса.
- **Параметры**: `{ studentId, lessonsCount, note? }`
- **Возвращает**: `{ success, newBalance }`
- **Firestore**: транзакционно пишет `students/{id}/balanceLedger/{entryId}` и обновляет `students/{id}.paidLessonsBalance`
- **Вызывающая сторона**: `src/firebase/finance.js` ← `AddPaymentForm` (карточка ученика / раздел «Финансы»)
- **Auth**: `request.auth` обязателен
- **Secrets**: `TELEGRAM_BOT_TOKEN`, `VK_GROUP_TOKEN` (списание за урок происходит внутри `completeLesson`, не здесь, но тот же секрет-набор нужен на случай уведомления о низком балансе после будущего списания — по факту эта функция сама уведомлений не шлёт, секреты объявлены с запасом)

Списание за проведённый урок (`deductLessonFromBalance`) — **не отдельная
Cloud Function**, а внутренний вызов из `completeLesson` (см. раздел
«Уроки»); напрямую с клиента не вызывается.

---

## 5. Уведомления

**В этом домене нет callable-функций** — клиент читает `notifications/`
напрямую через `onSnapshot` (`src/firebase/notifications.js`), без
Cloud Function-посредника. Запись в `notifications/` происходит только
изнутри других функций через общий `createNotification()`
(`functions/core/notifier.js`) — это внутренний хелпер, а не отдельная
Cloud Function. Единственные экспортируемые функции в этом домене —
три планировщика, которые генерируют и шлют напоминания:

### `dailyReminderMidday` — scheduled (`0 9 * * *`, `Europe/Moscow`)
Раз в день в 9:00 по Москве — одно сводное сообщение по всем урокам
ученика в окне «сейчас → конец завтрашнего дня».
- **Firestore**: читает `students/*`, `students/*/lessons` (статус `upcoming`), пишет `notifications/`, обновляет `students/{id}.remindersSent.middaySentDate`
- **Вызывающая сторона**: Cloud Scheduler (внешний триггер)
- **Secrets**: `TELEGRAM_BOT_TOKEN`, `VK_GROUP_TOKEN`

### `dailyReminderPreLesson` — scheduled (`0 * * * *`)
Каждый час — напоминание по каждому уроку, начинающемуся в ближайшие 2
часа (с троттлингом — не чаще раза в 30 мин на ученика).
- **Firestore**: то же плюс `students/{id}/lessons/{id}.remindersSent.preLessonSent`, `students/{id}.remindersSent.lastPreLessonSentAt`
- **Вызывающая сторона**: Cloud Scheduler
- **Secrets**: `TELEGRAM_BOT_TOKEN`, `VK_GROUP_TOKEN`

### `dailyReminderTenMin` — scheduled (`*/5 * * * *`)
Каждые 5 минут — напоминание по урокам, начинающимся в ближайшие 15 минут
(текст говорит «10 минут», окно шире как буфер под интервал крона).
- **Firestore**: то же плюс `students/{id}/lessons/{id}.remindersSent.tenMinSent`
- **Вызывающая сторона**: Cloud Scheduler
- **Secrets**: `TELEGRAM_BOT_TOKEN`, `VK_GROUP_TOKEN`

---

## 6. Google Calendar

### `startGoogleOAuth` — callable
Начинает OAuth-подключение: генерирует consent URL и CSRF-`state`.
- **Возвращает**: `{ authUrl }`
- **Firestore**: пишет `oauthStates/{state}`
- **Вызывающая сторона**: `src/firebase/google-calendar.js` ← `TeacherDashboard` (кнопка «Подключить» Google Calendar)
- **Auth**: `request.auth` обязателен
- **Secrets**: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`

### `googleOAuthCallback` — HTTP
Redirect-эндпоинт, на который Google отправляет браузер после согласия
пользователя; обменивает `code` на токены, редиректит обратно в панель.
- **Вход**: query-параметры `code`, `state`
- **Firestore**: читает и удаляет `oauthStates/{state}` (проверка TTL 10 мин), пишет `integrations/googleCalendar`
- **Вызывающая сторона**: браузер учителя, редиректится сюда самим Google после экрана согласия — никогда не вызывается программно
- **Auth**: нет (проверка через одноразовый `state`, не Firebase Auth)
- **Secrets**: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`

### `getGoogleCalendarStatus` — callable
Подключён ли Google Calendar вообще.
- **Возвращает**: `{ connected: boolean }`
- **Firestore**: читает `integrations/googleCalendar`
- **Вызывающая сторона**: `src/firebase/google-calendar.js` ← `TeacherDashboard`
- **Auth**: `request.auth` обязателен
- **Secrets**: нет

### `getCalendarEmbedInfo` — callable
Строит URL для встраиваемого `<iframe>` календаря учителя.
- **Возвращает**: `{ embedUrl }`
- **Firestore**: читает `integrations/googleCalendar` (через `getAuthorizedClient`)
- **Внешнее**: вызывает Google `oauth2.userinfo.get()`
- **Вызывающая сторона**: `src/firebase/google-calendar.js` ← `TeacherDashboard` (вкладка календаря)
- **Auth**: `request.auth` обязателен
- **Secrets**: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`

### `syncStudentScheduleToGoogleCalendar` — trigger (`students/{studentId}`)
Реагирует на изменение `scheduleSlots`: создаёт/обновляет/удаляет
повторяющиеся события в Google Calendar, пишет id событий обратно на
документ ученика (снабжено защитой от рекурсии на собственную запись).
- **Firestore**: читает before/after, обновляет `students/{id}.googleEventIds`/`.googleEventId`
- **Внешнее**: Google Calendar API
- **Вызывающая сторона**: та же запись `students/{id}`, что и `syncUpcomingLessonOnScheduleChange` — оба триггера висят на одном документе независимо друг от друга
- **Auth**: н/п (триггер)
- **Secrets**: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`

---

## 7. Видеозвонки

### `updateVideoCallAvailability` — scheduled (`*/5 * * * *`)
Поддерживает флаг `videoCallAvailable` на предстоящих уроках — `true` в
окне [-10 мин; +60 мин] от эффективной даты урока.
- **Firestore**: читает `students/*/lessons` (статус `upcoming`), точечно обновляет `videoCallAvailable` там, где значение изменилось
- **Вызывающая сторона**: Cloud Scheduler
- **Auth**: н/п
- **Secrets**: нет (никогда не шлёт сообщения в бот)

Сама ссылка на видеозвонок (`integrations/videoCall.url`) правится прямым
клиентским `setDoc` (`src/firebase/videoCall.js`) — отдельной Cloud
Function на это нет.

---

## 8. Служебные / диагностические

### `deleteStudent` — callable
Полное каскадное удаление ученика: события Google Calendar, все
документы `lessons` + их файлы в Storage, `registrationTokens`,
бот-сессии, затем сам документ ученика. Каждый шаг обёрнут в try/catch —
отдельная неудача (например, не удалось стереть файл Storage) не
прерывает остальную очистку.
- **Параметры**: `{ studentId }`
- **Firestore**: удаляет `students/{id}`, `students/{id}/lessons/*`, записи `registrationTokens` с этим `studentId`, `telegramSessions`/`vkSessions` по chatId/peerId ученика
- **Storage**: удаляет файлы материалов/домашки, на которые ссылались уроки ученика
- **Внешнее**: удаляет события Google Calendar
- **Вызывающая сторона**: `src/firebase/students.js` ← `DeleteStudentDialog` (`student-row.jsx`)
- **Auth**: `request.auth` обязателен
- **Secrets**: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`

Диагностических/health-check функций в проекте нет — единственный способ
проверить состояние функции сейчас — `firebase functions:log`.

`functions/scripts/migrateSchedule.js` существует в репозитории, но это
**не Cloud Function** — одноразовый ручной скрипт (`node
functions/scripts/migrateSchedule.js`), не деплоится и не вызывается ни
из чего в этом каталоге.

---

## Firebase Secrets

Полный список (`defineSecret(...)` по всему `functions/`) — 5 штук,
никаких других секретов в проекте нет:

| Secret | Для чего |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Токен Telegram-бота — все вызовы Telegram Bot API (`sendMessage`, `deleteMessage`, `getFile`, вебхук) |
| `VK_GROUP_TOKEN` | Токен доступа сообщества VK — все вызовы VK API (`messages.send`, `messages.delete`, `messages.sendMessageEventAnswer`) |
| `VK_CONFIRMATION_CODE` | Строка, которую VK Callback API ожидает в ответ на `type: "confirmation"` при настройке вебхука в кабинете сообщества |
| `GOOGLE_OAUTH_CLIENT_ID` | Google OAuth2 client id для подключения Google Calendar учителя |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google OAuth2 client secret, в паре с `GOOGLE_OAUTH_CLIENT_ID` |

Практическое следствие (см. `techContext.md` в memory bank проекта): любая
`onCall`/`onSchedule`/`onRequest`/`onDocumentWritten`, которая хотя бы
транзитивно доходит до отправки бот-сообщения (`createNotification`),
обязана явно перечислить `TELEGRAM_BOT_TOKEN`+`VK_GROUP_TOKEN` в своём
`secrets:` — Cloud Functions v2 монтирует только то, что функция
объявила явно; без этого доставка в бот молча падает без видимой ошибки
у вызывающей стороны.
