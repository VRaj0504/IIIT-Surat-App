const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const escapedDirname = __dirname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : [config.resolver.blockList]
  ).filter(Boolean),
  new RegExp(`^${escapedDirname}/functions/.*`),
];

module.exports = config;
