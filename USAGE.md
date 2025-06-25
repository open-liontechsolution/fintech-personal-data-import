# Guía de Uso - Fintech Personal Data Import

## Descripción General

El servicio `data-import` es responsable de importar datos financieros crudos desde archivos CSV y Excel a MongoDB. Este servicio NO procesa ni transforma los datos, simplemente los almacena tal como vienen del archivo para su posterior procesamiento por el servicio `data-transform`.

### Detección Automática de Bancos

El servicio incluye detección automática del banco basándose en:

1. **Nombre del archivo**: Busca patrones como "ing", "bbva", "santander"
2. **Headers del archivo**: Analiza la estructura de columnas típica de cada banco
3. **Contenido**: Examina los primeros registros para confirmar el formato

#### Bancos Soportados

| Banco | Patrones de Detección | Confianza |
|-------|----------------------|-----------|
| ING | Headers: "fecha", "nombre", "cuenta/contrapartida", "importe" | 95% |
| BBVA | Headers: "fecha operacion", "importe", "concepto" | 90% |
| Santander | Headers: "fecha valor", "movimiento", "saldo" | 90% |
| CaixaBank | Headers: "data", "concepte", "import" | 90% |

## Arquitectura de Datos

### Colecciones MongoDB

1. **raw_imports**: Almacena cada fila del archivo como un documento
   ```javascript
   {
     _id: ObjectId,
     importId: "uuid",
     fileId: "gridfs-file-id",
     fileName: "movements-242025.xls",
     fileType: "bank",
     userId: "user-id",
     bankName: "ING",           // Detectado automáticamente
     bankCode: "ING",           // Código del banco
     accountInfo: {             // Info de cuenta si está disponible
       accountType: "Cuenta Corriente"
     },
     rowNumber: 1,
     rawData: {
       "Fecha": "01/01/2024",
       "Nombre / Descripción": "Compra en tienda",
       "Cuenta de contrapartida": "ES1234567890",
       "Importe (EUR)": "-50.00",
       // ... más campos según el archivo
     },
     headers: ["Fecha", "Nombre / Descripción", "Cuenta de contrapartida", "Importe (EUR)"],
     importedAt: ISODate
   }
   ```

2. **import_summaries**: Resumen de cada importación
   ```javascript
   {
     _id: ObjectId,
     importId: "uuid",
     fileId: "gridfs-file-id",
     fileName: "movements-242025.xls",
     fileType: "bank",
     userId: "user-id",
     bankName: "ING",           // Banco detectado
     bankCode: "ING",           // Código del banco
     accountInfo: {             // Información de la cuenta
       accountType: "Cuenta Corriente"
     },
     status: "completed",
     progress: 100,
     totalRows: 150,
     importedRows: 148,
     failedRows: 2,
     headers: ["Fecha", "Nombre / Descripción", "Cuenta de contrapartida", "Importe (EUR)"],
     startedAt: ISODate,
     completedAt: ISODate,
     errors: [
       { rowNumber: 45, error: "Fila vacía" }
     ],
     metadata: {
       fileSize: 25600,
       mimeType: "application/vnd.ms-excel",
       sheets: ["Hoja1"] // Para Excel
     }
   }
   ```

## Flujo de Procesamiento

1. **Web App sube archivo a GridFS** → Envía evento `FileUploaded` a RabbitMQ
2. **Data Import recibe evento** → Descarga archivo de GridFS
3. **Detecta banco automáticamente** → Basándose en nombre y contenido
4. **Procesa archivo línea por línea** → Guarda datos crudos con info del banco
5. **Envía actualizaciones de estado** → Web App puede mostrar progreso
6. **Al finalizar** → Datos listos para ser procesados por `data-transform`

### Proceso de Detección de Banco

```javascript
// 1. Detectar por nombre de archivo
if (fileName.includes('ing') || fileName.includes('movements')) {
  return { bankName: 'ING', confidence: 0.9 };
}

// 2. Detectar por headers (más preciso)
if (headers.includes('fecha') && headers.includes('contrapartida')) {
  return { bankName: 'ING', confidence: 0.95 };
}

// 3. Detectar patrones genéricos
if (headers.includes('fecha') && headers.includes('importe')) {
  return { bankName: 'Generic Bank', confidence: 0.7 };
}
```

## Configuración

### Variables de Entorno

```bash
# MongoDB
MONGODB_URI=mongodb://localhost:27017/fintech
MONGODB_DB_NAME=fintech

# RabbitMQ
RABBITMQ_URL=amqp://guest:guest@localhost:5672
RABBITMQ_EXCHANGE=fintech-events
RABBITMQ_QUEUE=file-import-queue
RABBITMQ_ROUTING_KEY=file.uploaded

# Procesamiento
MAX_CONCURRENT_PROCESSING=3
TEMP_FILES_DIR=./tmp
```

### Opciones de Importación

El servicio respeta las opciones enviadas en el evento:

```javascript
{
  hasHeaders: true,      // Primera fila contiene headers
  delimiter: ",",        // Delimitador para CSV
  skipRows: 2,          // Saltar N filas al inicio
  sheetName: "Hoja1"    // Para Excel
}
```

## Ejemplos de Uso

### Archivo de ING

Estructura típica de archivo de ING (`movements-242025.xls`):

| Fecha | Nombre / Descripción | Cuenta de contrapartida | Importe (EUR) |
|-------|---------------------|------------------------|---------------|
| 01/01/2024 | Compra online | ES1234567890 | -25.50 |
| 02/01/2024 | Transferencia recibida | ES0987654321 | 1000.00 |

**Detección automática**:
- Banco: ING (confianza: 95%)
- Headers detectados automáticamente
- Cada fila se guarda con `bankName: "ING"`

### Simulación de Importación

```javascript
// Evento que recibiría el servicio
{
  eventId: "123e4567-e89b-12d3-a456-426614174000",
  eventType: "FileUploaded",
  timestamp: "2024-01-01T10:00:00Z",
  data: {
    fileId: "507f1f77bcf86cd799439011",
    fileName: "movements-242025.xls",
    fileType: "bank",
    userId: "user123",
    importOptions: {
      hasHeaders: true,
      sheetName: "Hoja1"
    }
  }
}
```

**Resultado esperado**:
- Banco detectado: ING
- 148 registros importados exitosamente
- 2 filas fallidas (vacías)
- Cada registro incluye `bankName: "ING"` y `bankCode: "ING"`

## Desarrollo Local

### Con Docker Compose

```bash
# Iniciar todos los servicios
docker-compose up -d

# Ver logs del servicio de importación
docker-compose logs -f data-import

# Detener servicios
docker-compose down
```

### Sin Docker

```bash
# Instalar dependencias
npm install

# Desarrollo con hot-reload
npm run dev

# Compilar
npm run build

# Producción
npm start
```

## Pruebas

### Simular Importación con Archivo de ING

```bash
# Analizar archivo de ejemplo
node scripts/test-ing-import.js

# Resultado esperado:
# Banco detectado: ING (confianza: 0.95)
# Headers: ["Fecha", "Nombre / Descripción", ...]
# Estructura MongoDB mostrada
```

### Verificar Datos Importados

```javascript
// MongoDB Shell
use fintech

// Ver resúmenes de importación con info de banco
db.import_summaries.find({ bankName: "ING" })

// Ver datos crudos de ING
db.raw_imports.find({ bankName: "ING" }).limit(5)

// Contar registros por banco
db.raw_imports.aggregate([
  { $group: { _id: "$bankName", count: { $sum: 1 } } }
])
```

## Monitoreo

### Health Check
```bash
curl http://localhost:3001/health
```

### Métricas por Banco
```bash
curl http://localhost:3001/metrics
# Incluye métricas específicas por banco detectado
```

### Logs Estructurados
```json
{
  "level": "info",
  "msg": "Archivo procesado exitosamente",
  "importId": "uuid",
  "bankName": "ING",
  "totalRows": 150,
  "importedRows": 148
}
```

## Troubleshooting

### Banco No Detectado Correctamente

**Problema**: El servicio detecta "Unknown" en lugar del banco correcto.

**Solución**:
1. Verificar el nombre del archivo incluya el nombre del banco
2. Revisar que los headers coincidan con los patrones esperados
3. Añadir nuevo patrón de detección en `detectBankFromContent()`

### Archivos de Formato Diferente

**Problema**: Banco conocido pero formato de archivo diferente.

**Solución**:
1. Revisar la estructura de headers con `scripts/test-ing-import.js`
2. Actualizar patrones de detección en `file-processor.service.ts`
3. Ajustar opciones de importación (skipRows, delimiter, etc.)

### Datos Perdidos o Incorrectos

**Problema**: Algunas transacciones no se importan correctamente.

**Solución**:
1. Verificar que las filas no estén vacías
2. Revisar logs para errores específicos
3. Comprobar que el formato de fecha/números sea válido para el banco
