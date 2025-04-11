# Fintech Personal Data Import Service

## Overview

The `data-import` microservice is a critical component of the Fintech Personal application architecture. This service is responsible for processing financial data files (CSV/Excel) uploaded by users, transforming the raw data into a structured format, and storing it in MongoDB for further analysis and reporting.

## Architecture

The `data-import` service follows a modern microservices architecture designed to scale horizontally in a Kubernetes environment. It's built as a stateless service that processes data asynchronously, making it ideal for deployment in container orchestration platforms.

```
┌─────────────┐    ┌───────────┐    ┌─────────────┐    ┌─────────────┐
│             │    │           │    │             │    │             │
│   web-app   ├───►│  RabbitMQ ├───►│ data-import ├───►│   MongoDB   │
│             │    │           │    │             │    │             │
└─────────────┘    └───────────┘    └─────────────┘    └─────────────┘
                                          │
                                          ▼
                                    ┌─────────────┐
                                    │             │
                                    │ data-transf │
                                    │             │
                                    └─────────────┘
```

### Key Components

1. **Message Consumer**: Listens continuously to RabbitMQ queues for new file processing requests
2. **File Processor**: Downloads files from MongoDB GridFS, processes them based on file type and format
3. **Data Transformer**: Converts raw financial data into standardized schema
4. **Data Storage**: Stores processed data in MongoDB collections
5. **Error Handling**: Provides robust error handling with standardized responses
6. **Authentication Integration**: Processes files in the context of the user who uploaded them

## Connections and Dependencies

The `data-import` service interacts with several other components:

### RabbitMQ

- **Connection**: Connects as a consumer to RabbitMQ
- **Queues**: 
  - `file-import-queue`: Main queue for file processing requests
  - `file-import-error-queue`: Dead letter queue for failed processing attempts
- **Message Format**: Uses standardized DTOs from the `fintech-personal-common` package

### MongoDB

- **Connection**: Connects directly to MongoDB
- **GridFS**: Uses GridFS for retrieving uploaded files
- **Collections**: 
  - `transactions`: Stores processed financial transactions
  - `accounts`: Stores account information
  - `categories`: Stores transaction categories
  - `files`: Metadata about processed files

### Common Library

Leverages the `fintech-personal-common` package for:
- Shared DTOs and schemas
- RabbitMQ client abstraction
- Error handling
- Validation utilities

## Flow Process

1. **File Upload**:
   - User uploads a financial file through the `web-app`
   - The file is stored in MongoDB GridFS
   - A message with the file ID is sent to RabbitMQ

2. **File Processing**:
   - `data-import` receives the message with file ID
   - Downloads the file from GridFS to temporary storage
   - Determines file type and appropriate processor
   - Parses and validates the file contents

3. **Data Transformation**:
   - Maps raw data to standardized schema
   - Applies business rules and data enrichment
   - Associates data with the correct user account

4. **Data Storage**:
   - Stores processed data in MongoDB
   - Updates import history and statistics
   - Cleans up temporary files

5. **Notification**:
   - Sends completion status to `data-transf` service
   - Notifies `web-app` of processing results (success/failure)

## Deployment

The service is designed to be deployed in a Kubernetes (k3s) cluster with the following considerations:

- **Container Image**: ARM64 compatible for Raspberry Pi deployment
- **Scaling**: Horizontally scalable based on queue load
- **Resource Management**: Configurable CPU/memory limits
- **Configuration**: Environment variables and ConfigMaps for configuration
- **Health Checks**: Liveness and readiness probes
- **Logging**: Structured JSON logging for better observability

## Development

### Prerequisites

- Node.js 16+
- Access to RabbitMQ and MongoDB services
- Verdaccio for accessing private npm packages

### Setup

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your configuration

# Run in development mode
npm run dev

# Run tests
npm test
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `RABBITMQ_URL` | RabbitMQ connection string | `amqp://guest:guest@localhost:5672` |
| `MONGODB_URL` | MongoDB connection string | `mongodb://localhost:27017/fintech` |
| `LOG_LEVEL` | Logging level | `info` |
| `NODE_ENV` | Environment | `development` |
| `PORT` | HTTP port for health checks | `3001` |

## Contributing

Consulta el archivo [CONTRIBUTING.md](./CONTRIBUTING.md) para obtener información detallada sobre cómo contribuir al proyecto, incluyendo las convenciones de commits que utilizamos para el versionado semántico automático.

## Versionado

Este proyecto utiliza versionado semántico automático basado en [Conventional Commits](https://www.conventionalcommits.org/). El sistema de CI/CD generará automáticamente nuevas versiones basadas en los mensajes de commit:

- Commits de tipo `fix` aumentan la versión PATCH (1.0.0 → 1.0.1)
- Commits de tipo `feat` aumentan la versión MINOR (1.0.0 → 1.1.0)
- Commits con `BREAKING CHANGE` o tipo `feat!` aumentan la versión MAJOR (1.0.0 → 2.0.0)

### Flujo de versiones

- La rama `develop` genera versiones pre-release (ej. 1.0.0-beta.1)
- La rama `main` genera versiones estables (ej. 1.0.0)

### Integración con fintech-personal-common

Este microservicio consume la biblioteca `fintech-personal-common` que proporciona componentes compartidos entre todos los microservicios:

- **Cliente RabbitMQ estandarizado**: Abstracción para la comunicación entre servicios
- **Manejo de errores**: Clases `AppError` y sus derivadas para un manejo consistente de errores
- **DTOs y validación**: Esquemas y utilidades de validación compartidos
- **Documentación**: Consultar la documentación de la biblioteca común para más detalles sobre `file-import-flow.md` y `architecture-overview.md`

Las dependencias entre este servicio y la biblioteca común se gestionan automáticamente mediante el sistema de versionado semántico.

## License

Private - All rights reserved