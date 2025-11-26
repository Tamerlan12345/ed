const { createSupabaseAdminClient } = require('../lib/supabaseClient');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient: createPexelsClient } = require('pexels');
const mammoth = require('mammoth');
const pdf = require('pdf-parse');
const { PPTXInHTMLOut } = require('pptx-in-html-out');
const rtfParser = require('rtf-parser');
const axios = require('axios');
const cheerio = require('cheerio');
const { Readable } = require('stream');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const { parsePptxToHtml, extractTextFromPptx } = require('./pptxParser');


// --- AI/External Service Clients ---
function chunkText(text, maxLength = 9000) {
    const chunks = [];
    for (let i = 0; i < text.length; i += maxLength) {
        chunks.push(text.substring(i, i + maxLength));
    }
    return chunks;
}
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const pexelsClient = process.env.PEXELS_API_KEY ? createPexelsClient(process.env.PEXELS_API_KEY) : null;
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

async function parseQuizFromText(textContent) {
    console.log('Starting quiz parsing with AI...');
    const outputFormat = {
        questions: [{
            question: "Текст вопроса",
            options: ["Вариант 1", "Вариант 2", "Вариант 3"],
            correct_option_index: 0
        }]
    };

    const prompt = `
        ЗАДАНИЕ: Проанализируй ИСХОДНЫЙ ТЕКСТ и преобразуй его в JSON-структуру для теста.

        ИСХОДНЫЙ ТЕКСТ:
        ---
        ${textContent}
        ---

        ПРАВИЛА ПАРСИНГА:
        1.  Каждый новый вопрос начинается с новой строки.
        2.  Варианты ответов идут сразу после вопроса, каждый на новой строке.
        3.  Правильный вариант ответа **ОДНОЗНАЧНО** помечается символом "+" или "*" в самом начале строки. Другие символы (например, "-") или нумерацию следует игнорировать как маркеры.
        4.  Текст вопроса и вариантов ответа нужно очистить от маркеров (+, *, -, 1., a)) и лишних пробелов.

        ТРЕБОВАНИЯ К ВЫВОДУ:
        -   Ты должен вернуть **ТОЛЬКО JSON** и ничего больше. Без слов "json", "вот json" и без использования markdown-форматирования (никаких \`\`\`).
        -   Структура JSON должна строго соответствовать этому формату: ${JSON.stringify(outputFormat)}
        -   Поле "correct_option_index" должно содержать индекс правильного ответа в массиве "options" (начиная с 0).

        Пример:
        Исходный текст:
        1. Столица Франции?
        - Рим
        + Париж
        - Берлин

        Результат JSON:
        {
            "questions": [
                {
                    "question": "Столица Франции?",
                    "options": ["Рим", "Париж", "Берлин"],
                    "correct_option_index": 1
                }
            ]
        }
    `;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const textResponse = response.text();

        let jsonString;

        // Strategy 1: Look for a JSON markdown block
        const markdownMatch = textResponse.match(/```json\n([\s\S]*?)\n```/);
        if (markdownMatch && markdownMatch[1]) {
            jsonString = markdownMatch[1];
        } else {
            // Strategy 2: Fallback to finding the first and last brace
            const firstBrace = textResponse.indexOf('{');
            const lastBrace = textResponse.lastIndexOf('}');
            if (firstBrace === -1 || lastBrace === -1) {
                throw new Error('AI response does not contain a valid JSON object.');
            }
            jsonString = textResponse.substring(firstBrace, lastBrace + 1);
        }

        const parsedJson = JSON.parse(jsonString);

        // Basic validation
        if (!parsedJson.questions || !Array.isArray(parsedJson.questions)) {
            throw new Error('Parsed JSON is missing the "questions" array.');
        }

        console.log(`AI parsing successful. Found ${parsedJson.questions.length} questions.`);
        return parsedJson;

    } catch (error) {
        console.error('AI parsing or JSON validation failed:', error);
        throw new Error(`AI failed to parse the quiz. Details: ${error.message}`);
    }
}


async function handlePresentationProcessing(jobId, payload) {
    const supabaseAdmin = createSupabaseAdminClient();
    const { course_id, presentation_url } = payload;

    const updateJobStatus = async (status, data = null, errorMessage = null) => {
        const { error } = await supabaseAdmin
            .from('background_jobs')
            .update({ status, payload: data, last_error: errorMessage, updated_at: new Date().toISOString() })
            .eq('id', jobId);
        if (error) console.error(`[Job ${jobId}] Failed to update job status to ${status}:`, error);
    };

    // Функция для очистки временной папки
    const cleanupTempDir = async (dirPath) => {
        try {
            if (dirPath && fs.existsSync(dirPath)) {
                fs.rmSync(dirPath, { recursive: true, force: true });
            }
        } catch (e) {
            console.error('Error cleaning up temp dir:', e);
        }
    };

    let tempDir = null;

    try {
        console.log(`[Job ${jobId}] Starting PDF-based presentation processing for course ${course_id} from URL: ${presentation_url}`);

        // 1. Extract the presentation ID from any valid Google Slides URL.
        const match = presentation_url.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (!match || !match[1]) {
            throw new Error('Invalid Google Slides URL. Could not extract presentation ID.');
        }
        const presentationId = match[1];

        // 2. Construct the PDF export URL.
        const pdfUrl = `https://docs.google.com/presentation/d/${presentationId}/export/pdf`;
        console.log(`[Job ${jobId}] Converted to PDF URL: ${pdfUrl}`);


        // 3. Fetch the PDF content from the export URL
        const response = await axios.get(pdfUrl, { responseType: 'arraybuffer' });
        const pdfBuffer = response.data;

        // --- NEW LOGIC: Visual Slides Processing ---

        // 4. Create temp dir and save PDF
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gslides-convert-'));
        const pdfPath = path.join(tempDir, 'presentation.pdf');
        fs.writeFileSync(pdfPath, pdfBuffer);

        await updateJobStatus('pending', { message: 'Рендеринг слайдов из Google Presentation...' });

        // 5. Convert PDF -> PNG (pdftoppm)
        const outputPrefix = 'slide';
        try {
             await execAsync(`pdftoppm -png -r 150 "${pdfPath}" "${path.join(tempDir, outputPrefix)}"`);
        } catch (e) {
            throw new Error(`Ошибка pdftoppm: ${e.message}`);
        }

        // 6. Upload images to Supabase
        const files = fs.readdirSync(tempDir).filter(f => f.startsWith(outputPrefix) && f.endsWith('.png'));
        if (files.length === 0) {
            throw new Error('Не удалось извлечь изображения слайдов из Google PDF.');
        }
        // Сортируем файлы, чтобы слайды шли по порядку
        files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

        const slides = [];
        // Ensure bucket exists
        try {
             const { data: buckets } = await supabaseAdmin.storage.listBuckets();
             if (buckets && !buckets.find(b => b.name === 'course_materials')) {
                 await supabaseAdmin.storage.createBucket('course_materials', { public: true });
             }
        } catch (e) { console.error('Bucket check failed', e); }

        for (let i = 0; i < files.length; i++) {
            const imgFileName = files[i];
            const imgPath = path.join(tempDir, imgFileName);
            const imgBuffer = fs.readFileSync(imgPath);
            const storagePath = `slides/${course_id}/gslides_${Date.now()}_${i + 1}.png`;

            const { error: uploadError } = await supabaseAdmin.storage
                .from('course_materials')
                .upload(storagePath, imgBuffer, { contentType: 'image/png', upsert: true });

            if (uploadError) throw new Error(`Upload failed for slide ${i}: ${uploadError.message}`);

            const { data: publicUrlData } = supabaseAdmin.storage
                .from('course_materials')
                .getPublicUrl(storagePath);

            slides.push({
                slide_title: `Слайд ${i + 1}`,
                image_url: publicUrlData.publicUrl,
                html_content: ''
            });
        }

        // 7. Extract text and generate quiz
        let generatedQuestions = [];
        try {
            console.log(`[Job ${jobId}] Extracting text from Google PDF for quiz...`);
            const data = await pdf(pdfBuffer);
            const textContent = data.text.replace(/\s+/g, ' ').trim();

            if (textContent && textContent.length > 50) {
                const textChunks = chunkText(textContent);
                console.log(`[Job ${jobId}] Text chunked into ${textChunks.length} parts.`);
                for (const chunk of textChunks) {
                    try {
                        const quizJson = await parseQuizFromText(chunk);
                        if (quizJson && quizJson.questions) {
                            generatedQuestions.push(...quizJson.questions);
                        }
                    } catch (chunkError) {
                        console.error(`[Job ${jobId}] Error processing a text chunk for quiz:`, chunkError);
                    }
                }
                console.log(`[Job ${jobId}] Total questions generated: ${generatedQuestions.length}`);
            }
        } catch (textError) {
            console.error(`[Job ${jobId}] Quiz generation failed:`, textError);
        }

        // 8. Save content
        const parsedContent = {
            summary: { slides },
            questions: generatedQuestions
        };

        const { error: updateError } = await supabaseAdmin
            .from('courses')
            .update({
                content: parsedContent,
                draft_content: parsedContent,
                description: `Импортировано из Google Slides: ${presentationId}`
            })
            .eq('id', course_id);

        if (updateError) throw new Error(`Failed to save content: ${updateError.message}`);

        await cleanupTempDir(tempDir);
        await updateJobStatus('completed', { message: `Google Presentation processed (${slides.length} slides).` });

    } catch (error) {
        if (tempDir) await cleanupTempDir(tempDir);
        console.error(`[Job ${jobId}] Error during presentation processing:`, error);
        // NEW: Check for a 404 error and provide a user-friendly message.
        if (error.isAxiosError && error.response?.status === 404) {
            const userFriendlyError = 'Failed to download the presentation (404 Not Found). This usually means the Google Slides presentation is not shared publicly. Please check the sharing settings and ensure that "General access" is set to "Anyone with the link".';
            await updateJobStatus('failed', null, userFriendlyError);
        } else {
            // For all other errors, use the default message
            await updateJobStatus('failed', null, error.message);
        }
    }
}


async function handleUploadAndProcess(jobId, payload) {
    const supabaseAdmin = createSupabaseAdminClient();

    const updateJobStatus = async (status, data = null, errorMessage = null) => {
        const { error } = await supabaseAdmin
            .from('background_jobs')
            .update({ status, payload: data, last_error: errorMessage, updated_at: new Date().toISOString() })
            .eq('id', jobId);
        if (error) console.error(`Failed to update job ${jobId} status to ${status}:`, error);
    };

    // Функция для очистки временной папки
    const cleanupTempDir = async (dirPath) => {
        try {
            if (dirPath && fs.existsSync(dirPath)) {
                fs.rmSync(dirPath, { recursive: true, force: true });
            }
        } catch (e) {
            console.error('Error cleaning up temp dir:', e);
        }
    };

    let tempDir = null;

    try {
        let { course_id, file_name, file_data, upload_mode } = payload;
        console.log(`[Job ${jobId}] Processing file: ${file_name}`);

        const buffer = Buffer.from(file_data, 'base64');

        // Если это НЕ PPTX и НЕ PDF, используем старую логику (для docx, rtf)
        if (!file_name.endsWith('.pptx') && !file_name.endsWith('.pdf')) {
            let textContent = '';

            console.log(`[Job ${jobId}] Buffer created, size: ${buffer.length}. Detecting file type (text-only).`);
            if (file_name.endsWith('.docx')) {
                console.log(`[Job ${jobId}] Processing .docx file with mammoth...`);
                const { value } = await mammoth.extractRawText({ buffer });
                textContent = value;
                console.log(`[Job ${jobId}] .docx processing complete. Text length: ${textContent.length}`);
            } else if (file_name.endsWith('.rtf')) {
                console.log(`[Job ${jobId}] Processing .rtf file with rtf-parser...`);
                textContent = await new Promise((resolve, reject) => {
                    const stream = Readable.from(buffer);
                    rtfParser.stream(stream, (err, doc) => {
                        if (err) return reject(err);
                        const text = doc.content.map(p => p.content.map(s => s.value).join('')).join('\n');
                        resolve(text);
                    });
                });
                console.log(`[Job ${jobId}] .rtf processing complete. Text length: ${textContent.length}`);
            } else {
                throw new Error('Unsupported file type. Please upload a .docx, .rtf, .pdf or .pptx file.');
            }

            if (!textContent) {
                throw new Error('Could not extract text from the document.');
            }

            // --- NEW LOGIC: Route based on upload_mode ---
            if (upload_mode === 'quiz') {
                console.log(`[Job ${jobId}] Quiz upload mode detected. Parsing text with AI...`);
                const quizJson = await parseQuizFromText(textContent);

                console.log(`[Job ${jobId}] AI parsing complete. Saving JSON to content fields and publishing course...`);
                const { error: dbError } = await supabaseAdmin
                    .from('courses')
                    .update({
                        content: quizJson,
                        draft_content: quizJson,
                        status: 'published',
                        description: `Квиз из файла: ${file_name}` // Add a description for clarity
                    })
                    .eq('id', course_id);

                if (dbError) {
                    throw new Error(`Failed to save quiz JSON to course: ${dbError.message}`);
                }
                console.log(`[Job ${jobId}] Quiz course ${course_id} created and published successfully.`);
                await updateJobStatus('completed', { message: `Quiz created successfully from ${file_name}` });

            } else {
                // --- OLD LOGIC: Save as course material ---
                console.log(`[Job ${jobId}] Course material mode. Saving extracted text to course description...`);
                const { error: dbError } = await supabaseAdmin
                    .from('courses')
                    .update({ description: textContent })
                    .eq('id', course_id);

                if (dbError) {
                    throw new Error(`Failed to save course content: ${dbError.message}`);
                }
                console.log(`[Job ${jobId}] Course material processing completed for course ID: ${course_id}.`);
                await updateJobStatus('completed', { message: `File processed for course ${course_id}` });
            }
            return; // Exit if not PPTX
        }

        // === ЛОГИКА ДЛЯ ВИЗУАЛЬНЫХ ПРЕЗЕНТАЦИЙ (PPTX, PDF) ===

        // 1. Создаем временную директорию
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'presentation-convert-'));

        let pdfPath;

        if (file_name.endsWith('.pptx')) {
            // --- PPTX BRANCH ---
            const inputPptxPath = path.join(tempDir, 'presentation.pptx');
            fs.writeFileSync(inputPptxPath, buffer);

            await updateJobStatus('pending', { message: 'Конвертация презентации в PDF (LibreOffice)...' });

            // 2. Конвертация PPTX -> PDF с помощью LibreOffice
            try {
                await execAsync(`libreoffice --headless --convert-to pdf --outdir "${tempDir}" "${inputPptxPath}"`);
            } catch (e) {
                throw new Error(`Ошибка LibreOffice: ${e.message}`);
            }

            pdfPath = path.join(tempDir, 'presentation.pdf');
            if (!fs.existsSync(pdfPath)) {
                throw new Error('Не удалось создать PDF из презентации.');
            }
        } else {
             // --- PDF BRANCH ---
             // Файл уже является PDF, пропускаем конвертацию
             console.log(`[Job ${jobId}] Processing PDF file directly (skipping LibreOffice).`);
             pdfPath = path.join(tempDir, 'presentation.pdf');
             fs.writeFileSync(pdfPath, buffer);
        }

        await updateJobStatus('pending', { message: 'Рендеринг слайдов в изображения...' });

        // 3. Конвертация PDF -> PNG (каждый слайд - отдельная картинка)
        // pdftoppm -png -r 150 (DPI) input.pdf prefix
        const outputPrefix = 'slide';
        try {
            // 150 DPI достаточно для веба, дает хорошее качество FullHD
            await execAsync(`pdftoppm -png -r 150 "${pdfPath}" "${path.join(tempDir, outputPrefix)}"`);
        } catch (e) {
            throw new Error(`Ошибка pdftoppm: ${e.message}`);
        }

        // 4. Сбор и загрузка изображений в Supabase Storage
        const files = fs.readdirSync(tempDir).filter(f => f.startsWith(outputPrefix) && f.endsWith('.png'));

        if (files.length === 0) {
            throw new Error('Не удалось извлечь изображения слайдов из PDF. Возможно, файл поврежден или пуст.');
        }

        // Сортируем файлы, чтобы слайды шли по порядку (slide-1, slide-2, ..., slide-10)
        // pdftoppm нумерует как slide-01.png или slide-1.png в зависимости от версии,
        // поэтому используем натуральную сортировку.
        files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

        const slides = [];

        // Ensure bucket exists
        try {
            const { data: buckets, error: bucketsError } = await supabaseAdmin.storage.listBuckets();
            if (!bucketsError) {
                const bucketExists = buckets.find(b => b.name === 'course_materials');
                if (!bucketExists) {
                    console.log(`[Job ${jobId}] Bucket 'course_materials' not found. Creating...`);
                    const { error: createError } = await supabaseAdmin.storage.createBucket('course_materials', {
                        public: true
                    });
                    if (createError) {
                        console.error(`[Job ${jobId}] Failed to create bucket 'course_materials':`, createError);
                    } else {
                        console.log(`[Job ${jobId}] Bucket 'course_materials' created successfully.`);
                    }
                }
            } else {
                console.error(`[Job ${jobId}] Failed to list buckets:`, bucketsError);
            }
        } catch (bucketCheckError) {
             console.error(`[Job ${jobId}] Error checking/creating bucket:`, bucketCheckError);
        }

        for (let i = 0; i < files.length; i++) {
            const imgFileName = files[i];
            const imgPath = path.join(tempDir, imgFileName);
            const imgBuffer = fs.readFileSync(imgPath);

            // Уникальное имя файла для storage: course_id/timestamp_slide_X.png
            const storagePath = `slides/${course_id}/${Date.now()}_${i + 1}.png`;

            // Загрузка в бакет 'course_materials' (предполагается, что он публичный)
            // Если бакета 'course_materials' нет, создайте его в Supabase Dashboard или используйте другой.
            const { data: uploadData, error: uploadError } = await supabaseAdmin
                .storage
                .from('course_materials')
                .upload(storagePath, imgBuffer, {
                    contentType: 'image/png',
                    upsert: true
                });

            if (uploadError) {
                console.error(`Ошибка загрузки слайда ${i}:`, uploadError);
                throw new Error(`Не удалось загрузить слайд ${i + 1} в хранилище. Проверьте настройки Supabase (бакет course_materials). Ошибка: ${uploadError.message}`);
            }

            // Получение публичной ссылки
            const { data: publicUrlData } = supabaseAdmin
                .storage
                .from('course_materials')
                .getPublicUrl(storagePath);

            slides.push({
                slide_title: `Слайд ${i + 1}`,
                // Мы не используем html_content, а только image_url.
                // Фронтенд должен уметь отображать это.
                image_url: publicUrlData.publicUrl,
                html_content: '' // Оставляем пустым, чтобы фронтенд использовал картинку
           });
        }

        if (slides.length === 0) {
             throw new Error('Презентация обработана, но слайды не найдены. Возможно, файл пустой или произошла ошибка конвертации.');
        }

        // 5. Извлечение текста для генерации вопросов (параллельно с картинками)
        let generatedQuestions = [];
        let extractedText = '';

        try {
            console.log(`[Job ${jobId}] Extracting text for quiz generation...`);

            if (file_name.endsWith('.pptx')) {
                 extractedText = await extractTextFromPptx(buffer);
            } else {
                 // For PDF, we use pdf-parse
                 const data = await pdf(buffer);
                 extractedText = data.text;
            }

            if (extractedText && extractedText.length > 50) {
                console.log(`[Job ${jobId}] Extracted ${extractedText.length} chars. Generating quiz...`);
                const textChunks = chunkText(extractedText);
                console.log(`[Job ${jobId}] Text chunked into ${textChunks.length} parts for quiz generation.`);
                for (const chunk of textChunks) {
                    try {
                        const quizJson = await parseQuizFromText(chunk);
                        if (quizJson && quizJson.questions) {
                            generatedQuestions.push(...quizJson.questions);
                        }
                    } catch (chunkError) {
                        console.error(`[Job ${jobId}] Error processing a text chunk for quiz:`, chunkError);
                        // Decide if you want to stop or continue. For now, we continue.
                    }
                }
                console.log(`[Job ${jobId}] Total questions generated after processing all chunks: ${generatedQuestions.length}`);
            } else {
                console.warn(`[Job ${jobId}] Not enough text extracted for quiz generation.`);
            }
        } catch (textError) {
            console.error(`[Job ${jobId}] Failed to generate quiz from text:`, textError);
        }

        // 6. Сохранение в БД
        const parsedContent = {
            summary: { slides },
            questions: generatedQuestions
        };

        const { error: dbError } = await supabaseAdmin
            .from('courses')
            .update({
                content: parsedContent,
                draft_content: parsedContent,
                description: (extractedText && extractedText.length > 0)
                    ? extractedText
                    : `Импортировано из ${file_name.endsWith('.pptx') ? 'PPTX' : 'PDF'} (1-в-1): ${file_name}`
            })
            .eq('id', course_id);

        if (dbError) throw new Error(`Ошибка сохранения в БД: ${dbError.message}`);

        await cleanupTempDir(tempDir);
        await updateJobStatus('completed', { message: `Презентация успешно обработана (${slides.length} слайдов, ${generatedQuestions.length} вопросов).` });

    } catch (error) {
        if (tempDir) await cleanupTempDir(tempDir);
        console.error(`[Job ${jobId}] Error:`, error);
        await updateJobStatus('failed', null, error.message);
    }
}

async function handleGenerateContent(jobId, payload) {
    const supabaseAdmin = createSupabaseAdminClient();

    const updateJobStatus = async (status, data = null, errorMessage = null) => {
        const { error } = await supabaseAdmin
            .from('background_jobs')
            .update({ status, payload: data, last_error: errorMessage, updated_at: new Date().toISOString() })
            .eq('id', jobId);
        if (error) console.error(`[Job ${jobId}] Failed to update job status to ${status}:`, error);
    };

    try {
        const { course_id, custom_prompt, generation_mode } = payload;
        if (!course_id) {
            throw new Error('Valid course_id is required for content generation.');
        }
        console.log(`[Job ${jobId}] Starting content generation for course ${course_id} with mode: ${generation_mode || 'full'}`);

        const { data: courseData, error: fetchError } = await supabaseAdmin.from('courses').select('description, content').eq('id', course_id).single();
        if (fetchError || !courseData?.description) {
            throw new Error('Course description not found or not yet processed.');
        }

        let finalPrompt;
        let parsedContent;

        if (generation_mode === 'questions_only') {
            const outputFormat = {
                questions: [{ question: "string", options: ["string"], correct_option_index: 0 }]
            };
            finalPrompt = `ЗАДАНИЕ: На основе ИСХОДНОГО ТЕКСТА, сгенерируй набор тестовых вопросов.

ИСХОДНЫЙ ТЕКСТ:
${courseData.description}

ТРЕБОВАНИЯ К ФОРМАТУ ВЫВОДА:
- Обязательно верни результат в формате JSON, соответствующем этой структуре: ${JSON.stringify(outputFormat)}
- Массив "questions" должен содержать как минимум 30 вопросов для теста.
- У каждого вопроса должно быть 4 варианта ответа.
- Укажи правильный вариант ответа в "correct_option_index".
- Не добавляй в вывод никаких других полей или секций, только "questions".
`;
            console.log(`[Job ${jobId}] Generating questions only with Gemini...`);
            const result = await model.generateContent(finalPrompt);
            const response = await result.response;
            const jsonString = response.text().replace(/```json\n|```/g, '').trim();

            // Merge new questions with existing content (which might have summary)
            const newContent = JSON.parse(jsonString);
            parsedContent = {
                ...courseData.content, // Preserve existing content like summary
                questions: newContent.questions
            };

        } else {
            // Full generation logic (summary + questions)
            const outputFormat = {
                summary: {
                    slides: [{
                        slide_title: "string (Заголовок слайда)",
                        html_content: "HTML контент слайда",
                        image_search_term: "string (1-2 слова на английском для поиска картинки на Pexels)"
                    }]
                },
                questions: [{ question: "string", options: ["string"], correct_option_index: 0 }]
            };
            finalPrompt = `Задание: Ты — профессиональный методолог страховой компании Centras Insurance (CIC). Твоя задача — создать обучающий курс СТРОГО на основе предоставленного ИСХОДНОГО ТЕКСТА.

ИСХОДНЫЙ ТЕКСТ:
${courseData.description}

ТРЕБОВАНИЯ К КОНТЕНТУ:
1.  **Объем:** Создай ровно 12 (двенадцать) слайдов. Не больше, не меньше.
2.  **Источник истины:** Использовать ТОЛЬКО информацию из исходного текста. Запрещено придумывать факты, добавлять внешнюю информацию или общие фразы, которых нет в документе. Если информации не хватает для 10 слайдов, декомпозируй сложные темы на подтемы, но не выдумывай.
3.  **Структура:**
    * Слайд 1: Титульный (Название программы/договора, Цели обучения).
    * Слайды 2-9: Основная часть. Четко выдели: Условия страхования, Риски (что покрывается, что нет), Франшизы, Действия при страховом случае, Исключения (материал должен быть предоставлен в понятном виде без искажений).
    * Слайд 10: Заключение и ключевые выводы (методологически четко и верно).
4.  **Формат слайда (HTML):**
    * Используй теги <h2> для заголовков.
    * Используй <ul> и <li> для списков (перечисление условий, рисков).
    * Используй <strong> для выделения важных терминов (например, "Страховая сумма", "Франшиза").
    * Текст должен быть лаконичным, полным и понятным и тезисным (методологически правильным).
5.  **Изображения:** Для каждого слайда подбери *image_search_term* (1-2 слова на английском), отражающий суть (e.g., "car accident", "contract signing", "medical help"), для поиска в фотобанке.

ТРЕБОВАНИЯ К ВЫВОДУ (JSON):
Верни строго валидный JSON, соответствующий структуре: ${JSON.stringify(outputFormat)}
`;
            console.log(`[Job ${jobId}] Generating full content with Gemini...`);
            const result = await model.generateContent(finalPrompt);
            const response = await result.response;
            const jsonString = response.text().replace(/```json\n|```/g, '').trim();
            parsedContent = JSON.parse(jsonString);

            if (pexelsClient && parsedContent.summary && Array.isArray(parsedContent.summary.slides)) {
                for (const slide of parsedContent.summary.slides) {
                    if (slide.image_search_term) {
                        try {
                            const query = slide.image_search_term;
                            const pexelsResponse = await pexelsClient.photos.search({ query, per_page: 1 });
                            if (pexelsResponse.photos && pexelsResponse.photos.length > 0) {
                                slide.image_url = pexelsResponse.photos[0].src.large;
                            }
                        } catch (pexelsError) {
                            console.error(`Pexels API call failed for term "${slide.image_search_term}":`, pexelsError);
                        }
                    }
                }
            }
        }

        console.log(`[Job ${jobId}] Content generated. Saving to database...`);
        const { error: dbError } = await supabaseAdmin
            .from('courses')
            .update({ content: parsedContent, draft_content: parsedContent }) // Also save to draft
            .eq('id', course_id);

        if (dbError) throw new Error(`Failed to save generated content: ${dbError.message}`);

        // Create a technical link for this generation
        try {
            console.log(`[Job ${jobId}] Creating technical access link for course ${course_id}...`);
            const access_key = require('crypto').randomBytes(16).toString('hex');
            const { error: generationError } = await supabaseAdmin
                .from('course_generations')
                .insert({
                    course_id: course_id,
                    access_key: access_key,
                    generated_at: new Date().toISOString()
                });

            if (generationError) {
                // Log the error but don't fail the main job, as it's non-critical.
                console.error(`[Job ${jobId}] Could not create technical link for course ${course_id}:`, generationError);
            } else {
                console.log(`[Job ${jobId}] Technical link created successfully with key: ${access_key}`);
            }
        } catch (e) {
            console.error(`[Job ${jobId}] Exception while creating technical link for course ${course_id}:`, e);
        }

        console.log(`[Job ${jobId}] Content generation completed successfully.`);
        await updateJobStatus('completed', { message: 'Content generated and saved.' });

    } catch (error) {
        console.error(`[Job ${jobId}] Unhandled error during content generation:`, error);
        await updateJobStatus('failed', null, error.message);
    }
}

async function handleGenerateSummary(jobId, payload) {
    const supabaseAdmin = createSupabaseAdminClient();

    const updateJobStatus = async (status, data = null, errorMessage = null) => {
        const { error } = await supabaseAdmin
            .from('background_jobs')
            .update({ status, payload: data, last_error: errorMessage, updated_at: new Date().toISOString() })
            .eq('id', jobId);
        if (error) console.error(`[Job ${jobId}] Failed to update job status to ${status}:`, error);
    };

    try {
        const { course_id } = payload;
        if (!course_id) {
            throw new Error('Valid course_id is required for summary generation.');
        }
        console.log(`[Job ${jobId}] Starting summary generation for course ${course_id}`);

        // Fetch the full description to generate a summary from it.
        const { data: courseData, error: fetchError } = await supabaseAdmin
            .from('courses')
            .select('description')
            .eq('id', course_id)
            .single();

        if (fetchError || !courseData?.description) {
            throw new Error('Course description not found or not yet processed.');
        }

        const finalPrompt = `На основе предоставленного текста, напиши краткое и емкое саммари (аннотацию) для учебного курса. Объем — 2-3 предложения. Стиль — деловой, привлекательный для пользователя. ИСХОДНЫЙ ТЕКСТ: ${courseData.description}`;

        console.log(`[Job ${jobId}] Generating summary with Gemini...`);
        const result = await model.generateContent(finalPrompt);
        const response = await result.response;
        const summaryText = response.text().trim();

        console.log(`[Job ${jobId}] Summary generated. Saving to database...`);
        // We update the 'description' field with the newly generated summary.
        const { error: dbError } = await supabaseAdmin
            .from('courses')
            .update({ description: summaryText })
            .eq('id', course_id);

        if (dbError) throw new Error(`Failed to save generated summary: ${dbError.message}`);

        console.log(`[Job ${jobId}] Summary generation completed successfully.`);
        await updateJobStatus('completed', { message: 'Summary generated and saved.', new_description: summaryText });

    } catch (error) {
        console.error(`[Job ${jobId}] Unhandled error during summary generation:`, error);
        await updateJobStatus('failed', null, error.message);
    }
}

async function handlePptxPresentationProcessing(jobId, payload) {
    const supabaseAdmin = createSupabaseAdminClient();
    const { course_id, presentation_url } = payload;

    const updateJobStatus = async (status, data = null, errorMessage = null) => {
        const { error } = await supabaseAdmin
            .from('background_jobs')
            .update({ status, payload: data, last_error: errorMessage, updated_at: new Date().toISOString() })
            .eq('id', jobId);
        if (error) console.error(`[Job ${jobId}] Failed to update job status to ${status}:`, error);
    };

    try {
        console.log(`[Job ${jobId}] Starting PPTX presentation processing for course ${course_id} from URL: ${presentation_url}`);

        // 1. Download the PPTX file.
        const response = await axios.get(presentation_url, { responseType: 'arraybuffer' });
        const pptxBuffer = response.data;

        // 2. Parse the PPTX file to HTML.
        const converter = new PPTXInHTMLOut(pptxBuffer);
        const html = await converter.toHTML();

        // 3. Transform the HTML into the desired slide format.
        const $ = cheerio.load(html);
        const slides = [];
        // Check for both 'section' (older versions/alternatives) and '.slide' (pptx-in-html-out)
        const slideSelector = $('section').length > 0 ? 'section' : '.slide';
        $(slideSelector).each((index, element) => {
            const slideHtml = $(element).html();
            // For simplicity, we'll use a generic title and the full HTML content.
            slides.push({
                slide_title: `Slide ${index + 1}`,
                html_content: slideHtml
            });
        });

        if (!slides.length) {
            throw new Error('Could not extract any slides from the PPTX file. The file might be empty, corrupted, or in an unsupported format.');
        }

        const parsedContent = {
            summary: {
                slides: slides
            },
            questions: [] // No questions from PPTX for now
        };

        // 4. Save the transformed content to the database.
        const { error: updateError } = await supabaseAdmin
            .from('courses')
            .update({ content: parsedContent, draft_content: parsedContent })
            .eq('id', course_id);

        if (updateError) throw new Error(`Failed to save processed PPTX content to course: ${updateError.message}`);

        console.log(`[Job ${jobId}] PPTX presentation processed and saved for course ${course_id}.`);
        await updateJobStatus('completed', { message: `PPTX presentation processed for course ${course_id}.` });

    } catch (error) {
        console.error(`[Job ${jobId}] Error during PPTX presentation processing:`, error);
        await updateJobStatus('failed', null, error.message);
    }
}

module.exports = {
    handlePresentationProcessing,
    handlePptxPresentationProcessing,
    handleUploadAndProcess,
    handleGenerateContent,
    handleGenerateSummary,
};
