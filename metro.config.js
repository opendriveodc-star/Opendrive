const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

// Cho phép bundle file .html như asset (dùng cho qr-scanner offline)
config.resolver.assetExts.push('html')

module.exports = config
