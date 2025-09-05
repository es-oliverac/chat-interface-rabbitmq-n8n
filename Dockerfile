# Use official Node.js runtime as base image
FROM node:18-alpine

# Set working directory in container
WORKDIR /app

# Add a non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S chatuser -u 1001

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY . .

# Change ownership of the app directory
RUN chown -R chatuser:nodejs /app
USER chatuser

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "const http = require('http'); \
        const options = { host: 'localhost', port: 3000, path: '/health', timeout: 2000 }; \
        const request = http.request(options, (res) => { \
            if (res.statusCode === 200) process.exit(0); \
            else process.exit(1); \
        }); \
        request.on('error', () => process.exit(1)); \
        request.end();"

# Start the application
CMD ["npm", "start"]
