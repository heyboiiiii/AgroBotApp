import { createServer } from 'http'
import { createServer as createNetServer } from 'net'

const HTTP_PORT = process.env.PORT ? Number(process.env.PORT) : 4000
const TCP_PORT = process.env.TCP_PORT ? Number(process.env.TCP_PORT) : 4001

let cows = [
  {
    id: '01',
    name: 'Lora',
    lat: -34.707652,
    lng: -58.242300,
    temp: '38.4',
    hb: '72',
  },
  {
    id: '02',
    name: 'Lola',
    lat: -34.707546,
    lng: -58.239348,
    temp: '38.1',
    hb: '68',
  },
  {
    id: '03',
    name: 'Luna',
    lat: -34.709948,
    lng: -58.242870,
    temp: '38.7',
    hb: '75',
  },
]

let limitsField = {
  limitsField1: {
    limit1: { lat: -34.712444, lng: -58.243586 },
    limit2: { lat: -34.707743, lng: -58.237085 },
    limit3: { lat: -34.701257, lng: -58.245205 },
    limit4: { lat: -34.706142, lng: -58.253289 },
  },
  LimitsField2: {
    limit1: { lat: -34.702611, lng: -58.256803 },
    limit2: { lat: -34.698916, lng: -58.249276 },
    limit3: { lat: -34.701257, lng: -58.245205 },
    limit4: { lat: -34.706142, lng: -58.253289 },
  },
}

//
function normalizeCowPayload(raw) {
  if (!raw || typeof raw !== 'object') return null

  const id = String(raw.ID ?? raw.id ?? raw.Id ?? raw.iD ?? raw.name ?? '').trim()
  const lat = Number(raw.LAT ?? raw.lat ?? raw.latitude ?? raw.Lat ?? raw.Latitude)
  const lng = Number(raw.LONG ?? raw.long ?? raw.longitude ?? raw.Long ?? raw.Longitude)
  const temp = raw.TEMP ?? raw.temp ?? raw.temperature ?? raw.Temperature ?? ''
  const hb = raw.HB ?? raw.hb ?? raw.HeartBeat ?? raw.hbRate ?? raw.heartBeat ?? ''

  if (!id || Number.isNaN(lat) || Number.isNaN(lng)) {
    return null
  }

  return {
    id,
    name: raw.NAME ?? raw.name ?? `Cow ${id}`,
    lat,
    lng,
    temp: String(temp),
    hb: String(hb),
  }
}

//
function mergeCowData(newCow) {
  const existingIndex = cows.findIndex((cow) => cow.id === newCow.id)
  if (existingIndex >= 0) {
    cows[existingIndex] = { ...cows[existingIndex], ...newCow }
  } else {
    cows.push(newCow)
  }
}

//
function normalizeLimitsField(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null

  const normalized = {}

  Object.entries(raw).forEach(([fieldName, fieldValue]) => {
    if (!fieldValue || typeof fieldValue !== 'object' || Array.isArray(fieldValue)) return

    const points = {}

    Object.entries(fieldValue).forEach(([limitName, point]) => {
      if (!point || typeof point !== 'object' || Array.isArray(point)) return

      const lat = Number(point.lat ?? point.LAT ?? point.latitude ?? point.Latitude)
      const lng = Number(point.lng ?? point.LNG ?? point.long ?? point.LONG ?? point.longitude ?? point.Longitude)

      if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
        points[limitName] = { lat, lng }
      }
    })

    if (Object.keys(points).length > 0) {
      normalized[fieldName] = points
    }
  })

  return Object.keys(normalized).length > 0 ? normalized : null
}

//
function mergeLimitsField(newLimits) {
  if (!newLimits || typeof newLimits !== 'object' || Array.isArray(newLimits)) return

  Object.entries(newLimits).forEach(([fieldName, fieldValue]) => {
    if (fieldValue && typeof fieldValue === 'object' && !Array.isArray(fieldValue)) {
      limitsField[fieldName] = fieldValue
    }
  })
}

//
function extractJsonObjects(value) {
  const jsonObjects = []
  let buffer = ''
  let depth = 0
  let inString = false
  let escape = false

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i]
    buffer += char

    if (escape) {
      escape = false
      continue
    }

    if (char === '\\') {
      escape = true
      continue
    }

    if (char === '"') {
      inString = !inString
      continue
    }

    if (inString) {
      continue
    }

    if (char === '{') {
      depth += 1
    }
    if (char === '}') {
      depth -= 1
    }

    if (depth === 0 && buffer.trim()) {
      jsonObjects.push(buffer.trim())
      buffer = ''
    }
  }

  if (buffer.trim()) {
    jsonObjects.push(buffer.trim())
  }

  return jsonObjects
}

function handleIncomingData(rawData) {
  const text = rawData.toString('utf8')
  if (!text || (!text.includes('{') && !text.includes('['))) return
  if (/^(GET|POST|HEAD|PUT|DELETE|OPTIONS|CONNECT|TRACE)\s+/i.test(text)) return

  const chunks = extractJsonObjects(text)
  chunks.forEach((chunk) => {
    try {
      const parsed = JSON.parse(chunk)
      if (Array.isArray(parsed)) {
        parsed.forEach((item) => {
          const cow = normalizeCowPayload(item)
          if (cow) mergeCowData(cow)
        })
      } else {
        const cow = normalizeCowPayload(parsed)
        if (cow) mergeCowData(cow)

        if (parsed && typeof parsed === 'object' && parsed.limitsField) {
          const normalizedLimits = normalizeLimitsField(parsed.limitsField)
          if (normalizedLimits) {
            mergeLimitsField(normalizedLimits)
          }
        }
      }
    } catch (jsonError) {
      console.warn('Could not parse incoming payload:', chunk)
    }
  })
}

function createTcpServer() {
  const server = createNetServer((socket) => {
    console.log('TCP client connected from', `${socket.remoteAddress}:${socket.remotePort}`)
    socket.setEncoding('utf8')

    socket.on('data', (data) => {
      const text = data.toString('utf8')
      if (!text.includes('{') && !text.includes('[')) {
        return
      }
      console.log('Received socket JSON data:', text.trim())
      handleIncomingData(data)
    })

    socket.on('end', () => {
      console.log('TCP client disconnected')
    })

    socket.on('error', (err) => {
      console.error('TCP socket error:', err.message)
    })
  })

  server.on('error', (err) => {
    console.error('TCP server error:', err.message)
  })

  server.listen(TCP_PORT, () => {
    console.log(`TCP socket server listening on port ${TCP_PORT}`)
  })
}

function createHttpServer() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`)

    if (req.method === 'GET' && url.pathname === '/cows') {
      const payload = JSON.stringify({ cows, limitsField })
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      })
      res.end(payload)
      return
    }

    if (req.method === 'GET' && url.pathname === '/status') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      })
      res.end(JSON.stringify({ status: 'ok', cows: cows.length }))
      return
    }

    if (req.method === 'POST' && url.pathname === '/cows/rename') {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk.toString()
      })

      req.on('end', () => {
        try {
          const payload = JSON.parse(body)
          const cowId = String(payload?.id ?? '').trim()
          const newName = String(payload?.name ?? '').trim()

          if (!cowId || !newName) {
            res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
            res.end(JSON.stringify({ status: 'error', message: 'Missing id or name' }))
            return
          }

          const foundCow = cows.find((cow) => cow.id === cowId)
          if (!foundCow) {
            res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
            res.end(JSON.stringify({ status: 'error', message: 'Cow not found' }))
            return
          }

          foundCow.name = newName
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          })
          res.end(JSON.stringify({ status: 'ok', id: cowId, name: newName }))
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
          res.end(JSON.stringify({ status: 'error', message: 'Invalid JSON body' }))
        }
      })
      return
    }

    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found' }))
  })

  server.listen(HTTP_PORT, () => {
    console.log(`HTTP server listening on port ${HTTP_PORT}`)
    console.log(`GET /cows returns ${cows.length} simulated cow entries`)
  })
}

function randomOffset(value, maxDelta) {
  return value + (Math.random() * 2 - 1) * maxDelta
}

function simulateCowMovement() {
  cows = cows.map((cow) => ({
    ...cow,
    lat: Number(randomOffset(cow.lat, 0.00055).toFixed(6)),
    lng: Number(randomOffset(cow.lng, 0.00055).toFixed(6)),
    temp: (37.8 + Math.random() * 1.2).toFixed(1),
    hb: String(65 + Math.round(Math.random() * 15)),
  }))
}

createHttpServer()
createTcpServer()
setInterval(simulateCowMovement, 15000)
console.log('Backend server started with simulated cow data. Use a TCP socket to send JSON updates to port', TCP_PORT)
