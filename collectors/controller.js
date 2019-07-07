/**
 * Import helper libraries
 */
const serviceHelper = require('../lib/helper.js');
const flowerCare = require('./flowercare/flowercare.js');

exports.collectData = async function FnCollectData() {
  try {
    let devices = await flowerCare.getFlowerCareDevices(); // Get Flower Care devices
    if (!(devices instanceof Error)) {
      await flowerCare.getFlowerCareData(devices); // Collect and store flower care device data
    }
    devices = null;
    setTimeout(() => FnCollectData(), 300000); // Get device data every 5 minutes
  } catch (err) {
    serviceHelper.log('error', err.message);
  }
};
