-- ═══════════════════════════════════════════════════════════════
-- مركز التواصل والدعم 💬 (Staging أولًا، ثم الإنتاج بيد صاحبة المنصة)
--
-- محادثات دعم لكل مستخدمة مع رسائلها: الذكاء خط أول يقرأ ويجيب من
-- معرفة معتمدة فقط، والإدارة تستلم متى شاءت — وبعد الاستلام لا يرد
-- الذكاء آليًا. RLS تعزل كل مستخدمة بمحادثاتها، والأدمِن يرى الكل.
-- رسائل ai/system تُكتب من الخادم بمفتاح الخدمة (يتجاوز RLS عمدًا).
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.support_conversations (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  title            text not null default 'محادثة دعم' check (char_length(title) <= 120),
  status           text not null default 'open'
                     check (status in ('open','needs_human','human_handling','closed')),
  handling_mode    text not null default 'ai' check (handling_mode in ('ai','human')),
  last_sender      text not null default 'user' check (last_sender in ('user','ai','admin','system')),
  user_seen_at     timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  last_message_at  timestamptz not null default now()
);

create table if not exists public.support_messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.support_conversations(id) on delete cascade,
  sender_type      text not null check (sender_type in ('user','ai','admin','system')),
  sender_user_id   uuid references auth.users(id) on delete set null,
  content          text not null check (char_length(content) between 1 and 2000),
  created_at       timestamptz not null default now()
);

create index if not exists support_conversations_user_idx
  on public.support_conversations (user_id, last_message_at desc);
create index if not exists support_conversations_inbox_idx
  on public.support_conversations (status, last_message_at desc);
create index if not exists support_messages_convo_idx
  on public.support_messages (conversation_id, created_at);

alter table public.support_conversations enable row level security;
alter table public.support_messages      enable row level security;

-- المحادثات: صاحبتها أو الأدمِن
create policy support_convo_select on public.support_conversations
  for select using (user_id = auth.uid() or public.is_admin());
create policy support_convo_insert on public.support_conversations
  for insert with check (user_id = auth.uid());
-- التحديث من المتصفح مقيَّد عمودًا واحدًا: مؤشر «قرأتُ» لا غير.
-- الحقول الإدارية (status/handling_mode/last_sender/last_message_at)
-- تُكتب حصرًا من مسارات الخادم بمفتاح الخدمة بعد تحقق الدور —
-- فلا تستطيع مستخدمة (ولا حتى جلسة أدمِن من العميل) قلب حالة التحويل.
create policy support_convo_update on public.support_conversations
  for update using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

revoke update, delete on public.support_conversations from anon, authenticated;
grant  update (user_seen_at) on public.support_conversations to authenticated;
revoke update, delete on public.support_messages from anon, authenticated;

-- الرسائل: القراءة لمن يرى المحادثة؛ والكتابة من المتصفح للمستخدمة
-- باسمها داخل محادثتها فقط، وللأدمِن بصفته — ai/system من الخادم فقط
create policy support_msg_select on public.support_messages
  for select using (
    exists (select 1 from public.support_conversations c
            where c.id = conversation_id
              and (c.user_id = auth.uid() or public.is_admin()))
  );
create policy support_msg_insert_user on public.support_messages
  for insert with check (
    sender_type = 'user'
    and sender_user_id = auth.uid()
    and exists (select 1 from public.support_conversations c
                where c.id = conversation_id and c.user_id = auth.uid()
                  and c.status <> 'closed')
  );
create policy support_msg_insert_admin on public.support_messages
  for insert with check (
    sender_type = 'admin'
    and sender_user_id = auth.uid()
    and public.is_admin()
  );
