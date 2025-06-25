# Scripts de Análisis y Testing - Fintech Data Import

Este directorio contiene scripts organizados para analizar, probar y debuggear la importación de archivos financieros.

## 🚀 Scripts Principales

### 1. `init-test-env.sh` ⭐ **ENTORNO COMPLETO**
Script principal para inicializar el entorno de test completo desde cero.

**Características:**
- ✅ Limpieza completa de entorno anterior
- ✅ Levantamiento de todos los servicios (MongoDB, RabbitMQ, Data Import)
- ✅ Subida automática de archivo de ejemplo a MongoDB
- ✅ Envío de mensaje a RabbitMQ para procesar archivo
- ✅ Verificación de conectividad y monitoreo de logs
- ✅ Entorno sin persistencia (ideal para testing)

**Uso:**
```bash
./scripts/init-test-env.sh           # Inicialización completa
./scripts/init-test-env.sh --logs    # Ver logs en tiempo real
```

### 2. `init-test-env.js` ⭐ **COMPLEMENTO NODE.JS**
Script complementario en Node.js para operaciones específicas.

**Uso:**
```bash
node scripts/init-test-env.js status    # Ver estado actual
node scripts/init-test-env.js clean     # Limpiar datos
```

## 🔍 Scripts de Análisis y Testing

### 3. `analyze-file.js` ⭐ **ANÁLISIS BÁSICO**
Analiza la estructura básica de un archivo financiero.

**Características:**
- ✅ Soporta archivos Excel (.xls, .xlsx)
- ✅ Fallback automático a CSV si Excel falla
- ✅ Fallback a texto plano como último recurso
- ✅ Manejo robusto de errores
- ✅ Análisis de columnas y estructura

### 4. `test-import.js` ⭐ **TEST COMPLETO**
Simula el proceso completo de importación con detección automática de banco.

**Características:**
- ✅ Detección automática de formato de archivo
- ✅ Identificación de múltiples bancos (ING, Santander, BBVA)
- ✅ Muestra estructura MongoDB resultante
- ✅ Estadísticas detalladas del archivo
- ✅ Análisis de tipos de datos

### 5. `send_rabbitmq_message.js` ⭐ **TRIGGER MANUAL**
Envía mensajes RabbitMQ para procesar archivos específicos ya subidos.

**Características:**
- ✅ Parámetros configurables por línea de comandos
- ✅ Verificación del estado de la cola
- ✅ Logs detallados del proceso
- ✅ Conexión y configuración automática de RabbitMQ

**Uso:**
```bash
node scripts/send_rabbitmq_message.js [fileId] [fileName]
node scripts/send_rabbitmq_message.js 685c71b9a04286b13bac34b0 movements.xls
```

### 6. `test_auto_delete.js` ⭐ **TEST AUTO-DELETE**
Test completo del sistema de eliminación automática de archivos después del procesamiento.

**Características:**
- ✅ Test end-to-end de auto-delete
- ✅ Reinicio automático de servicios con configuración
- ✅ Upload, procesamiento y verificación de eliminación
- ✅ Verificación de integridad de datos
- ✅ Configuración automática DELETE_AFTER_PROCESSING=true

**Uso:**
```bash
node scripts/test_auto_delete.js    # Test completo de auto-delete
```

### 7. `verify_gridfs_upload.js` ⭐ **VERIFICACIÓN GRIDFS**
Verifica archivos subidos en MongoDB GridFS y su estado.

**Características:**
- ✅ Lista todos los archivos en GridFS
- ✅ Busca archivos específicos por ID
- ✅ Muestra metadata completa
- ✅ Verifica integridad de archivos
- ✅ Información de tamaño y chunks

**Uso:**
```bash
node scripts/verify_gridfs_upload.js           # Lista todos los archivos
node scripts/verify_gridfs_upload.js [fileId]  # Busca archivo específico
```

### 8. `universal-file-analyzer.js` ⭐ **ANALIZADOR UNIVERSAL**
Analizador universal que maneja múltiples formatos automáticamente.

## 🛠️ Scripts de Debugging

### 9. `verify-import-data.js` ✅ **VERIFICACIÓN POST-IMPORT**
Verifica que los datos se importaron correctamente en MongoDB.

**Características:**
- ✅ Revisa resúmenes de importación
- ✅ Verifica datos crudos en raw_imports
- ✅ Muestra estadísticas detalladas
- ✅ Ejemplo de estructura de transacciones

**Uso:**
```bash
node scripts/verify-import-data.js
```

### 10. `debug-excel.js` ✅ **DEBUG EXCEL ESPECÍFICO**
Debuggea problemas específicos con archivos Excel.

**Características:**
- ✅ Verifica signature de archivos Excel
- ✅ Compara archivo descargado vs original
- ✅ Identifica problemas de encoding
- ✅ Test de librerías Excel

**Uso:**
```bash
node scripts/debug-excel.js
```

### 11. `test-xlsx-library.js` ✅ **TEST LIBRERÍAS EXCEL**
Prueba diferentes librerías para procesar Excel.

**Características:**
- ✅ Compara read-excel-file vs xlsx vs node-xlsx
- ✅ Identifica cuál funciona mejor
- ✅ Útil para troubleshooting de librerías

## 📋 Flujo de Trabajo Recomendado

### 🟢 Para Testing Completo:
1. **Inicializar entorno**: `./scripts/init-test-env.sh`
2. **Verificar resultados**: `node scripts/verify-import-data.js`

### 🟡 Para Análisis de Archivos:
1. **Análisis básico**: `node scripts/analyze-file.js <archivo>`
2. **Test de importación**: `node scripts/test-import.js <archivo>`

### 🔴 Para Debugging:
1. **Debug Excel**: `node scripts/debug-excel.js`
2. **Test librerías**: `node scripts/test-xlsx-library.js`

## 🔧 Configuración

Todos los scripts están configurados para trabajar con:
- **MongoDB**: `mongodb://admin:admin123@localhost:27017/fintech`
- **RabbitMQ**: `amqp://guest:guest@localhost:5672`
- **Data Import Service**: `http://localhost:3001`

## ⚠️ Notas Importantes

- Los scripts están diseñados para entorno de **desarrollo/testing**
- El entorno es **sin persistencia** por defecto (datos se borran al reiniciar)
- Usar **init-test-env.sh** como punto de entrada principal
- Los scripts de debugging asumen que el entorno ya está corriendo

## 🎯 Estado Actual

- ✅ **Excel Processing**: Resuelto (librería xlsx funcionando)
- ✅ **File Permissions**: Resuelto (directorio /app/tmp con permisos correctos)
- ✅ **Base64 Storage**: Funcionando como alternativa a GridFS
- ✅ **End-to-End Import**: 104 filas procesadas exitosamente
