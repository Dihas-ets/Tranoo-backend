const assert = require('assert');
const mongoose = require('mongoose');
const PersonneInteressee = require('../src/models/PersonneInteressee');
const User = require('../src/models/User');

async function run() {
  try {
    const prospectPath = User.schema.path('prospect');
    assert(prospectPath, 'Champ prospect introuvable sur User');
    assert.strictEqual(prospectPath.instance, 'Boolean');
    assert.strictEqual(prospectPath.defaultValue, false);

    const countPath = PersonneInteressee.schema.path('personneInteresse');
    assert(countPath, 'Compteur personneInteresse introuvable');
    assert.strictEqual(countPath.instance, 'Number');
    assert.strictEqual(countPath.defaultValue, 0);
    assert.strictEqual(
      PersonneInteressee.collection.collectionName,
      'personne_interessee',
    );

    console.log('Installment prospect schema tests passed ✅');
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Installment prospect schema tests failed ❌');
    console.error(error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

run();
