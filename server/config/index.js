const path = require('path');
const dotenv = require('dotenv');

// Явно указываем путь к .env файлу в корне проекта
const envPath = path.resolve(__dirname, '..', '..', '.env');
const result = dotenv.config({ path: envPath });

if (result.error) {
  // Если файл .env не найден или не может быть прочитан, программа аварийно завершится с этой ошибкой
  throw new Error(`FATAL ERROR: Could not load .env file from ${envPath}. Error: ${result.error}`);
}

const config = {
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY,
  geminiApiKey: process.env.GEMINI_API_KEY,
  bytezApiUrl: process.env.BYTEZ_API_URL,
  bytezApiKey: process.env.BYTEZ_API_KEY,
};

// Проверяем, что ВСЕ необходимые переменные были загружены
for (const key in config) {
  if (!config[key]) {
    // Исключаем необязательные ключи из строгой проверки
    if (key === 'geminiApiKey' || key === 'bytezApiUrl' || key === 'bytezApiKey') continue;
    throw new Error(`FATAL ERROR: Missing environment variable '${key.toUpperCase()}' in .env file.`);
  }
}

// Выводим в консоль подтверждение, что всё загружено
console.log('[Config] Environment variables loaded successfully.');

module.exports = config;