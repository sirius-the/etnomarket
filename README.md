# Этно-Маркетплейс

## 1. Подключить общую базу данных (один раз, ~5 минут)

1. Зарегистрируйтесь бесплатно на https://supabase.com
2. Создайте новый проект (New project)
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

4. Слева откройте Settings → API. Скопируйте "Project URL" и "anon public" ключ.
5. Откройте src/App.jsx, найдите строки:

   const SUPABASE_URL = "https://ВАШ-ПРОЕКТ.supabase.co";
   const SUPABASE_ANON_KEY = "ВАШ_ANON_KEY";

   и вставьте туда свои значения.

## 2. Запустить локально (проверить, что всё работает)

   npm install
   npm run dev

Откройте адрес, который покажет терминал (обычно http://localhost:5173).

## 3. Опубликовать как настоящий сайт (бесплатно)

Самый простой способ — Netlify Drop:

   npm run build

Это создаст папку `dist`. Зайдите на https://app.netlify.com/drop и перетащите
папку `dist` мышкой в браузер — через несколько секунд получите настоящую
рабочую ссылку вида https://ваш-сайт.netlify.app

Другой вариант — Vercel:
1. Зарегистрируйтесь на https://vercel.com
2. Загрузите этот проект на GitHub
3. В Vercel нажмите "New Project" → выберите репозиторий → Deploy

Оба варианта бесплатны для такого сайта.
