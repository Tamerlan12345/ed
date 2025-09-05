const { createClient } = require('@supabase/supabase-js');
const { handleError } = require('../utils/errors');
const mammoth = require('mammoth');
const pdf = require('pdf-parse');

exports.handler = async (event) => {
    try {
        const { course_id, title, file_name, file_data } = JSON.parse(event.body);

        }

        const token = event.headers.authorization.split(' ')[1];
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
            { global: { headers: { Authorization: `Bearer ${token}` } } }
        );


        const buffer = Buffer.from(file_data, 'base64');
        let textContent = '';

        try {
            if (file_name.endsWith('.docx')) {
                const { value } = await mammoth.extractRawText({ buffer });
                textContent = value;
            } else if (file_name.endsWith('.pdf')) {
                const data = await pdf(buffer);
                textContent = data.text;
            } else {
                throw new Error('Unsupported file type. Please upload a .docx or .pdf file.');
            }

            if (!textContent) {
                throw new Error('Could not extract text from the document. The file might be empty or corrupted.');
            }
        } catch (e) {
            console.error('File parsing error:', e);
            throw new Error(`Failed to process file: ${e.message}`);
        }

        const { error: dbError } = await supabase
            .from('courses')
            .upsert({
                course_id: course_id,
                title: title,
                source_text: textContent,
                status: 'processed'
            }, { onConflict: 'course_id' });

        if (dbError) {
            console.error('Supabase upsert error:', dbError);
            throw new Error('Failed to save course content to the database.');
        }

        return { statusCode: 200, body: JSON.stringify({ extractedText: textContent }) };
    } catch (error) {
        return handleError(error, 'upload-and-process');
    }
};
