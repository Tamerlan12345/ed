import os
import re
from flask import Flask, request, jsonify
from gtts import gTTS

app = Flask(__name__)

# Директория для сохранения аудиофайлов.
# ../ указывает, что папка будет создана на уровень выше, в корне проекта.
AUDIO_BASE_DIR = os.path.join(os.path.dirname(__file__), '..', 'audio_summaries')

@app.route('/generate-audio', methods=['POST'])
def generate_audio():
    """
    Генерирует аудиофайл из текста и возвращает URL для доступа к нему.
    Принимает JSON с полями 'text' и 'course_id'.
    """
    try:
        data = request.get_json()
        text_to_speak = data.get('text')
        course_id = data.get('course_id')

        if not text_to_speak or not course_id:
            return jsonify({'error': 'Отсутствуют обязательные поля: text и course_id'}), 400

        # Sanitize course_id to prevent Path Traversal
        course_id_str = str(data.get('course_id'))
        safe_course_id = re.sub(r'[^a-zA-Z0-9_-]', '', course_id_str)
        if not safe_course_id:
            return jsonify({'error': 'Invalid course_id format'}), 400

        # Создаем директорию для курса, если она не существует
        course_audio_dir = os.path.join(AUDIO_BASE_DIR, safe_course_id)
        os.makedirs(course_audio_dir, exist_ok=True)

        # Путь для сохранения файла
        output_filepath = os.path.join(course_audio_dir, 'summary.mp3')

        # Генерация аудио
        tts = gTTS(text=text_to_speak, lang='ru', slow=False)
        tts.save(output_filepath)

        # Формирование публичного URL
        # Node.js сервер будет раздавать статику из корня проекта
        public_url = f'/audio_summaries/{safe_course_id}/summary.mp3'

        return jsonify({'url': public_url})

    except Exception as e:
        print(f"Error during audio generation: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    # Запускаем сервер на порту 5001, чтобы не конфликтовать с Node.js (порт 3001)
    app.run(host='0.0.0.0', port=5001, debug=True)
