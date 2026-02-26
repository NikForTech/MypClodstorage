document.addEventListener('DOMContentLoaded', () => {
    const uploadForm = document.getElementById('uploadForm');
    const fileInput = document.getElementById('fileInput');
    const dropZone = document.getElementById('dropZone');
    const uploadKeyInput = document.getElementById('uploadKey');
    const togglePasswordBtn = document.getElementById('togglePassword');
    const uploadBtn = document.getElementById('uploadBtn');
    const btnText = uploadBtn.querySelector('.btn-text');
    const btnSpinner = document.getElementById('btnSpinner');
    const progressContainer = document.getElementById('progressContainer');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const resultContainer = document.getElementById('resultContainer');
    const resultContent = document.getElementById('resultContent');
    const resultIcon = document.getElementById('resultIcon');
    const resultMessage = document.getElementById('resultMessage');
    const resultLink = document.getElementById('resultLink');
    const resetBtn = document.getElementById('resetBtn');
    const fileInfo = document.getElementById('fileInfo');
    const fileName = document.getElementById('fileName');
    const fileSize = document.getElementById('fileSize');
    const fileTypeBadge = document.getElementById('fileTypeBadge');
    const dropText = document.getElementById('dropText');

    let selectedFile = null;

    // ── Detect environment: use function URL on Netlify, /upload locally ──────
    const UPLOAD_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? '/upload'
        : '/.netlify/functions/api/upload';

    // ── Password toggle ───────────────────────────────────────────────────────
    togglePasswordBtn.addEventListener('click', () => {
        const type = uploadKeyInput.getAttribute('type') === 'password' ? 'text' : 'password';
        uploadKeyInput.setAttribute('type', type);

        const eyeIcon = togglePasswordBtn.querySelector('.eye-icon');
        if (type === 'text') {
            eyeIcon.innerHTML = `
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                <line x1="1" y1="1" x2="23" y2="23"></line>
            `;
        } else {
            eyeIcon.innerHTML = `
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
            `;
        }
    });

    // ── File input change ─────────────────────────────────────────────────────
    fileInput.addEventListener('change', (e) => {
        handleFileSelection(e.target.files[0]);
    });

    // ── Drag and drop ─────────────────────────────────────────────────────────
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (files.length > 0) handleFileSelection(files[0]);
    });

    dropZone.addEventListener('click', () => fileInput.click());

    // ── Handle file selection ─────────────────────────────────────────────────
    function handleFileSelection(file) {
        if (!file) return;
        selectedFile = file;

        fileName.textContent = file.name;
        fileSize.textContent = formatFileSize(file.size);
        fileTypeBadge.textContent = getFileType(file);

        fileInfo.classList.remove('hidden');
        dropText.textContent = file.name;
        resultContainer.classList.add('hidden');
    }

    function getFileType(file) {
        const type = file.type.toLowerCase();
        if (type.startsWith('video/'))  return 'VIDEO';
        if (type.startsWith('audio/'))  return 'AUDIO';
        if (type.startsWith('image/'))  return 'IMAGE';
        if (type.includes('pdf') || type.includes('document') || type.includes('text')) return 'DOCUMENT';
        return 'FILE';
    }

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    // ── Form submit ───────────────────────────────────────────────────────────
    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!uploadKeyInput.value.trim()) {
            showError('Please enter your upload key');
            return;
        }
        if (!selectedFile) {
            showError('Please select a file to upload');
            return;
        }

        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('uploadKey', uploadKeyInput.value.trim());

        // Show loading state
        uploadBtn.disabled = true;
        btnText.textContent = 'Uploading...';
        btnSpinner.classList.remove('hidden');
        progressContainer.classList.remove('hidden');
        progressFill.style.width = '0%';
        progressText.textContent = '0%';
        resultContainer.classList.add('hidden');

        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const pct = Math.round((e.loaded / e.total) * 100);
                progressFill.style.width = pct + '%';
                progressText.textContent = pct + '%';
            }
        });

        xhr.addEventListener('load', () => {
            resetBtn_state();

            if (xhr.status === 200) {
                try {
                    const response = JSON.parse(xhr.responseText);
                    if (response.success) {
                        showSuccess(response);
                    } else {
                        showError(response.message || 'Upload failed');
                    }
                } catch {
                    showError('Invalid response from server');
                }
            } else {
                try {
                    const err = JSON.parse(xhr.responseText);
                    showError(err.message || `Upload failed (${xhr.status})`);
                } catch {
                    showError(`Upload failed with status ${xhr.status}`);
                }
            }
        });

        xhr.addEventListener('error', () => {
            resetBtn_state();
            showError('Network error. Please check your connection and try again.');
        });

        xhr.addEventListener('abort', () => {
            resetBtn_state();
            showError('Upload cancelled');
        });

        // ← This is the key line — uses UPLOAD_URL not hardcoded '/upload'
        xhr.open('POST', UPLOAD_URL);
        xhr.send(formData);
    });

    function resetBtn_state() {
        uploadBtn.disabled = false;
        btnText.textContent = 'Upload File';
        btnSpinner.classList.add('hidden');
        progressContainer.classList.add('hidden');
    }

    // ── Success / Error display ───────────────────────────────────────────────
    function showSuccess(response) {
        resultContainer.classList.remove('hidden', 'error');
        resultContainer.classList.add('success');

        resultIcon.innerHTML = `
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
        `;

        resultMessage.textContent = response.message || 'File uploaded successfully!';

        if (response.assetUrl) {
            resultLink.href = response.assetUrl;
            resultLink.textContent = 'View Uploaded File';
            resultLink.classList.remove('hidden');
        } else {
            resultLink.classList.add('hidden');
        }
    }

    function showError(message) {
        resultContainer.classList.remove('hidden', 'success');
        resultContainer.classList.add('error');

        resultIcon.innerHTML = `
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
        `;

        resultMessage.textContent = message;
        resultLink.classList.add('hidden');
    }

    // ── Footer year ───────────────────────────────────────────────────────────
    document.getElementById('year').textContent = new Date().getFullYear();

    // ── Reset button ──────────────────────────────────────────────────────────
    resetBtn.addEventListener('click', () => {
        selectedFile = null;
        fileInput.value = '';
        fileInfo.classList.add('hidden');
        dropText.textContent = 'Drag and drop your file here';
        resultContainer.classList.add('hidden');
        progressContainer.classList.add('hidden');
        uploadBtn.disabled = false;
        btnText.textContent = 'Upload File';
        btnSpinner.classList.add('hidden');
    });
});
