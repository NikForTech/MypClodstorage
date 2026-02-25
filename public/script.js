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

    // Password toggle functionality
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

    // File input change handler
    fileInput.addEventListener('change', (e) => {
        handleFileSelection(e.target.files[0]);
    });

    // Drag and drop handlers
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
        if (files.length > 0) {
            handleFileSelection(files[0]);
        }
    });

    // Click to browse
    dropZone.addEventListener('click', () => {
        fileInput.click();
    });

    // Handle file selection
    function handleFileSelection(file) {
        if (!file) return;

        selectedFile = file;
        
        // Display file info
        fileName.textContent = file.name;
        fileSize.textContent = formatFileSize(file.size);
        
        // Determine file type
        const fileType = getFileType(file);
        fileTypeBadge.textContent = fileType;
        
        // Show file info
        fileInfo.classList.remove('hidden');
        dropText.textContent = file.name;
        
        // Hide result container if visible
        resultContainer.classList.add('hidden');
    }

    // Get file type category
    function getFileType(file) {
        const type = file.type.toLowerCase();
        if (type.startsWith('video/')) return 'VIDEO';
        if (type.startsWith('audio/')) return 'AUDIO';
        if (type.startsWith('image/')) return 'IMAGE';
        if (type.includes('pdf') || type.includes('document') || type.includes('text')) return 'DOCUMENT';
        return 'FILE';
    }

    // Format file size
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    // Form submission handler
    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Validate key
        if (!uploadKeyInput.value.trim()) {
            showError('Please enter your upload key');
            return;
        }

        // Validate file
        if (!selectedFile) {
            showError('Please select a file to upload');
            return;
        }

        // Prepare form data
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('uploadKey', uploadKeyInput.value.trim());

        // Show progress
        uploadBtn.disabled = true;
        btnText.textContent = 'Uploading...';
        btnSpinner.classList.remove('hidden');
        progressContainer.classList.remove('hidden');
        progressFill.style.width = '0%';
        progressText.textContent = '0%';
        resultContainer.classList.add('hidden');

        // Create XMLHttpRequest for upload progress
        const xhr = new XMLHttpRequest();

        // Upload progress handler
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percentComplete = (e.loaded / e.total) * 100;
                progressFill.style.width = percentComplete + '%';
                progressText.textContent = Math.round(percentComplete) + '%';
            }
        });

        // Load handler
        xhr.addEventListener('load', () => {
            uploadBtn.disabled = false;
            btnText.textContent = 'Upload File';
            btnSpinner.classList.add('hidden');
            progressContainer.classList.add('hidden');

            if (xhr.status === 200) {
                try {
                    const response = JSON.parse(xhr.responseText);
                    if (response.success) {
                        showSuccess(response);
                    } else {
                        showError(response.message || 'Upload failed');
                    }
                } catch (error) {
                    showError('Invalid response from server');
                }
            } else {
                try {
                    const errorResponse = JSON.parse(xhr.responseText);
                    showError(errorResponse.message || `Upload failed with status ${xhr.status}`);
                } catch (error) {
                    showError(`Upload failed with status ${xhr.status}`);
                }
            }
        });

        // Error handler
        xhr.addEventListener('error', () => {
            uploadBtn.disabled = false;
            btnText.textContent = 'Upload File';
            btnSpinner.classList.add('hidden');
            progressContainer.classList.add('hidden');
            showError('Network error. Please check your connection and try again.');
        });

        // Abort handler
        xhr.addEventListener('abort', () => {
            uploadBtn.disabled = false;
            btnText.textContent = 'Upload File';
            btnSpinner.classList.add('hidden');
            progressContainer.classList.add('hidden');
            showError('Upload cancelled');
        });

        // Send request
        xhr.open('POST', '/upload');
        xhr.send(formData);
    });

    // Show success result
    function showSuccess(response) {
        resultContainer.classList.remove('hidden');
        resultContainer.classList.remove('error');
        resultContainer.classList.add('success');
        
        resultIcon.innerHTML = `
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
        `;
        
        resultMessage.textContent = response.message || 'File uploaded successfully!';
        
        if (response.assetUrl) {
            resultLink.href = response.assetUrl;
            resultLink.textContent = 'View in Playbook';
            resultLink.classList.remove('hidden');
        } else {
            resultLink.classList.add('hidden');
        }
    }

    // Show error result
    function showError(message) {
        resultContainer.classList.remove('hidden');
        resultContainer.classList.remove('success');
        resultContainer.classList.add('error');
        
        resultIcon.innerHTML = `
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
        `;
        
        resultMessage.textContent = message;
        resultLink.classList.add('hidden');
    }
  
  
  document.getElementById("year").textContent = new Date().getFullYear();


    // Reset button handler
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
