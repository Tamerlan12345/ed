const { createClient } = require('@supabase/supabase-js');
// Импортируем нашу проверенную и загруженную конфигурацию
const { supabaseUrl, supabaseAnonKey, supabaseServiceKey } = require('../config');

// Ошибка больше невозможна, так как config/index.js уже всё проверил.
// Если бы что-то пошло не так, сервер бы уже упал с более ясной ошибкой.

const createSupabaseClient = (jwt) => {
  return createClient(supabaseUrl, supabaseAnonKey, {
      global: {
          headers: { Authorization: `Bearer ${jwt}` }
      }
  });
};

const createSupabaseAdminClient = () => {
    return createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });
};

console.log('[Supabase] Supabase client functions initialized.');

module.exports = {
    createSupabaseClient,
    createSupabaseAdminClient,
};