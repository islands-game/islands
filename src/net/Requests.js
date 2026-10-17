import { Cloud } from './Cloud.js';

// Заявки ИИ (supabase/schema.sql, таблица requests). Видит их только автор и владелец проекта.
export const KINDS = ['creature', 'enemy', 'building', 'island', 'other'];

export const Requests = {
  // Есть ли в тексте то, что похоже на личные данные (почта, телефон, ссылка): такое не отправляем
  looksPersonal(text) {
    return /@|https?:\/\/|www\./i.test(text) || /\d[\d\s().-]{6,}\d/.test(text);
  },

  async list() {
    if (!Cloud.client || !Cloud.user) return null;
    const { data, error } = await Cloud.client.from('requests')
      .select('id,kind,title,status,reply,created_at').order('created_at', { ascending: false }).limit(20);
    return error ? null : data;
  },

  // Результат: 'ok' | 'too_many' | 'error' | 'signin'
  async submit({ kind, title, body }) {
    if (!Cloud.client || !Cloud.user) return 'signin';
    if (!KINDS.includes(kind)) return 'error';
    const { error } = await Cloud.client.from('requests').insert({ kind, title: title.trim().slice(0, 60), body: body.trim().slice(0, 420) });
    if (!error) return 'ok';
    return /too_many_open_requests/.test(error.message ?? '') ? 'too_many' : 'error';
  },

  async remove(id) {
    if (!Cloud.client || !Cloud.user) return false;
    const { error } = await Cloud.client.from('requests').delete().eq('id', id);
    return !error;
  },
};
