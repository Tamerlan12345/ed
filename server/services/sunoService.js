// server/services/sunoService.js

const Bytez = require('bytez.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const sdk = new Bytez(process.env.BYTEZ_API_KEY);
const model = sdk.model("suno/bark");

const AUDIO_BASE_DIR = path.join(process.cwd(), 'audio_summaries');

/**
 * Генерирует аудио из текста с помощью SUNO и сохраняет его локально.
 * @param {string} text Текст для озвучки.
 * @param {string|number} courseId ID курса для сохранения файла.
 * @param {string} [voice] Опциональный пресет голоса (например, 'v2/ru_speaker_3').
 * @returns {Promise<string>} Публичный URL к сохраненному файлу.
 */
async function generateAndSaveAudio(text, courseId, voice) {
    console.log(`Generating audio with SUNO for course: ${courseId}, voice: ${voice || 'default'}`);

    // Формируем параметры для модели
    const modelInput = {
        text: text,
        // Добавляем пресет голоса, только если он был передан
        ...(voice && { history_prompt: voice })
    };

    // 1. Вызов модели SUNO
    // ВАЖНО: я предполагаю, что параметр называется `history_prompt`.
    // Название может отличаться, нужно свериться с документацией bytez.js или suno/bark.
    // Если параметр другой, нужно заменить `history_prompt` на верное имя.
    const { error, output } = await model.run(modelInput);

    if (error || !output || !output.output) {
        console.error('Bytez API error:', error);
        throw new Error('Failed to generate audio via Bytez API.');
    }

    const audioUrl = output.output;
    console.log('Received audio URL:', audioUrl);

    // ... остальная часть функции (скачивание и сохранение файла) остается без изменений ...

    // 2. Создание директории и определение пути для сохранения
    const courseAudioDir = path.join(AUDIO_BASE_DIR, String(courseId));
    if (!fs.existsSync(courseAudioDir)) {
        fs.mkdirSync(courseAudioDir, { recursive: true });
    }

    // Определяем имя файла. Пока обе кнопки ведут на один файл `summary.mp3`.
    // В будущем можно будет передавать тип ('description'/'course') и сохранять разные файлы.
    const outputFilePath = path.join(courseAudioDir, 'summary.mp3');

    // 3. Скачивание файла по URL
    const response = await axios({
        method: 'GET',
        url: audioUrl,
        responseType: 'stream',
    });

    // 4. Сохранение файла на диск
    const writer = fs.createWriteStream(outputFilePath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });

    console.log('Audio file saved successfully to:', outputFilePath);

    // 5. Возвращаем публичный URL
    return `/audio_summaries/${courseId}/summary.mp3`;
}

module.exports = { generateAndSaveAudio };