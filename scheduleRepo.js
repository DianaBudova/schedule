// scheduleRepo.js
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set.");
}

const supabaseServer = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Отримати розклад користувача
 * @param {string} userId - uuid користувача
 * @returns {Promise<{courses: Array}>}
 */
export async function getSchedule(userId) {
  try {
    const { data, error } = await supabaseServer
      .from('schedules')
      .select('courses')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error("getSchedule error:", error);
      return { courses: [] };
    }

    return data || { courses: [] };
  } catch (err) {
    console.error("getSchedule exception:", err);
    return { courses: [] };
  }
}

/**
 * Зберегти розклад користувача
 * @param {string} userId - uuid користувача
 * @param {{courses: Array}} schedule - об'єкт розкладу
 */
export async function saveSchedule(userId, schedule) {
  try {
    // Upsert: якщо є рядок з user_id — оновлюємо, інакше вставляємо
    const { data, error } = await supabaseServer
      .from('schedules')
      .upsert(
        { user_id: userId, courses: schedule.courses },
        { onConflict: 'user_id' }
      );

    if (error) {
      console.error("saveSchedule error:", error);
    }

    return data;
  } catch (err) {
    console.error("saveSchedule exception:", err);
  }
}

/**
 * Видалити розклад користувача
 * @param {string} userId
 */
export async function deleteSchedule(userId) {
  try {
    const { data, error } = await supabaseServer
      .from('schedules')
      .delete()
      .eq('user_id', userId);

    if (error) {
      console.error("deleteSchedule error:", error);
    }

    return data;
  } catch (err) {
    console.error("deleteSchedule exception:", err);
  }
}
