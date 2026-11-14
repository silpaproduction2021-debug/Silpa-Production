import http from 'node:http'
import crypto from 'node:crypto'
import path from 'node:path'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import pino from 'pino'
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from 'baileys'

const PORT = Number(process.env.PORT || 10000)
const AUTH_DIR = process.env.AUTH_DIR || '/var/data/auth'
const RECEIPTS_FILE = path.join(AUTH_DIR, 'delivery-receipts.json')
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || ''
const TARGET_GROUP_NAME = process.env.TARGET_GROUP_NAME || 'Silpa Production'
const TARGET_GROUP_JID = process.env.TARGET_GROUP_JID || ''
const logger = pino({ level: process.env.LOG_LEVEL || 'info' })

let sock
let authState
let connection = 'starting'
let groupReady = false
let targetGroupJid = ''
let lastError = ''
let reconnectTimer
let shuttingDown = false

const attempts = new Map()

function json(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  })
  res.end(payload)
}

function authorized(req) {
  if (ADMIN_TOKEN.length < 32) return false
  const header = req.headers.authorization || ''
  if (!header.startsWith('Bearer ')) return false
  const supplied = Buffer.from(header.slice(7))
  const expected = Buffer.from(ADMIN_TOKEN)
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected)
}

function rateLimited(req) {
  const key = req.socket.remoteAddress || 'unknown'
  const now = Date.now()
  const recent = (attempts.get(key) || []).filter((time) => now - time < 60_000)
  recent.push(now)
  attempts.set(key, recent)
  return recent.length > 30
}

async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 32_000) throw new Error('Request body too large')
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

async function readReceipts() {
  try {
    return JSON.parse(await readFile(RECEIPTS_FILE, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return {}
    throw error
  }
}

async function saveReceipts(receipts) {
  await mkdir(AUTH_DIR, { recursive: true })
  const temporary = RECEIPTS_FILE + '.tmp'
  await writeFile(temporary, JSON.stringify(receipts, null, 2), { mode: 0o600 })
  await rename(temporary, RECEIPTS_FILE)
}

function safeMessage(message) {
  if (typeof message !== 'string' || !message.trim() || message.length > 4000) {
    throw new Error('Message must contain 1-4000 characters')
  }
  if (/\b(?:NPR|USD|EUR|Rs\.?)\s*[\d,]+|\bbank account\b|\baccount number\b|\bpassword\b|\bapi.?key\b/i.test(message)) {
    throw new Error('Financial amounts and credentials are blocked')
  }
  return message.startsWith('[Silpa Assistant]') ? message : '[Silpa Assistant]\n' + message
}

async function resolveTargetGroup() {
  groupReady = false
  targetGroupJid = ''
  if (!sock || connection !== 'open') return

  const groups = Object.values(await sock.groupFetchAllParticipating())
  let matches

  if (TARGET_GROUP_JID) {
    matches = groups.filter((group) => group.id === TARGET_GROUP_JID && group.subject === TARGET_GROUP_NAME)
  } else {
    matches = groups.filter((group) => group.subject === TARGET_GROUP_NAME)
  }

  if (matches.length !== 1) {
    lastError = matches.length
      ? 'More than one group matches the configured name; set TARGET_GROUP_JID'
      : 'Configured WhatsApp group was not found'
    logger.warn({ matchCount: matches.length }, lastError)
    return
  }

  targetGroupJid = matches[0].id
  groupReady = true
  lastError = ''
  logger.info({ group: TARGET_GROUP_NAME }, 'Target group verified')
}

function scheduleReconnect() {
  if (shuttingDown || reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined
    startWhatsApp().catch((error) => {
      lastError = error.message
      logger.error({ err: error }, 'WhatsApp reconnect failed')
      scheduleReconnect()
    })
  }, 5000)
}

async function startWhatsApp() {
  await mkdir(AUTH_DIR, { recursive: true })
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
  authState = state
  const { version } = await fetchLatestBaileysVersion()

  sock = makeWASocket({
    version,
    auth: state,
    logger: logger.child({ component: 'baileys' }),
    browser: Browsers.macOS('Desktop'),
    printQRInTerminal: false,
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
  })

  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', async ({ connection: next, lastDisconnect }) => {
    if (next) connection = next

    if (next === 'open') {
      logger.info('WhatsApp session connected')
      await resolveTargetGroup().catch((error) => {
        lastError = error.message
        logger.error({ err: error }, 'Group verification failed')
      })
      return
    }

    if (next === 'close') {
      groupReady = false
      targetGroupJid = ''
      const statusCode = lastDisconnect?.error?.output?.statusCode
      if (statusCode === DisconnectReason.loggedOut) {
        connection = 'logged-out'
        lastError = 'WhatsApp session logged out; secure phone pairing is required'
        logger.error(lastError)
      } else {
        connection = 'reconnecting'
        scheduleReconnect()
      }
    }
  })
}

async function listGroups() {
  if (!sock || connection !== 'open') throw new Error('WhatsApp is not connected')
  const groups = Object.values(await sock.groupFetchAllParticipating())
  return groups.map((group) => ({
    id: group.id,
    subject: group.subject,
    participantCount: group.participants?.length || 0,
  }))
}

async function sendGroupUpdate(key, message) {
  if (typeof key !== 'string' || !/^[a-zA-Z0-9-]{8,120}$/.test(key)) {
    throw new Error('Invalid idempotency key')
  }
  if (!sock || connection !== 'open' || !groupReady || !targetGroupJid) {
    return { success: false, status: 'whatsapp-disconnected' }
  }

  const receipts = await readReceipts()
  const id = 'ops-' + key
  if (receipts[id]) {
    return {
      success: receipts[id].status === 'sent',
      alreadyTracked: true,
      status: receipts[id].status,
    }
  }

  const text = safeMessage(message)
  receipts[id] = { status: 'sending', attemptedAt: new Date().toISOString() }
  await saveReceipts(receipts)

  try {
    const result = await sock.sendMessage(targetGroupJid, { text })
    receipts[id] = {
      status: 'sent',
      attemptedAt: receipts[id].attemptedAt,
      sentAt: new Date().toISOString(),
      messageId: result?.key?.id || null,
    }
    await saveReceipts(receipts)
    return { success: true, status: 'sent', group: TARGET_GROUP_NAME }
  } catch (error) {
    receipts[id] = {
      status: 'uncertain',
      attemptedAt: receipts[id].attemptedAt,
      failedAt: new Date().toISOString(),
    }
    await saveReceipts(receipts)
    logger.error({ err: error }, 'Group send returned an uncertain result')
    return {
      success: false,
      status: 'uncertain',
      note: 'Do not retry this update with a new key',
    }
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost')

    if (req.method === 'GET' && url.pathname === '/health') {
      return json(res, 200, {
        ok: true,
        connection,
        paired: Boolean(authState?.creds?.registered),
        groupReady,
        groupName: TARGET_GROUP_NAME,
        lastError: lastError || null,
      })
    }

    if (url.pathname.startsWith('/admin/')) {
      if (rateLimited(req)) return json(res, 429, { error: 'Too many requests' })
      if (!authorized(req)) return json(res, 401, { error: 'Unauthorized' })
    }

    if (req.method === 'POST' && url.pathname === '/admin/pairing-code') {
      if (!sock || !authState) return json(res, 503, { error: 'WhatsApp is starting' })
      if (authState.creds.registered) return json(res, 409, { error: 'Already paired' })
      const { phoneNumber } = await readBody(req)
      const number = String(phoneNumber || '').replace(/\D/g, '')
      if (!/^\d{8,15}$/.test(number)) return json(res, 400, { error: 'Invalid phone number' })
      const code = await sock.requestPairingCode(number)
      return json(res, 200, { pairingCode: code })
    }

    if (req.method === 'GET' && url.pathname === '/admin/groups') {
      return json(res, 200, { groups: await listGroups() })
    }

    if (req.method === 'POST' && url.pathname === '/admin/refresh-group') {
      await resolveTargetGroup()
      return json(res, groupReady ? 200 : 409, { groupReady, groupName: TARGET_GROUP_NAME, lastError })
    }

    if (req.method === 'POST' && url.pathname === '/admin/send') {
      const { key, message } = await readBody(req)
      const result = await sendGroupUpdate(key, message)
      return json(res, result.success ? 200 : 409, result)
    }

    return json(res, 404, { error: 'Not found' })
  } catch (error) {
    logger.error({ err: error }, 'Request failed')
    return json(res, 400, { error: error.message })
  }
})

server.listen(PORT, '0.0.0.0', () => {
  logger.info({ port: PORT }, 'Silpa WhatsApp cloud bridge listening')
  startWhatsApp().catch((error) => {
    lastError = error.message
    connection = 'error'
    logger.error({ err: error }, 'WhatsApp startup failed')
    scheduleReconnect()
  })
})

async function shutdown(signal) {
  shuttingDown = true
  if (reconnectTimer) clearTimeout(reconnectTimer)
  logger.info({ signal }, 'Shutting down')
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
