class ChatInterface {
    constructor() {
        this.currentImage = null;
        this.initializeElements();
        this.attachEventListeners();
        this.checkServerStatus();
        this.autoResizeTextarea();
    }

    initializeElements() {
        this.chatMessages = document.getElementById('chat-messages');
        this.messageInput = document.getElementById('message-input');
        this.imageInput = document.getElementById('image-input');
        this.attachBtn = document.getElementById('attach-btn');
        this.sendBtn = document.getElementById('send-btn');
        this.imagePreview = document.getElementById('image-preview');
        this.previewImage = document.getElementById('preview-image');
        this.removeImageBtn = document.getElementById('remove-image');
        this.charCount = document.getElementById('char-count');
        this.statusIndicator = document.getElementById('status-indicator');
        this.statusDot = this.statusIndicator.querySelector('.status-dot');
        this.statusText = this.statusIndicator.querySelector('.status-text');
    }

    attachEventListeners() {
        // Attach button click
        this.attachBtn.addEventListener('click', () => {
            this.imageInput.click();
        });

        // Image selection
        this.imageInput.addEventListener('change', (e) => {
            this.handleImageSelection(e.target.files[0]);
        });

        // Remove image
        this.removeImageBtn.addEventListener('click', () => {
            this.removeImage();
        });

        // Send button click
        this.sendBtn.addEventListener('click', () => {
            this.sendMessage();
        });

        // Enter key to send (Shift+Enter for new line)
        this.messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Character count update
        this.messageInput.addEventListener('input', () => {
            this.updateCharCount();
            this.autoResizeTextarea();
        });

        // Drag and drop functionality
        this.setupDragAndDrop();
    }

    setupDragAndDrop() {
        const container = document.querySelector('.chat-container');
        
        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            container.classList.add('drag-over');
        });

        container.addEventListener('dragleave', (e) => {
            e.preventDefault();
            if (!container.contains(e.relatedTarget)) {
                container.classList.remove('drag-over');
            }
        });

        container.addEventListener('drop', (e) => {
            e.preventDefault();
            container.classList.remove('drag-over');
            
            const files = Array.from(e.dataTransfer.files);
            const imageFile = files.find(file => file.type.startsWith('image/'));
            
            if (imageFile) {
                this.handleImageSelection(imageFile);
            }
        });
    }

    handleImageSelection(file) {
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            this.showError('Solo se permiten archivos de imagen');
            return;
        }

        // Validate file size (10MB limit)
        const maxSize = 10 * 1024 * 1024;
        if (file.size > maxSize) {
            this.showError('El archivo es demasiado grande. Máximo 10MB.');
            return;
        }

        this.currentImage = file;

        // Show preview
        const reader = new FileReader();
        reader.onload = (e) => {
            this.previewImage.src = e.target.result;
            this.imagePreview.style.display = 'block';
        };
        reader.readAsDataURL(file);

        // Update UI
        this.attachBtn.style.background = '#00b894';
        this.messageInput.placeholder = 'Agregar descripción (opcional)...';
    }

    removeImage() {
        this.currentImage = null;
        this.imagePreview.style.display = 'none';
        this.previewImage.src = '';
        this.imageInput.value = '';
        this.attachBtn.style.background = '#667eea';
        this.messageInput.placeholder = 'Escribe una descripción...';
    }

    updateCharCount() {
        const count = this.messageInput.value.length;
        this.charCount.textContent = `${count}/1000`;
        
        if (count > 900) {
            this.charCount.style.color = '#e17055';
        } else if (count > 800) {
            this.charCount.style.color = '#fdcb6e';
        } else {
            this.charCount.style.color = '#6c757d';
        }
    }

    autoResizeTextarea() {
        this.messageInput.style.height = 'auto';
        const scrollHeight = this.messageInput.scrollHeight;
        const maxHeight = 120;
        
        if (scrollHeight <= maxHeight) {
            this.messageInput.style.height = scrollHeight + 'px';
        } else {
            this.messageInput.style.height = maxHeight + 'px';
        }
    }

    async sendMessage() {
        const description = this.messageInput.value.trim();
        
        if (!description && !this.currentImage) {
            this.showError('Debes agregar texto o una imagen');
            return;
        }

        // Disable send button during upload
        this.sendBtn.disabled = true;
        this.sendBtn.innerHTML = '<div class="spinner"></div>';

        // Show loading message
        this.addLoadingMessage();

        try {
            const formData = new FormData();
            
            if (description) {
                formData.append('description', description);
            }
            
            if (this.currentImage) {
                formData.append('image', this.currentImage);
            }

            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                // Add message to chat
                const messageData = {
                    text: description,
                    image: this.currentImage,
                    timestamp: new Date().toISOString(),
                    messageId: result.data.messageId
                };
                
                this.addMessage(messageData);

                // Poll for response after a delay
                setTimeout(() => {
                    this.pollForResponse(result.data.messageId);
                }, 2000);

                // Clear inputs
                this.messageInput.value = '';
                this.removeImage();
                this.updateCharCount();
                this.autoResizeTextarea();
                
                this.showSuccess('Mensaje enviado a RabbitMQ');
            } else {
                throw new Error(result.error || 'Error al enviar mensaje');
            }

        } catch (error) {
            console.error('Upload error:', error);
            this.showError('Error al enviar mensaje: ' + error.message);
        } finally {
            // Re-enable send button
            this.sendBtn.disabled = false;
            this.sendBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22,2 15,22 11,13 2,9 22,2"></polygon>
                </svg>
            `;
            
            // Remove loading message
            this.removeLoadingMessage();
        }
    }

    addMessage(data) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message user-message';
        
        // Store messageId for response handling
        if (data.messageId) {
            messageDiv.dataset.messageId = data.messageId;
        }

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        let content = '';

        // Add image if present
        if (data.image) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = document.createElement('img');
                img.src = e.target.result;
                img.className = 'message-image';
                img.alt = 'Uploaded image';
                
                img.addEventListener('click', () => {
                    this.openImageModal(e.target.result);
                });
                
                contentDiv.insertBefore(img, contentDiv.firstChild);
            };
            reader.readAsDataURL(data.image);
        }

        // Add text if present
        if (data.text) {
            const textP = document.createElement('p');
            textP.className = 'message-text';
            textP.textContent = data.text;
            contentDiv.appendChild(textP);
        }

        messageDiv.appendChild(contentDiv);

        // Add timestamp
        const timestampDiv = document.createElement('div');
        timestampDiv.className = 'message-timestamp';
        timestampDiv.textContent = this.formatTimestamp(data.timestamp);
        messageDiv.appendChild(timestampDiv);

        this.chatMessages.appendChild(messageDiv);
        this.scrollToBottom();
    }

    addLoadingMessage() {
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'loading-indicator';
        loadingDiv.id = 'loading-message';
        loadingDiv.innerHTML = `
            <div class="spinner"></div>
            <span>Enviando mensaje...</span>
        `;
        this.chatMessages.appendChild(loadingDiv);
        this.scrollToBottom();
    }

    removeLoadingMessage() {
        const loadingMessage = document.getElementById('loading-message');
        if (loadingMessage) {
            loadingMessage.remove();
        }
    }

    openImageModal(imageSrc) {
        // Create modal overlay
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            cursor: pointer;
        `;

        const img = document.createElement('img');
        img.src = imageSrc;
        img.style.cssText = `
            max-width: 90%;
            max-height: 90%;
            border-radius: 12px;
        `;

        modal.appendChild(img);
        document.body.appendChild(modal);

        modal.addEventListener('click', () => {
            document.body.removeChild(modal);
        });
    }

    formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) { // Less than 1 minute
            return 'Ahora';
        } else if (diff < 3600000) { // Less than 1 hour
            const minutes = Math.floor(diff / 60000);
            return `Hace ${minutes} min`;
        } else if (diff < 86400000) { // Less than 1 day
            return date.toLocaleTimeString('es-ES', { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
        } else {
            return date.toLocaleDateString('es-ES', { 
                day: '2-digit', 
                month: '2-digit' 
            });
        }
    }

    async checkServerStatus() {
        try {
            const response = await fetch('/health');
            const status = await response.json();

            if (status.rabbitmq === 'connected') {
                this.updateStatus('connected', 'Conectado a RabbitMQ');
            } else {
                this.updateStatus('error', 'RabbitMQ desconectado');
            }
        } catch (error) {
            this.updateStatus('error', 'Error de conexión');
        }

        // Check status every 30 seconds
        setTimeout(() => this.checkServerStatus(), 30000);
    }

    updateStatus(type, text) {
        this.statusDot.className = `status-dot ${type}`;
        this.statusText.textContent = text;
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    showNotification(message, type) {
        // Remove existing notifications
        const existingNotifications = document.querySelectorAll('.notification');
        existingNotifications.forEach(notification => notification.remove());

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            z-index: 1000;
            animation: slideIn 0.3s ease-out;
            background: ${type === 'error' ? '#e17055' : '#00b894'};
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    scrollToBottom() {
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    async pollForResponse(messageId, attempts = 0, maxAttempts = 30) {
        try {
            const response = await fetch(`/api/response/${messageId}`);
            const result = await response.json();

            if (result.success && result.data.hasResponse) {
                this.addResponseMessage(messageId, result.data.response);
            } else if (attempts < maxAttempts) {
                // Poll again after 2 seconds
                setTimeout(() => {
                    this.pollForResponse(messageId, attempts + 1, maxAttempts);
                }, 2000);
            } else {
                console.log('Max polling attempts reached for message:', messageId);
            }
        } catch (error) {
            console.error('Error polling for response:', error);
        }
    }

    addResponseMessage(messageId, responseData) {
        // Find the original message
        const originalMessage = document.querySelector(`[data-message-id="${messageId}"]`);
        
        if (!originalMessage) {
            console.error('Original message not found:', messageId);
            return;
        }

        // Create response message
        const responseDiv = document.createElement('div');
        responseDiv.className = 'message bot-message';
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content bot-content';

        // Handle different types of responses
        if (typeof responseData === 'string') {
            const textP = document.createElement('p');
            textP.className = 'message-text';
            textP.textContent = responseData;
            contentDiv.appendChild(textP);
        } else if (responseData.text) {
            const textP = document.createElement('p');
            textP.className = 'message-text';
            textP.textContent = responseData.text;
            contentDiv.appendChild(textP);
        }

        // Add image if present in response
        if (responseData.image) {
            const img = document.createElement('img');
            img.className = 'message-image';
            img.src = responseData.image;
            img.alt = 'Generated image';
            
            img.addEventListener('click', () => {
                this.openImageModal(responseData.image);
            });
            
            contentDiv.appendChild(img);
        }

        responseDiv.appendChild(contentDiv);

        // Add timestamp
        const timestampDiv = document.createElement('div');
        timestampDiv.className = 'message-timestamp';
        timestampDiv.textContent = this.formatTimestamp(new Date().toISOString());
        responseDiv.appendChild(timestampDiv);

        // Insert response after the original message
        originalMessage.insertAdjacentElement('afterend', responseDiv);
        
        this.scrollToBottom();
        this.showSuccess('Respuesta recibida de N8N');
    }
}

// Add CSS animations for notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    
    .chat-container.drag-over {
        border: 2px dashed #667eea;
        background: rgba(102, 126, 234, 0.05);
    }
`;
document.head.appendChild(style);

// Initialize the chat interface when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ChatInterface();
});
