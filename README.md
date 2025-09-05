# Chat Interface con RabbitMQ

Una interfaz web moderna tipo chat que permite subir imágenes con descripciones y enviarlas a RabbitMQ.

## Características

- 📱 Interfaz responsiva tipo chat
- 🖼️ Subida de imágenes con vista previa
- 📝 Descripciones de texto opcionales
- 🐰 Integración con RabbitMQ
- 🔄 Estado de conexión en tiempo real
- ⚡ Drag & drop para imágenes  
- 🤖 Integración completa con N8N workflows
- 📬 Sistema de webhook para respuestas automáticas
- 🐳 Containerizado con Docker

## Tecnologías

- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Backend**: Node.js, Express
- **Message Queue**: RabbitMQ con amqplib
- **Container**: Docker

## Estructura del Proyecto

```
chat-interface/
├── public/
│   ├── index.html          # Interfaz principal
│   ├── style.css           # Estilos modernos
│   └── script.js           # Lógica frontend
├── server.js               # Servidor Express + RabbitMQ
├── package.json            # Dependencias Node.js
├── Dockerfile              # Configuración Docker
├── .dockerignore           # Archivos ignorados en build
├── .env.example            # Variables de entorno ejemplo
└── README.md               # Este archivo
```

## Instalación Local

### Prerrequisitos

- Node.js 16+ 
- npm o yarn
- RabbitMQ server (local o remoto)

### Pasos

1. **Clonar y navegar al proyecto**
   ```bash
   cd chat-interface
   ```

2. **Instalar dependencias**
   ```bash
   npm install
   ```

3. **Configurar variables de entorno**
   ```bash
   cp .env.example .env
   # Editar .env con tus credenciales
   ```

4. **Ejecutar la aplicación**
   ```bash
   npm start
   ```

5. **Abrir en navegador**
   ```
   http://localhost:3000
   ```

## Deployment en EasyPanel

### Método 1: Deploy Directo

1. **Subir proyecto a EasyPanel**
   - Crea un nuevo servicio en EasyPanel
   - Selecciona "Source Code" 
   - Sube la carpeta `chat-interface`

2. **Configurar variables de entorno**
   ```
   RABBITMQ_ENABLED=true
   RABBITMQ_URI=amqp://guest:guest@agenteia-rabbitmq.myusvz.easypanel.host:5672
   RABBITMQ_TOPIC=sebastian
   PORT=3000
   NODE_ENV=production
   ```

3. **Configurar puertos**
   - Puerto interno: 3000
   - Puerto público: (el que asigne EasyPanel)

### Método 2: Docker Build

1. **Build local de la imagen**
   ```bash
   docker build -t chat-interface .
   ```

2. **Subir imagen a registry**
   ```bash
   docker tag chat-interface your-registry/chat-interface:latest
   docker push your-registry/chat-interface:latest
   ```

3. **Deploy en EasyPanel**
   - Crear servicio con imagen Docker
   - Usar imagen: `your-registry/chat-interface:latest`
   - Configurar variables de entorno

## Variables de Entorno

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `RABBITMQ_ENABLED` | Habilitar RabbitMQ | `true` |
| `RABBITMQ_URI` | URI de conexión RabbitMQ | `amqp://user:pass@host:5672` |
| `RABBITMQ_TOPIC` | Nombre del topic/exchange | `sebastian` |
| `PORT` | Puerto del servidor | `3000` |
| `NODE_ENV` | Entorno de ejecución | `production` |

## Uso

### Interfaz Web

1. **Subir imagen**: Click en el botón de clip o arrastra una imagen
2. **Agregar descripción**: Escribe texto en el campo de entrada
3. **Enviar**: Click en el botón de envío o presiona Enter
4. **Estado**: Verifica la conexión RabbitMQ en la esquina superior

### Formato del Mensaje RabbitMQ

Los mensajes enviados a RabbitMQ tienen este formato:

```json
{
  "id": "unique-message-id-123",
  "timestamp": "2025-01-05T16:52:00Z",
  "type": "chat_message",
  "content": {
    "text": "Descripción del usuario",
    "image": "data:image/jpeg;base64,..."
  },
  "metadata": {
    "filename": "imagen.jpg",
    "size": 1024576,
    "mimetype": "image/jpeg"
  },
  "webhookUrl": "http://localhost:3003/webhook/response/unique-message-id-123"
}
```

### Configuración N8N Workflow

#### 1. RabbitMQ Trigger
- **Queue**: `sebastian` (configurable con RABBITMQ_TOPIC)
- **Type**: Quorum queue

#### 2. Procesar imagen (ej. Nano Banana)
- Usar `$json.content.image` para la imagen base64
- Usar `$json.content.text` para la descripción

#### 3. HTTP Request (Respuesta)
Configurar nodo HTTP Request al final:
```
Method: POST
URL: {{ $json.webhookUrl }}
Headers: 
  Content-Type: application/json
Body:
{
  "text": "¡Imagen procesada exitosamente!",
  "image": "data:image/jpeg;base64,{{ $binary.data.data }}"
}
```

## API Endpoints

### `GET /`
Página principal de la interfaz

### `POST /upload`
Subir imagen y/o texto
- **Content-Type**: `multipart/form-data`
- **Body**: 
  - `description` (optional): Texto descriptivo
  - `image` (optional): Archivo de imagen

### `POST /webhook/response/:messageId`
Recibir respuestas de N8N workflows
- **Content-Type**: `application/json`
- **Body**: 
  ```json
  {
    "text": "Respuesta del workflow",
    "image": "data:image/jpeg;base64,..." // opcional
  }
  ```

### `GET /api/response/:messageId`
Consultar estado de respuesta de un mensaje

### `GET /api/debug/messages`
Debug: ver todos los mensajes almacenados

### `GET /health`
Status del servidor y conexión RabbitMQ
```json
{
  "status": "ok",
  "rabbitmq": "connected",
  "timestamp": "2025-01-05T16:52:00Z"
}
```

## Limitaciones

- Tamaño máximo de imagen: 10MB
- Tipos de archivo soportados: Todos los formatos de imagen
- Descripción máxima: 1000 caracteres

## Troubleshooting

### Error de conexión RabbitMQ
```
RabbitMQ connection error: getaddrinfo ENOTFOUND
```
**Solución**: Verificar `RABBITMQ_URI` y conectividad de red

### Puerto ocupado
```
Error: listen EADDRINUSE :::3000
```
**Solución**: Cambiar variable `PORT` o liberar el puerto

### Imágenes no se suben
- Verificar tipos de archivo permitidos
- Comprobar límite de tamaño (10MB)
- Revisar permisos de red

## Desarrollo

### Estructura del Código

- `server.js`: Servidor Express con endpoints y conexión RabbitMQ
- `public/script.js`: Clase ChatInterface con toda la lógica frontend
- `public/style.css`: Diseño responsive con animaciones CSS

### Funcionalidades Destacadas

- Auto-resize del textarea de entrada
- Drag & drop de imágenes
- Preview de imágenes antes del envío
- Notificaciones toast
- Modal para ver imágenes en grande
- Timestamps relativos en español
- Indicador de estado de conexión

## Licencia

MIT

## Soporte

Para soporte técnico, revisar:
1. Logs del contenedor/aplicación
2. Estado de RabbitMQ
3. Variables de entorno configuradas
4. Conectividad de red
