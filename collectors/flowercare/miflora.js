/**
 * Import external libraries
 */
const noble = require('noble');
/**
 * Import helper libraries
 */
const MiFloraDevice = require('./miflora-device.js');
const serviceHelper = require('../../lib/helper.js');

const UUID_SERVICE_XIAOMI = 'fe95';
const getOpt = (options, value, def) => ((options && typeof options[value] !== 'undefined') ? options[value] : def);

class MiFlora {
  constructor() {
    this.devices = {};
    noble.on('stateChange', (state) => {
      serviceHelper.log('trace', 'miflora', `Adapter changed to ${state}`);
      if (state !== 'poweredOn') noble.stopScanning();
    });
    noble.on('scanStart', () => {
      serviceHelper.log('trace', 'miflora', 'Discovery started');
    });
    noble.on('scanStop', () => {
      serviceHelper.log('trace', 'miflora', 'Discovery stopped');
    });
  }

  /**
   * Start the discovery process
   * @public
   * @param {object} options - Discovery options
   * @return {Promise} A Promise which resolves with an array of MiFloraDevice
   */
  discover(options) {
    const optDuration = getOpt(options, 'duration', 10000);
    const optAddresses = getOpt(options, 'addresses', []);
    const optIgnoreUnknown = getOpt(options, 'ignoreUnknown', false);

    if (isNaN(optDuration)) {
      throw new TypeError('argument [duration] must be a number');
    }
    if (!Array.isArray(optAddresses)) {
      throw new TypeError('argument [addresses] must be an array');
    }

    if (typeof optIgnoreUnknown !== typeof true) {
      throw new TypeError('argument [skipUnknown] must be of type boolean');
    }

    optAddresses.forEach((address, idx) => {
      optAddresses[idx] = MiFloraDevice.normaliseAddress(address);
    });

    return new Promise(async (resolve, reject) => {
      try {
        await this.ensurePowerOnState();
        await this.startScan(optAddresses, optDuration, optIgnoreUnknown);
        await this.stopScan();
        return resolve(Object.values(this.devices));
      } catch (error) {
        return reject(error);
      }
    });
  }

  /**
   * Returns a Promise which resolves when the adapter is ready
   * @private
   */
  ensurePowerOnState() {
    this.returnVal = new Promise(async (resolve) => {
      if (noble.state === 'poweredOn') return resolve();
      serviceHelper.log('trace', 'miflora', 'Waiting for adapter state change');
      noble.on('stateChange', (state) => {
        if (state === 'poweredOn') return resolve();
      });
    });
    return this.returnVal;
  }

  /**
   * Returns true if all given addresses have been discovered
   * @private
   * @param {String[]} addresses
   */
  checkDiscovered(addresses) {
    let result = true;
    addresses.forEach((address) => {
      result &= (this._devices[address] !== undefined);
    });
    return result;
  }

  /**
   * @private
   */
  startScan(addresses, duration, ignoreUnknown) {
    return new Promise((resolve, reject) => {
      serviceHelper.log('trace', 'miflora', `Starting discovery with ${duration}ms duration`);

      if (addresses && addresses.length > 0) {
        serviceHelper.log('trace', 'miflora', `Discovery will be stopped when ${addresses} ${addresses.length === 1 ? 'is' : 'are'} found`);
        if (this.checkDiscovered(addresses)) {
          return resolve();
        }
      }
      const timeout = setTimeout(() => {
        serviceHelper.log('Duration reached, stopping discovery');
        return resolve();
      }, duration);
      noble.on('discover', (peripheral) => {
        const deviceAddress = MiFloraDevice.normaliseAddress(peripheral.address);
        if (ignoreUnknown && !addresses.find(addr => addr === deviceAddress)) {
          serviceHelper.log('trace', 'miflora', `Ignoring device with address ${deviceAddress}`);
          return;
        }
        const exisitingDevice = this.devices[deviceAddress];
        if (!exisitingDevice) {
          const newDevice = MiFloraDevice.from(peripheral);
          if (newDevice) {
            this.devices[deviceAddress] = newDevice;
            serviceHelper.log('trace', 'miflora', `Discovered ${newDevice.type} @ ${newDevice.address}`);
            if (addresses && addresses.length > 0 && this.checkDiscovered(addresses)) {
              serviceHelper.log('trace', 'miflora', 'Found all requested devices, stopping discovery');
              if (timeout) clearTimeout(timeout);
              return resolve();
            }
          }
        }
      });
      noble.startScanning([UUID_SERVICE_XIAOMI], true, (error) => {
        if (error) return reject(error);
      });
    });
  }

  /**
   * @private
   */
  stopScan() {
    this.returnVal = new Promise((resolve) => {
      noble.stopScanning(() => resolve());
    });
    return this.returnVal;
  }
}

module.exports = new MiFlora();
