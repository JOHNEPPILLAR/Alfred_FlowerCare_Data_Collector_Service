/**
 * Import helper libraries
 */
const serviceHelper = require('../lib/helper.js');
const flowerCare = require('./flowercare/flowercare.js');

const poolingInterval = 5 * 60 * 1000; // 5 minutes

exports.collectData = async function FnCollectData() {
  try {
    await flowerCare.getFlowerCareData(); // Collect Flower Care device data
  } catch (err) {
    serviceHelper.log('error', err.message);
  }
  setTimeout(() => { FnCollectData(); }, poolingInterval); // Wait then run function again
};
