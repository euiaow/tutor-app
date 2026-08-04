# Модель данных

Собрано по фактическому коду (не по прошлым обсуждениям): чтения/записи в
`functions/core/*.js`, `functions/index.js`, `functions/reminders.js`,
`functions/adapters/*.js` и `src/firebase/*.js`. Никакого файла
`firestore.rules`/`storage.rules` в репозитории нет — доступ к коллекциям
не ограничен на уровне кода Cloud Functions или клиентских правил из этого
чекаута (см. `techContext.md` в memory bank проекта).

Обозначения: **тип** указан по факту того, что пишется/читается в коде
(Firestore `Timestamp`, если не сказано иное — JS `Date` после
`.toDate()`/сериализации через клиентские мапперы). «Опционально» —
поле может отсутствовать у старых документов и код обязан обрабатывать
`undefined`/`null` через `??`.

---

## Коллекции верхнего уровня

### `students/{studentId}`

Единственный источник правды об ученике. У ученика нет Firebase Auth —
`studentId` (сам является ключом документа) выступает единственным
секретом, знание которого даёт доступ к данным этого ученика везде в
клиентском коде.

| Поле | Тип | Назначение |
|---|---|---|
| `name` | string | Полное имя ученика |
| `accessCode` | string | 4-значный PIN для входа в `LoginScreen` (`verifyStudentAccessCode`) |
| `xp` | number | Игровой опыт (не используется в текущем UI активно, но пишется/читается) |
| `level` | number | Игровой уровень, растёт при `xp >= 100` |
| `subject` | string[] | Предметы (`"russian"`, `"literature"`, …). *Опционально/legacy*: раньше было одиночной строкой — `mapStudentDoc` приводит нестроковые/отсутствующие значения к `[]` |
| `examTarget` | string | `"ege"` \| `"oge"` \| `"school"`, по умолчанию `"school"` |
| `hourlyRate` | number | Ставка ₽/час, по умолчанию `0` |
| `paidLessonsBalance` | number | Текущий баланс оплаченных занятий (кэш суммы `balanceLedger`), по умолчанию `0` |
| `lowBalanceThreshold` | number | Порог, при котором баланс считается низким, по умолчанию `1` |
| `autoRemindLowBalance` | boolean | Слать ли ученику авто-напоминание о низком балансе, по умолчанию `true` |
| `scheduleSlots` | array\<Slot\> | Слоты еженедельного расписания (см. ниже). *Опционально/legacy*: старые документы могли иметь одиночный объект `schedule` вместо массива — `normalizeScheduleSlots` поддерживает оба варианта |
| `schedule` | object | **Legacy**, одиночный слот `{dayOfWeek, time, durationMinutes}` — читается только как fallback, если `scheduleSlots` нет |
| `topic` | string | Свободное поле темы (используется слабо) |
| `reviewTopic` | string | Свободное поле темы повторения |
| `platform` | string \| null | `"telegram"` \| `"vk"` \| `null` — через какой бот ученик зарегистрирован |
| `telegramChatId` | string \| null | Numeric chat id Telegram (не публичный `@username`) |
| `vkPeerId` | string \| null | Numeric peer id VK |
| `contactUrl` | string \| null | Ручная ссылка для связи с учеником (override, если авто-выведенная ссылка не подходит) |
| `curriculumSourceTemplateId` | string \| null | Ссылка на `curriculumTemplates/{id}`, из которого скопирован текущий `curriculumProgress/main` |
| `targetScore` | number \| null | Целевой балл ЕГЭ/ОГЭ (Exam Radar) |
| `examDate` | Timestamp \| null | Дата экзамена (Exam Radar) |
| `googleEventIds` | map\<string, string\> | *Опционально*. Ключ — `slotIndex` как строка (`"0"`, `"1"`, …), значение — Google Calendar event id для этого слота расписания |
| `googleEventId` | string | **Legacy**, одиночный event id — читается как fallback перед `googleEventIds`, когда `scheduleSlots` было одним слотом |
| `remindersSent` | map | `{ middaySentDate?: Timestamp, lastPreLessonSentAt?: Timestamp }` — служебное состояние дневного/двухчасового напоминания (не путать с одноимённым полем на документе урока, у него другие ключи) |

**Slot** (элемент `scheduleSlots[]`): `{ dayOfWeek: number (0-6), time: "HH:MM", durationMinutes: number }`.

---

### `students/{studentId}/lessons/{lessonId}`

Подколлекция. Один документ — один урок (по расписанию, внеплановый или
черновик предстоящего). Создаётся `ensureUpcomingLesson`/триггером синка
расписания (`status: "upcoming"`) либо `createExtraLesson`.

| Поле | Тип | Назначение |
|---|---|---|
| `status` | string | `"upcoming"` \| `"completed"` \| `"cancelled"` |
| `date` | Timestamp | Дата/время урока. При подтверждённом переносе сдвигается на новое время (см. `rescheduledDate`) |
| `slotIndex` | number \| null | Индекс слота в `students.scheduleSlots`, к которому привязан урок. `null` для внепланового урока. *Опционально/legacy*: документы без поля трактуются как слот `0` |
| `isExtraLesson` | boolean | *Опционально*. `true` только у внеплановых уроков (`createExtraLesson`); у обычных урок-черновиков поля вовсе нет |
| `durationMinutes` | number | Копия длительности слота на момент создания черновика — не меняется задним числом при правке расписания |
| `topic` | string | Тема урока, редактируется учителем пока `status === "upcoming"` |
| `homework` | object | `{ assignment: { text: string, files: Material[] }, submission: { files: {url, submittedAt: Timestamp}[], submittedAt: Timestamp \| null } }` |
| `materials` | Material[] | *Опционально*. Дополнительные материалы (объединение `homework.assignment.files` + вручную прикреплённых при завершении урока), дедуп по `url` |
| `attendance` | string \| null | `"on_time"` \| `"late"` \| `"absent"`, ставится в `completeLesson` |
| `homeworkDone` | boolean | Ставится в `completeLesson` |
| `rating` | string \| null | `"excellent"` \| `"good"` \| `"needs_work"`, ставится в `completeLesson` |
| `rescheduled` | boolean | `true`, если урок хоть раз был перенесён (для UI-бейджа) |
| `rescheduledDate` | Timestamp \| null | Подтверждённая новая дата (аудит-след — `date` тоже обновляется, это дублирующее поле специально для UI) |
| `rescheduleStatus` | string \| null | `null` \| `"pending_student"` \| `"pending_teacher"` \| `"confirmed"` |
| `rescheduleInitiator` | string \| null | `"teacher"` \| `"student"` — кто предложил перенос |
| `rescheduleProposedDate` | Timestamp \| null | Предложенная (ещё не подтверждённая) дата переноса |
| `cancellationStatus` | string \| null | `null` \| `"pending_student"` \| `"pending_teacher"` |
| `cancellationInitiator` | string \| null | `"teacher"` \| `"student"` — кто предложил отмену |
| `proposalMessage` | object \| null | `{platform: "telegram"\|"vk", chatId: string, messageId: string\|number}` — бот-сообщение с кнопками, отправленное **ученику** при последнем предложении переноса/отмены; удаляется и обнуляется при разрешении (подтверждение/отклонение с любой стороны) |
| `teacherProposalMessage` | array\<object\> \| null | То же самое, но массив (0–2 элемента: **учитель** может быть подключён к Telegram и VK одновременно) — заполняется, когда предложение исходит от ученика |
| `coveredTopics` | \{id, title\}[] | *Опционально*. Снимок тем учебного плана, отмеченных пройденными на этом уроке (`markTopicsCovered`) |
| `coveredPrototypes` | \{id, title\}[] | То же для прототипов |
| `videoCallAvailable` | boolean | *Опционально* (отсутствие трактуется как `false`). Поддерживается шедулером `updateVideoCallAvailability` каждые 5 мин — `true` в окне [-10 мин; +60 мин] от эффективной даты урока |
| `remindersSent` | map | `{ preLessonSent?: boolean, tenMinSent?: boolean }` — служебные флаги «напоминание уже отправлено» (для внеплановых уроков задаётся сразу `{preLessonSent: false}` при создании) |
| `googleEventId` | string | *Только у внеплановых уроков* (`isExtraLesson: true`) — у обычных уроков id календарного события хранится на `students.googleEventIds[slotIndex]`, не здесь |
| `createdAt` | Timestamp | `serverTimestamp()` при создании |

**Material** (элемент `homework.assignment.files`/`materials`): `{ title: string, url: string, type?: string }`.

---

### `students/{studentId}/balanceLedger/{entryId}`

Подколлекция. Append-only журнал операций с балансом — `students.paidLessonsBalance`
это кэш суммы этих записей, обновляется в той же транзакции, что и запись
в журнал (`addPayment`/`deductLessonFromBalance`, `functions/core/finance.js`).

| Поле | Тип | Назначение |
|---|---|---|
| `type` | string | `"payment"` \| `"lesson_deduction"` |
| `amount` | number | `+N` для оплаты, `-1` для списания за урок |
| `note` | string \| null | Комментарий учителя к оплате (только для `type: "payment"`) |
| `lessonId` | string \| null | Ссылка на `students/{id}/lessons/{lessonId}`, за который списано — `null` для платежей |
| `createdAt` | Timestamp | `serverTimestamp()` |

---

### `students/{studentId}/curriculumProgress/main`

Подколлекция-синглтон: **всегда ровно один документ** с id `"main"`, не
множество документов на тему. Полностью перезаписывается (не сливается)
при `assignCurriculumTemplate`.

| Поле | Тип | Назначение |
|---|---|---|
| `topics` | ProgressItem[] | Темы программы ученика |
| `prototypes` | ProgressItem[] | Прототипы программы ученика |
| `assignedAt` | Timestamp | Когда программа была назначена/пересоздана |

**ProgressItem**: `{ id: string, title: string, covered: boolean, coveredAt: Timestamp | null, minScoreRequired: number, needsReview?: boolean }`.
`needsReview` — *опционально*, появляется только у элементов, отмеченных
пройденными через `markTopicsCovered` при уроке с оценкой `"needs_work"`;
у элементов, добавленных вручную (`addPersonalTopic`) или скопированных
из шаблона без отметки, поля нет.

---

### `curriculumTemplates/{templateId}`

Верхнеуровневая коллекция. Админский контент, редактируется учителем
напрямую с клиента (`src/firebase/curriculum.js`), без Cloud Function.

| Поле | Тип | Назначение |
|---|---|---|
| `name` | string | Название плана |
| `examTarget` | string | `"ege"` \| `"oge"` \| `"school"` |
| `topics` | \{id, title, minScoreRequired\}[] | Темы шаблона |
| `prototypes` | \{id, title, minScoreRequired\}[] | Прототипы шаблона |
| `createdAt` | Timestamp | `serverTimestamp()`, ставится только при создании |
| `updatedAt` | Timestamp | `serverTimestamp()`, обновляется при каждом сохранении |

---

### `notifications/{notificationId}`

Верхнеуровневая коллекция. Единая точка правды для колокольчика
учителя и блока уведомлений ученика — пишется исключительно через
`createNotification()` (`functions/core/notifier.js`).

| Поле | Тип | Назначение |
|---|---|---|
| `target` | string | `"teacher"` \| `"student"` — кому адресовано |
| `studentId` | string \| null | Ссылка на `students/{studentId}`, к которому относится событие (`null` для уведомлений без привязки к ученику — таких на практике не встречается, но поле не required) |
| `type` | string | Тип события — см. полный список ниже |
| `text` | string | Готовый текст на русском (тот же, что уходит в бот) |
| `read` | boolean | Прочитано ли, по умолчанию `false` |
| `createdAt` | Timestamp | `serverTimestamp()` |
| `lessonId` | string \| null | Ссылка на `students/{studentId}/lessons/{lessonId}`, если событие про конкретный урок |

Известные значения `type` (по коду): `reschedule_proposed_to_student`,
`reschedule_proposed_to_teacher`, `reschedule_confirmed`,
`reschedule_rejected`, `cancellation_proposed_to_student`,
`cancellation_proposed_to_teacher`, `cancellation_confirmed`,
`cancellation_rejected`, `lesson_cancelled_by_teacher`,
`assignment_added`, `assignment_updated`, `material_added`,
`homework_submitted`, `homework_received`, `extra_lesson_assigned`,
`low_balance`, `self_service_registration`, `lesson_reminder_midday`,
`lesson_reminder_preLesson`, `lesson_soon`.

`telegramReplyMarkup`/`vkKeyboard`, которые можно передать в
`createNotification(...)`, **не сохраняются в документ** — это
dispatch-only опции, влияющие только на отправку в бот.

---

### `registrationTokens/{token}`

Верхнеуровневая коллекция. `{token}` — сам случайный токен (id документа).

| Поле | Тип | Назначение |
|---|---|---|
| `studentName` | string \| null | Имя, введённое учителем при создании ссылки. `null` для self-service токенов (имя появится только на `students/{id}.name` после того, как ученик впишет его в чат бота) |
| `status` | string | `"pending"` \| `"used"` |
| `isSelfService` | boolean | *Опционально*, есть только у токенов из `/start signup` (Telegram) / `"регистрация"` (VK) |
| `createdAt` | Timestamp | `serverTimestamp()` |
| `studentId` | string | *Появляется только после использования*. Ссылка на созданный `students/{studentId}` |
| `completedAt` | Timestamp | *Появляется только после использования* |

---

### `teacherConnectTokens/{token}`

Верхнеуровневая коллекция. `{token}` — случайный токен (id документа).
Одноразовые токены для привязки Telegram/VK чата учителя к
`integrations/teacherContact` (замена ручного редактирования этого
документа). TTL 10 минут проверяется инлайн в коде при использовании
(`resolveTeacherConnectToken`), отдельного cron на очистку нет —
просроченные документы остаются в коллекции неограниченно.

| Поле | Тип | Назначение |
|---|---|---|
| `platform` | string | `"telegram"` \| `"vk"` |
| `status` | string | `"pending"` \| `"used"` |
| `createdAt` | Timestamp | `serverTimestamp()`, база для проверки TTL |

---

### `integrations/{docId}`

Верхнеуровневая коллекция-контейнер для нескольких несвязанных
синглтон-документов (не подколлекция, просто общий namespace):

**`integrations/googleCalendar`**

| Поле | Тип | Назначение |
|---|---|---|
| `access_token` | string | Текущий access token учительского Google-аккаунта |
| `refresh_token` | string | *Опционально* — Google присылает его только при первом consent, при обновлении токена поле не перезаписывается, если в ответе его нет |
| `expiry_date` | number (ms epoch) | Когда истекает `access_token` |
| `connectedAt` | Timestamp | `serverTimestamp()`, ставится при каждом сохранении токенов |

**`integrations/videoCall`**

| Поле | Тип | Назначение |
|---|---|---|
| `url` | string \| null | Единая постоянная ссылка на видеозвонок, общая для всех учеников |

**`integrations/teacherContact`**

| Поле | Тип | Назначение |
|---|---|---|
| `telegramChatId` | string \| null | Chat id учителя в Telegram, если подключено |
| `vkPeerId` | string \| null | Peer id учителя в VK, если подключено |
| `updatedAt` | Timestamp | `serverTimestamp()`, обновляется при подключении/отключении канала |

Учитель может быть подключён к **обоим** каналам одновременно — оба поля
независимы, оба заполняются `resolveTeacherConnectToken` при успешном
использовании соответствующего токена, оба доступны для сброса по
отдельности с клиента (`disconnectTeacherPlatform`).

---

### `oauthStates/{state}`

Верхнеуровневая коллекция. `{state}` — случайная строка (id документа),
CSRF-state для Google OAuth consent-флоу.

| Поле | Тип | Назначение |
|---|---|---|
| `createdAt` | Timestamp | `serverTimestamp()` — используется для проверки истечения (10 минут) в `googleOAuthCallback` |

---

### `telegramSessions/{chatId}` / `vkSessions/{peerId}`

Две отдельные верхнеуровневые коллекции с идентичной формой документа.
Id документа — numeric chat/peer id как строка. Временное состояние
пошагового диалога бота (регистрация, ввод даты переноса); документ
удаляется по завершении шага (`sessionRef.delete()`).

| Поле | Тип | Назначение |
|---|---|---|
| `token` | string | *Опционально*. Токен регистрации, если сессия — это флоу регистрации |
| `step` | string | `"awaiting_name"` \| `"awaiting_pin"` \| `"awaiting_reschedule_date"` |
| `name` | string | *Опционально*, появляется после шага `awaiting_name` |
| `lessonId` | string | *Опционально*, есть только у сессии `"awaiting_reschedule_date"` — ссылка на `students/{id}/lessons/{lessonId}`, для которого запрошен перенос |

---

### `vkProcessedMessages/{key}`

Верхнеуровневая коллекция. `{key}` = `"{peerId}_{conversationMessageId}"`
(или `"id_{message.id}"` как fallback). Чисто дедуп-guard: VK повторно
шлёт `message_new`, если вебхук не ответил достаточно быстро;
`.create()` (не `.set()`) на этот документ атомарно гарантирует
обработку ровно один раз. **Нет TTL/очистки** — коллекция растёт
неограниченно, по одному документу на каждое входящее сообщение VK.

| Поле | Тип | Назначение |
|---|---|---|
| `processedAt` | Timestamp | `serverTimestamp()` |

---

## Связи между коллекциями

- `students/{id}/lessons/{lessonId}` — подколлекция `students/{id}`, живёт и умирает вместе с учеником (`deleteStudent` явно чистит её, рекурсивного удаления в Firestore нет).
- `students/{id}/balanceLedger/{entryId}` — подколлекция `students/{id}`.
- `students/{id}/curriculumProgress/main` — подколлекция-синглтон `students/{id}`.
- `students.curriculumSourceTemplateId` → `curriculumTemplates/{id}` (какой шаблон был скопирован последним).
- `students.googleEventIds[slotIndex]` / `students.googleEventId` (legacy) → id события во внешнем Google Calendar (не Firestore-ссылка).
- `students/{id}/lessons/{lessonId}.googleEventId` → id события Google Calendar для конкретного внепланового урока.
- `notifications.studentId` → `students/{id}`.
- `notifications.lessonId` → `students/{studentId}/lessons/{lessonId}` (тот же `studentId`, что и в самом документе уведомления).
- `students/{id}/balanceLedger/{entryId}.lessonId` → `students/{id}/lessons/{lessonId}` (для записей `type: "lesson_deduction"`; `null` для `type: "payment"`).
- `students/{id}/lessons/{lessonId}.proposalMessage`/`.teacherProposalMessage` → внешние сущности (сообщения в Telegram/VK по `{platform, chatId, messageId}`), не Firestore-документы.
- `students/{id}/lessons/{lessonId}.coveredTopics`/`.coveredPrototypes` — денормализованный снимок элементов из `students/{id}/curriculumProgress/main` на момент, когда урок был завершён (не живая ссылка — правки текущей программы задним числом эту историю не переписывают).
- `registrationTokens/{token}.studentId` → `students/{id}` (появляется после использования токена).
- `teacherConnectTokens/{token}.platform` определяет, какое поле (`telegramChatId`/`vkPeerId`) на `integrations/teacherContact` будет заполнено при использовании токена.
- `telegramSessions/{chatId}.token` / `vkSessions/{peerId}.token` → `registrationTokens/{token}` (пока сессия активна).
- `telegramSessions/{chatId}.lessonId` / `vkSessions/{peerId}.lessonId` → `students/{studentId}/lessons/{lessonId}` (studentId выводится отдельно через `telegramChatId`/`vkPeerId` на самом документе ученика, в сессии не хранится).
- `students.telegramChatId`/`students.vkPeerId` — обратная связь для поиска ученика по входящему сообщению бота (`findStudentIdByChatIdentity`), а также ключ, по которому `telegramSessions`/`vkSessions` и `vkProcessedMessages` **не** ссылаются напрямую (сессии ключуются самим chatId/peerId, а не через студента).
