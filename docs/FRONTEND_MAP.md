# Карта фронтенда

Что где живёт и как связано — не построчный пересказ компонентов. Основано
на фактической структуре `src/` (проверено чтением `App.jsx`,
`TeacherDashboard.jsx`, `StudentDashboard.jsx` целиком и подсчётом
реальных импортов по всему `src/`, не предположениями).

---

## 1. Маршрутизация

Определена в `src/App.jsx` (`react-router-dom`, `BrowserRouter`):

| Путь | Показывает | Защита |
|---|---|---|
| `/` | `<Navigate to="/teacher" replace />` | — |
| `/teacher` | `TeacherRoute` — внутренний компонент, слушает `onAuthStateChanged`: пока статус неизвестен → спиннер «Проверка входа...»; есть Firebase Auth сессия → `TeacherDashboard`; нет → `TeacherLogin` | Firebase Auth (email/пароль), проверяется на клиенте перед рендером страницы |
| `/student/:studentId` | `StudentDashboard` → `StudentGate` → PIN-экран (`LoginScreen`) или сам дашборд, в зависимости от `localStorage` | Нет Firebase Auth — своя PIN-модель, см. §5 |
| `/app` | `AppEntry` — резолвит один из трёх сценариев в момент загрузки: (1) внутри Telegram Mini App с уже привязанным учеником → редирект на `/student/{id}?skipPin=true`; (2) внутри Telegram без привязки → `SelfServiceSignup`; (3) обычный браузер/QR → `PublicLanding` | Резолвится по контексту (Telegram WebApp `initDataUnsafe`), не по URL-параметру напрямую (см. §5 про `skipPin`) |

`TeacherRoute` — не отдельный роут, а компонент-переключатель прямо
внутри `<Route path="/teacher">`, так что URL для входа и для самой
панели учителя один и тот же — какая страница фактически покажется,
решает исключительно состояние Firebase Auth.

---

## 2. Две главные страницы

### 2.1. `TeacherDashboard.jsx`

Секции в порядке отображения на странице:

1. **Шапка** (`header`) — заголовок, три кнопки: `VideoCallSettings`
   (Popover, подписка `subscribeToVideoCallUrl`, прямой `setDoc` на
   `updateVideoCallUrl`, без callable), `TeacherNotificationsBell`
   (Dialog; подписка `subscribeToTeacherNotifications`; `markNotificationRead`/
   `markAllNotificationsRead` — прямые Firestore-записи, не callable; внутри
   диалога — `TeacherBotConnectStatus`, свой `subscribeToTeacherContact` +
   callable `generateTeacherConnectToken`), кнопка «Выйти» (`signOutTeacher`).
2. **Статы** (4 плашки) — считаются на клиенте из уже загруженных
   `students`/`upcomingLessons`, отдельного запроса не делают.
3. **Расписание** — one-time `getGoogleCalendarStatus()` при монтировании;
   если подключено — ещё один one-time `getCalendarEmbedInfo()` для
   `<iframe>`. Кнопка «Подключить» → callable `startGoogleOAuth()` →
   редирект на Google. `ExtraLessonDialog` в этой же секции — callable
   `createExtraLesson`.
4. **Ближайшие уроки** — `subscribeToUpcomingLessons` (realtime,
   `collectionGroup` по всем ученикам, капа 10), клиентская кластеризация
   (`selectClusteredUpcomingLessons`, до 3 подряд идущих). Каждая строка —
   переиспользуемый `UpcomingLessonCard` (см. §3): открывает
   `HomeworkLessonDialog`/`RescheduleDialog`/`CancelLessonDialog`, вызывает
   callable-и `confirmReschedule`/`cancelReschedule`/`confirmCancellation`/
   `rejectCancellation`/`proposeReschedule`/`proposeCancellation`/
   `cancelLessonDirectly` в зависимости от кнопки.
5. **Ученики** — `subscribeToStudents` (realtime, весь список без пагинации).
   Плюс два one-time запроса, не привязанных к конкретной строке:
   `getCurriculumTemplates()` (для отображения названия плана в каждой
   строке) и `getAllCurriculumProgressByStudent()` (батч-прогресс для
   свёрнутых строк, перезапрашивается при изменении `students.length`).
   Каждая строка — `StudentRow` (см. §3): раскрывается инлайн (не модалка),
   открывает `UpcomingLessonsListDialog`, `DeleteStudentDialog`, диалог
   редактирования профиля, диалог истории урока
   (`StudentLessonHistoryModal`); вызывает `deleteStudent`,
   `assignCurriculumTemplate`, `addPersonalTopic`, `removePersonalTopic`,
   прямые записи `updateStudentSchedule`/`updateStudentProfile`/
   `updateStudentContactUrl`.
6. **Прошедшие уроки** + **Финансы** (сетка 2 колонки) —
   `subscribeToCompletedLessons` (realtime, капа 25, показывает первые 5);
   «Показать все» → `AllPastLessonsDialog`, one-time `getAllCompletedLessons()`.
   `FinanceSection` — отдельный компонент со своими подписками:
   `subscribeToIncomeLessons` (realtime, `status in [upcoming, completed]`,
   без капы) для расчёта «Доход за неделю»; открытие карточки ученика →
   `subscribeToBalanceLedger` (realtime, только пока открыт диалог);
   `AddPaymentForm` внутри → callable `addPayment`.
7. **Учебные планы** (`CurriculumSection`) — собственный one-time
   `getCurriculumTemplates()` (перезапрашивается вручную после каждого
   изменения, не realtime); CRUD — прямые клиентские записи
   (`createCurriculumTemplate`/`updateCurriculumTemplate`/
   `deleteCurriculumTemplate`), без callable вообще (админский контент).
8. **Ожидают регистрации** (`PendingRegistrations`) —
   `subscribeToPendingRegistrationTokens` (realtime, `where status ==
   pending`). Кнопка «Добавить ученика» в шапке секции «Ученики»
   (`RegistrationLinkDialog`) вызывает callable `generateRegistrationLink`;
   каждая строка — callable `cancelRegistrationToken` через кастомный
   диалог подтверждения.

### 2.2. `StudentDashboard.jsx`

Вход через `StudentGate`: если `localStorage['auth_{studentId}']`
не пуст — сразу дашборд; иначе, если в URL `?skipPin=true` и есть
Telegram-контекст — one-time `getStudentTelegramChatId()` для сверки
(см. §5), иначе `LoginScreen` (one-time `verifyStudentAccessCode()` при
вводе кода). После успеха рендерится `StudentDashboardContent`.

`StudentDashboardContent` сам держит три верхнеуровневые подписки —
`subscribeToStudent`, `subscribeToLessons` (вся история урока целиком, не
только upcoming), `subscribeToCurriculumProgress` — и раздаёт их вниз как
пропсы/данные. Секции в порядке отображения:

1. **Шапка** — приветствие по имени (`subscribeToStudent`), инициал
   вместо аватара.
2. **`NextLessonPlate`** — собственные подписки:
   `subscribeToUpcomingLesson` (ближайший актуальный урок),
   `subscribeToLesson` (точечно, только пока последний известный урок мог
   быть только что отменён — чтобы на миг показать «Урок отменён»),
   `subscribeToVideoCallUrl`. Вызывает callable-и `confirmCancellation`/
   `rejectCancellation`/`confirmReschedule`/`cancelReschedule` напрямую по
   кнопкам, `proposeReschedule`/`proposeCancellation` через диалоги
   (`ProposeRescheduleDialog`/`ProposeCancelDialog`), `submitHomeworkFile`
   при загрузке фото/файла домашки (сам файл предварительно грузится в
   Storage через `uploadHomeworkSubmissionFile`, не через callable).
   Кнопка «Все уроки» → `AllUpcomingLessonsDialog` со своей подпиской
   `subscribeToAllUpcomingLessons`.
3. **`StudentNotifications`** — своя подписка
   `subscribeToStudentNotifications` (realtime). «Все уведомления» →
   `AllNotificationsDialog` (переиспользует уже загруженные данные, без
   новой подписки). Каждое уведомление с типом `*_proposed` показывает
   `ProposalActions` — те же callable подтверждения/отклонения, что и в
   `NextLessonPlate`, продублированные здесь ради «ответить прямо из
   уведомления».
4. **`MyGoalCard`** (только если у ученика назначена программа ЕГЭ/ОГЭ) —
   callable `setStudentGoal`.
5. **`ExamRadar`** (если цель поставлена) **или `CurriculumProgressCard`**
   (иначе) — обе читают уже загруженный `curriculumProgress` сверху,
   собственных подписок не заводят.
6. **`MaterialsLibrary`** — тоже без своей подписки: материалы собираются
   на клиенте из уже загруженного `lessons` (завершённые уроки).
7. **`LessonHistory`** — превью на тех же `lessons` (фильтр `status !==
   "upcoming"`), «Показать всю историю» → собственный
   `LessonHistoryDialog` с независимой пересобственной подпиской
   `subscribeToLessons` (не переиспользует родительскую — открывается по
   требованию).

---

## 3. Переиспользуемые компоненты

Только те, что реально импортируются больше чем в одном месте (проверено
`grep` по `src/`, не предположение):

| Компонент | Что делает | Где используется |
|---|---|---|
| `theme-ui.jsx` (`Panel`, `Title`, `GhostBtn`, `SolidBtn`, `StudentDot`, `TeacherStatusBadge`, `TeacherDialog*`, `TeacherPopover*`, …) | Общий дизайн-язык учительской темы (розовая палитра, `.teacher-theme`) | 14 файлов — практически весь `components/teacher/*` |
| `StudentTags` (`student-tags.jsx`) | Цветные бейджи предмета/цели экзамена, один источник стилей (`TAG_STYLES`) | `TeacherDashboard.jsx` (карточки уроков), `finance-section.jsx`, `upcoming-lesson-card.jsx`, ещё 2 места |
| `HomeworkLessonDialog` | Полная карточка урока — тема/задание/ответ ученика/итоги/материалы, реагирует на `status` (`upcoming`/`completed`/`cancelled`) | `TeacherDashboard.jsx` (`PastLessonCard`), `student-row.jsx`, `upcoming-lesson-card.jsx` |
| `ContactButton`/`ContactIconButton` (`contact-button.jsx`) | Кнопка «Написать ученику» с авто-выведенной или ручной ссылкой | `student-row.jsx`, `upcoming-lesson-card.jsx` |
| `NotificationsList` | Общий рендер списка уведомлений (иконка+текст+время), опциональный `glass`-стиль | Колокольчик учителя (`TeacherDashboard.jsx`), блок уведомлений ученика (`StudentDashboard.jsx`) |
| `GlassDialog`/`GlassDialogContent`/… (`glass-dialog.jsx`) | Общий «стеклянный» модальный стиль для студенческой темы, обёртка над `ui/dialog.jsx` | `StudentDashboard.jsx`, `lesson-history.jsx`, `materials-library.jsx` |
| `TruncatedList` | «Показать первые N / развернуть на месте» без модалки | `student-row.jsx` (учительский чеклист тем/прототипов), `curriculum-item-groups.jsx` (ученический прогресс) |
| `MaterialLink` | Единый рендер ссылки на файл материала/домашки | `lesson-history.jsx`, `materials-library.jsx` |
| `Spinner` (`ui/spinner.jsx`) | Универсальный индикатор загрузки | 9 файлов по всему проекту |
| `Button` (`ui/button.jsx`, shadcn) | Базовая некастомизированная под тему кнопка | `PublicLanding.jsx`, `self-service-signup.jsx` — оба **вне** `.teacher-theme`/студенческой глас-темы, публичные/незалогиненные экраны |

**Обнаружено при проверке — реально существующие, но нигде не
импортируемые файлы (мёртвый код на момент написания):**
`components/status-badge.jsx`, `components/ui/popover.jsx`,
`components/ui/dropdown-menu.jsx`, `components/ui/sheet.jsx`,
`components/next-lesson-card.jsx`, `components/submit-homework-button.jsx`.
Судя по названиям и содержанию — более ранние версии функциональности,
впоследствии замещённые (`StatusBadge` → локальный `Badge` в
`lesson-history.jsx` + `TeacherStatusBadge` в `theme-ui.jsx`;
`ui/popover.jsx`/`ui/dropdown-menu.jsx` → `TeacherPopover*` в
`theme-ui.jsx`; `ui/sheet.jsx` → `TeacherDialog` для колокольчика
уведомлений; `next-lesson-card.jsx`/`submit-homework-button.jsx` →
инлайновая логика в `NextLessonPlate`). Не удалялись — при рефакторинге
этой области стоит перепроверить перед тем, как полагаться на них.

---

## 4. Слой доступа к данным (`src/firebase/*.js`)

Каждый файл — тонкая обёртка поверх Firestore SDK и/или
`httpsCallable`, чтобы компоненты не собирали запросы напрямую. Общий
паттерн: `subscribeTo*` = `onSnapshot` (realtime), `get*`/без префикса =
разовый `getDoc(s)` либо вызов callable.

| Файл | Что оборачивает |
|---|---|
| `firebase.js` | Инициализация приложения (`initializeApp`) и экспорт `db`/`auth`/`storage`/`functions` — на этот файл опираются все остальные |
| `auth.js` | `signInTeacher`/`signOutTeacher` — тонкая обёртка над Firebase Auth email/пароль |
| `students.js` | `mapStudentDoc` (единая нормализация документа), `subscribeToStudent(s)`, прямые записи `updateStudentSchedule`/`updateStudentContactUrl`/`updateStudentProfile`, callable-обёртки `deleteStudent`/`setStudentGoal`, служебные `findStudentIdByTelegramUserId`/`getStudentTelegramChatId`/`verifyStudentAccessCode` (все три — под PIN/skipPin-модель, без Auth) |
| `lessons.js` | Самый большой файл: `mapLessonDoc`, весь набор callable-обёрток (`ensureUpcomingLesson`, `completeLesson`, `propose/confirm/cancel/reject*`, `createExtraLesson`, `submitHomeworkFile`, `addLessonMaterial`, `updateHomeworkAssignment`), прямые записи (`updateLessonTopic`, `removeLessonMaterial`), и всё семейство подписок (`subscribeToUpcomingLesson(s)`, `subscribeToCompletedLessons`, `subscribeToIncomeLessons`, `subscribeToLesson(s)`) + one-time `getAllCompletedLessons`/`getLessons` |
| `curriculum.js` | Прямой CRUD `curriculumTemplates` (админский контент, без callable), callable-обёртки `assignCurriculumTemplate`/`markTopicsCovered`/`addPersonalTopic`/`removePersonalTopic`, `subscribeToCurriculumProgress`, батч-чтение `getAllCurriculumProgressByStudent`, ручная правка `setCurriculumItemCovered` |
| `finance.js` | `subscribeToBalanceLedger`, callable-обёртка `addPayment` |
| `notifications.js` | `subscribeToTeacherNotifications`/`subscribeToStudentNotifications`, прямые записи `markNotificationRead`/`markAllNotificationsRead` — весь домен уведомлений без единого callable, см. `docs/BACKEND_CATALOG.md` |
| `registration.js` | Callable-обёртки `generateRegistrationLink`/`cancelRegistrationToken`, `subscribeToPendingRegistrationTokens` |
| `teacherConnect.js` | Callable-обёртка `generateTeacherConnectToken`, `subscribeToTeacherContact` (проекция `integrations/teacherContact` в `{telegramConnected, vkConnected}`), прямая запись `disconnectTeacherPlatform` |
| `google-calendar.js` | Callable-обёртки `startGoogleOAuth`/`getGoogleCalendarStatus`/`getCalendarEmbedInfo` |
| `videoCall.js` | `subscribeToVideoCallUrl`, прямая запись `updateVideoCallUrl` — без callable вообще |
| `materials.js` | Не Firestore, а Storage: `uploadMaterial`/`uploadHomeworkSubmissionFile` (`uploadBytes`+`getDownloadURL`) |

---

## 5. Аутентификация

Два полностью независимых механизма, потому что у приложения два разных
типа пользователей (см. `CLAUDE.md`):

**Учитель — настоящий Firebase Auth**, email/пароль
(`signInWithEmailAndPassword`). Сессия живёт в Firebase Auth SDK
(`onAuthStateChanged` в `App.jsx`/`TeacherRoute`), не в `localStorage`
напрямую — токен-обновление и персистентность берёт на себя сам SDK.
Единственный учительский аккаунт (email захардкожен в
`TeacherLogin.jsx`, создан вручную в Firebase Console — см.
`docs/LOCAL_SETUP.md`).

**Ученик — без Firebase Auth вообще.** Вход — 4-значный PIN
(`accessCode` на документе `students/{id}`, сверяется client-side
`getDoc`+сравнение строк в `verifyStudentAccessCode`, без callable). Раз
код совпал — `localStorage['auth_{studentId}']` ставится в `"true"`, и
это единственное, что помнит браузер: ключ **не содержит** ни токена, ни
подписи, просто факт «этот код на этом устройстве уже вводили». Оговорка
`?skipPin=true` (используется `/app`-редиректом из Telegram Mini App) —
сама по себе ничего не доказывает (её может подставить кто угодно
вручную в URL); реальная проверка — свежий `getStudentTelegramChatId()` и
сверка с `window.Telegram.WebApp.initDataUnsafe.user.id`, полученным
именно в момент запроса, а не взятым из URL.

**Как это отражается в модели безопасности бэкенда**: раз у ученика нет
Firebase Auth сессии, `request.auth` на его callable-вызовах всегда
`undefined` — значит любая функция, реально достижимая со Student
Dashboard, физически не может требовать `request.auth`, иначе была бы
недостижима для ученика в принципе. Отсюда — `submitHomeworkFile`,
`setStudentGoal` вообще без проверки auth, и двусторонние
`proposeReschedule`/`confirmReschedule`/`proposeCancellation`/
`confirmCancellation` с проверкой **условной**: `request.auth`
обязателен только если фактическая роль в вызове — `"teacher"`, для
`"student"` — нет (см. `docs/BACKEND_CATALOG.md` за полным списком, кто
из функций как проверяет). Это не недосмотр, а прямое следствие
архитектуры: раз студенческая часть в принципе не может пройти
`request.auth`-проверку, доверие для неё строится на знании самого
`studentId` (непубличного, но и не криптографического секрета) — та же
модель, что и у PIN-кода на клиенте.
