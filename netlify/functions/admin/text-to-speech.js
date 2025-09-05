const axios = require('axios');
const { handleError } = require('../utils/errors');

exports.handler = async (event) => {
    try {
        const { text } = JSON.parse(event.body);

        if (!text) {
            return { statusCode: 400, body: JSON.stringify({ error: 'No text provided for speech synthesis.' }) };
        }

        if (!process.env.VOICERSS_API_KEY) {
            return { statusCode: 500, body: JSON.stringify({ error: 'VoiceRSS API key is not configured.' }) };
        }

        const response = await axios.get('http://api.voicerss.org/', {
            params: { key: process.env.VOICERSS_API_KEY, src: text, hl: 'ru-ru', c: 'MP3', f: '16khz_16bit_stereo', b64: true },
            responseType: 'text'
        });

        if (response.data.startsWith('ERROR')) {
            throw new Error(response.data);
        }

        return { statusCode: 200, body: JSON.stringify({ audioUrl: response.data }) };
    } catch (error) {
        return handleError(error, 'text-to-speech');
    }
};
