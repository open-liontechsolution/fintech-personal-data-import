# Guía de contribución

## Convenciones de commits

Este proyecto utiliza [Conventional Commits](https://www.conventionalcommits.org/) para la generación automática de versiones semánticas. Por favor, sigue estas convenciones al escribir tus mensajes de commit:

### Formato básico

```
<tipo>(<alcance opcional>): <descripción>

<cuerpo opcional>

<pie opcional>
```

### Tipos de commit

- `feat`: Nuevas características
- `fix`: Corrección de errores
- `docs`: Cambios en la documentación
- `style`: Cambios que no afectan al significado del código (espacios en blanco, formato, etc.)
- `refactor`: Cambios en el código que no corrigen errores ni añaden funcionalidades
- `perf`: Cambios que mejoran el rendimiento
- `test`: Añadir o corregir pruebas
- `build`: Cambios que afectan al sistema de compilación o dependencias externas
- `ci`: Cambios en nuestros archivos de configuración de CI
- `chore`: Otros cambios que no modifican el código fuente ni las pruebas

### Incremento de versiones

La versión se incrementará automáticamente según el tipo de cambio:

- `fix`: incrementa la versión PATCH (1.0.0 → 1.0.1)
- `feat`: incrementa la versión MINOR (1.0.0 → 1.1.0)
- Para un BREAKING CHANGE (cambio incompatible):
  - Añade `!` después del tipo/alcance: `feat!: cambio incompatible`
  - O añade `BREAKING CHANGE:` en el pie del commit

### Ejemplos

```
feat(api): añadir endpoint para la importación de archivos CSV

fix(procesador): corregir error al procesar fechas en formato YYYY/MM/DD

feat!: rediseño completo de la API de procesamiento de archivos

BREAKING CHANGE: La API de procesamiento ahora requiere un objeto de opciones
```

## Flujo de trabajo de Git

1. Crea una rama desde `develop` para tu función/corrección
2. Haz commits siguiendo las convenciones anteriores
3. Envía un Pull Request a `develop`
4. Una vez aprobado y fusionado, los cambios pasarán a `main` en el próximo lanzamiento

## Entornos de desarrollo

- `develop`: Contiene la última versión pre-release (beta)
- `main`: Contiene la última versión estable
