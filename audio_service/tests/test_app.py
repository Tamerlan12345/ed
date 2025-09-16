import os
import shutil
import pytest
from unittest.mock import patch

# We need to make sure the app module can be found
import sys
# Add the parent directory of audio_service to the Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

from audio_service.app import app as flask_app

# Define the base directory for audio files for testing
TEST_AUDIO_BASE_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'test_audio_summaries')


@pytest.fixture
def app():
    """Create and configure a new app instance for each test."""
    # Override the AUDIO_BASE_DIR for tests
    # By using a global variable in the app module, we can change it here.
    # A better approach would be to use Flask's app.config
    flask_app.config['AUDIO_BASE_DIR'] = TEST_AUDIO_BASE_DIR
    flask_app.config['TESTING'] = True

    # This is a hacky way to override the base dir.
    # The app.py should be refactored to use app.config for AUDIO_BASE_DIR
    import audio_service.app
    audio_service.app.AUDIO_BASE_DIR = TEST_AUDIO_BASE_DIR


    # Clean up the test audio directory before each test
    if os.path.exists(TEST_AUDIO_BASE_DIR):
        shutil.rmtree(TEST_AUDIO_BASE_DIR)
    os.makedirs(TEST_AUDIO_BASE_DIR, exist_ok=True)

    yield flask_app

    # Clean up after the test
    if os.path.exists(TEST_AUDIO_BASE_DIR):
        shutil.rmtree(TEST_AUDIO_BASE_DIR)


@pytest.fixture
def client(app):
    """A test client for the app."""
    return app.test_client()


def test_generate_audio_success(client):
    """Test successful audio generation."""
    with patch('audio_service.app.gTTS') as mock_gtts:
        # Mock the save method of the gTTS instance
        mock_gtts.return_value.save.return_value = None

        response = client.post('/generate-audio', json={
            'text': 'Hello world',
            'course_id': '123'
        })

        assert response.status_code == 200
        json_data = response.get_json()
        assert 'url' in json_data
        assert json_data['url'] == '/audio_summaries/123/summary.mp3'

        # Check if the directory was created
        expected_dir = os.path.join(TEST_AUDIO_BASE_DIR, '123')
        assert os.path.exists(expected_dir)

        # Check if gTTS was called with the correct parameters
        mock_gtts.assert_called_once_with(text='Hello world', lang='ru', slow=False)
        mock_gtts.return_value.save.assert_called_once_with(os.path.join(expected_dir, 'summary.mp3'))


def test_generate_audio_missing_fields(client):
    """Test request with missing fields."""
    response = client.post('/generate-audio', json={
        'text': 'Hello world'
        # course_id is missing
    })
    assert response.status_code == 400
    json_data = response.get_json()
    assert 'error' in json_data
    assert json_data['error'] == 'Отсутствуют обязательные поля: text и course_id'

    response = client.post('/generate-audio', json={
        'course_id': '123'
        # text is missing
    })
    assert response.status_code == 400
    json_data = response.get_json()
    assert 'error' in json_data
    assert 'Отсутствуют обязательные поля: text и course_id' in json_data['error']


def test_generate_audio_gtts_error(client):
    """Test handling of gTTS errors."""
    with patch('audio_service.app.gTTS') as mock_gtts:
        # Configure the mock to raise an exception
        mock_gtts.side_effect = Exception("TTS service is down")

        response = client.post('/generate-audio', json={
            'text': 'This will fail',
            'course_id': '456'
        })

        assert response.status_code == 500
        json_data = response.get_json()
        assert 'error' in json_data
        assert json_data['error'] == 'TTS service is down'


def test_base_directory_creation(client):
    """Test that the base audio directory is created if it doesn't exist."""
    # The app fixture already creates the directory.
    # To test this, we need to remove it first.
    if os.path.exists(TEST_AUDIO_BASE_DIR):
        shutil.rmtree(TEST_AUDIO_BASE_DIR)

    with patch('audio_service.app.gTTS') as mock_gtts:
        mock_gtts.return_value.save.return_value = None

        client.post('/generate-audio', json={
            'text': 'Hello world',
            'course_id': '123'
        })

        expected_dir = os.path.join(TEST_AUDIO_BASE_DIR, '123')
        assert os.path.exists(expected_dir)
