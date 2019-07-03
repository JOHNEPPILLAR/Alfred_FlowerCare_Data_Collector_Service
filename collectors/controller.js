/**
 * Import helper libraries
 */
const serviceHelper = require('../lib/helper.js');
const flowerCare = require('./flowercare/flowercare.js');

exports.collectData = async function FnCollectData() {
  try {
    const devices = await flowerCare.getFlowerCareDevices(); // Get Flower Care devices
    if (!(devices instanceof Error)) {
      await flowerCare.getFlowerCareData(devices); // Collect and store flower care device data
      setTimeout(async () => {
        await flowerCare.getFlowerCareData(devices); // Collect and store flower care device data
      }, 300000); // Get device data every 5 minutes
    }
  } catch (err) {
    serviceHelper.log('error', err.message);
  }

  setTimeout(async () => {
    await flowerCare.getFlowerCareDevices(); // Collect and store flower care device data
  }, 10800000); // Re-scan/discover devices every 3 hours
};
