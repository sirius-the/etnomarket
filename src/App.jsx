import { useState, useEffect, useRef } from "react";

/* ============================================================
   ЭТНО-МАРКЕТПЛЕЙС — единый файл, инлайн-стили
   Хранилище: Supabase (общий бесплатный бэкенд, см. инструкцию
   ниже по SUPABASE_URL/SUPABASE_ANON_KEY) — каталог/пользователи/
   сообщения общие для ВСЕХ, кто открыл сайт, с любого устройства
   Роли: гость / зергер (мастер) / супер-админ (по номеру телефона)
   ============================================================ */

/* Пользователь, который зарегистрируется или войдёт под этим
   номером, автоматически получает роль "super_admin". */
const SUPER_ADMIN_PHONE = "77716651271";

/* ---------- ЦВЕТА / ТОКЕНЫ ---------- */
const C = {
  emerald: "#004B49",
  emeraldDark: "#00302E",
  emeraldSoft: "#0C5F5C",
  gold: "#E4C477",
  goldDark: "#C9A653",
  white: "#FFFFFF",
  paper: "#FBF7EF",
  cream: "#F3ECDC",
  text: "#163331",
  muted: "#5F7C79",
  danger: "#B23A3A",
};

const FONT_DISPLAY = '"Iowan Old Style", Georgia, "Times New Roman", serif';
const FONT_BODY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/* ---------- ПОМОЩНИКИ ---------- */
const L = (obj, lang) => (obj ? obj[lang] ?? obj.ru ?? obj.kz ?? "" : "");

function normalizePhone(p) {
  let digits = (p || "").replace(/\D/g, "");
  if (digits.length === 11 && digits[0] === "8") digits = "7" + digits.slice(1);
  return digits;
}

/* ============================================================
   РЕАЛЬНОЕ ХРАНИЛИЩЕ ДЛЯ ОБЫЧНОГО (не-Claude) САЙТА

   Раньше здесь был window.storage — он работает ТОЛЬКО внутри
   опубликованного артефакта Claude. Чтобы сайт был настоящим,
   отдельным и открывался у всех с одного и того же общего
   каталога — подключаем бесплатный бэкенд Supabase (без сервера,
   без своего кода на бэкенде, просто REST по HTTPS).

   ЧТО СДЕЛАТЬ ПЕРЕД ЗАПУСКОМ (один раз, 5 минут):
   1. Зарегистрируйтесь на https://supabase.com (бесплатно).
   2. Создайте новый проект (New project).
   3. Слева откройте "SQL Editor" → New query → вставьте и выполните:

      create table kv_store (
        key text primary key,
        value jsonb,
        updated_at timestamptz default now()
      );
      alter table kv_store enable row level security;
      create policy "public read"   on kv_store for select using (true);
      create policy "public insert" on kv_store for insert with check (true);
      create policy "public update" on kv_store for update using (true);

   4. Слева откройте Settings → API. Скопируйте "Project URL"
      и "anon public" ключ.
   5. Вставьте их ниже вместо SUPABASE_URL и SUPABASE_ANON_KEY.

   Это открытая (без пароля) схема на уровне "общей таблицы" —
   как и раньше, не храните здесь по-настоящему секретные данные. */

const SUPABASE_URL = "https://hvzxpdzgqnctscdhhegu.supabase.co/rest/v1/"; // <-- ЗАМЕНИТЕ
const SUPABASE_ANON_KEY = "sb_publishable_m5sHPUZoJTexct1YAMs-LQ_7MnFiSGx"; // <-- ЗАМЕНИТЕ

const SUPABASE_READY =
  SUPABASE_URL.indexOf("ВАШ-ПРОЕКТ") === -1 && SUPABASE_ANON_KEY.indexOf("ВАШ_ANON_KEY") === -1;

if (!SUPABASE_READY) {
  console.warn(
    "⚠️ Supabase не настроен — сайт работает в демо-режиме (данные не синхронизируются между устройствами). См. инструкцию в начале App.jsx."
  );
}

const supaHeaders = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  "Content-Type": "application/json",
};

/* ---- ОБЩИЕ данные (каталог, пользователи, сообщения, подкатегории) ----
   Хранятся в Supabase — видны ВСЕМ, кто открыл сайт, с любого устройства. */
async function sharedGet(key) {
  if (!SUPABASE_READY) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/kv_store?key=eq.${encodeURIComponent(key)}&select=value`,
      { headers: supaHeaders }
    );
    const rows = await res.json();
    return rows && rows[0] ? JSON.stringify(rows[0].value) : null;
  } catch (e) {
    console.error("Ошибка чтения из Supabase:", key, e);
    return null;
  }
}
async function sharedSet(key, jsonString) {
  if (!SUPABASE_READY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/kv_store`, {
      method: "POST",
      headers: { ...supaHeaders, Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify([{ key, value: JSON.parse(jsonString) }]),
    });
  } catch (e) {
    console.error("Ошибка записи в Supabase:", key, e);
  }
}
async function sharedDelete(key) {
  if (!SUPABASE_READY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/kv_store?key=eq.${encodeURIComponent(key)}`, {
      method: "DELETE",
      headers: supaHeaders,
    });
  } catch (e) {}
}

/* ---- ЛИЧНЫЕ данные (язык интерфейса, текущий вход) ----
   Обычный localStorage — на настоящем сайте (не внутри Claude) он
   работает без ограничений, отдельно в каждом браузере. */
function localGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}
function localSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {}
}
function localRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {}
}

/* ---------- UI-СЛОВАРЬ ---------- */
const T = {
  brand: { kz: "Этно-Маркетплейс", ru: "Этно-Маркетплейс" },
  brandSub: { kz: "қолөнер һәм мұра", ru: "ремесло и наследие" },
  tabCatalog: { kz: "Каталог", ru: "Каталог" },
  tabAI: { kz: "ИИ-Этнограф", ru: "ИИ-Этнограф" },
  tabMaster: { kz: "Мастерге", ru: "Мастерам" },
  messagesTab: { kz: "Хаттар", ru: "Сообщения" },
  categoriesTitle: { kz: "Санаттар", ru: "Категории" },
  itemsCount: { kz: "бұйым", ru: "изделий" },
  back: { kz: "Артқа", ru: "Назад" },
  price: { kz: "Бағасы", ru: "Цена" },
  master: { kz: "Шебер", ru: "Мастер" },
  region: { kz: "Өңір", ru: "Регион" },
  description: { kz: "Сипаттама", ru: "Описание" },
  aiAnalysisTitle: { kz: "ИИ-Этнограф өрнек туралы", ru: "ИИ-Этнограф об узоре" },
  whatsappBtn: { kz: "WhatsApp арқылы тапсырыс беру", ru: "Заказать через WhatsApp" },
  noPhone: { kz: "Шебердің нөмірі көрсетілмеген", ru: "Мастер не указал номер" },
  emptyCatalog: { kz: "Бұл санатта әзірге бұйым жоқ", ru: "В этой категории пока нет товаров" },
  chatIntro1: {
    kz: "Ассалаумағалейкум! Мен — ИИ-Этнограф. Қазақ әшекейлерінің киелі мағынасы туралы сұрай аласыз: қошқармүйіз, шолпы, құсмұрын, құдағи білезік, тазалық жүзік немесе күн белгілері.",
    ru: "Здравствуйте! Я — ИИ-Этнограф. Спросите меня о сакральном смысле казахских украшений: қошқармүйіз, шолпы, құсмұрын, құдағи білезік, тазалық жүзік или солярные знаки.",
  },
  chatPlaceholder: { kz: "Сұрағыңызды жазыңыз...", ru: "Напишите свой вопрос..." },
  chatSend: { kz: "Жіберу", ru: "Отправить" },
  chatTopicsLabel: { kz: "Жылдам тақырыптар:", ru: "Быстрые темы:" },
  formTitle: { kz: "Бұйым қосу", ru: "Добавить изделие" },
  formName: { kz: "Бұйым атауы", ru: "Название изделия" },
  formCategory: { kz: "Санат", ru: "Категория" },
  formSubcategory: { kz: "Ішкі санат", ru: "Подкатегория" },
  formPrice: { kz: "Бағасы (₸)", ru: "Цена (₸)" },
  formMasterName: { kz: "Шебердің аты-жөні", ru: "Имя мастера" },
  formPhone: { kz: "WhatsApp нөмірі", ru: "Номер WhatsApp" },
  formRegion: { kz: "Өңір", ru: "Регион" },
  formPattern: { kz: "Өрнектің мағынасы (ИИ-разбор үшін)", ru: "Смысл узора (для ИИ-разбора)" },
  formDescription: { kz: "Сипаттама", ru: "Описание" },
  formSubmit: { kz: "Каталогке қосу", ru: "Добавить в каталог" },
  uploadPhotoBtn: { kz: "📸 Әшекей суретін жүктеу", ru: "📸 Загрузить фото украшения" },
  uploadPhotoChange: { kz: "📸 Суретті ауыстыру", ru: "📸 Заменить фото" },
  formSaved: { kz: "Сақталды! Бұйым каталогке қосылды.", ru: "Сохранено! Изделие добавлено в каталог." },
  formRequired: { kz: "Атауын, санатын, бағасын және телефонды толтырыңыз", ru: "Заполните название, категорию, цену и телефон" },
  choose: { kz: "Таңдаңыз", ru: "Выберите" },
  selectAnalysis: { kz: "Мағынасы белгіленбеген", ru: "Смысл не указан" },

  authPhone: { kz: "Телефон нөмірі", ru: "Номер телефона" },
  authPassword: { kz: "Құпия сөз", ru: "Пароль" },
  authName: { kz: "Аты-жөні", ru: "Имя" },
  authLoginBtn: { kz: "Кіру", ru: "Войти" },
  authRegisterBtn: { kz: "Тіркелу", ru: "Зарегистрироваться" },
  authSwitchToRegister: { kz: "Тіркелгіңіз жоқ па? Тіркелу", ru: "Нет аккаунта? Зарегистрироваться" },
  authSwitchToLogin: { kz: "Аккаунтыңыз бар ма? Кіру", ru: "Уже есть аккаунт? Войти" },
  authLogoutBtn: { kz: "Шығу", ru: "Выйти" },
  authWelcome: { kz: "Зергерлер кабинеті", ru: "Кабинет мастера" },
  authErrorExists: { kz: "Бұл нөмір бұрын тіркелген", ru: "Этот номер уже зарегистрирован" },
  authErrorNotFound: { kz: "Мұндай пайдаланушы табылмады", ru: "Такой пользователь не найден" },
  authErrorPassword: { kz: "Құпия сөз қате", ru: "Неверный пароль" },
  authErrorFill: { kz: "Барлық өрісті толтырыңыз", ru: "Заполните все поля" },
  roleSuperAdmin: { kz: "Супер-әкімші", ru: "Супер-администратор" },
  roleZerger: { kz: "Зергер", ru: "Мастер-зергер" },

  cabinetTitle: { kz: "Жеке кабинет", ru: "Личный кабинет" },
  myProducts: { kz: "Менің бұйымдарым", ru: "Мои изделия" },
  statusActive: { kz: "Белсенді", ru: "Активен" },
  statusBlocked: { kz: "Бұғатталған", ru: "Заблокирован" },
  statusOnReview: { kz: "Тексерілуде", ru: "На проверке" },
  appealBtn: { kz: "Апелляцияға беру", ru: "Подать апелляцию" },
  appealPlaceholder: { kz: "Түсіндірме жазыңыз...", ru: "Напишите объяснение..." },
  appealSend: { kz: "Жіберу", ru: "Отправить" },

  addSubcatBtn: { kz: "➕ Жаңа ішкі санат қосу", ru: "➕ Добавить подкатегорию" },
  addSubcatTitle: { kz: "Жаңа ішкі санат ұсынысы", ru: "Заявка на новую подкатегорию" },
  addSubcatName: { kz: "Атауы", ru: "Название" },
  addSubcatEmoji: { kz: "Эмодзи-белгіше", ru: "Эмодзи-иконка" },
  addSubcatMeaning: { kz: "ИИ-Этнограф үшін киелі мағынасы", ru: "Сакральный смысл для ИИ-Этнографа" },
  addSubcatCategory: { kz: "Қай санатқа?", ru: "В какую категорию?" },
  addSubcatSend: { kz: "Модерацияға жіберу", ru: "Отправить на модерацию" },
  addSubcatSent: { kz: "Жіберілді! Модератор қарайды.", ru: "Отправлено! Модератор рассмотрит." },
  addSubcatCancel: { kz: "Болдырмау", ru: "Отмена" },

  messagesTitle: { kz: "Хаттар / Сообщения", ru: "Хаттар / Сообщения" },
  messagesEmpty: { kz: "Жаңа хаттар жоқ", ru: "Новых сообщений нет" },
  msgFrom: { kz: "Кімнен", ru: "От мастера" },
  msgPhone: { kz: "Телефоны", ru: "Телефон" },
  msgTypeAppeal: { kz: "Апелляция", ru: "Апелляция" },
  msgTypeNewCat: { kz: "Жаңа санат ұсынысы", ru: "Заявка на категорию" },
  msgProductLabel: { kz: "Тауар", ru: "Товар" },
  msgReturnBtn: { kz: "✅ Каталогке қайтару", ru: "✅ Вернуть в каталог" },
  msgDeleteProductBtn: { kz: "❌ Тауарды жою", ru: "❌ Удалить товар" },
  msgApproveCatBtn: { kz: "👍 Санатты бекіту", ru: "👍 Одобрить категорию" },
  msgRejectCatBtn: { kz: "❌ Қабылдамау", ru: "❌ Отклонить" },

  adminApproveBtn: { kz: "✅ Бекіту / Қалпына келтіру", ru: "✅ Одобрить / Возобновить" },
  adminDeleteForeverBtn: { kz: "❌ Мүлдем жою", ru: "❌ Удалить навсегда" },
  reportBtn: { kz: "🚩 Шағымдану", ru: "🚩 Пожаловаться" },
  reportConfirmed: { kz: "Шағым қабылданды, тауар тексеруге жіберілді", ru: "Жалоба принята, товар отправлен на проверку" },
};

/* ---------- КАТЕГОРИИ И ПОДКАТЕГОРИИ (статичные) ---------- */
const CATEGORIES = [
  { key: "bas", name: { kz: "Бас әшекейлері", ru: "Головные украшения" }, emoji: "👑", subcats: ["saukele", "shashbau", "sholpy"] },
  { key: "qol", name: { kz: "Қол әшекейлері", ru: "Украшения для рук" }, emoji: "💍", subcats: ["bilezik", "zhuzik", "sakina"] },
  { key: "kokirek", name: { kz: "Көкірек әшекейлері", ru: "Нагрудные украшения" }, emoji: "🔔", subcats: ["shekelik"] },
];

const SUBCATS = {
  saukele: { name: { kz: "Сәукеле", ru: "Саукеле" }, emoji: "👑", pattern: "solar" },
  shashbau: { name: { kz: "Шашбау", ru: "Шашбау" }, emoji: "🎀", pattern: "qoshqarmuiz" },
  sholpy: { name: { kz: "Шолпы", ru: "Шолпы" }, emoji: "🔔", pattern: "sholpy" },
  bilezik: { name: { kz: "Білезік", ru: "Билезик" }, emoji: "💍", pattern: "qudagi" },
  zhuzik: { name: { kz: "Жүзік", ru: "Жузик" }, emoji: "💍", pattern: "tazalyq" },
  sakina: { name: { kz: "Сақина", ru: "Сакина" }, emoji: "💍", pattern: "qusmurun" },
  shekelik: { name: { kz: "Шекелік", ru: "Шекелик" }, emoji: "🔔", pattern: "qoshqarmuiz" },
};

/* ---------- БАЗА ЗНАНИЙ ИИ-ЭТНОГРАФА (статичная часть) ---------- */
const KB_STATIC = {
  qoshqarmuiz: {
    title: { kz: "Қошқармүйіз (қошқар мүйізі)", ru: "Қошқармүйіз (бараний рог)" },
    keywords: ["қошқармүйіз", "кошкармуиз", "қошқар", "кошкар", "рог", "ram", "шашбау", "шекелік"],
    text: {
      kz: "Қошқармүйіз — қазақ халқының көне ою-өрнектерінің бірі, мал шаруашылығымен айналысқан ата-бабаларымыздың берекет пен молшылық культінен бастау алады. Иірімді өрнек өмір күшін, байлықты және отардың — көшпелі тұрмыстың басты байлығының — қорғалуын білдіреді. Әшекейге түскен бұл өрнек оны тағушыға ата-баба қуатын беріп, көз тиюден сақтайды деп саналған. Шеберлер иірімнің бағытын бекер таңдамайды — ол қалыңдық шыққан үйдің берекесінің өсуін білдіретін мағыналы код болып саналады.",
      ru: "Қошқармүйіз, «бараний рог», — один из древнейших орнаментальных мотивов казахской культуры, восходящий к культу плодородия скотоводческих племён. Спиралевидный завиток символизирует жизненную силу, богатство и защиту отары — главного источника благополучия кочевника. Нанесённый на украшение узор словно передаёт его владелице энергию рода и оберегает от сглаза. Мастера никогда не выбирают направление завитка случайно — оно хранит смысловой код, читаемый посвящёнными: рост благополучия дома, из которого вышла невеста.",
    },
  },
  solar: {
    title: { kz: "Күн белгілері (солярлық шеңберлер)", ru: "Солярные круги (знаки солнца)" },
    keywords: ["күн", "солярн", "солнеч", "круг", "сәукеле", "саукеле", "тәңір"],
    text: {
      kz: "Күн шеңберлері — Тәңірінің, мәңгілік аспанның және өмір айналымының белгісі. Басы да, соңы да жоқ шеңбер ұрпақтың үзілмейтінін, ал ортадан таралатын сәулелер адамды қараңғылық пен аурудан қорғайтын жарықты бейнелейді. Сәукеленің төбесіне күн розеткасын салу кездейсоқ емес: әйелдің көкпен байланысы дәл осы төбе арқылы жүзеге асады деп есептелген, ал өрнек осы байланысты күшейтіп, қалыңдықты жаңа отбасы үшін «қайта туылатын» күнінде қорғайды.",
      ru: "Солярные круги — символ Тәңірі, вечного неба и жизненного цикла. Круг без начала и конца воплощает бесконечность рода, а лучи, расходящиеся от центра, — свет, оберегающий человека от тьмы и болезней. На саукеле солнечные розетки размещали на самой макушке убора неслучайно: считалось, что через темя происходит связь женщины с небесным покровительством, а узор усиливает эту связь, оберегая невесту в день, когда она символически «рождается заново» для новой семьи.",
    },
  },
  sholpy: {
    title: { kz: "Шолпы", ru: "Шолпы" },
    keywords: ["шолпы"],
    text: {
      kz: "Шашқа өрілетін шолпы тек әшекей ғана емес, дыбыстық тұмар қызметін де атқарған. Бас қимылдаған сайын шыққан күмістің жұмсақ сыңғыры жын-шайтанды үркітеді деп сенген — өйткені күміс сыңғыры арам күштерді қорқытады деп саналған. Екінші, тәжірибелік мағынасы да бар: шолпының салмағы мен орналасуы қызды басын тік, арқасын жинақы ұстауға үйретіп, байбише — үй иесіне тән асыл да сабырлы кескінді қалыптастырған.",
      ru: "Шолпы — подвески, вплетаемые в косы, — выполняли не только эстетическую, но и звуковую, обережную функцию. Мягкий металлический перезвон при каждом движении головы, по поверьям, отпугивал злых духов, которые, как считалось, боятся звона серебра. Но есть и второй, более практичный смысл: вес и положение шолпы приучали девушку держать голову прямо, а спину — ровно, вырабатывая ту сдержанную, полную достоинства осанку, которая считалась признаком воспитанности байбише — хозяйки дома.",
    },
  },
  qudagi: {
    title: { kz: "Құдағи білезік", ru: "Құдағи білезік (браслет сватьи)" },
    keywords: ["құдағи", "кудаги", "білезік", "билезик", "браслет"],
    text: {
      kz: "Құдағи білезік — құда болған екі жақтың аналары алмасатын білезік. Бұл әдеттегі әшекей емес, жасалған одақтың нақты белгісі: білезік алмасу екі рудың келісімін кез келген сөзден де берік бекітіп, екі әйелді бір-біріне жауапты құдағиға айналдырған. Білезіктегі өрнекте жиі қосарлы элементтер кездеседі — бұл күннен бастап екі рудың бір бүтінге айналғанын, ал балалардың тағдыры екі отбасының ортақ жауапкершілігі екенін білдіреді.",
      ru: "Құдағи білезік — браслет, которым обменивались женщины породнившихся семей: матери жениха и невесты. Это не украшение в привычном смысле, а материальный знак заключённого союза: обмен браслетами скреплял договорённость между родами крепче любых слов, превращая двух женщин в құдағи — сватий, обязанных отныне заботиться друг о друге. Узор на браслете часто содержит парные элементы — знак того, что с этого дня два рода становятся единым целым, а судьбы детей — общей ответственностью обеих семей.",
    },
  },
  tazalyq: {
    title: { kz: "Тазалық жүзікте", ru: "«Тазалық жүзікте» (чистота в кольце)" },
    keywords: ["тазалық", "тазалык", "жүзік", "жузик", "чистот", "күміс", "серебр"],
    text: {
      kz: "«Тазалық жүзікте» деген нақыл сөз бар. Күміс ежелден жаман әсерді бейтараптандыратын металл саналған, сондықтан қонаққа тағам не қымыз ұсынар алдында жүзікті соған батырып көрген — егер күміс қараға айналса, тағам қауіпті деп есептелген. Күміс жүзік тағып жүрген әйел өзімен бірге тазарту тұмарын алып жүргендей болған — тек тағамға ғана емес, үйге кірген қонақтың ой-ниетіне де қатысты.",
      ru: "Существует поговорка «тазалық жүзікте» — чистота в кольце. Серебро издавна считалось металлом, нейтрализующим дурное воздействие: жүзік окунали в пищу или кумыс перед тем, как подать её гостю, — если серебро темнело, угощение считалось небезопасным. Женщина, носившая серебряный жүзік, как бы постоянно несла при себе оберег очищения — не только для еды, но и для мыслей и намерений, входящих в дом вместе с гостем.",
    },
  },
  qusmurun: {
    title: { kz: "Құсмұрын жүзігі", ru: "Перстень «Құсмұрын»" },
    keywords: ["құсмұрын", "кусмурын", "сақина", "сакина", "перстень"],
    text: {
      kz: "«Құсмұрын» жүзігі жоғарғы бөлігіндегі құс тұмсығына ұқсас шошақ бөлшегіне байланысты осылай аталған — оны қалыңдық болашақ бақыт пен сәтті некенің белгісі ретінде таққан. Қазақ мифологиясында құс — әлемдер арасындағы дәнекер, қуанышты хабардың жаршысы, сондықтан тұмсық тәрізді жүзік болашақ бақытты «шоқып» әкеледі деп сенген. Мұндай жүзіктер анадан қызға әйел бақытының эстафетасы ретінде беріліп, онымен бірге күйеу жағының отбасына бата-тілек те жалғасқан.",
      ru: "Перстень «Құсмұрын» («птичий клюв») получил название за характерный клювовидный выступ в верхней части — деталь, которую невеста надевала как знак предстоящего счастья и удачного замужества. Птица в казахской мифологии — посредник между мирами, вестник добрых новостей, поэтому клювовидная форма перстня словно «выклёвывала» будущее счастье, привлекая его в дом. Такие перстни часто передавались от матери к дочери как эстафета женского счастья, а вместе с ними — благословение семье мужа.",
    },
  },
};

const KB_ORDER_STATIC = ["qoshqarmuiz", "solar", "sholpy", "qudagi", "tazalyq", "qusmurun"];

function findAnswer(query, kb, order) {
  const q = query.toLowerCase();
  for (const key of order) {
    const kw = kb[key].keywords || [];
    if (kw.some((w) => q.includes(w))) return key;
  }
  return null;
}

function statusLabel(status, lang) {
  if (status === "blocked") return L(T.statusBlocked, lang);
  if (status === "on_review") return L(T.statusOnReview, lang);
  return L(T.statusActive, lang);
}
function statusColors(status) {
  if (status === "blocked") return { bg: "#FBEAEA", fg: C.danger };
  if (status === "on_review") return { bg: "#FDF3E0", fg: C.goldDark };
  return { bg: "#E8F3EF", fg: C.emeraldDark };
}

/* Ранее здесь был жёстко зашитый демо-набор товаров (SEED_PRODUCTS),
   который подставлялся при самой первой загрузке сайта. По просьбе
   владелицы сайта — убран полностью: теперь при первом запуске
   каталог всегда стартует пустым, и в нём никогда не появятся
   товары "по умолчанию", которые нужно было бы удалять вручную. */

/* ---------- МЕЛКИЕ КОМПОНЕНТЫ ---------- */

function Ornament() {
  return (
    <div
      style={{
        textAlign: "center",
        letterSpacing: "6px",
        fontSize: 10,
        color: C.gold,
        opacity: 0.8,
        padding: "4px 0",
        background: C.emeraldDark,
        userSelect: "none",
      }}
    >
      ❖ ❖ ❖ ❖ ❖ ❖ ❖ ❖ ❖ ❖ ❖
    </div>
  );
}

function Pill({ active, children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: active ? `1px solid ${C.gold}` : "1px solid rgba(255,255,255,0.3)",
        background: active ? C.gold : "transparent",
        color: active ? C.emeraldDark : C.white,
        fontWeight: 700,
        fontSize: 12,
        borderRadius: 20,
        padding: "5px 12px",
        cursor: "pointer",
        fontFamily: FONT_BODY,
      }}
    >
      {children}
    </button>
  );
}

/* ---------- АДАПТИВНОСТЬ ----------
   На десктопе сайт красиво показан как макет телефона (рамка, тень,
   "чёлка"). На настоящем мобильном экране эта рамка не нужна —
   сайт должен занимать весь экран, как обычный сайт. */
function ResponsiveStyles() {
  return (
    <style>{`
      .etno-outer-wrap {
        width: 100%;
        min-height: 100vh;
        display: flex;
        justify-content: center;
        align-items: flex-start;
        padding: 28px 12px;
        box-sizing: border-box;
      }
      .etno-phone-shell {
        width: 380px;
        max-width: 100%;
        height: 780px;
        border-radius: 42px;
        box-shadow: 0 30px 70px rgba(0,30,28,0.35), 0 0 0 1px rgba(228,196,119,0.4);
        border: 2px solid ${C.emeraldDark};
      }
      @media (max-width: 480px) {
        .etno-outer-wrap {
          padding: 0;
          align-items: stretch;
        }
        .etno-phone-shell {
          width: 100%;
          height: 100vh;
          height: 100dvh;
          border-radius: 0;
          box-shadow: none;
          border: none;
        }
        .etno-notch {
          display: none;
        }
      }

      /* ---- РЕЖИМ ДЛЯ ПК ---- */
      .etno-mobile-nav { display: flex; }
      .etno-desktop-nav { display: none; }
      .etno-grid-cats {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .etno-grid-sub, .etno-grid-prod {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      @media (min-width: 680px) {
        .etno-outer-wrap {
          padding: 0;
          align-items: stretch;
        }
        .etno-phone-shell {
          width: 100%;
          max-width: none;
          height: auto;
          min-height: 100vh;
          border-radius: 0;
          box-shadow: none;
          border: none;
        }
        .etno-notch { display: none; }
        .etno-mobile-nav { display: none !important; }
        .etno-desktop-nav { display: flex !important; }
        .etno-inner-max {
          max-width: 1100px;
          margin: 0 auto;
          width: 100%;
          box-sizing: border-box;
        }
        .etno-grid-cats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 18px;
        }
        .etno-grid-sub, .etno-grid-prod {
          grid-template-columns: repeat(4, 1fr);
          gap: 18px;
        }
      }
    `}</style>
  );
}

/* общие мелкие стили форм, переиспользуются в нескольких компонентах */
const inputStyleBase = {
  width: "100%",
  border: `1px solid ${C.gold}`,
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 13,
  outline: "none",
  marginTop: 4,
  marginBottom: 12,
  boxSizing: "border-box",
  fontFamily: FONT_BODY,
  color: C.text,
  background: C.white,
};
const labelStyleBase = { fontSize: 11.5, fontWeight: 700, color: C.emeraldDark };

/* ---------- ГЛАВНОЕ ПРИЛОЖЕНИЕ ---------- */
export default function App() {
  /* ready=false, пока не подгрузили общие данные из Supabase.
     Каталог/пользователи/сообщения/подкатегории — общие для ВСЕХ,
     кто открыл сайт (зергеры, покупатели, супер-админ).
     Язык интерфейса и текущий вход — личные, для этого устройства
     (обычный localStorage браузера). */
  const [ready, setReady] = useState(false);
  const [lang, setLang] = useState(() => localGet("etno_lang", "kz"));
  const [tab, setTab] = useState("catalog");
  const [cat, setCat] = useState(null);
  const [sub, setSub] = useState(null);
  const [productId, setProductId] = useState(null);
  const [products, setProducts] = useState([]);
  const [users, setUsers] = useState([]);
  const [session, setSession] = useState(() => localGet("etno_session", null));
  const [messages, setMessages] = useState([]);
  const [customSubcats, setCustomSubcats] = useState([]);

  /* личные данные — сохраняем сразу в localStorage при изменении */
  useEffect(() => {
    localSet("etno_lang", lang);
  }, [lang]);
  useEffect(() => {
    if (session) localSet("etno_session", session);
    else localRemove("etno_session");
  }, [session]);

  /* ---- загрузка общих данных из Supabase (переиспользуется:
     при первом открытии, по таймеру, и при возврате во вкладку) ---- */
  const refreshSharedData = async (isInitial = false) => {
    const [prodRaw, usersRaw, msgRaw, subRaw] = await Promise.all([
      sharedGet("etno_products"),
      sharedGet("etno_users"),
      sharedGet("etno_messages"),
      sharedGet("etno_custom_subcats"),
    ]);

    /* Важно: пустой список ([]) — это ЗАКОННОЕ состояние (например, вы
       удалили все товары), а не "данных ещё нет". Раньше здесь была
       ошибка: любой пустой массив подменялся набором SEED_PRODUCTS,
       из-за чего удалённые товары "воскресали" каждые 15 секунд.
       Теперь: если с сервера пришёл настоящий массив (даже пустой) —
       используем его как есть. SEED_PRODUCTS подставляется только
       один раз, при самой первой загрузке сайта, если на сервере ещё
       вообще нет записи (prodRaw === null). Если запись просто не
       удалось прочитать (сбой сети при фоновом опросе) — не трогаем
       уже показанные данные, чтобы ничего не затереть по ошибке. */

    if (prodRaw !== null) {
      try {
        const parsed = JSON.parse(prodRaw);
        if (Array.isArray(parsed)) setProducts(parsed);
      } catch (e) {}
    } else if (isInitial) {
      setProducts([]);
    }

    if (usersRaw !== null) {
      try {
        const parsed = JSON.parse(usersRaw);
        if (Array.isArray(parsed)) setUsers(parsed);
      } catch (e) {}
    } else if (isInitial) {
      setUsers([]);
    }

    if (msgRaw !== null) {
      try {
        const parsed = JSON.parse(msgRaw);
        if (Array.isArray(parsed)) setMessages(parsed);
      } catch (e) {}
    } else if (isInitial) {
      setMessages([]);
    }

    if (subRaw !== null) {
      try {
        const parsed = JSON.parse(subRaw);
        if (Array.isArray(parsed)) setCustomSubcats(parsed);
      } catch (e) {}
    } else if (isInitial) {
      setCustomSubcats([]);
    }
  };

  /* ---- первая загрузка при открытии сайта ---- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refreshSharedData(true);
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ---- ПОДХВАТ ЧУЖИХ ИЗМЕНЕНИЙ (важно!) ----
     Без этого блока, если сайт открыт у кого-то давно (даже фоном),
     он продолжает работать со старой версией данных из памяти —
     и любое его действие (например, добавление товара) может заново
     сохранить в Supabase старый список, "воскресив" то, что вы уже
     удалили с другого устройства. Поэтому раз в 15 секунд, а также
     сразу при возврате во вкладку — тихо подтягиваем свежие данные. */
  useEffect(() => {
    if (!ready) return;
    const interval = setInterval(() => {
      refreshSharedData();
    }, 15000);
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshSharedData();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [ready]);

  /* ---- сохранение общих данных обратно в Supabase (только после загрузки!) ---- */
  useEffect(() => {
    if (!ready) return;
    sharedSet("etno_products", JSON.stringify(products));
  }, [products, ready]);

  useEffect(() => {
    if (!ready) return;
    sharedSet("etno_users", JSON.stringify(users));
  }, [users, ready]);

  useEffect(() => {
    if (!ready) return;
    sharedSet("etno_messages", JSON.stringify(messages));
  }, [messages, ready]);

  useEffect(() => {
    if (!ready) return;
    sharedSet("etno_custom_subcats", JSON.stringify(customSubcats));
  }, [customSubcats, ready]);

  const t = (key) => L(T[key], lang);

  /* ---- слияние статичных и одобренных пользовательских данных ---- */
  const approvedSubcats = customSubcats.filter((s) => s.status === "approved");

  const mergedSubcats = { ...SUBCATS };
  approvedSubcats.forEach((s) => {
    mergedSubcats[s.key] = { name: s.name, emoji: s.emoji, pattern: s.key };
  });

  const mergedCategories = CATEGORIES.map((c) => ({
    ...c,
    subcats: [...c.subcats, ...approvedSubcats.filter((s) => s.categoryKey === c.key).map((s) => s.key)],
  }));

  const mergedKB = { ...KB_STATIC };
  approvedSubcats.forEach((s) => {
    mergedKB[s.key] = {
      title: s.name,
      keywords: [(s.name.kz || "").toLowerCase(), (s.name.ru || "").toLowerCase()],
      text: { kz: s.meaning, ru: s.meaning },
    };
  });
  const mergedKBOrder = [...KB_ORDER_STATIC, ...approvedSubcats.map((s) => s.key)];

  /* ---- авторизация ---- */
  const registerUser = (phoneRaw, password, name) => {
    const phone = normalizePhone(phoneRaw);
    if (!phone || !password.trim() || !name.trim()) return { error: "fill" };
    if (users.some((u) => u.phone === phone)) return { error: "exists" };
    const role = phone === normalizePhone(SUPER_ADMIN_PHONE) ? "super_admin" : "zerger";
    const newUser = { phone, phoneDisplay: phoneRaw, password, name, role };
    setUsers((prev) => [...prev, newUser]);
    setSession({ phone, name, role });
    return { ok: true };
  };

  const loginUser = (phoneRaw, password) => {
    const phone = normalizePhone(phoneRaw);
    const user = users.find((u) => u.phone === phone);
    if (!user) return { error: "notfound" };
    if (user.password !== password) return { error: "password" };
    setSession({ phone: user.phone, name: user.name, role: user.role });
    return { ok: true };
  };

  const logoutUser = () => {
    setSession(null);
    setTab("catalog");
  };

  /* ---- модерация товаров ---- */
  const reportProduct = (id) => {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, status: "blocked" } : p)));
  };
  const moderateProduct = (id, status) => {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
  };
  const deleteProductForever = (id) => {
    setProducts((prev) => prev.filter((p) => p.id !== id));
  };

  /* ---- апелляции и заявки на подкатегории ---- */
  const sendAppeal = (productId, text) => {
    const msg = {
      id: "m" + Date.now() + Math.random().toString(16).slice(2),
      type: "appeal",
      masterName: session?.name || "",
      masterPhone: session?.phone || "",
      productId,
      text,
      status: "pending",
      createdAt: Date.now(),
    };
    setMessages((prev) => [msg, ...prev]);
    setProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, status: "on_review" } : p)));
  };

  const sendNewSubcatRequest = ({ name, emoji, meaning, categoryKey }) => {
    const key = "custom" + Date.now();
    const subcat = {
      key,
      name: { kz: name, ru: name },
      emoji,
      categoryKey,
      meaning,
      status: "pending",
      masterName: session?.name || "",
      masterPhone: session?.phone || "",
    };
    setCustomSubcats((prev) => [...prev, subcat]);
    const msg = {
      id: "m" + Date.now() + Math.random().toString(16).slice(2),
      type: "newCategory",
      masterName: session?.name || "",
      masterPhone: session?.phone || "",
      subcatKey: key,
      text: meaning,
      status: "pending",
      createdAt: Date.now(),
    };
    setMessages((prev) => [msg, ...prev]);
  };

  const resolveAppeal = (msg, action) => {
    if (action === "return") {
      setProducts((prev) => prev.map((p) => (p.id === msg.productId ? { ...p, status: "active" } : p)));
    }
    if (action === "delete") {
      setProducts((prev) => prev.filter((p) => p.id !== msg.productId));
    }
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, status: "resolved" } : m)));
  };

  const resolveNewCategory = (msg, action) => {
    setCustomSubcats((prev) =>
      prev.map((s) => (s.key === msg.subcatKey ? { ...s, status: action === "approve" ? "approved" : "rejected" } : s))
    );
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, status: "resolved" } : m)));
  };

  const goCatalogRoot = () => {
    setTab("catalog");
    setCat(null);
    setSub(null);
    setProductId(null);
  };

  const product = products.find((p) => p.id === productId) || null;

  const navItems = [
    { key: "catalog", label: t("tabCatalog"), icon: "🗂️" },
    { key: "ai", label: t("tabAI"), icon: "📜" },
    { key: "master", label: t("tabMaster"), icon: "🛠️" },
  ];
  if (session?.role === "super_admin") {
    navItems.push({ key: "messages", label: t("messagesTab"), icon: "✉️" });
  }

  if (!ready) {
    return (
      <div
        className="etno-outer-wrap"
        style={{
          background: `radial-gradient(circle at 50% 0%, ${C.cream}, ${C.paper})`,
          fontFamily: FONT_BODY,
        }}
      >
        <ResponsiveStyles />
        <div
          className="etno-phone-shell"
          style={{
            background: `linear-gradient(160deg, ${C.emerald}, ${C.emeraldDark})`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
          }}
        >
          <div style={{ fontSize: 40, color: C.gold }}>❖</div>
          <div style={{ fontFamily: FONT_DISPLAY, color: C.gold, fontWeight: 700, fontSize: 15 }}>
            {lang === "kz" ? "Жүктелуде..." : "Загрузка..."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="etno-outer-wrap"
      style={{
        background: `radial-gradient(circle at 50% 0%, ${C.cream}, ${C.paper})`,
        fontFamily: FONT_BODY,
      }}
    >
      <ResponsiveStyles />
      <div
        className="etno-phone-shell"
        style={{
          background: C.white,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          position: "relative",
        }}
      >
        <div
          className="etno-notch"
          style={{
            position: "absolute",
            top: 8,
            left: "50%",
            transform: "translateX(-50%)",
            width: 90,
            height: 16,
            borderRadius: 10,
            background: C.emeraldDark,
            zIndex: 5,
          }}
        />

        {/* HEADER */}
        <div
          style={{
            background: `linear-gradient(160deg, ${C.emerald}, ${C.emeraldDark})`,
            padding: "26px 18px 12px",
            color: C.white,
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontFamily: FONT_DISPLAY, fontSize: 21, fontWeight: 700, color: C.gold, letterSpacing: 0.5 }}>
                {t("brand")}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", marginTop: 2, fontStyle: "italic" }}>
                {t("brandSub")}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 2, alignItems: "center" }}>
              <div
                className="etno-desktop-nav"
                style={{ gap: 4, marginRight: 10 }}
              >
                {navItems.map((it) => {
                  const active = tab === it.key;
                  return (
                    <button
                      key={it.key}
                      onClick={() => {
                        if (it.key === "catalog") goCatalogRoot();
                        else setTab(it.key);
                      }}
                      style={{
                        border: "none",
                        background: active ? "rgba(228,196,119,0.18)" : "transparent",
                        color: active ? C.gold : "rgba(255,255,255,0.75)",
                        borderRadius: 10,
                        padding: "7px 12px",
                        cursor: "pointer",
                        fontSize: 12.5,
                        fontWeight: active ? 700 : 500,
                        fontFamily: FONT_BODY,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <span style={{ fontSize: 14 }}>{it.icon}</span>
                      {it.label}
                    </button>
                  );
                })}
              </div>
              <Pill active={lang === "kz"} onClick={() => setLang("kz")}>
                KZ
              </Pill>
              <Pill active={lang === "ru"} onClick={() => setLang("ru")}>
                RU
              </Pill>
            </div>
          </div>
        </div>
        <Ornament />

        {/* CONTENT */}
        <div style={{ flex: 1, overflowY: "auto", background: C.paper }}>
          <div className="etno-inner-max">
          {tab === "catalog" && (
            <CatalogView
              lang={lang}
              t={t}
              cat={cat}
              sub={sub}
              product={product}
              products={products}
              setCat={setCat}
              setSub={setSub}
              setProductId={setProductId}
              categories={mergedCategories}
              subcatsMap={mergedSubcats}
              kb={mergedKB}
              session={session}
              reportProduct={reportProduct}
              moderateProduct={moderateProduct}
              deleteProductForever={deleteProductForever}
            />
          )}
          {tab === "ai" && <AIChatView lang={lang} t={t} kb={mergedKB} kbOrder={mergedKBOrder} />}
          {tab === "master" && (
            <MasterCabinet
              lang={lang}
              t={t}
              session={session}
              registerUser={registerUser}
              loginUser={loginUser}
              logoutUser={logoutUser}
              products={products}
              setProducts={setProducts}
              sendAppeal={sendAppeal}
              sendNewSubcatRequest={sendNewSubcatRequest}
              categories={mergedCategories}
              subcatsMap={mergedSubcats}
              kb={mergedKB}
              kbOrder={mergedKBOrder}
            />
          )}
          {tab === "messages" && session?.role === "super_admin" && (
            <MessagesView
              lang={lang}
              t={t}
              messages={messages}
              products={products}
              resolveAppeal={resolveAppeal}
              resolveNewCategory={resolveNewCategory}
            />
          )}
          </div>
        </div>

        <Ornament />
        {/* BOTTOM NAV (мобильный режим; на ПК скрыто, там меню сверху) */}
        <div
          className="etno-mobile-nav"
          style={{
            background: C.emeraldDark,
            flexShrink: 0,
          }}
        >
          {navItems.map((it) => {
            const active = tab === it.key;
            return (
              <button
                key={it.key}
                onClick={() => {
                  if (it.key === "catalog") goCatalogRoot();
                  else setTab(it.key);
                }}
                style={{
                  flex: 1,
                  border: "none",
                  background: "transparent",
                  padding: "10px 4px 14px",
                  cursor: "pointer",
                  color: active ? C.gold : "rgba(255,255,255,0.55)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 3,
                  fontFamily: FONT_BODY,
                }}
              >
                <span style={{ fontSize: 18 }}>{it.icon}</span>
                <span style={{ fontSize: 10, fontWeight: active ? 700 : 500 }}>{it.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------- КАТАЛОГ ---------- */
function CatalogView({
  lang,
  t,
  cat,
  sub,
  product,
  products,
  setCat,
  setSub,
  setProductId,
  categories,
  subcatsMap,
  kb,
  session,
  reportProduct,
  moderateProduct,
  deleteProductForever,
}) {
  const BackBtn = ({ onClick }) => (
    <button
      onClick={onClick}
      style={{
        border: "none",
        background: "transparent",
        color: C.emerald,
        fontWeight: 700,
        fontSize: 13,
        cursor: "pointer",
        padding: "14px 16px 0",
        display: "flex",
        alignItems: "center",
        gap: 4,
        fontFamily: FONT_BODY,
      }}
    >
      ← {t("back")}
    </button>
  );

  const isVisible = (p) =>
    p.status === "active" ||
    (session && (session.role === "super_admin" || p.ownerPhone === session.phone));

  if (product) {
    return (
      <ProductDetailView
        lang={lang}
        t={t}
        product={product}
        subcatsMap={subcatsMap}
        kb={kb}
        session={session}
        setProductId={setProductId}
        reportProduct={reportProduct}
        moderateProduct={moderateProduct}
        deleteProductForever={deleteProductForever}
      />
    );
  }

  /* -- Список товаров подкатегории -- */
  if (cat && sub) {
    const list = products.filter((p) => p.subcat === sub && isVisible(p));
    return (
      <div style={{ paddingBottom: 20 }}>
        <BackBtn onClick={() => setSub(null)} />
        <div style={{ padding: "10px 16px" }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, color: C.text, fontWeight: 700, marginBottom: 10 }}>
            {L(subcatsMap[sub].name, lang)}
          </div>
          {list.length === 0 && (
            <div style={{ color: C.muted, fontSize: 13, padding: "20px 0", textAlign: "center" }}>
              {t("emptyCatalog")}
            </div>
          )}
          <div className="etno-grid-prod">
            {list.map((p) => {
              const sc = statusColors(p.status);
              return (
                <div
                  key={p.id}
                  onClick={() => setProductId(p.id)}
                  style={{
                    background: C.white,
                    borderRadius: 16,
                    padding: 12,
                    cursor: "pointer",
                    boxShadow: "0 4px 14px rgba(0,60,55,0.08)",
                    border: `1px solid ${C.cream}`,
                    position: "relative",
                  }}
                >
                  {p.status !== "active" && (
                    <div
                      style={{
                        position: "absolute",
                        top: 6,
                        right: 6,
                        fontSize: 8.5,
                        fontWeight: 700,
                        color: sc.fg,
                        background: sc.bg,
                        borderRadius: 8,
                        padding: "2px 6px",
                      }}
                    >
                      {statusLabel(p.status, lang)}
                    </div>
                  )}
                  {p.image ? (
                    <img
                      src={p.image}
                      alt={L(p.name, lang)}
                      style={{
                        width: "100%",
                        height: 70,
                        objectFit: "cover",
                        borderRadius: 12,
                        marginBottom: 8,
                        display: "block",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        background: `linear-gradient(160deg, ${C.cream}, ${C.gold}33)`,
                        borderRadius: 12,
                        height: 70,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 34,
                        marginBottom: 8,
                      }}
                    >
                      {subcatsMap[p.subcat]?.emoji}
                    </div>
                  )}
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, lineHeight: 1.3 }}>
                    {L(p.name, lang)}
                  </div>
                  <div style={{ fontSize: 12, color: C.goldDark, fontWeight: 700, marginTop: 4 }}>
                    {p.price.toLocaleString()} ₸
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  /* -- Список подкатегорий -- */
  if (cat) {
    const catInfo = categories.find((c) => c.key === cat);
    return (
      <div style={{ paddingBottom: 20 }}>
        <BackBtn onClick={() => setCat(null)} />
        <div style={{ padding: "10px 16px" }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, color: C.text, fontWeight: 700, marginBottom: 10 }}>
            {L(catInfo.name, lang)}
          </div>
          <div className="etno-grid-sub">
            {catInfo.subcats.map((sk) => {
              const count = products.filter((p) => p.subcat === sk && isVisible(p)).length;
              return (
                <div
                  key={sk}
                  onClick={() => setSub(sk)}
                  style={{
                    background: `linear-gradient(160deg, ${C.white}, ${C.cream})`,
                    borderRadius: 16,
                    padding: 16,
                    textAlign: "center",
                    cursor: "pointer",
                    border: `1px solid ${C.gold}55`,
                  }}
                >
                  <div style={{ fontSize: 32 }}>{subcatsMap[sk]?.emoji}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, marginTop: 6 }}>
                    {L(subcatsMap[sk].name, lang)}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                    {count} {t("itemsCount")}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  /* -- Корневой список категорий -- */
  return (
    <div style={{ padding: "14px 16px 20px" }}>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, color: C.text, fontWeight: 700, marginBottom: 10 }}>
        {t("categoriesTitle")}
      </div>
      <div className="etno-grid-cats">
        {categories.map((c) => {
          const count = products.filter((p) => c.subcats.includes(p.subcat) && isVisible(p)).length;
          return (
            <div
              key={c.key}
              onClick={() => setCat(c.key)}
              style={{
                background: `linear-gradient(120deg, ${C.emerald}, ${C.emeraldDark})`,
                borderRadius: 18,
                padding: "18px 16px",
                display: "flex",
                alignItems: "center",
                gap: 14,
                cursor: "pointer",
                boxShadow: "0 8px 18px rgba(0,60,55,0.18)",
                border: `1px solid ${C.gold}66`,
              }}
            >
              <div
                style={{
                  fontSize: 30,
                  background: "rgba(255,255,255,0.08)",
                  borderRadius: 14,
                  width: 54,
                  height: 54,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {c.emoji}
              </div>
              <div>
                <div style={{ fontFamily: FONT_DISPLAY, color: C.gold, fontWeight: 700, fontSize: 15.5 }}>
                  {L(c.name, lang)}
                </div>
                <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 11.5, marginTop: 2 }}>
                  {count} {t("itemsCount")}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- ДЕТАЛЬНАЯ КАРТОЧКА ТОВАРА ---------- */
function ProductDetailView({
  lang,
  t,
  product,
  subcatsMap,
  kb,
  session,
  setProductId,
  reportProduct,
  moderateProduct,
  deleteProductForever,
}) {
  const [reported, setReported] = useState(false);

  const subInfo = subcatsMap[product.subcat] || { emoji: "✨", name: { kz: "", ru: "" } };
  const kbKey = product.patternOverride || subInfo.pattern;
  const kbEntry = kb[kbKey];
  const sc = statusColors(product.status);

  const digits = normalizePhone(product.phone || "");
  const orderText =
    lang === "kz"
      ? `Сәлеметсіз бе! "${L(product.name, lang)}" бұйымына тапсырыс бергім келеді (${product.price.toLocaleString()} ₸). Этно-Маркетплейс арқылы жаздым.`
      : `Здравствуйте! Хочу заказать изделие "${L(product.name, lang)}" (${product.price.toLocaleString()} ₸). Пишу через Этно-Маркетплейс.`;
  const waLink = digits ? `https://wa.me/${digits}?text=${encodeURIComponent(orderText)}` : null;

  const isAdmin = session?.role === "super_admin";

  return (
    <div style={{ paddingBottom: 20 }}>
      <button
        onClick={() => setProductId(null)}
        style={{
          border: "none",
          background: "transparent",
          color: C.emerald,
          fontWeight: 700,
          fontSize: 13,
          cursor: "pointer",
          padding: "14px 16px 0",
          display: "flex",
          alignItems: "center",
          gap: 4,
          fontFamily: FONT_BODY,
        }}
      >
        ← {t("back")}
      </button>
      <div style={{ padding: 16 }}>
        <div
          style={{
            background: product.image ? C.cream : `linear-gradient(160deg, ${C.emeraldSoft}, ${C.emerald})`,
            borderRadius: 20,
            height: 160,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 72,
            boxShadow: "inset 0 0 0 1px rgba(228,196,119,0.5)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {product.image ? (
            <img
              src={product.image}
              alt={L(product.name, lang)}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            subInfo.emoji
          )}
          {product.status !== "active" && (
            <div
              style={{
                position: "absolute",
                top: 10,
                right: 10,
                fontSize: 10,
                fontWeight: 700,
                color: sc.fg,
                background: sc.bg,
                borderRadius: 10,
                padding: "3px 9px",
              }}
            >
              {statusLabel(product.status, lang)}
            </div>
          )}
        </div>

        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 20, color: C.text, marginTop: 14, fontWeight: 700 }}>
          {L(product.name, lang)}
        </div>
        <div style={{ color: C.goldDark, fontWeight: 700, fontSize: 18, marginTop: 4 }}>
          {product.price.toLocaleString()} ₸
        </div>

        <div style={{ marginTop: 14, fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
          <div>
            <b style={{ color: C.text }}>{t("master")}:</b> {product.master}
          </div>
          {product.region && (
            <div>
              <b style={{ color: C.text }}>{t("region")}:</b> {L(product.region, lang)}
            </div>
          )}
          <div style={{ marginTop: 6 }}>
            <b style={{ color: C.text }}>{t("description")}:</b> {L(product.desc, lang)}
          </div>
        </div>

        {kbEntry && (
          <div
            style={{
              marginTop: 16,
              background: C.white,
              border: `1px solid ${C.gold}`,
              borderRadius: 16,
              padding: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 16 }}>📜</span>
              <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, color: C.emerald, fontSize: 14 }}>
                {t("aiAnalysisTitle")}
              </span>
            </div>
            <div style={{ fontSize: 12.5, color: C.goldDark, fontWeight: 700, marginBottom: 4 }}>
              {L(kbEntry.title, lang)}
            </div>
            <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.6 }}>{L(kbEntry.text, lang)}</div>
          </div>
        )}

        {waLink ? (
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              marginTop: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              background: "#25D366",
              color: C.white,
              textDecoration: "none",
              fontWeight: 700,
              fontSize: 14,
              padding: "13px 10px",
              borderRadius: 14,
              boxShadow: "0 8px 18px rgba(37,211,102,0.35)",
            }}
          >
            📲 {t("whatsappBtn")}
          </a>
        ) : (
          <div
            style={{
              marginTop: 18,
              textAlign: "center",
              fontSize: 12,
              color: C.danger,
              background: "#FBEAEA",
              borderRadius: 12,
              padding: 10,
            }}
          >
            {t("noPhone")}
          </div>
        )}

        {/* быстрая модерация — только для супер-админа */}
        {isAdmin && (
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button
              onClick={() => moderateProduct(product.id, "active")}
              style={{
                flex: 1,
                background: "#E8F3EF",
                color: C.emeraldDark,
                border: `1px solid ${C.emerald}`,
                borderRadius: 12,
                padding: "10px 6px",
                fontWeight: 700,
                fontSize: 11.5,
                cursor: "pointer",
                fontFamily: FONT_BODY,
              }}
            >
              {t("adminApproveBtn")}
            </button>
            <button
              onClick={() => {
                deleteProductForever(product.id);
                setProductId(null);
              }}
              style={{
                flex: 1,
                background: "#FBEAEA",
                color: C.danger,
                border: `1px solid ${C.danger}`,
                borderRadius: 12,
                padding: "10px 6px",
                fontWeight: 700,
                fontSize: 11.5,
                cursor: "pointer",
                fontFamily: FONT_BODY,
              }}
            >
              {t("adminDeleteForeverBtn")}
            </button>
          </div>
        )}

        {/* пожаловаться — доступно всем, кроме админа (у него есть свои кнопки) */}
        {!isAdmin && product.status === "active" && (
          <div style={{ textAlign: "center", marginTop: 14 }}>
            {reported ? (
              <div style={{ fontSize: 11.5, color: C.goldDark, fontWeight: 700 }}>{t("reportConfirmed")}</div>
            ) : (
              <button
                onClick={() => {
                  reportProduct(product.id);
                  setReported(true);
                }}
                style={{
                  border: "none",
                  background: "transparent",
                  color: C.muted,
                  fontSize: 11.5,
                  textDecoration: "underline",
                  cursor: "pointer",
                  fontFamily: FONT_BODY,
                }}
              >
                {t("reportBtn")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- ИИ-ЭТНОГРАФ ЧАТ ---------- */
function AIChatView({ lang, t, kb, kbOrder }) {
  const [messages, setMessages] = useState(() => [{ role: "bot", text: L(T.chatIntro1, lang) }]);
  const [input, setInput] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const send = (text) => {
    const clean = (text || "").trim();
    if (!clean) return;
    const key = findAnswer(clean, kb, kbOrder);
    const botText = key
      ? `${L(kb[key].title, lang)}\n\n${L(kb[key].text, lang)}`
      : lang === "kz"
      ? "Кешіріңіз, нақтырақ сұраңызшы. Мысалы: қошқармүйіз, шолпы, құсмұрын, құдағи білезік, тазалық жүзік немесе күн белгілері туралы сұрай аласыз."
      : "Извините, уточните вопрос. Например, спросите про қошқармүйіз, шолпы, құсмұрын, құдағи білезік, тазалық жүзік или солярные знаки.";
    setMessages((m) => [...m, { role: "user", text: clean }, { role: "bot", text: botText }]);
    setInput("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "14px 14px 6px" }}>
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: m.role === "user" ? "flex-end" : "flex-start",
              marginBottom: 10,
            }}
          >
            <div
              style={{
                maxWidth: "82%",
                background: m.role === "user" ? C.emerald : C.white,
                color: m.role === "user" ? C.white : C.text,
                border: m.role === "bot" ? `1px solid ${C.gold}` : "none",
                borderRadius: 16,
                borderBottomRightRadius: m.role === "user" ? 4 : 16,
                borderBottomLeftRadius: m.role === "bot" ? 4 : 16,
                padding: "10px 12px",
                fontSize: 12.5,
                lineHeight: 1.55,
                whiteSpace: "pre-line",
              }}
            >
              {m.text}
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: "6px 14px", flexShrink: 0 }}>
        <div style={{ fontSize: 10.5, color: C.muted, marginBottom: 6 }}>{t("chatTopicsLabel")}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {kbOrder.map((k) => (
            <button
              key={k}
              onClick={() => send(L(kb[k].title, lang))}
              style={{
                fontSize: 10.5,
                border: `1px solid ${C.gold}`,
                background: C.cream,
                color: C.emeraldDark,
                borderRadius: 20,
                padding: "5px 9px",
                cursor: "pointer",
                fontFamily: FONT_BODY,
              }}
            >
              {L(kb[k].title, lang)}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, padding: "0 14px 14px", flexShrink: 0 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send(input);
          }}
          placeholder={t("chatPlaceholder")}
          style={{
            flex: 1,
            border: `1px solid ${C.gold}`,
            borderRadius: 20,
            padding: "10px 14px",
            fontSize: 12.5,
            outline: "none",
            fontFamily: FONT_BODY,
          }}
        />
        <button
          onClick={() => send(input)}
          style={{
            background: C.emerald,
            color: C.white,
            border: "none",
            borderRadius: 20,
            padding: "0 16px",
            fontWeight: 700,
            fontSize: 12,
            cursor: "pointer",
            fontFamily: FONT_BODY,
          }}
        >
          {t("chatSend")}
        </button>
      </div>
    </div>
  );
}

/* ---------- ЛИЧНЫЙ КАБИНЕТ МАСТЕРА / АДМИНА ---------- */
function MasterCabinet({
  lang,
  t,
  session,
  registerUser,
  loginUser,
  logoutUser,
  products,
  setProducts,
  sendAppeal,
  sendNewSubcatRequest,
  categories,
  subcatsMap,
  kb,
  kbOrder,
}) {
  if (!session) {
    return <AuthForms lang={lang} t={t} registerUser={registerUser} loginUser={loginUser} />;
  }

  return (
    <div style={{ padding: "16px 16px 30px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: C.text }}>{session.name}</div>
          <div style={{ fontSize: 11, color: C.goldDark, fontWeight: 700 }}>
            {session.role === "super_admin" ? t("roleSuperAdmin") : t("roleZerger")}
          </div>
        </div>
        <button
          onClick={logoutUser}
          style={{
            border: `1px solid ${C.emerald}`,
            background: "transparent",
            color: C.emerald,
            borderRadius: 14,
            padding: "7px 12px",
            fontSize: 11.5,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: FONT_BODY,
          }}
        >
          {t("authLogoutBtn")}
        </button>
      </div>

      <MyProducts lang={lang} t={t} session={session} products={products} subcatsMap={subcatsMap} sendAppeal={sendAppeal} />

      <div style={{ height: 1, background: C.gold, opacity: 0.4, margin: "18px 0" }} />

      <AddSubcatForm lang={lang} t={t} categories={categories} sendNewSubcatRequest={sendNewSubcatRequest} />

      <div style={{ height: 1, background: C.gold, opacity: 0.4, margin: "18px 0" }} />

      <ProductForm
        lang={lang}
        t={t}
        session={session}
        setProducts={setProducts}
        categories={categories}
        subcatsMap={subcatsMap}
        kb={kb}
        kbOrder={kbOrder}
      />
    </div>
  );
}

/* ---------- ФОРМЫ ВХОДА / РЕГИСТРАЦИИ ---------- */
function AuthForms({ lang, t, registerUser, loginUser }) {
  const [mode, setMode] = useState("login");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const submit = () => {
    if (mode === "register") {
      if (!phone.trim() || !password.trim() || !name.trim()) {
        setError(t("authErrorFill"));
        return;
      }
      const res = registerUser(phone, password, name);
      if (res.error === "exists") {
        setError(t("authErrorExists"));
        return;
      }
      if (res.error === "fill") {
        setError(t("authErrorFill"));
        return;
      }
      setError("");
    } else {
      if (!phone.trim() || !password.trim()) {
        setError(t("authErrorFill"));
        return;
      }
      const res = loginUser(phone, password);
      if (res.error === "notfound") {
        setError(t("authErrorNotFound"));
        return;
      }
      if (res.error === "password") {
        setError(t("authErrorPassword"));
        return;
      }
      setError("");
    }
  };

  return (
    <div style={{ padding: "24px 20px" }}>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 19, fontWeight: 700, color: C.text, marginBottom: 4, textAlign: "center" }}>
        {t("cabinetTitle")}
      </div>
      <div style={{ textAlign: "center", fontSize: 12, color: C.muted, marginBottom: 18 }}>{t("authWelcome")}</div>

      {mode === "register" && (
        <>
          <label style={labelStyleBase}>{t("authName")}</label>
          <input style={inputStyleBase} value={name} onChange={(e) => setName(e.target.value)} />
        </>
      )}

      <label style={labelStyleBase}>{t("authPhone")}</label>
      <input
        style={inputStyleBase}
        placeholder="+7 7XX XXX XX XX"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />

      <label style={labelStyleBase}>{t("authPassword")}</label>
      <input
        style={inputStyleBase}
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      {error && <div style={{ color: C.danger, fontSize: 12, marginBottom: 10, fontWeight: 600 }}>{error}</div>}

      <button
        onClick={submit}
        style={{
          width: "100%",
          background: `linear-gradient(120deg, ${C.gold}, ${C.goldDark})`,
          color: C.emeraldDark,
          border: "none",
          borderRadius: 14,
          padding: "13px 10px",
          fontWeight: 800,
          fontSize: 14,
          cursor: "pointer",
          fontFamily: FONT_BODY,
        }}
      >
        {mode === "register" ? t("authRegisterBtn") : t("authLoginBtn")}
      </button>

      <div
        onClick={() => {
          setMode(mode === "register" ? "login" : "register");
          setError("");
        }}
        style={{
          textAlign: "center",
          marginTop: 14,
          fontSize: 12,
          color: C.emerald,
          fontWeight: 600,
          cursor: "pointer",
          textDecoration: "underline",
        }}
      >
        {mode === "register" ? t("authSwitchToLogin") : t("authSwitchToRegister")}
      </div>
    </div>
  );
}

/* ---------- СПИСОК СВОИХ ТОВАРОВ + АПЕЛЛЯЦИЯ ---------- */
function MyProducts({ lang, t, session, products, subcatsMap, sendAppeal }) {
  const mine = products.filter((p) => p.ownerPhone === session.phone);
  const [openAppealFor, setOpenAppealFor] = useState(null);
  const [appealText, setAppealText] = useState("");
  const [justSent, setJustSent] = useState(null);

  return (
    <div>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 8 }}>
        {t("myProducts")}
      </div>
      {mine.length === 0 && <div style={{ fontSize: 12, color: C.muted }}>—</div>}
      {mine.map((p) => {
        const sc = statusColors(p.status);
        return (
          <div
            key={p.id}
            style={{
              background: C.white,
              border: `1px solid ${C.cream}`,
              borderRadius: 14,
              padding: 10,
              marginBottom: 8,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text }}>
                {subcatsMap[p.subcat]?.emoji} {L(p.name, lang)}
              </div>
              <span
                style={{
                  fontSize: 9.5,
                  fontWeight: 700,
                  color: sc.fg,
                  background: sc.bg,
                  borderRadius: 8,
                  padding: "3px 7px",
                }}
              >
                {statusLabel(p.status, lang)}
              </span>
            </div>
            <div style={{ fontSize: 11.5, color: C.goldDark, fontWeight: 700, marginTop: 2 }}>
              {p.price.toLocaleString()} ₸
            </div>

            {p.status === "blocked" &&
              (openAppealFor === p.id ? (
                <div style={{ marginTop: 8 }}>
                  <textarea
                    value={appealText}
                    onChange={(e) => setAppealText(e.target.value)}
                    placeholder={t("appealPlaceholder")}
                    style={{ ...inputStyleBase, minHeight: 60, marginBottom: 6 }}
                  />
                  <button
                    onClick={() => {
                      if (appealText.trim()) {
                        sendAppeal(p.id, appealText.trim());
                        setAppealText("");
                        setOpenAppealFor(null);
                        setJustSent(p.id);
                        setTimeout(() => setJustSent(null), 2500);
                      }
                    }}
                    style={{
                      background: C.emerald,
                      color: C.white,
                      border: "none",
                      borderRadius: 10,
                      padding: "7px 14px",
                      fontSize: 11.5,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: FONT_BODY,
                    }}
                  >
                    {t("appealSend")}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setOpenAppealFor(p.id)}
                  style={{
                    marginTop: 8,
                    border: `1px solid ${C.gold}`,
                    background: C.cream,
                    color: C.emeraldDark,
                    borderRadius: 10,
                    padding: "7px 12px",
                    fontSize: 11.5,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: FONT_BODY,
                  }}
                >
                  {t("appealBtn")}
                </button>
              ))}

            {justSent === p.id && (
              <div style={{ fontSize: 11, color: C.emeraldDark, marginTop: 6, fontWeight: 700 }}>✓</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- ЗАЯВКА НА НОВУЮ ПОДКАТЕГОРИЮ ---------- */
function AddSubcatForm({ lang, t, categories, sendNewSubcatRequest }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [meaning, setMeaning] = useState("");
  const [categoryKey, setCategoryKey] = useState("");
  const [sent, setSent] = useState(false);

  const submit = () => {
    if (!name.trim() || !emoji.trim() || !meaning.trim() || !categoryKey) return;
    sendNewSubcatRequest({ name: name.trim(), emoji: emoji.trim(), meaning: meaning.trim(), categoryKey });
    setName("");
    setEmoji("");
    setMeaning("");
    setCategoryKey("");
    setOpen(false);
    setSent(true);
    setTimeout(() => setSent(false), 3000);
  };

  return (
    <div>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{
            width: "100%",
            border: `1px dashed ${C.goldDark}`,
            background: C.cream,
            color: C.emeraldDark,
            borderRadius: 12,
            padding: "10px 8px",
            fontSize: 12.5,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: FONT_BODY,
          }}
        >
          {t("addSubcatBtn")}
        </button>
      )}
      {sent && (
        <div
          style={{
            color: C.emeraldDark,
            background: "#E8F3EF",
            borderRadius: 10,
            padding: "8px 10px",
            fontSize: 12,
            marginTop: 8,
            fontWeight: 600,
          }}
        >
          ✓ {t("addSubcatSent")}
        </div>
      )}
      {open && (
        <div style={{ marginTop: 10, background: C.white, border: `1px solid ${C.gold}`, borderRadius: 14, padding: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: C.emeraldDark, marginBottom: 8 }}>
            {t("addSubcatTitle")}
          </div>

          <label style={labelStyleBase}>{t("addSubcatCategory")}</label>
          <select style={inputStyleBase} value={categoryKey} onChange={(e) => setCategoryKey(e.target.value)}>
            <option value="">{t("choose")}</option>
            {categories.map((c) => (
              <option key={c.key} value={c.key}>
                {L(c.name, lang)}
              </option>
            ))}
          </select>

          <label style={labelStyleBase}>{t("addSubcatName")}</label>
          <input style={inputStyleBase} value={name} onChange={(e) => setName(e.target.value)} />

          <label style={labelStyleBase}>{t("addSubcatEmoji")}</label>
          <input style={inputStyleBase} placeholder="✨" value={emoji} onChange={(e) => setEmoji(e.target.value)} />

          <label style={labelStyleBase}>{t("addSubcatMeaning")}</label>
          <textarea
            style={{ ...inputStyleBase, minHeight: 70 }}
            value={meaning}
            onChange={(e) => setMeaning(e.target.value)}
          />

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={submit}
              style={{
                flex: 1,
                background: C.emerald,
                color: C.white,
                border: "none",
                borderRadius: 12,
                padding: "10px 8px",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: FONT_BODY,
              }}
            >
              {t("addSubcatSend")}
            </button>
            <button
              onClick={() => setOpen(false)}
              style={{
                flex: 1,
                background: "transparent",
                color: C.muted,
                border: `1px solid ${C.muted}`,
                borderRadius: 12,
                padding: "10px 8px",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: FONT_BODY,
              }}
            >
              {t("addSubcatCancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- ФОРМА ДОБАВЛЕНИЯ ТОВАРА ---------- */
function ProductForm({ lang, t, session, setProducts, categories, subcatsMap, kb, kbOrder }) {
  const emptyForm = { name: "", cat: "", sub: "", price: "", master: "", phone: "", region: "", pattern: "", desc: "", image: "" };
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const catInfo = categories.find((c) => c.key === form.cat);

  const update = (field, value) => {
    setForm((f) => {
      const next = { ...f, [field]: value };
      if (field === "cat") {
        next.sub = "";
        next.pattern = "";
      }
      if (field === "sub" && value) {
        next.pattern = subcatsMap[value]?.pattern || "";
      }
      return next;
    });
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      update("image", reader.result);
    };
    reader.readAsDataURL(file);
  };

  const submit = () => {
    if (!form.name.trim() || !form.cat || !form.sub || !form.price || !form.phone.trim()) {
      setError(t("formRequired"));
      setSaved(false);
      return;
    }
    const newProduct = {
      id: "u" + Date.now(),
      subcat: form.sub,
      name: { kz: form.name, ru: form.name },
      price: Number(form.price) || 0,
      master: form.master || "—",
      phone: form.phone,
      region: form.region ? { kz: form.region, ru: form.region } : null,
      desc: { kz: form.desc || "—", ru: form.desc || "—" },
      image: form.image || "",
      status: "active",
      ownerPhone: session.phone,
    };
    if (form.pattern && subcatsMap[form.sub]?.pattern !== form.pattern) {
      newProduct.patternOverride = form.pattern;
    }
    setProducts((prev) => [newProduct, ...prev]);
    setError("");
    setSaved(true);
    setForm(emptyForm);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 15, color: C.text, fontWeight: 700, marginBottom: 10 }}>
        {t("formTitle")}
      </div>

      <label style={labelStyleBase}>{t("formName")}</label>
      <input style={inputStyleBase} value={form.name} onChange={(e) => update("name", e.target.value)} />

      <label style={labelStyleBase}>{t("formCategory")}</label>
      <select style={inputStyleBase} value={form.cat} onChange={(e) => update("cat", e.target.value)}>
        <option value="">{t("choose")}</option>
        {categories.map((c) => (
          <option key={c.key} value={c.key}>
            {L(c.name, lang)}
          </option>
        ))}
      </select>

      {catInfo && (
        <>
          <label style={labelStyleBase}>{t("formSubcategory")}</label>
          <select style={inputStyleBase} value={form.sub} onChange={(e) => update("sub", e.target.value)}>
            <option value="">{t("choose")}</option>
            {catInfo.subcats.map((sk) => (
              <option key={sk} value={sk}>
                {L(subcatsMap[sk].name, lang)}
              </option>
            ))}
          </select>
        </>
      )}

      <label style={labelStyleBase}>{t("formPrice")}</label>
      <input style={inputStyleBase} type="number" value={form.price} onChange={(e) => update("price", e.target.value)} />

      <label style={labelStyleBase}>{t("formMasterName")}</label>
      <input style={inputStyleBase} value={form.master} onChange={(e) => update("master", e.target.value)} />

      <label style={labelStyleBase}>{t("formPhone")}</label>
      <input
        style={inputStyleBase}
        placeholder="+7 7XX XXX XX XX"
        value={form.phone}
        onChange={(e) => update("phone", e.target.value)}
      />

      <label style={labelStyleBase}>{t("formRegion")}</label>
      <input style={inputStyleBase} value={form.region} onChange={(e) => update("region", e.target.value)} />

      <div style={{ marginBottom: 14 }}>
        <label
          htmlFor="etno-photo-input"
          style={{
            display: "block",
            textAlign: "center",
            background: `linear-gradient(120deg, ${C.gold}, ${C.emerald})`,
            color: C.white,
            fontWeight: 800,
            fontSize: 12.5,
            borderRadius: 12,
            padding: "11px 10px",
            cursor: "pointer",
            fontFamily: FONT_BODY,
            boxShadow: "0 6px 14px rgba(0,60,55,0.2)",
          }}
        >
          {form.image ? t("uploadPhotoChange") : t("uploadPhotoBtn")}
        </label>
        <input
          id="etno-photo-input"
          type="file"
          accept="image/*"
          onChange={handlePhotoChange}
          style={{ display: "none" }}
        />
        {form.image && (
          <div style={{ display: "flex", justifyContent: "center", marginTop: 10 }}>
            <img
              src={form.image}
              alt="preview"
              style={{
                width: 90,
                height: 90,
                objectFit: "cover",
                borderRadius: 14,
                border: `2px solid ${C.gold}`,
              }}
            />
          </div>
        )}
      </div>

      <label style={labelStyleBase}>{t("formPattern")}</label>
      <select style={inputStyleBase} value={form.pattern} onChange={(e) => update("pattern", e.target.value)}>
        <option value="">{t("selectAnalysis")}</option>
        {kbOrder.map((k) => (
          <option key={k} value={k}>
            {L(kb[k].title, lang)}
          </option>
        ))}
      </select>

      <label style={labelStyleBase}>{t("formDescription")}</label>
      <textarea
        style={{ ...inputStyleBase, minHeight: 70 }}
        value={form.desc}
        onChange={(e) => update("desc", e.target.value)}
      />

      {error && <div style={{ color: C.danger, fontSize: 12, marginBottom: 10, fontWeight: 600 }}>{error}</div>}
      {saved && (
        <div
          style={{
            color: C.emeraldDark,
            background: "#E8F3EF",
            borderRadius: 10,
            padding: "8px 10px",
            fontSize: 12,
            marginBottom: 10,
            fontWeight: 600,
          }}
        >
          ✓ {t("formSaved")}
        </div>
      )}

      <button
        onClick={submit}
        style={{
          width: "100%",
          background: `linear-gradient(120deg, ${C.gold}, ${C.goldDark})`,
          color: C.emeraldDark,
          border: "none",
          borderRadius: 14,
          padding: "13px 10px",
          fontWeight: 800,
          fontSize: 14,
          cursor: "pointer",
          fontFamily: FONT_BODY,
        }}
      >
        {t("formSubmit")}
      </button>
    </div>
  );
}

/* ---------- ВКЛАДКА ХАТТАР / СООБЩЕНИЯ (только супер-админ) ---------- */
function MessagesView({ lang, t, messages, products, resolveAppeal, resolveNewCategory }) {
  const pending = messages.filter((m) => m.status === "pending").sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div style={{ padding: "16px 16px 30px" }}>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, color: C.text, fontWeight: 700, marginBottom: 12 }}>
        {t("messagesTitle")}
      </div>
      {pending.length === 0 && (
        <div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: "30px 0" }}>
          {t("messagesEmpty")}
        </div>
      )}
      {pending.map((m) => {
        const prod = m.productId ? products.find((p) => p.id === m.productId) : null;
        return (
          <div
            key={m.id}
            style={{
              background: C.white,
              border: `1px solid ${C.gold}`,
              borderRadius: 14,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <div
              style={{
                display: "inline-block",
                fontSize: 9.5,
                fontWeight: 700,
                color: C.emeraldDark,
                background: C.cream,
                borderRadius: 8,
                padding: "3px 8px",
                marginBottom: 6,
              }}
            >
              {m.type === "appeal" ? t("msgTypeAppeal") : t("msgTypeNewCat")}
            </div>
            <div style={{ fontSize: 12.5, color: C.text }}>
              <b>{t("msgFrom")}:</b> {m.masterName || "—"}
            </div>
            <div style={{ fontSize: 12.5, color: C.text }}>
              <b>{t("msgPhone")}:</b> {m.masterPhone || "—"}
            </div>
            {prod && (
              <div style={{ fontSize: 12.5, color: C.text }}>
                <b>{t("msgProductLabel")}:</b> {L(prod.name, lang)}
              </div>
            )}
            <div
              style={{
                fontSize: 12.5,
                color: C.muted,
                lineHeight: 1.5,
                marginTop: 6,
                background: C.paper,
                borderRadius: 10,
                padding: 8,
              }}
            >
              {m.text}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              {m.type === "appeal" ? (
                <>
                  <button
                    onClick={() => resolveAppeal(m, "return")}
                    style={{
                      flex: 1,
                      background: "#E8F3EF",
                      color: C.emeraldDark,
                      border: `1px solid ${C.emerald}`,
                      borderRadius: 10,
                      padding: "8px 4px",
                      fontSize: 10.5,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: FONT_BODY,
                    }}
                  >
                    {t("msgReturnBtn")}
                  </button>
                  <button
                    onClick={() => resolveAppeal(m, "delete")}
                    style={{
                      flex: 1,
                      background: "#FBEAEA",
                      color: C.danger,
                      border: `1px solid ${C.danger}`,
                      borderRadius: 10,
                      padding: "8px 4px",
                      fontSize: 10.5,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: FONT_BODY,
                    }}
                  >
                    {t("msgDeleteProductBtn")}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => resolveNewCategory(m, "approve")}
                    style={{
                      flex: 1,
                      background: "#E8F3EF",
                      color: C.emeraldDark,
                      border: `1px solid ${C.emerald}`,
                      borderRadius: 10,
                      padding: "8px 4px",
                      fontSize: 10.5,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: FONT_BODY,
                    }}
                  >
                    {t("msgApproveCatBtn")}
                  </button>
                  <button
                    onClick={() => resolveNewCategory(m, "reject")}
                    style={{
                      flex: 1,
                      background: "#FBEAEA",
                      color: C.danger,
                      border: `1px solid ${C.danger}`,
                      borderRadius: 10,
                      padding: "8px 4px",
                      fontSize: 10.5,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: FONT_BODY,
                    }}
                  >
                    {t("msgRejectCatBtn")}
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
