// scheduleRepo.js
import supabaseServer from './supabaseServer.js';

/**
 * Очікується таблиця public.schedules з колонками:
 * - user_id text PRIMARY KEY
 * - courses jsonb
 * - created_at timestamptz default now()
 *
 * SQL для створення (покладений у README або в SQL editor Supabase):
 * 
 * create table public.schedules (
 *   user_id text primary key,
 *   courses jsonb default '[]'::jsonb,
 *   created_at timestamptz default now()
 * );
 */

export async function getSchedule(userId) {
  if (!userId) return { user_id: null, courses: [] };
  const { data, error } = await supabaseServer
    .from('schedules')
    .select('*')
    .eq('user_id', String(userId))
    .limit(1)
    .single();
  if (error) {
    // Якщо рядка нема — повертаємо пустий об'єкт (не кидаємо помилку)
    if (error.code === 'PGRST116' || /No rows/.test(error.message || '')) {
      return { user_id: userId, courses: [] };
    }
    throw error;
  }
  // data.courses може бути null -> зробимо масив
  return {
    user_id: data.user_id,
    courses: data.courses ?? []
  };
}

export async function saveSchedule(userId, scheduleObj) {
  if (!userId) throw new Error('Missing userId');
  // scheduleObj має поле courses (масив)
  const payload = {
    user_id: String(userId),
    courses: scheduleObj.courses ?? []
  };

  // upsert по PK user_id
  const { data, error } = await supabaseServer
    .from('schedules')
    .upsert(payload, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteSchedule(userId) {
  if (!userId) throw new Error('Missing userId');
  const { data, error } = await supabaseServer
    .from('schedules')
    .delete()
    .eq('user_id', String(userId));

  if (error) throw error;
  return data;
}
