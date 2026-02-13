
FROM node:20-slim

WORKDIR /app
RUN npm install -g npm@11.10.0
COPY package*.json ./
RUN npm install

COPY . .

# Construir el frontend de React
RUN npm run build

# Exponer puerto de Cloud Run
ENV PORT 8080
EXPOSE 8080

# Iniciar el servidor de Node.js (index.js)
CMD ["npm", "start"]
