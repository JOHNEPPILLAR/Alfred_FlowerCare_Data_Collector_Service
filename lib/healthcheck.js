/**
 * Import external libraries
 */
require('dotenv').config();
const rp = require('request-promise');
const logger = require('pino')();

const options = {
  method: 'GET',
  uri: `https://localhost:${process.env.Port}/ping`,
  json: true,
  agentOptions: {
    rejectUnauthorized: false,
  },
  headers: {
    'Client-Access-Key': process.env.ClientAccessKey,
  },
};

async function pingApp() {
  try {
    await rp(options);
    process.exit(0);
  } catch (err) {
    logger.info(err.message);
    process.exit(1);
  }
}

pingApp();
