const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { handleError } = require('./utils/errors');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// --- AI Client Personalities ---
const PERSONALITIES = {
    'cold': `Ты не заинтересован в продукте, отвечаешь коротко, без энтузиазма. Твоя цель -- как можно скорее закончить разговор. Не груби, но будь отстраненным.`,
    'interested': `Ты слышал о продукте и задаешь много уточняющих вопросов о цене, условиях, преимуществах. Ты хочешь понять все детали.`,
    'aggressive': `У тебя был негативный опыт со страховыми компаниями. Ты настроен скептически, перебиваешь, выражаешь сомнения и требуешь гарантий.`
};

// --- AI Evaluator Prompt ---
const EVALUATOR_PROMPT = `
Ты -- опытный бизнес-тренер. Проанализируй следующий диалог между менеджером по продажам и клиентом.
Твоя задача — оценить работу менеджера по 5 ключевым критериям по 10-балльной шкале.
ВЕРНИ РЕЗУЛЬТАТ СТРОГО В ФОРМАТЕ JSON. Не добавляй никаких других слов или комментариев вне JSON.

Критерии для оценки:
1.  **Установление контакта:** Насколько хорошо менеджер начал диалог, создал доверительную атмосферу.
2.  **Выявление потребностей:** Задавал ли менеджер открытые и уточняющие вопросы, чтобы понять ситуацию и потребности клиента.
3.  **Презентация продукта:** Насколько убедительно и релевантно потребностям клиента была представлена услуга страхования.
4.  **Работа с возражениями:** Как менеджер обрабатывал сомнения, скепсис или прямые отказы клиента.
5.  **Завершение диалога:** Была ли попытка завершить сделку, договориться о следующем шаге или позитивно закончить разговор.

Формат JSON для ответа:
{
  "evaluation_criteria": [
    { "criterion": "Установление контакта", "score": <число от 1 до 10>, "comment": "<краткий комментарий>" },
    { "criterion": "Выявление потребностей", "score": <число от 1 до 10>, "comment": "<краткий комментарий>" },
    { "criterion": "Презентация продукта", "score": <число от 1 до 10>, "comment": "<краткий комментарий>" },
    { "criterion": "Работа с возражениями", "score": <число от 1 до 10>, "comment": "<краткий комментарий>" },
    { "criterion": "Завершение диалога", "score": <число от 1 до 10>, "comment": "<краткий комментарий>" }
  ],
  "average_score": <средний балл>,
  "general_comment": "<общий вывод и главная рекомендация для менеджера>"
}
`;


exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const token = event.headers.authorization.split(' ')[1];
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) throw new Error('Unauthorized');

        const { history, persona, scenario, action = 'chat' } = JSON.parse(event.body);

        if (!history || !Array.isArray(history)) {
            return { statusCode: 400, body: 'Bad Request: history must be an array.' };
        }
        if (action === 'chat' && (!PERSONALITIES[persona] || !scenario)) {
             return { statusCode: 400, body: 'Bad Request: Invalid persona or missing scenario.' };
        }

        let prompt;
        let answer;

        if (action === 'evaluate') {
            const dialogueText = history.map(h => `${h.role}: ${h.text}`).join('\n');
            prompt = `${EVALUATOR_PROMPT}\n\nДИАЛОГ ДЛЯ АНАЛИЗА:\n${dialogueText}`;

            const result = await model.generateContent(prompt);
            const responseText = (await result.response).text().replace(/```json/g, '').replace(/```/g, '').trim();

            // Attempt to parse the JSON response from the model
            try {
                answer = JSON.parse(responseText);
            } catch (e) {
                console.error("Failed to parse JSON from AI evaluator:", responseText);
                throw new Error("Evaluation failed: AI returned an invalid format.");
            }

            // Save the completed simulation to the database
            const { error: dbError } = await supabase.from('dialogue_simulations').insert({
                user_id: user.id,
                persona: persona,
                scenario: scenario, // Save the scenario
                dialogue_history: history,
                evaluation: answer // Save the JSON object
            });

            if (dbError) {
                // Log the error but don't block the user from seeing their evaluation
                console.error('Error saving dialogue simulation to DB:', dbError);
            }

        } else { // action === 'chat'
            const personalityInstruction = PERSONALITIES[persona];
            const dialogueContext = history.map(h => `* ${h.role}: ${h.text}`).join('\n');

            prompt = `Твоя роль: клиент страховой компании.
            Твой сценарий: "${scenario}"
            Твой характер: "${personalityInstruction}"
            История диалога:
            ${dialogueContext}

            Твоя следующая реплика (отвечай как клиент, только текст, без указания роли):`;

            const result = await model.generateContent(prompt);
            answer = (await result.response).text();
        }

        return { statusCode: 200, body: JSON.stringify({ answer }) };

    } catch (error) {
        return handleError(error, 'dialogueSimulator');
    }
};
