/**
 * Import helper libraries
 */
const serviceHelper = require('../lib/helper.js');
const flowerCare = require('./flowercare/flowercare.js');

const poolingInterval = 15 * 60 * 1000; // 15 minutes

exports.collectData = async function FnCollectData() {
  try {
    await flowerCare.getFlowerCareData(); // Collect Flower Care device data
  } catch (err) {
    serviceHelper.log('error', 'Controller - CollectData', err.message);
  }
  setTimeout(() => { FnCollectData(); }, poolingInterval); // Wait then run function again
};
