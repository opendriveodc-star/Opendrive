// src/utils/nanoid.ts
// Tạo random ID 21 ký tự alphanumeric – dùng làm tripId

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const SIZE = 21

export function nanoid(): string {
  let id = ''
  // Dùng crypto nếu có (React Native 0.73+ hỗ trợ)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(SIZE)
    crypto.getRandomValues(bytes)
    for (let i = 0; i < SIZE; i++) {
      id += ALPHABET[bytes[i] % ALPHABET.length]
    }
  } else {
    for (let i = 0; i < SIZE; i++) {
      id += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
    }
  }
  return id
}
