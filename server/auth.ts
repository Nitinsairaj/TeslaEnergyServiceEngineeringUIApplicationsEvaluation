import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(nodeScrypt)
const HASH_PREFIX = 'scrypt'
const KEY_LENGTH = 64

export const SESSION_COOKIE_NAME = 'planner_session'
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30

export function createId(size = 18): string {
  return randomBytes(size).toString('base64url')
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function isValidPassword(password: string): boolean {
  return password.trim().length >= 8
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const derivedKey = (await scrypt(password, salt, KEY_LENGTH)) as Buffer
  return [HASH_PREFIX, salt, derivedKey.toString('hex')].join(':')
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [prefix, salt, hash] = storedHash.split(':')

  if (prefix !== HASH_PREFIX || !salt || !hash) {
    return false
  }

  const storedBuffer = Buffer.from(hash, 'hex')
  const candidateBuffer = (await scrypt(password, salt, storedBuffer.length)) as Buffer

  return storedBuffer.length === candidateBuffer.length && timingSafeEqual(storedBuffer, candidateBuffer)
}
