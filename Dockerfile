FROM node:18-alpine

WORKDIR /app

# Install server dependencies
COPY package*.json ./
RUN npm install --production

# Copy server code
COPY server/ ./server/

# Build React frontend
COPY client/package*.json ./client/
RUN cd client && npm install
COPY client/ ./client/
RUN cd client && npm run build

# Serve the React build as static files from Express
RUN mv client/build server/public

EXPOSE 8080

CMD ["node", "server/index.js"]
