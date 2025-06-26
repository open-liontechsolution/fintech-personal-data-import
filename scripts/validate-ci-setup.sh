#!/bin/bash

# Script para validar que la configuración de CI/CD esté completa
# Uso: ./scripts/validate-ci-setup.sh

set -e

echo "🔍 Validando configuración de CI/CD para fintech-personal-data-import..."

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Función para mostrar mensajes con colores
echo_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

echo_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

echo_error() {
    echo -e "${RED}❌ $1${NC}"
}

echo_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Verificar archivos esenciales
echo_info "Verificando archivos de configuración..."

REQUIRED_FILES=(
    "package.json"
    "tsconfig.json"
    "jest.config.js"
    ".eslintrc.js"
    "Dockerfile"
    ".dockerignore"
    ".github/workflows/ci.yml"
    ".github/workflows/dev-deploy.yml"
    ".github/workflows/qa-deploy.yml"
    ".github/workflows/prod-deploy.yml"
    ".github/dependabot.yml"
    ".github/pull_request_template.md"
    "docs/github-actions.md"
)

MISSING_FILES=()

for file in "${REQUIRED_FILES[@]}"; do
    if [[ -f "$file" ]]; then
        echo_success "Archivo encontrado: $file"
    else
        echo_error "Archivo faltante: $file"
        MISSING_FILES+=("$file")
    fi
done

# Verificar scripts en package.json
echo_info "Verificando scripts en package.json..."

REQUIRED_SCRIPTS=("test" "build" "start" "lint")
MISSING_SCRIPTS=()

for script in "${REQUIRED_SCRIPTS[@]}"; do
    if grep -q "\"$script\":" package.json; then
        echo_success "Script encontrado: $script"
    else
        echo_error "Script faltante en package.json: $script"
        MISSING_SCRIPTS+=("$script")
    fi
done

# Verificar dependencias de desarrollo
echo_info "Verificando dependencias de desarrollo..."

REQUIRED_DEV_DEPS=(
    "@typescript-eslint/eslint-plugin"
    "@typescript-eslint/parser"
    "eslint"
    "jest"
    "ts-jest"
    "@types/jest"
    "supertest"
    "@types/supertest"
)

MISSING_DEV_DEPS=()

for dep in "${REQUIRED_DEV_DEPS[@]}"; do
    if grep -q "\"$dep\":" package.json; then
        echo_success "Dev dependency encontrada: $dep"
    else
        echo_warning "Dev dependency faltante: $dep"
        MISSING_DEV_DEPS+=("$dep")
    fi
done

# Verificar estructura de directorios
echo_info "Verificando estructura de directorios..."

REQUIRED_DIRS=(
    "src"
    "src/__tests__"
    "tests"
    "scripts"
    "docs"
    ".github"
    ".github/workflows"
)

for dir in "${REQUIRED_DIRS[@]}"; do
    if [[ -d "$dir" ]]; then
        echo_success "Directorio encontrado: $dir"
    else
        echo_warning "Directorio faltante: $dir"
    fi
done

# Verificar archivos de test
echo_info "Verificando archivos de test..."

TEST_FILES=(
    "src/__tests__/file-processor.service.test.ts"
    "src/__tests__/upload.controller.test.ts"
    "tests/setup.ts"
    ".env.test"
)

for file in "${TEST_FILES[@]}"; do
    if [[ -f "$file" ]]; then
        echo_success "Archivo de test encontrado: $file"
    else
        echo_warning "Archivo de test faltante: $file"
    fi
done

# Verificar configuración de Docker
echo_info "Verificando configuración de Docker..."

if [[ -f "Dockerfile" ]]; then
    if grep -q "FROM node:" Dockerfile; then
        echo_success "Dockerfile usa imagen base de Node.js"
    else
        echo_warning "Dockerfile no usa imagen base de Node.js"
    fi
    
    if grep -q "WORKDIR /app" Dockerfile; then
        echo_success "Dockerfile configura WORKDIR correctamente"
    else
        echo_warning "Dockerfile no configura WORKDIR"
    fi
    
    if grep -q "mkdir -p /app/tmp" Dockerfile; then
        echo_success "Dockerfile crea directorio temporal"
    else
        echo_warning "Dockerfile no crea directorio temporal"
    fi
fi

# Verificar workflows de GitHub Actions
echo_info "Verificando workflows de GitHub Actions..."

WORKFLOWS=("ci.yml" "dev-deploy.yml" "qa-deploy.yml" "prod-deploy.yml")

for workflow in "${WORKFLOWS[@]}"; do
    if [[ -f ".github/workflows/$workflow" ]]; then
        if grep -q "mongodb:" ".github/workflows/$workflow"; then
            echo_success "Workflow $workflow configura MongoDB"
        else
            echo_warning "Workflow $workflow no configura MongoDB"
        fi
        
        if grep -q "rabbitmq:" ".github/workflows/$workflow"; then
            echo_success "Workflow $workflow configura RabbitMQ"
        else
            echo_warning "Workflow $workflow no configura RabbitMQ"
        fi
    fi
done

# Resumen final
echo ""
echo_info "=== RESUMEN DE VALIDACIÓN ==="

if [[ ${#MISSING_FILES[@]} -eq 0 ]]; then
    echo_success "Todos los archivos esenciales están presentes"
else
    echo_error "Archivos faltantes: ${#MISSING_FILES[@]}"
    for file in "${MISSING_FILES[@]}"; do
        echo "  - $file"
    done
fi

if [[ ${#MISSING_SCRIPTS[@]} -eq 0 ]]; then
    echo_success "Todos los scripts requeridos están configurados"
else
    echo_error "Scripts faltantes: ${#MISSING_SCRIPTS[@]}"
    for script in "${MISSING_SCRIPTS[@]}"; do
        echo "  - $script"
    done
fi

if [[ ${#MISSING_DEV_DEPS[@]} -eq 0 ]]; then
    echo_success "Todas las dependencias de desarrollo están instaladas"
else
    echo_warning "Dependencias de desarrollo faltantes: ${#MISSING_DEV_DEPS[@]}"
fi

echo ""
if [[ ${#MISSING_FILES[@]} -eq 0 && ${#MISSING_SCRIPTS[@]} -eq 0 ]]; then
    echo_success "🎉 Configuración de CI/CD completa y lista para GitHub Actions"
    echo_info "Próximos pasos:"
    echo "  1. Hacer push a una rama de feature"
    echo "  2. Crear un Pull Request para probar el workflow ci.yml"
    echo "  3. Hacer merge a develop para probar dev-deploy.yml"
    echo "  4. Configurar secrets en GitHub si es necesario:"
    echo "     - ARGOCD_REPO_TOKEN"
    echo "     - CODECOV_TOKEN (opcional)"
    exit 0
else
    echo_error "❌ Configuración incompleta. Revisa los archivos faltantes antes de continuar."
    exit 1
fi
