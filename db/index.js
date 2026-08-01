import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { Pool } from 'pg'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DEMO_EMAIL = 'demo@agronomad.app'

let pool
let initialized = false

function escapeSqlLiteral(value) {
  if (value === null || typeof value === 'undefined') return 'NULL'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return `'${String(value).replace(/'/g, "''")}'`
}

function splitSqlStatements(sql) {
  return sql
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean)
}

function getSslConfig() {
  const sslMode = process.env.PGSSLMODE || process.env.PGSSL || ''

  if (!sslMode) return false
  if (sslMode === 'disable') return false

  return { rejectUnauthorized: false }
}

function getPoolConfig() {
  const databaseUrl = process.env.DATABASE_URL?.trim()

  if (databaseUrl) {
    return {
      connectionString: databaseUrl,
      ssl: getSslConfig(),
      max: Number(process.env.PGPOOL_MAX || 10),
      idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
      connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 10000),
    }
  }

  return {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || 'agronomad',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    ssl: getSslConfig(),
    max: Number(process.env.PGPOOL_MAX || 10),
    idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
    connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 10000),
  }
}

export function getDb() {
  if (!pool) {
    pool = new Pool(getPoolConfig())
  }

  return pool
}

export async function testConnection() {
  const client = await getDb().connect()
  try {
    const result = await client.query('SELECT NOW() as now')
    return result.rows[0]
  } finally {
    client.release()
  }
}

export async function initializeDatabase() {
  if (initialized) return getDb()

  const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
  const client = await getDb().connect()

  try {
    await client.query('BEGIN')
    for (const statement of splitSqlStatements(schemaSql)) {
      await client.query(statement)
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }

  initialized = true
  return getDb()
}

async function getDemoUserId(client) {
  const existingUser = await client.query(
    'SELECT id FROM users WHERE email = $1',
    [DEMO_EMAIL]
  )

  if (existingUser.rows.length > 0) {
    return existingUser.rows[0].id
  }

  const insertedUser = await client.query(
    `INSERT INTO users (name, email, phone, password_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    ['Demo User', DEMO_EMAIL, '+54 11 5555 0000', 'hashed-demo-password']
  )

  return insertedUser.rows[0].id
}

export async function seedSampleData() {
  await initializeDatabase()
  const client = await getDb().connect()

  try {
    const userId = await getDemoUserId(client)

    const existingYard = await client.query('SELECT id FROM yards WHERE user_id = $1 LIMIT 1', [userId])
    let yardId

    if (existingYard.rows.length > 0) {
      yardId = existingYard.rows[0].id
    } else {
      const yardInsert = await client.query(
        `INSERT INTO yards (user_id, name, boundary)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [userId, 'Campo Norte', 'POLYGON((-58.253289 -34.712444, -58.237085 -34.707743, -58.245205 -34.701257, -58.253289 -34.706142, -58.253289 -34.712444))']
      )
      yardId = yardInsert.rows[0].id
    }

    const sampleAnimals = [
      { name: 'Lora', animalType: 'cow', deviceUid: 'COLLAR-01', lat: -34.707652, lng: -58.242300, temp: '38.4', hb: '72' },
      { name: 'Lola', animalType: 'cow', deviceUid: 'COLLAR-02', lat: -34.707546, lng: -58.239348, temp: '38.1', hb: '68' },
      { name: 'Luna', animalType: 'cow', deviceUid: 'COLLAR-03', lat: -34.709948, lng: -58.242870, temp: '38.7', hb: '75' },
    ]

    for (const animal of sampleAnimals) {
      const existingAnimal = await client.query(
        `SELECT a.id
         FROM animals a
         JOIN animal_devices ad ON ad.animal_id = a.id
         JOIN devices d ON d.id = ad.device_id
         WHERE a.user_id = $1 AND d.device_uid = $2
         LIMIT 1`,
        [userId, animal.deviceUid]
      )

      if (existingAnimal.rows.length > 0) {
        continue
      }

      const animalInsert = await client.query(
        `INSERT INTO animals (user_id, yard_id, name, animal_type)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [userId, yardId, animal.name, animal.animalType]
      )
      const animalId = animalInsert.rows[0].id

      const deviceInsert = await client.query(
        `INSERT INTO devices (device_uid, hardware_version, firmware_version, last_battery_level, last_seen)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         RETURNING id`,
        [animal.deviceUid, 'v1.0', '1.2.3', '87%']
      )
      const deviceId = deviceInsert.rows[0].id

      await client.query(
        `INSERT INTO animal_devices (animal_id, device_id)
         VALUES ($1, $2)`,
        [animalId, deviceId]
      )

      await client.query(
        `INSERT INTO gps_positions (animal_id, device_id, timestamp, latitude, longitude, temperature, heartbeat, speed, accuracy)
         VALUES ($1, $2, CURRENT_TIMESTAMP, $3, $4, $5, $6, $7, $8)`,
        [animalId, deviceId, animal.lat, animal.lng, animal.temp, animal.hb, 1.1, 2.5]
      )

      await client.query(
        `INSERT INTO animal_daily_statistics (animal_id, date, distance_travelled, movement_time, sleep_time)
         VALUES ($1, CURRENT_DATE, $2, $3, $4)`,
        [animalId, 4 + Math.random() * 2, 6 + Math.random() * 3, 18 + Math.random() * 2]
      )
    }

    return { userId }
  } finally {
    client.release()
  }
}

export async function listAnimals() {
  await initializeDatabase()
  const client = await getDb().connect()

  try {
    const userId = await getDemoUserId(client)
    const result = await client.query(
      `SELECT a.id, a.name, a.animal_type, d.device_uid
       FROM animals a
       LEFT JOIN animal_devices ad ON ad.animal_id = a.id AND ad.unassigned_at IS NULL
       LEFT JOIN devices d ON d.id = ad.device_id
       WHERE a.user_id = $1
       ORDER BY a.id`,
      [userId]
    )

    const animals = []
    for (const row of result.rows) {
      const latestGpsResult = await client.query(
        `SELECT latitude, longitude, temperature, heartbeat
         FROM gps_positions
         WHERE animal_id = $1
         ORDER BY timestamp DESC
         LIMIT 1`,
        [row.id]
      )
      const latest = latestGpsResult.rows[0] || {}

      animals.push({
        id: String(row.device_uid || row.id),
        name: row.name,
        lat: Number(latest.latitude ?? 0),
        lng: Number(latest.longitude ?? 0),
        temp: String(latest.temperature ?? ''),
        hb: String(latest.heartbeat ?? ''),
      })
    }

    return animals
  } finally {
    client.release()
  }
}

export async function upsertCowSnapshot(payload) {
  await initializeDatabase()
  const client = await getDb().connect()

  try {
    const userId = await getDemoUserId(client)
    const id = String(payload.ID ?? payload.id ?? payload.Id ?? '').trim()
    const name = String(payload.NAME ?? payload.name ?? `Cow ${id}`).trim()
    const lat = Number(payload.LAT ?? payload.lat ?? payload.latitude ?? payload.Latitude)
    const lng = Number(payload.LONG ?? payload.long ?? payload.longitude ?? payload.Longitude)
    const temp = String(payload.TEMP ?? payload.temp ?? payload.temperature ?? payload.Temperature ?? '')
    const hb = String(payload.HB ?? payload.hb ?? payload.HeartBeat ?? payload.hbRate ?? payload.heartBeat ?? '')

    if (!id || Number.isNaN(lat) || Number.isNaN(lng)) {
      return null
    }

    const animalLookup = await client.query(
      `SELECT a.id
       FROM animals a
       JOIN animal_devices ad ON ad.animal_id = a.id
       JOIN devices d ON d.id = ad.device_id
       WHERE a.user_id = $1 AND d.device_uid = $2
       LIMIT 1`,
      [userId, id]
    )

    let animalId
    let deviceId

    if (animalLookup.rows.length > 0) {
      animalId = animalLookup.rows[0].id
      const deviceLookup = await client.query(
        'SELECT d.id FROM devices d WHERE d.device_uid = $1 LIMIT 1',
        [id]
      )
      deviceId = deviceLookup.rows[0]?.id
    } else {
      const insertedAnimal = await client.query(
        `INSERT INTO animals (user_id, yard_id, name, animal_type)
         VALUES ($1, (SELECT id FROM yards WHERE user_id = $1 LIMIT 1), $2, $3)
         RETURNING id`,
        [userId, name, 'cow']
      )
      animalId = insertedAnimal.rows[0].id

      const insertedDevice = await client.query(
        `INSERT INTO devices (device_uid, hardware_version, firmware_version, last_battery_level, last_seen)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         RETURNING id`,
        [id, 'v1.0', '1.2.3', '87%']
      )
      deviceId = insertedDevice.rows[0].id

      await client.query(
        `INSERT INTO animal_devices (animal_id, device_id)
         VALUES ($1, $2)`,
        [animalId, deviceId]
      )
    }

    await client.query('UPDATE animals SET name = $1 WHERE id = $2', [name, animalId])

    await client.query(
      `INSERT INTO gps_positions (animal_id, device_id, timestamp, latitude, longitude, temperature, heartbeat, speed, accuracy)
       VALUES ($1, $2, CURRENT_TIMESTAMP, $3, $4, $5, $6, $7, $8)`,
      [animalId, deviceId, lat, lng, temp, hb, 1.1, 2.5]
    )

    return { id, name, lat, lng, temp, hb }
  } finally {
    client.release()
  }
}

export async function renameAnimal(id, newName) {
  await initializeDatabase()
  const client = await getDb().connect()

  try {
    const userId = await getDemoUserId(client)
    const animalResult = await client.query(
      `SELECT a.id
       FROM animals a
       LEFT JOIN animal_devices ad ON ad.animal_id = a.id AND ad.unassigned_at IS NULL
       LEFT JOIN devices d ON d.id = ad.device_id
       WHERE a.user_id = $1 AND (a.id = $2 OR d.device_uid = $3)
       LIMIT 1`,
      [userId, Number(id), String(id)]
    )

    if (animalResult.rows.length === 0) {
      return null
    }

    await client.query('UPDATE animals SET name = $1 WHERE id = $2', [newName, animalResult.rows[0].id])
    return { id, name: newName }
  } finally {
    client.release()
  }
}
