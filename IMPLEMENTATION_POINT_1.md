# Implementación Point 1: Persistencia de Límites/Yards desde PostgreSQL

## 📋 Resumen

Se implementó la persistencia real de los límites de campos (yards) en PostgreSQL, reemplazando el objeto hardcodeado en memoria por un sistema completamente basado en base de datos.

## 🔧 Cambios Realizados

### 1. **server/server.js**

#### Antes:
```javascript
let limitsField = {
  limitsField1: { ... },
  LimitsField2: { ... }
}
```

#### Ahora:
```javascript
// Importa listYards desde db/index.js
import { ..., listYards, ... } from './db/index.js'

// Inicializa limitsField vacío
let limitsField = {}

// En startServer(), agrega:
await refreshYardState()
```

**Cambios:**
- ✅ Importa la función `listYards` desde el módulo de base de datos
- ✅ Inicializa `limitsField` como objeto vacío (se llena desde BD)
- ✅ Llama a `refreshYardState()` en el startup del servidor

---

### 2. **server/db/index.js**

#### Nueva función: `polygonToLimitMap()`
Convierte un polígono GeoJSON de PostGIS a la estructura esperada por el frontend:

```javascript
function polygonToLimitMap(name, polygonGeoJson) {
  // Toma las coordenadas del polígono
  // Las convierte a puntos límite (limit1, limit2, limit3, limit4, etc.)
  // Retorna: { fieldName: { limit1: {lat, lng}, limit2: {lat, lng}, ... } }
}
```

#### Nueva función: `ensureDefaultYards()`
Garantiza que existan las dos geocercas predeterminadas:

```javascript
async function ensureDefaultYards(client, userId) {
  // Verifica si ya existen limitsField1 y LimitsField2
  // Si no existen, las inserta en la tabla yards
  // Usa ST_GeomFromText para convertir WKT a geometría PostGIS
}
```

#### Función actualizada: `listYards()`
Ahora lee realmente de PostgreSQL:

```javascript
export async function listYards() {
  // 1. Obtiene el userId del usuario demo
  // 2. Asegura que existan los yards predeterminados
  // 3. Consulta la tabla yards del usuario
  // 4. Convierte cada polígono a estructura limitsField
  // 5. Retorna el objeto limitsField completo
}
```

#### Función actualizada: `seedSampleData()`
Ahora llama a `ensureDefaultYards()`:

```javascript
const userId = await getDemoUserId(client)
await ensureDefaultYards(client, userId)  // ← Nueva línea
```

---

## 💾 Estructura en la Base de Datos

Los límites se guardan en la tabla `yards` con esta estructura:

```sql
id   | user_id | name            | boundary (POLYGON)                              | created_at
-----|---------|-----------------|------------------------------------------------|-------------
1    | 1       | limitsField1    | POLYGON((-58.253289 -34.712444, ...))         | 2024-...
2    | 1       | LimitsField2    | POLYGON((-58.256803 -34.702611, ...))         | 2024-...
```

### Datos de Ejemplo Persistidos:

**limitsField1:**
- limit1: { lat: -34.712444, lng: -58.243586 }
- limit2: { lat: -34.707743, lng: -58.237085 }
- limit3: { lat: -34.701257, lng: -58.245205 }
- limit4: { lat: -34.706142, lng: -58.253289 }

**LimitsField2:**
- limit1: { lat: -34.702611, lng: -58.256803 }
- limit2: { lat: -34.698916, lng: -58.249276 }
- limit3: { lat: -34.701257, lng: -58.245205 }
- limit4: { lat: -34.706142, lng: -58.253289 }

---

## 🔄 Flujo de Datos

### Al iniciar el servidor:
1. `startServer()` se ejecuta
2. `seedSampleData()` crea el usuario demo
3. `ensureDefaultYards()` verifica e inserta los 2 campos predeterminados en `yards`
4. `refreshYardState()` carga los límites desde BD
5. `limitsField` en memoria contiene los datos de PostgreSQL

### Al hacer `GET /api/yards`:
1. `refreshYardState()` llama a `listYards()`
2. `listYards()` consulta la tabla `yards`
3. Convierte cada polígono a estructura de límites
4. Retorna JSON con los límites

---

## ✅ Ventajas de esta Implementación

- ✅ **Persistencia real**: Los límites se guardan en PostgreSQL, no en memoria
- ✅ **Escalable**: Permite múltiples usuarios y múltiples campos
- ✅ **Editable**: Futuros cambios de límites se guardarán en BD
- ✅ **Seguro**: Usa PostGIS para geometría espacial
- ✅ **Consistente**: Los datos persisten entre reinicios del servidor

---

## 🚀 Próximos Pasos (Point 2)

Point 2 implementará:
- Actualizar `devices.last_seen` en cada mensaje TCP
- Actualizar `devices.last_battery_level` en cada mensaje
- Mejores índices para queries de dispositivos

---

## 📝 Notas Técnicas

- Los polígonos se almacenan en formato WKT (Well-Known Text) usando PostGIS
- La función `ST_AsGeoJSON()` convierte automáticamente a GeoJSON para enviar al frontend
- El sistema es tolerante: si los yards ya existen, no los duplica
- Se usa transacciones SQL para garantizar integridad de datos
