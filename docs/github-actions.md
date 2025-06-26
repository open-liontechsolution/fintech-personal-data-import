# GitHub Actions - Pipelines de CI/CD

Este documento describe los workflows de GitHub Actions configurados para el microservicio `fintech-personal-data-import`.

## Workflows Disponibles

### 1. Continuous Integration (CI) - `ci.yml`
**Trigger:** Pull Requests a ramas `main`, `develop`, `qa`

**Propósito:** Validación básica de código en Pull Requests

**Jobs:**
- `lint-and-test`: Ejecuta linting, build y tests unitarios
- `security-check`: Auditoría de seguridad y escaneo de vulnerabilidades

**Servicios utilizados:**
- MongoDB 6.0 para tests
- RabbitMQ 3.12 para tests

### 2. Development Pipeline - `dev-deploy.yml`
**Trigger:** Push a rama `develop`

**Propósito:** Deploy automático al entorno de desarrollo

**Jobs:**
1. `validate`: Linting y instalación de dependencias
2. `test`: Tests completos con servicios externos
3. `build-and-push`: Construcción y push de imagen Docker
4. `cleanup-old-images`: Limpieza de imágenes antiguas (mantiene 5 más recientes)
5. `update-argocd-dev`: Actualización automática de ArgoCD para desarrollo

**Imagen generada:** `ghcr.io/[owner]/fintech-personal-data-import:dev-[short-sha]`

### 3. QA Pipeline - `qa-deploy.yml`
**Trigger:** Push a ramas `qa` o `release/*`

**Propósito:** Deploy automático al entorno de QA

**Jobs:**
1. `validate`: Linting y validación de código
2. `test`: Tests con coverage report
3. `build-and-push`: Construcción multi-arquitectura (amd64, arm64)
4. `cleanup-old-images`: Limpieza de imágenes (mantiene 10 más recientes)
5. `update-argocd-qa`: Actualización de ArgoCD para QA

**Imagen generada:** 
- Para rama `qa`: `ghcr.io/[owner]/fintech-personal-data-import:qa-[short-sha]`
- Para rama `release/*`: `ghcr.io/[owner]/fintech-personal-data-import:[branch-name]-[short-sha]`

### 4. Production Pipeline - `prod-deploy.yml`
**Trigger:** 
- Push de tags `v*`
- Workflow manual con input de versión

**Propósito:** Deploy a producción con máxima seguridad

**Jobs:**
1. `validate`: Validación exhaustiva de código
2. `test`: Tests completos con coverage
3. `security-scan`: Auditoría de seguridad con Trivy
4. `build-and-push`: Construcción y push con tags de versión y `latest`
5. `vulnerability-scan`: Escaneo de vulnerabilidades en imagen
6. `create-release`: Creación automática de GitHub Release
7. `update-argocd-prod`: Actualización de ArgoCD para producción

**Imagen generada:** 
- `ghcr.io/[owner]/fintech-personal-data-import:[version]`
- `ghcr.io/[owner]/fintech-personal-data-import:latest`

## Configuración Requerida

### Secrets de GitHub
Los siguientes secrets deben configurarse en el repositorio:

- `ARGOCD_REPO_TOKEN`: Token para acceder al repositorio de ArgoCD
- `CODECOV_TOKEN`: Token para subir coverage reports (opcional)

### Variables de Entorno
Las siguientes variables se configuran automáticamente en los workflows:

```yaml
NODE_ENV: test
MONGODB_URI: mongodb://admin:admin123@localhost:27017/fintech_test?authSource=admin
RABBITMQ_URL: amqp://guest:guest@localhost:5672
RABBITMQ_EXCHANGE: test-file-upload-exchange
RABBITMQ_QUEUE: test-file-import-queue
RABBITMQ_ROUTING_KEY: file.uploaded
DELETE_AFTER_PROCESSING: false
```

## Servicios Externos

### MongoDB
- **Imagen:** `mongo:6.0`
- **Configuración:** Usuario admin con autenticación
- **Base de datos:** `fintech_test`
- **Puerto:** 27017

### RabbitMQ
- **Imagen:** `rabbitmq:3.12-management`
- **Configuración:** Usuario guest/guest
- **Puertos:** 5672 (AMQP), 15672 (Management)

## Arquitecturas Soportadas

Todas las imágenes Docker se construyen para múltiples arquitecturas:
- `linux/amd64` (x86_64)
- `linux/arm64` (ARM64/Apple Silicon)

## Limpieza de Imágenes

Los workflows incluyen limpieza automática de imágenes antiguas:
- **Desarrollo:** Mantiene 5 versiones más recientes
- **QA:** Mantiene 10 versiones más recientes
- **Producción:** No elimina automáticamente (gestión manual)

## Registry de Contenedores

Las imágenes se almacenan en GitHub Container Registry:
- **URL:** `ghcr.io/[owner]/fintech-personal-data-import`
- **Visibilidad:** Privado (requiere autenticación)

## Integración con ArgoCD

Los workflows actualizan automáticamente los manifiestos de ArgoCD:
- **Repositorio:** `[owner]/fintech-argocd-config`
- **Estructura esperada:**
  - `overlays/dev/fintech-personal-data-import/kustomization.yaml`
  - `overlays/qa/fintech-personal-data-import/kustomization.yaml`
  - `overlays/prod/fintech-personal-data-import/kustomization.yaml`

## Dependabot

Configurado para actualizar automáticamente:
- Dependencias npm (semanalmente los lunes)
- Actions de GitHub (semanalmente los lunes)
- Imágenes Docker base (semanalmente los lunes)

## Troubleshooting

### Tests Fallando
1. Verificar que MongoDB y RabbitMQ estén disponibles
2. Verificar variables de entorno
3. Verificar timeout de servicios (60 segundos)

### Build de Docker Fallando
1. Verificar `.npmrc` configurado correctamente
2. Verificar acceso a registry Verdaccio
3. Verificar que todas las dependencias están en package.json

### ArgoCD No Actualiza
1. Verificar `ARGOCD_REPO_TOKEN` secret
2. Verificar estructura de directorios en repo ArgoCD
3. Verificar permisos de escritura en repo ArgoCD

## Comandos Útiles

```bash
# Trigger manual del workflow de producción
gh workflow run prod-deploy.yml -f version=v1.2.3

# Ver status de workflows
gh run list

# Ver logs de un workflow específico
gh run view [run-id] --log
```
