
FROM node:20-slim

WORKDIR /app

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
