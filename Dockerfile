FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./
COPY src/ ./src/
COPY .npmrc ./

# Instalar dependencias y compilar TypeScript
RUN npm ci && \
    npm run build && \
    npm prune --production

# Crear directorio temporal para archivos descargados
RUN mkdir -p /app/tmp && \
    ls -la dist/ && \
    echo "Build completado. Verificando archivo de entrada:" && \
    ls -la dist/index.js

EXPOSE 3001

CMD ["npm", "start"]
