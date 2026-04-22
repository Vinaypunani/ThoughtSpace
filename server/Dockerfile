FROM node:20-alpine

WORKDIR /app

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm ci --only=production

# Copy application source
COPY src/ ./src/
COPY ecosystem.config.js ./

# Install PM2 globally
RUN npm install -g pm2

EXPOSE 5000

CMD ["pm2-runtime", "ecosystem.config.js"]
