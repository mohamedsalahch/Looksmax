const mongoose = require('mongoose');

async function migrate() {
  await mongoose.connect('mongodb://localhost:27017/looksmax');
  const db = mongoose.connection.db;
  const products = await db.collection('products').find({}).toArray();
  let migrated = 0;

  for (const p of products) {
    const setOp = {};
    const unsetOp = {};

    // Migrate category -> categories
    if (p.category && !p.categories) {
      setOp.categories = [p.category];
      unsetOp.category = 1;
    }

    // Migrate images from string[] to {url, isMain}[]
    if (p.images && p.images.length > 0 && typeof p.images[0] === 'string') {
      setOp.images = p.images.map((url, i) => ({ url, isMain: i === 0 }));
    }

    // If images is empty, ensure it's empty array
    if (!p.images || p.images.length === 0) {
      setOp.images = [];
    }

    if (Object.keys(setOp).length > 0 || Object.keys(unsetOp).length > 0) {
      const op = {};
      if (Object.keys(setOp).length > 0) op.$set = setOp;
      if (Object.keys(unsetOp).length > 0) op.$unset = unsetOp;
      await db.collection('products').updateOne({ _id: p._id }, op);
      migrated++;
    }
  }

  console.log(`✅ Migrated ${migrated} of ${products.length} products`);
  process.exit(0);
}

migrate().catch(e => { console.error(e); process.exit(1); });
