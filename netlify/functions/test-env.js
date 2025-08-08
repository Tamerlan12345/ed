// netlify/functions/test-env.js
exports.handler = async (event) => {
    console.log("--- Запуск теста на совместимость библиотек ---");
    const results = {};
    try {
        require('@supabase/supabase-js');
        results['@supabase/supabase-js'] = 'УСПЕХ';
        console.log("УСПЕХ: @supabase/supabase-js загружен.");
    } catch (e) {
        results['@supabase/supabase-js'] = `ПРОВАЛ: ${e.message}`;
        console.error("ПРОВАЛ: @supabase/supabase-js", e);
    }
    try {
        require('@google/generative-ai');
        results['@google/generative-ai'] = 'УСПЕХ';
        console.log("УСПЕХ: @google/generative-ai загружен.");
    } catch (e) {
        results['@google/generative-ai'] = `ПРОВАЛ: ${e.message}`;
        console.error("ПРОВАЛ: @google/generative-ai", e);
    }
    try {
        require('node-fetch');
        results['node-fetch'] = 'УСПЕХ';
        console.log("УСПЕХ: node-fetch загружен.");
    } catch (e) {
        results['node-fetch'] = `ПРОВАЛ: ${e.message}`;
        console.error("ПРОВАЛ: node-fetch", e);
    }
    try {
        require('pdf-parse');
        results['pdf-parse'] = 'УСПЕХ';
        console.log("УСПЕХ: pdf-parse загружен.");
    } catch (e) {
        results['pdf-parse'] = `ПРОВАЛ: ${e.message}`;
        console.error("ПРОВАЛ: pdf-parse", e);
    }
    try {
        require('mammoth');
        results['mammoth'] = 'УСПЕХ';
        console.log("УСПЕХ: mammoth загружен.");
    } catch (e) {
        results['mammoth'] = `ПРОВАЛ: ${e.message}`;
        console.error("ПРОВАЛ: mammoth", e);
    }

    console.log("--- Тест завершен ---");

    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(results, null, 2)
    };
};
