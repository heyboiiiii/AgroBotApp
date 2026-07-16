import { createServer } from 'http'
import { createServer as createNetServer } from 'net'

const HTTP_PORT = process.env.PORT ? Number(process.env.PORT) : 4000
const TCP_PORT = process.env.TCP_PORT ? Number(process.env.TCP_PORT) : 4001

let cows = [
  {
    id: '1',
    name: 'Cow 1',
    lat: -34.748720129467664, 
    lng: -58.26610154519363,
    temp: '38.4',
    hb: '72',
  },
  {
    id: '2',
    name: 'Cow 2',
    lat: -34.748968900209654, 
    lng: -58.265264318229406,
    temp: '38.1',
    hb: '68',
  },
  {
    id: '3',
    name: 'Cow 3',
    lat: -34.749566104573326,
    lng:  -58.265894458076446,
    temp: '38.7',
    hb: '75',
  },
]

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

function mergeCowData(newCow) {
  const existingIndex = cows.findIndex((cow) => cow.id === newCow.id)
  if (existingIndex >= 0) {
    cows[existingIndex] = { ...cows[existingIndex], ...newCow }
  } else {
    cows.push(newCow)
  }
}

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
      const payload = JSON.stringify(cows)
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
