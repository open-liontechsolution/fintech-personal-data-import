#!/bin/bash

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Variables del proyecto
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXAMPLE_FILE="$PROJECT_ROOT/example/movements-242025.xls"

# Función para mostrar mensajes con color
echo_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

echo_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

echo_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Función para verificar si un comando está disponible
check_command() {
    if ! command -v $1 &> /dev/null; then
        echo_error "El comando '$1' no está disponible. Por favor, instálalo antes de continuar."
        exit 1
    fi
}

# Función para verificar si un puerto está disponible
check_port() {
    local host=$1
    local port=$2
    local service_name=$3
    local max_attempts=30
    local attempt=1
    
    echo_info "Verificando que $service_name esté disponible en $host:$port..."
    
    while [ $attempt -le $max_attempts ]; do
        if nc -z $host $port 2>/dev/null; then
            echo_success "$service_name está disponible"
            return 0
        fi
        
        echo -n "."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    echo_error "$service_name no está disponible después de $((max_attempts * 2)) segundos"
    return 1
}

# Función para esperar que un servicio esté disponible
wait_for_service() {
    local service_name="$1"
    local host="$2"
    local port="$3"
    local max_attempts="$4"
    local timeout_per_attempt="$5"
    
    echo_info "Esperando que $service_name esté disponible en ${host}:${port}..."
    
    for i in $(seq 1 $max_attempts); do
        if timeout $timeout_per_attempt bash -c "</dev/tcp/$host/$port" >/dev/null 2>&1; then
            echo_success "$service_name está disponible"
            return 0
        fi
        
        if [ $i -lt $max_attempts ]; then
            echo_info "Intento $i/$max_attempts falló, reintentando en 3 segundos..."
            sleep 3
        fi
    done
    
    echo_error "$service_name no está disponible después de $max_attempts intentos"
    return 1
}

# Función para limpiar el entorno anterior
cleanup_environment() {
    echo_info "Limpiando entorno anterior..."
    
    cd "$PROJECT_ROOT"
    
    # Detener y eliminar contenedores existentes
    if docker compose ps -q | grep -q .; then
        echo_info "Deteniendo contenedores existentes..."
        docker compose down -v --remove-orphans
    fi
    
    # Eliminar imágenes relacionadas con el proyecto
    echo_info "Eliminando imágenes relacionadas..."
    docker images | grep "fintech" | awk '{print $3}' | xargs -r docker rmi -f
    
    # Limpiar volúmenes dangling
    echo_info "Limpiando volúmenes no utilizados..."
    docker volume prune -f
    
    # Limpiar directorio temporal
    if [ -d "$PROJECT_ROOT/tmp" ]; then
        echo_info "Limpiando directorio temporal..."
        # Cambiar permisos recursivamente para poder eliminar archivos creados por Docker
        if [ "$(ls -A "$PROJECT_ROOT/tmp" 2>/dev/null)" ]; then
            chmod -R 755 "$PROJECT_ROOT/tmp"/* 2>/dev/null || true
            rm -rf "$PROJECT_ROOT/tmp"/* 2>/dev/null || true
        fi
    fi
    
    echo_success "Limpieza completada"
}

# Función para construir y levantar servicios
start_services() {
    echo_info "Iniciando servicios con Docker Compose..."
    
    cd "$PROJECT_ROOT"
    
    # Construir y levantar servicios
    docker compose up -d --build
    
    if [ $? -ne 0 ]; then
        echo_error "Error al levantar los servicios"
        exit 1
    fi
    
    echo_success "Servicios iniciados"
}

# Función para esperar que todos los servicios estén listos
wait_for_all_services() {
    echo_info "Esperando que todos los servicios estén listos..."
    
    # Esperar MongoDB
    wait_for_service "MongoDB" "localhost" "27017" "30" "5"
    
    # Esperar RabbitMQ
    wait_for_service "RabbitMQ" "localhost" "5672" "30" "5"
    
    # Esperar RabbitMQ Management
    wait_for_service "RabbitMQ Management" "localhost" "15672" "30" "5"
    
    # Espera especial para data-import con más tiempo
    echo_info "Esperando que Data Import Service esté disponible en localhost:3001..."
    for i in $(seq 1 45); do
        if timeout 10 bash -c "</dev/tcp/localhost/3001" >/dev/null 2>&1; then
            echo_success "Data Import Service está disponible"
            break
        fi
        
        if [ $i -lt 45 ]; then
            echo_info "Data Import Service - Intento $i/45, reintentando en 5 segundos..."
            sleep 5
        else
            echo_error "Data Import Service no está disponible después de 45 intentos"
        fi
    done
    
    # Tiempo adicional para asegurar inicialización completa
    echo_info "Dando tiempo adicional para la inicialización completa..."
    sleep 15
    echo_success "Todos los servicios están listos"
}

# Función para verificar que el archivo de ejemplo existe
check_example_file() {
    echo_info "Verificando archivo de ejemplo..."
    
    if [ ! -f "$EXAMPLE_FILE" ]; then
        echo_error "No se encontró el archivo de ejemplo en: $EXAMPLE_FILE"
        exit 1
    fi
    
    echo_success "Archivo de ejemplo encontrado: $(basename "$EXAMPLE_FILE")"
}

upload_example_file() {
    echo -e "${BLUE}[INFO]${NC} Subiendo archivo de ejemplo usando almacenamiento alternativo (sin GridFS)..." >&2
    
    local file_path="example/movements-242025.xls"
    local file_name="movements-242025.xls"
    
    if [ ! -f "$file_path" ]; then
        echo -e "${RED}[ERROR]${NC} Archivo de ejemplo no encontrado: $file_path" >&2
        return 1
    fi
    
    echo -e "${BLUE}[INFO]${NC} Ejecutando upload con almacenamiento alternativo..." >&2
    
    # Ejecutar el upload y capturar solo la última línea (el FileID)
    local upload_output=$(node -e "
        const { MongoClient, ObjectId } = require('mongodb');
        const fs = require('fs');
        
        async function upload() {
            const client = new MongoClient('mongodb://admin:admin123@localhost:27017/fintech?authSource=admin');
            try {
                await client.connect();
                const db = client.db('fintech');
                const filesCollection = db.collection('uploaded_files');
                
                // Leer archivo y convertir a base64
                const fileData = fs.readFileSync('$file_path');
                const base64Data = fileData.toString('base64');
                
                // Crear documento con el archivo
                const fileDoc = {
                    _id: new ObjectId(),
                    filename: '$file_name',
                    originalName: '$file_name',
                    mimeType: 'application/vnd.ms-excel',
                    size: fileData.length,
                    data: base64Data,
                    uploadedAt: new Date(),
                    source: 'test-environment',
                    metadata: {
                        originalName: '$file_name',
                        uploadedAt: new Date(),
                        source: 'test-environment'
                    }
                };
                
                const result = await filesCollection.insertOne(fileDoc);
                // Solo imprimir el FileID, sin más mensajes
                console.log(result.insertedId.toString());
                
            } finally {
                await client.close();
            }
        }
        
        upload().catch(err => {
            console.error('ERROR:', err.message);
            process.exit(1);
        });
    " 2>/dev/null)
    
    # Extraer solo la última línea que contiene el FileID
    local upload_result=$(echo "$upload_output" | tail -n 1 | tr -d '\r\n')
    
    # Extraer solo el ObjectId (24 caracteres hex) del output mezclado
    upload_result=$(echo "$upload_result" | grep -o '[0-9a-f]\{24\}' | tail -n 1)
    
    if [ $? -ne 0 ] || [ -z "$upload_result" ]; then
        echo -e "${RED}[ERROR]${NC} Error al subir archivo con almacenamiento alternativo" >&2
        return 1
    fi
    
    echo -e "${GREEN}[SUCCESS]${NC} Archivo subido exitosamente (alternativo a GridFS)" >&2
    echo "$upload_result"
    return 0
}

# Función para purgar la cola de RabbitMQ
purge_rabbitmq_queue() {
    echo_info "Purgando cola de RabbitMQ para limpiar mensajes anteriores..."
    
    local max_attempts=10
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -f -s -u guest:guest -X DELETE "http://localhost:15672/api/queues/%2F/file-import-queue/contents" > /dev/null 2>&1; then
            echo_success "Cola de RabbitMQ purgada exitosamente"
            return 0
        fi
        echo_info "Intento $attempt/$max_attempts: Esperando que RabbitMQ Management esté listo..."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    echo_error "No se pudo purgar la cola de RabbitMQ"
    return 1
}

# Función para enviar mensaje a RabbitMQ
send_message_to_rabbitmq() {
    local file_id=$1
    local file_name=$(basename "$EXAMPLE_FILE")
    
    echo_info "Creando mensaje en RabbitMQ para procesar archivo..."
    
    # Crear script temporal en el directorio del proyecto para acceder a node_modules
    cat > "$PROJECT_ROOT/temp_rabbitmq_sender.js" << 'EOF'
const amqp = require('amqplib');

async function sendMessage() {
    let connection;
    let channel;
    
    try {
        connection = await amqp.connect('amqp://guest:guest@localhost:5672');
        channel = await connection.createChannel();
        
        const exchange = 'fintech-events';
        const queueName = 'file-import-queue';
        const routingKey = 'file.uploaded';
        
        // Crear exchange y cola (igual que el servicio espera)
        await channel.assertExchange(exchange, 'topic', { durable: true });
        await channel.assertQueue(queueName, { durable: true });
        await channel.bindQueue(queueName, exchange, routingKey);
        
        // Preparar mensaje con el formato que espera el servicio
        const message = {
            eventId: 'test-' + Date.now(),
            eventType: 'FileUploaded',
            timestamp: new Date().toISOString(),
            data: {
                fileId: process.argv[2],
                fileName: process.argv[3],
                originalName: process.argv[3],
                size: 12345,
                mimeType: 'application/vnd.ms-excel',
                uploadedBy: 'test-user',
                uploadedAt: new Date().toISOString(),
                importOptions: {
                    hasHeaders: true,
                    skipRows: 0,
                    delimiter: ',',
                    encoding: 'utf8'
                },
                metadata: {
                    source: 'test-upload',
                    bankName: 'ING',
                    accountType: 'checking'
                }
            }
        };
        
        // Enviar mensaje
        channel.publish(
            exchange,
            routingKey,
            Buffer.from(JSON.stringify(message)),
            {
                persistent: true,
                headers: {
                    'content-type': 'application/json'
                }
            }
        );
        
        console.log('✅ Mensaje enviado a RabbitMQ exitosamente');
        console.log('📄 Detalles del mensaje:');
        console.log('   - Event ID:', message.eventId);
        console.log('   - File ID:', message.data.fileId);
        console.log('   - File Name:', message.data.fileName);
        console.log('   - Exchange:', exchange);
        console.log('   - Queue:', queueName);
        console.log('   - Routing Key:', routingKey);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        throw error;
    } finally {
        if (channel) await channel.close();
        if (connection) await connection.close();
    }
}

sendMessage()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('❌ Error:', error.message);
        process.exit(1);
    });
EOF

    # Ejecutar script desde el directorio del proyecto para acceso a node_modules
    cd "$PROJECT_ROOT"
    if node temp_rabbitmq_sender.js "$file_id" "$file_name"; then
        echo_success "Mensaje enviado a RabbitMQ exitosamente"
    else
        echo_error "Error al enviar mensaje a RabbitMQ"
        return 1
    fi
    
    # Limpiar archivo temporal
    rm -f "$PROJECT_ROOT/temp_rabbitmq_sender.js"
}

# Función para mostrar estado de los servicios
show_services_status() {
    echo_info "Estado de los servicios:"
    echo
    echo "Contenedores Docker:"
    docker compose ps
    echo
    echo "URLs de acceso:"
    echo "   • MongoDB: mongodb://admin:admin123@localhost:27017/fintech"
    echo "   • RabbitMQ Management: http://localhost:15672 (guest/guest)"
    echo "   • Data Import Service: http://localhost:3001"
    echo "   • Health Check: http://localhost:3001/health"
    echo
}

# Función para mostrar logs en tiempo real
show_logs() {
    echo_info "Mostrando logs del servicio data-import..."
    echo "Presiona Ctrl+C para detener los logs"
    echo
    docker compose logs -f data-import
}

# Función principal
main() {
    echo
    echo "Inicializador del Entorno de Test Local"
    echo "==========================================="
    echo "Proyecto: fintech-personal-data-import"
    echo "Versión: 1.0.0"
    echo
    
    # Verificar comandos necesarios
    echo_info "Verificando dependencias..."
    check_command "docker"
    check_command "node"
    check_command "npm"
    check_command "nc"
    check_command "lsof"
    
    # Verificar archivo de ejemplo
    check_example_file
    
    # Paso 1: Limpiar entorno anterior
    cleanup_environment
    
    # Paso 2: Levantar servicios
    start_services
    
    # Paso 3: Esperar que los servicios estén listos
    wait_for_all_services
    
    # Subir archivo de ejemplo a GridFS
    echo_info "Subiendo archivo de ejemplo a GridFS..."
    FILE_ID=$(upload_example_file)
    if [ $? -ne 0 ]; then
        echo_error "No se pudo subir el archivo a GridFS. Saltando envío de mensaje."
        echo_info "El entorno está listo pero sin archivo de ejemplo para procesar."
        show_services_status
        return 0
    fi
    
    echo_info "FileID obtenido: $FILE_ID"
    
    # Esperar más tiempo para que data-import esté completamente listo
    echo_info "Esperando que data-import esté completamente inicializado..."
    sleep 10
    
    # Verificar que data-import responda en health check
    local max_attempts=30
    local attempt=1
    while [ $attempt -le $max_attempts ]; do
        if curl -f -s http://localhost:3001/health > /dev/null 2>&1; then
            echo_success "Data-import está completamente listo"
            break
        fi
        echo_info "Intento $attempt/$max_attempts: Esperando que data-import responda..."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    if [ $attempt -gt $max_attempts ]; then
        echo_error "Data-import no responde después de $max_attempts intentos"
        exit 1
    fi
    
    # Paso 5: Purgar cola de RabbitMQ
    purge_rabbitmq_queue
    
    # Paso 6: Enviar mensaje a RabbitMQ
    send_message_to_rabbitmq "$FILE_ID"
    
    # Paso 7: Mostrar estado
    show_services_status
    
    echo
    echo_success "Entorno de test inicializado correctamente"
    echo
    echo "Próximos pasos:"
    echo "   1. Revisar los logs: $0 --logs"
    echo "   2. Acceder a RabbitMQ Management: http://localhost:15672"
    echo "   3. Verificar importación en MongoDB"
    echo "   4. Ejecutar scripts de análisis desde la carpeta scripts/"
    echo
    
    # Preguntar si mostrar logs
    read -p "¿Quieres ver los logs del servicio data-import ahora? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        show_logs
    fi
}

# Manejar parámetros de línea de comandos
case "${1:-}" in
    --logs)
        show_logs
        ;;
    --status)
        show_services_status
        ;;
    --cleanup)
        cleanup_environment
        ;;
    --help|-h)
        echo "Uso: $0 [opción]"
        echo
        echo "Opciones:"
        echo "  (sin opciones)  Inicializar entorno completo"
        echo "  --logs         Mostrar logs del servicio data-import"
        echo "  --status       Mostrar estado de los servicios"
        echo "  --cleanup      Solo limpiar entorno anterior"
        echo "  --help, -h     Mostrar esta ayuda"
        ;;
    *)
        main
        ;;
esac
