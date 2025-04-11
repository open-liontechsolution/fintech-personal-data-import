FROM node:18-alpine

# Crear directorio de la aplicación
WORKDIR /app

# Copiar archivos de configuración de proyecto
COPY package*.json tsconfig*.json ./

# Copiar código fuente
COPY src/ ./src/

# Copiar configuración npm temporalmente
COPY .npmrc ./

# Instalar dependencias, compilar y limpiar en un solo paso para reducir capas
RUN npm ci && \
    npm run build && \
    # Mantener solo las dependencias de producción
    npm prune --production && \
    # Limpiar caché npm para reducir tamaño
    npm cache clean --force && \
    # Eliminar archivos no necesarios en producción
    rm -rf src tsconfig*.json .npmrc

# Crear directorio temporal y asignar permisos adecuados
RUN mkdir -p /app/temp && \
    chown -R node:node /app

# Cambiar a usuario no root por seguridad
USER node

# Verificación de salud del contenedor
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# Exponer puerto de la aplicación
EXPOSE 3001

# Comando para iniciar la aplicación
CMD ["node", "dist/src/index.js"]
