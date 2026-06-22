// api/backup/run.js
import crypto from 'crypto'

const PB_URL = 'https://fieldtrack-kenya.fly.dev'

async function pbAdminToken() {
  const r = await fetch(`${PB_URL}/api/admins/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identity: process.env.PB_ADMIN_EMAIL,
      password: process.env.PB_ADMIN_PASSWORD,
    }),
  })
  if (!r.ok) {
    const txt = await r.text()
    throw new Error(`PocketBase auth failed: ${r.status} ${txt}`)
  }
  const data = await r.json()
  return data.token
}

async function triggerPbBackup(token) {
  const name = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`
  const r = await fetch(`${PB_URL}/api/backups`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token,
    },
    body: JSON.stringify({ name }),
  })
  if (!r.ok) {
    const txt = await r.text()
    throw new Error(`PocketBase backup creation failed: ${r.status} ${txt}`)
  }
  return name
}

async function downloadPbBackup(token, name) {
  const r = await fetch(
    `${PB_URL}/api/backups/${encodeURIComponent(name)}?token=${token}`,
  )
  if (!r.ok) throw new Error(`PocketBase backup download failed: ${r.status}`)
  const buffer = await r.arrayBuffer()
  return Buffer.from(buffer)
}

function sign(key, msg) {
  return crypto.createHmac('sha256', key).update(msg).digest()
}

function getSigningKey(secret, date, region, service) {
  const kDate    = sign('AWS4' + secret, date)
  const kRegion  = sign(kDate, region)
  const kService = sign(kRegion, service)
  const kSigning = sign(kService, 'aws4_request')
  return kSigning
}

function sha256hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex')
}

function b2Endpoint() {
  return `https://s3.us-east-005.backblazeb2.com`
}

async function b2Upload(fileBuffer, fileName) {
  const bucket  = process.env.BACKBLAZE_BUCKET_NAME
  const keyId   = process.env.BACKBLAZE_KEY_ID
  const appKey  = process.env.BACKBLAZE_APP_KEY
  const region  = 'us-east-005'
  const service = 's3'
  const host    = `s3.us-east-005.backblazeb2.com`

  const now         = new Date()
  const amzDate     = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z'
  const dateStamp   = amzDate.slice(0, 8)
  const payloadHash = sha256hex(fileBuffer)

  const canonicalHeaders =
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`

  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'

  const canonicalRequest = [
    'PUT',
    `/${bucket}/${fileName}`,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256hex(canonicalRequest),
  ].join('\n')

  const signingKey = getSigningKey(appKey, dateStamp, region, service)
  const signature  = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex')

  const authHeader =
    `AWS4-HMAC-SHA256 Credential=${keyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`

  const r = await fetch(`${b2Endpoint()}/${bucket}/${fileName}`, {
    method: 'PUT',
    headers: {
      'Authorization':        authHeader,
      'Content-Type':         'application/zip',
      'Content-Length':       String(fileBuffer.length),
      'x-amz-date':           amzDate,
      'x-amz-content-sha256': payloadHash,
    },
    body: fileBuffer,
  })

  if (!r.ok) {
    const txt = await r.text()
    throw new Error(`B2 upload failed: ${r.status} ${txt}`)
  }
  return fileName
}

async function b2ListBackups() {
  const bucket  = process.env.BACKBLAZE_BUCKET_NAME
  const keyId   = process.env.BACKBLAZE_KEY_ID
  const appKey  = process.env.BACKBLAZE_APP_KEY
  const region  = 'us-east-005'
  const service = 's3'
  const host    = `s3.us-east-005.backblazeb2.com`

  const now       = new Date()
  const amzDate   = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z'
  const dateStamp = amzDate.slice(0, 8)
  const payload   = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

  const canonicalHeaders =
    `host:${host}\n` +
    `x-amz-content-sha256:${payload}\n` +
    `x-amz-date:${amzDate}\n`

  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'

  const canonicalRequest = [
    'GET',
    `/${bucket}`,
    'list-type=2&prefix=backup-',
    canonicalHeaders,
    signedHeaders,
    payload,
  ].join('\n')

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256hex(canonicalRequest),
  ].join('\n')

  const signingKey = getSigningKey(appKey, dateStamp, region, service)
  const signature  = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex')

  const authHeader =
    `AWS4-HMAC-SHA256 Credential=${keyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`

  const r = await fetch(
    `${b2Endpoint()}/${bucket}?list-type=2&prefix=backup-`,
    {
      headers: {
        'Authorization':        authHeader,
        'x-amz-date':           amzDate,
        'x-amz-content-sha256': payload,
      },
    },
  )
  if (!r.ok) return []
  const xml = await r.text()
  const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map(m => m[1])
  return keys
}

async function b2Delete(fileName) {
  const bucket  = process.env.BACKBLAZE_BUCKET_NAME
  const keyId   = process.env.BACKBLAZE_KEY_ID
  const appKey  = process.env.BACKBLAZE_APP_KEY
  const region  = 'us-east-005'
  const service = 's3'
  const host    = `s3.us-east-005.backblazeb2.com`

  const now       = new Date()
  const amzDate   = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z'
  const dateStamp = amzDate.slice(0, 8)
  const payload   = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

  const canonicalHeaders =
    `host:${host}\n` +
    `x-amz-content-sha256:${payload}\n` +
    `x-amz-date:${amzDate}\n`

  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'

  const canonicalRequest = [
    'DELETE',
    `/${bucket}/${fileName}`,
    '',
    canonicalHeaders,
    signedHeaders,
    payload,
  ].join('\n')

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256hex(canonicalRequest),
  ].join('\n')

  const signingKey = getSigningKey(appKey, dateStamp, region, service)
  const signature  = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex')

  const authHeader =
    `AWS4-HMAC-SHA256 Credential=${keyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`

  await fetch(`${b2Endpoint()}/${bucket}/${fileName}`, {
    method: 'DELETE',
    headers: {
      'Authorization':        authHeader,
      'x-amz-date':           amzDate,
      'x-amz-content-sha256': payload,
    },
  })
}

export default async function handler(req, res) {
  const authHeader = req.headers['authorization']
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const log   = []
  const start = Date.now()

  try {
    log.push('Authenticating with PocketBase...')
    const token = await pbAdminToken()
    log.push('PocketBase auth OK')

    log.push('Creating PocketBase backup...')
    const backupName = await triggerPbBackup(token)
    log.push(`Backup created: ${backupName}`)

    await new Promise(r => setTimeout(r, 5000))

    log.push('Downloading backup ZIP...')
    const buffer = await downloadPbBackup(token, backupName)
    const sizeMB = (buffer.length / 1024 / 1024).toFixed(2)
    log.push(`Downloaded ${sizeMB} MB`)

    log.push('Uploading to Backblaze B2...')
    await b2Upload(buffer, backupName)
    log.push(`Uploaded to B2: ${backupName}`)

    log.push('Cleaning up old backups...')
    const allKeys = await b2ListBackups()
    const cutoff  = Date.now() - 30 * 24 * 60 * 60 * 1000
    let deleted   = 0
    for (const key of allKeys) {
      const dateStr = key
        .replace('backup-', '')
        .replace('.zip', '')
        .replace(/(-\d{3}Z)$/, '.000Z')
        .replace(/-(?=\d{2}:)/g, ':')
      const ts = new Date(dateStr).getTime()
      if (!isNaN(ts) && ts < cutoff) {
        await b2Delete(key)
        deleted++
      }
    }
    log.push(`Cleanup done - deleted ${deleted} old backup(s)`)

    const elapsed = ((Date.now() - start) / 1000).toFixed(1)
    log.push(`BACKUP COMPLETE in ${elapsed}s - ${sizeMB} MB uploaded to B2`)

    return res.status(200).json({
      success: true,
      backup:  backupName,
      sizeMB,
      deleted,
      elapsed,
      log,
    })

  } catch (err) {
    console.error('[backup] FAILED:', err.message)
    log.push(`ERROR: ${err.message}`)
    return res.status(500).json({
      success: false,
      error:   err.message,
      log,
    })
  }
}