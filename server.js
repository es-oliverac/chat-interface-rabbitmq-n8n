require('dotenv').config();
const express = require('express');
const multer = require('multer');
const amqp = require('amqplib');
const cors = require('cors');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Multer configuration for memory storage
const storage = multer.memoryStorage();

// Upload for user uploads (only images)
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Upload for webhook responses (all file types)
const webhookUpload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// RabbitMQ connection
let channel = null;
let connection = null;

// Store for associating messages with responses
const messageStore = new Map();

async function connectRabbitMQ() {
  try {
    const rabbitmqEnabled = process.env.RABBITMQ_ENABLED === 'true';
    if (!rabbitmqEnabled) {
      console.log('RabbitMQ is disabled');
      return;
    }

    const rabbitmqUri = process.env.RABBITMQ_URI;
    if (!rabbitmqUri) {
      throw new Error('RABBITMQ_URI environment variable is required');
    }

    console.log('Connecting to RabbitMQ...');
    connection = await amqp.connect(rabbitmqUri);
    channel = await connection.createChannel();
    
    const queueName = process.env.RABBITMQ_TOPIC || 'sebastian';
    await channel.assertQueue(queueName, { 
      durable: true,
      arguments: {
        'x-queue-type': 'quorum'
      }
    });
    
    console.log(`Connected to RabbitMQ queue: ${queueName}`);
  } catch (error) {
    console.error('RabbitMQ connection error:', error.message);
    setTimeout(connectRabbitMQ, 5000); // Retry after 5 seconds
  }
}

// Initialize RabbitMQ connection
connectRabbitMQ();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    rabbitmq: channel ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// Upload endpoint
app.post('/upload', upload.single('image'), async (req, res) => {
  try {
    const { description } = req.body;
    const file = req.file;

    if (!description && !file) {
      return res.status(400).json({ error: 'Description or image is required' });
    }

    // Generate unique message ID
    const messageId = Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9);
    
    // Prepare message payload
    const message = {
      id: messageId,
      timestamp: new Date().toISOString(),
      type: 'chat_message',
      content: {
        text: description || '',
        image: file ? `data:${file.mimetype};base64,${file.buffer.toString('base64')}` : null
      },
      metadata: file ? {
        filename: file.originalname,
        size: file.size,
        mimetype: file.mimetype
      } : {},
      webhookUrl: process.env.WEBHOOK_BASE_URL ? 
        `${process.env.WEBHOOK_BASE_URL}/webhook/response/${messageId}` : 
        `http://localhost:${port}/webhook/response/${messageId}`
    };

    // Send to RabbitMQ if connected
    if (channel && process.env.RABBITMQ_ENABLED === 'true') {
      const queueName = process.env.RABBITMQ_TOPIC || 'sebastian';
      
      await channel.sendToQueue(queueName, Buffer.from(JSON.stringify(message)), {
        persistent: true,
        timestamp: Date.now()
      });
      
      console.log('Message sent to RabbitMQ queue:', {
        messageId: messageId,
        queue: queueName,
        hasImage: !!file,
        description: description || 'No description',
        webhookUrl: message.webhookUrl
      });
    } else {
      console.log('RabbitMQ not available, message not sent');
    }

    // Store message for webhook response
    messageStore.set(messageId, {
      originalMessage: message,
      response: null,
      timestamp: new Date().toISOString()
    });

    res.json({ 
      success: true, 
      message: 'Message processed successfully',
      data: {
        messageId: messageId,
        hasImage: !!file,
        description: description || '',
        timestamp: message.timestamp
      }
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

// Webhook endpoint to receive N8N responses (with binary file support)
app.post('/webhook/response/:messageId', webhookUpload.single('data'), (req, res) => {
  try {
    const { messageId } = req.params;
    const file = req.file;
    const textData = req.body;

    console.log('=== WEBHOOK RECEIVED ===');
    console.log('Message ID:', messageId);
    console.log('Text Data:', textData);
    console.log('File Info:', file ? {
      filename: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    } : 'No file');
    console.log('Headers:', req.headers);
    console.log('========================');

    // Prepare response data
    let responseData = {
      text: textData.text || 'Imagen procesada exitosamente',
      timestamp: new Date().toISOString()
    };

    // Add image data if file is present
    if (file) {
      responseData.image = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    }

    if (messageStore.has(messageId)) {
      const storedMessage = messageStore.get(messageId);
      storedMessage.response = responseData;
      storedMessage.responseTimestamp = new Date().toISOString();
      messageStore.set(messageId, storedMessage);

      console.log('Response stored for message:', messageId);
      
      res.json({ 
        success: true, 
        message: 'Response received and stored',
        messageId: messageId
      });
    } else {
      console.log('Message ID not found:', messageId);
      res.status(404).json({ 
        error: 'Message ID not found',
        messageId: messageId
      });
    }
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Failed to process webhook response' });
  }
});

// Get response for a specific message
app.get('/api/response/:messageId', (req, res) => {
  try {
    const { messageId } = req.params;
    
    if (messageStore.has(messageId)) {
      const storedMessage = messageStore.get(messageId);
      res.json({
        success: true,
        data: {
          messageId: messageId,
          hasResponse: !!storedMessage.response,
          response: storedMessage.response,
          responseTimestamp: storedMessage.responseTimestamp
        }
      });
    } else {
      res.status(404).json({ 
        error: 'Message ID not found',
        messageId: messageId
      });
    }
  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({ error: 'Failed to get response' });
  }
});

// Debug endpoint to see stored messages
app.get('/api/debug/messages', (req, res) => {
  const messages = Array.from(messageStore.entries()).map(([id, data]) => ({
    messageId: id,
    hasResponse: !!data.response,
    timestamp: data.timestamp,
    responseTimestamp: data.responseTimestamp
  }));
  
  res.json({
    success: true,
    totalMessages: messages.length,
    messages: messages
  });
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  if (channel) await channel.close();
  if (connection) await connection.close();
  process.exit(0);
});

app.listen(port, () => {
  console.log(`Chat interface server running on port ${port}`);
});
