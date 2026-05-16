// cloudflare-workers/create-wallet/index.ts
// Worker 1: POST /api/create-wallet
// Generate Stellar keypair, mã hóa private key, tạo ví có sponsored reserve bằng Fee-bump wallet, tặng 100 ODC

import { Keypair, Asset, TransactionBuilder, Operation, Networks, Server } from '@stellar/stellar-sdk'

interface WorkerEnv {
  MASTER_ENCRYPTION_KEY:      string
  STELLAR_ISSUER_PRIVATE_KEY: string
  STELLAR_ISSUER_ADDRESS:     string
  STELLAR_FEEBUMP_PRIVATE_KEY: string
  STELLAR_NETWORK:            string
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

// AES-256-GCM encryption sử dụng Web Crypto API (có sẵn trong Workers)
async function encryptPrivateKey(rawKey: string, masterKey: string): Promise<string> {
  const encoder   = new TextEncoder()
  const keyMat    = await crypto.subtle.importKey(
    'raw',
    encoder.encode(masterKey.slice(0, 32).padEnd(32, '0')),
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  )
  const iv         = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    keyMat,
    encoder.encode(rawKey),
  )
  // Gộp iv + ciphertext, encode base64
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(ciphertext), iv.byteLength)
  return btoa(String.fromCharCode(...combined))
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS })
    }
    if (request.method !== 'POST') {
      return json({ success: false, error: 'Method not allowed' }, 405)
    }

    let body: { uid?: string }
    try {
      body = await request.json()
    } catch {
      return json({ success: false, error: 'Invalid JSON' }, 400)
    }

    const { uid } = body
    if (!uid || typeof uid !== 'string') {
      return json({ success: false, error: 'Invalid UID', code: 'INVALID_UID' }, 400)
    }

    try {
      const isTestnet    = env.STELLAR_NETWORK !== 'mainnet'
      const networkPass  = isTestnet ? Networks.TESTNET : Networks.PUBLIC
      const horizonUrl   = isTestnet
        ? 'https://horizon-testnet.stellar.org'
        : 'https://horizon.stellar.org'

      const server         = new Server(horizonUrl)
      const issuerKeypair  = Keypair.fromSecret(env.STELLAR_ISSUER_PRIVATE_KEY)
      const sponsorKeypair = Keypair.fromSecret(env.STELLAR_FEEBUMP_PRIVATE_KEY)
      const newKeypair     = Keypair.random()
      const ODC_ASSET      = new Asset('ODC', env.STELLAR_ISSUER_ADDRESS)

      // Lấy issuer account để ký giao dịch và sponsor trả reserve XLM
      const issuerAccount = await server.loadAccount(issuerKeypair.publicKey())

      const tx = new TransactionBuilder(issuerAccount, {
        fee:              '100',
        networkPassphrase: networkPass,
      })
        // Sponsored reserve: fee-bump/sponsor wallet bảo trợ cho ví tài xế mới
        .addOperation(Operation.beginSponsoringFutureReserves({
          sponsoredId: newKeypair.publicKey(),
          source:      sponsorKeypair.publicKey(),
        }))
        // Tạo account mới dưới sponsor
        .addOperation(Operation.createAccount({
          destination:      newKeypair.publicKey(),
          startingBalance:  '0',
          source:           sponsorKeypair.publicKey(),
        }))
        // Thêm ODC trustline cho ví mới
        .addOperation(Operation.changeTrust({
          asset:  ODC_ASSET,
          source: newKeypair.publicKey(),
        }))
        .addOperation(Operation.endSponsoringFutureReserves({
          source: newKeypair.publicKey(),
        }))
        // Tặng 100 ODC signup bonus
        .addOperation(Operation.payment({
          destination: newKeypair.publicKey(),
          asset:       ODC_ASSET,
          amount:      '100',
        }))
        .setTimeout(60)
        .build()

      // Ký bởi Issuer, Sponsor và ví mới
      tx.sign(issuerKeypair, sponsorKeypair, newKeypair)
      await server.submitTransaction(tx)

      // Mã hóa private key
      const encryptedPrivateKey = await encryptPrivateKey(newKeypair.secret(), env.MASTER_ENCRYPTION_KEY)

      return json({
        success: true,
        data: {
          stellarWallet:       newKeypair.publicKey(),
          encryptedPrivateKey,
        },
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      return json({ success: false, error: msg }, 500)
    }
  },
}
