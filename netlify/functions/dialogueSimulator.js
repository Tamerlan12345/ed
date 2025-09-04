const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' }); // Using gemini-pro for better dialogue

// --- Prompts for different AI personas ---
const PERSONAS = {
    'cold': `Ты -- "холодный" клиент. Ты не заинтересован в продукте, отвечаешь коротко, без энтузиазма. Твоя цель -- как можно скорее закончить разговор. Не груби, но будь отстраненным.`,
    'interested': `Ты -- "заинтересованный" клиент. Ты слышал о продукте и задаешь много уточняющих вопросов о цене, условиях, преимуществах. Ты хочешь понять все детали.`,
    'aggressive': `Ты -- "агрессивный" клиент. У тебя был негативный опыт со страховыми компаниями. Ты настроен скептически, перебиваешь, выражаешь сомнения и требуешь гарантий.`,
    'evaluator': `Ты -- опытный бизнес-тренер. Проанализируй следующий диалог между менеджером по продажам и клиентом. Оцени работу менеджера по 10-балльной шкале по следующим критериям: 1. Установление контакта. 2. Выявление потребностей. 3. Презентация продукта. 4. Работа с возражениями. 5. Завершение диалога. Дай краткий, но содержательный комментарий по каждому пункту и выведи итоговую среднюю оценку.`
};

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const token = event.headers.authorization.split(' ')[1];
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) throw new Error('Unauthorized');

        const { history, persona, action = 'chat' } = JSON.parse(event.body);

        if (!history || !Array.isArray(history)) {
            return { statusCode: 400, body: 'Bad Request: history must be an array.' };
        }
        if (action === 'chat' && !PERSONAS[persona]) {
             return { statusCode: 400, body: 'Bad Request: Invalid persona.' };
        }

        let prompt;
        let answer;

        if (action === 'evaluate') {
            const dialogueText = history.map(h => `${h.role}: ${h.text}`).join('\n');
            prompt = `${PERSONAS.evaluator}\n\nДИАЛОГ:\n${dialogueText}`;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            answer = response.text();

            // Save the completed simulation to the database
            const { error: dbError } = await supabase.from('dialogue_simulations').insert({
                user_id: user.id,
                persona: persona,
                dialogue_history: history,
                evaluation: answer
            });

            if (dbError) {
                // Log the error but don't block the user from seeing their evaluation
                console.error('Error saving dialogue simulation to DB:', dbError);
            }

        } else { // action === 'chat'
            const dialogueContext = history.map(h => `* ${h.role}: ${h.text}`).join('\n');
            prompt = `Инструкция: ${PERSONAS[persona]}\n\nИстория диалога:\n${dialogueContext}\n\nТвой следующий ответ (только текст, без роли):`;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            answer = response.text();
        }

        return { statusCode: 200, body: JSON.stringify({ answer }) };

    } catch (error) {
        console.error('Error in dialogueSimulator:', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};
