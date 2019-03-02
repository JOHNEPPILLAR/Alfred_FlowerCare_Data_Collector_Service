/**
 * Import external libraries
 */
const pino = require('pino');
const rp = require('request-promise');
const os = require('os');

/**
 * Setup logger
 */
async function log(type, functionName, message) {
  let logger;
  if (process.env.Environment === 'dev') {
    logger = pino({
      level: 'trace',
      prettyPrint: {
        levelFirst: true,
      },
    });
  } else {
    logger = pino();
  }
  switch (type) {
    case 'info':
      logger.info(`${functionName} - ${message}`);
      break;
    case 'trace':
      logger.trace(`${functionName} - ${message}`);
      break;
    case 'debug':
      logger.trace(`${functionName} - ${message}`);
      break;
    case 'warn':
      logger.info(`${functionName} - ${message}`);
      break;
    case 'error':
      logger.error(`${functionName} - ${message}`);
      break;
    case 'fatal':
      logger.fatal(`${message}`);
      break;
    default:
      logger.info(`${message}`);
      break;
  }
}
exports.log = (type, functionName, message) => {
  log(type, functionName, message);
};

/**
 * Call another Alfred service with PUT
 */
async function callAlfredServicePut(apiURL, body, retryCounter) {
  const options = {
    method: 'PUT',
    uri: apiURL,
    json: true,
    agentOptions: {
      rejectUnauthorized: false,
    },
    headers: {
      'Client-Access-Key': process.env.ClientAccessKey,
      'Instance-Trace-ID': global.instanceTraceID,
      'Call-Trace-ID': global.callTraceID,
    },
    body,
  };

  try {
    return await rp(options);
  } catch (err) {
    const errorCode = err.cause.code;
    let retryCount = retryCounter || 0;
    if (errorCode === 'ECONNREFUSED') {
      log('error', 'callAlfredServicePut', `Can not connect to ${apiURL}: ${err.message}`);
      log('error', 'callAlfredServicePut', `Waiting 1 minute before retrying. Attempt: ${retryCount}`);
      retryCount += 1;
      setTimeout(() => {
        callAlfredServicePut(apiURL, body, retryCount);
      }, 60000); // 1 minute delay before re-tyring
    }
    return err;
  }
}
exports.callAlfredServicePut = async (apiURL, body) => {
  const apiResponse = await callAlfredServicePut(apiURL, body, 0);
  return apiResponse;
};

/**
 * Call another Alfred service with Get
 */
async function callAlfredServiceGet(apiURL, retryCounter, noRetry) {
  const options = {
    method: 'GET',
    uri: apiURL,
    json: true,
    agentOptions: {
      rejectUnauthorized: false,
    },
    headers: {
      'Client-Access-Key': process.env.ClientAccessKey,
      'Instance-Trace-ID': global.instanceTraceID,
      'Call-Trace-ID': global.callTraceID,
    },
  };

  try {
    return await rp(options);
  } catch (err) {
    if (noRetry) {
      log('error', 'callAlfredServiceGet', err.message);
      return err;
    }
    const errorCode = err.cause.code;
    let retryCount = retryCounter || 0;
    if (errorCode === 'ECONNREFUSED') {
      log('error', 'callAlfredServiceGet', `Can not connect to ${apiURL}: ${err.message}`);
      log('error', 'callAlfredServiceGet', `Waiting 1 minute before retrying. Attempt: ${retryCount}`);
      retryCount += 1;
      setTimeout(() => {
        callAlfredServiceGet(apiURL, retryCount);
      }, 60000); // 1 minute delay before re-tyring
    }
    return err;
  }
}
exports.callAlfredServiceGet = async (apiURL, noRetry) => {
  const apiResponse = await callAlfredServiceGet(apiURL, 0, noRetry);
  return apiResponse;
};

/**
 * Call 3rd party API with PUT
 */
async function callAPIServicePut(apiURL, body) {
  const options = {
    method: 'POST',
    uri: apiURL,
    json: true,
    headers: {
      'Content-Type': 'application/json',
    },
    body,
  };

  try {
    return await rp(options);
  } catch (err) {
    log('error', `Can not connect to 3rd party api service: ${err.message}`);
    return err;
  }
}
exports.callAPIServicePut = async (apiURL, body) => {
  const apiResponse = await callAPIServicePut(apiURL, body);
  return apiResponse;
};

/**
 * Construct and send JSON response back to caller
 */
exports.sendResponse = (res, status, dataObj) => {
  let httpHeaderCode;
  let rtnData = dataObj;

  switch (status) {
    case null: // Internal server error
      httpHeaderCode = 500;
      rtnData = {
        name: dataObj.name,
        message: dataObj.message,
      };
      break;
    case false: // Invalid params
      httpHeaderCode = 400;
      break;
    case 401: // Not authorised, invalid app_key
      httpHeaderCode = 401;
      break;
    case 404: // Resource not found
      httpHeaderCode = 404;
      break;
    default:
      httpHeaderCode = 200;
  }

  const returnJSON = {
    data: rtnData,
  };

  res.send(httpHeaderCode, returnJSON); // Send response back to caller
};

/**
 * Misc
 */
exports.isEmptyObject = (obj) => {
  if (obj == null) return true;
  if (obj.length > 0) return false;
  if (obj.length === 0) return true;
  if (typeof obj !== 'object') return true;
  return !Object.keys(obj).length;
};

exports.GetSortOrder = (prop) => {
  const obj = function AB(a, b) {
    if (a[prop] > b[prop]) {
      return 1;
    }
    if (a[prop] < b[prop]) return -1;
    return 0;
  };
  return obj;
};

exports.zeroFill = (number, width) => {
  const pad = width - number.toString().length;
  if (pad > 0) {
    return new Array(pad + (/\./.test(number) ? 2 : 1)).join('0') + number;
  }
  return `${number}`; // always return a string
};

exports.cleanString = (input) => {
  let output = '';
  for (let i = 0; i < input.length; i += 1) {
    if (input.charCodeAt(i) <= 127) {
      output += input.charAt(i);
    }
  }
  output = output.replace(/\0/g, '');
  return output;
};

exports.getCpuInfo = () => {
  const load = os.loadavg();
  const cpu = {
    load1: load[0],
    load5: load[1],
    load15: load[2],
    cores: os.cpus().length,
  };
  cpu.utilization = Math.min(Math.floor((load[0] * 100) / cpu.cores), 100);
  return cpu;
};

exports.getMemoryInfo = () => {
  const mem = {
    free: os.freemem(),
    total: os.totalmem(),
  };
  mem.percent = ((mem.free * 100) / mem.total);
  return mem;
};

exports.getOsInfo = () => {
  const osInfo = {
    uptime: os.uptime(),
    type: os.type(),
    release: os.release(),
    hostname: os.hostname(),
    arch: os.arch(),
    platform: os.platform(),
    user: os.userInfo(),
  };
  return osInfo;
};

exports.getProcessInfo = () => {
  const processInfo = {
    pid: process.pid,
    memory: process.memoryUsage(),
    uptime: process.uptime(),
    argv: process.argv,
  };
  return processInfo;
};
