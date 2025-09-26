import supabase from './supabaseClient.js'

export async function getSchedule(userId) {
  const { data, error } = await supabase
    .from('schedules')
    .select('content')
    .eq('user_id', userId)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data?.content ?? { courses: [] }
}

export async function saveSchedule(userId, content) {
  const { data, error } = await supabase
    .from('schedules')
    .upsert({ user_id: userId, content })
    .select()
  if (error) throw error
  return data
}

export async function deleteSchedule(userId) {
  const { error } = await supabase
    .from('schedules')
    .delete()
    .eq('user_id', userId)
  if (error) throw error
  return true
}
