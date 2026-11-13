const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, updateDoc } = require('firebase/firestore');
const fs = require('fs');

const cfg = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(cfg);
const db = getFirestore(app, cfg.firestoreDatabaseId);

const DISTRICT_4_LETTER_CODES = {
  "पुणे": "PUNE",
  "सातारा": "SATA",
  "सांगली": "SANG",
  "कोल्हापूर": "KOLH",
  "सोलापूर": "SOLA",
  "ठाणे": "THAN",
  "पालघर": "PALG",
  "रायगड": "RAIG",
  "रत्नागिरी": "RATN",
  "सिंधुदुर्ग": "SIND",
  "नाशिक": "NASH",
  "धुळे": "DHUL",
  "नंदुरबार": "NAND",
  "जळगाव": "JALG",
  "अहिल्यानगर": "AHIL",
  "अहमदनगर": "AHIL",
  "छत्रपती संभाजीनगर": "SAMB",
  "औरंगाबाद": "SAMB",
  "जालना": "JALN",
  "बीड": "BEED",
  "लातूर": "LATU",
  "धाराशिव": "DHAR",
  "उस्मानाबाद": "DHAR",
  "नांदेड": "NAND",
  "परभणी": "PARB",
  "हिंगोली": "HING",
  "नागपूर": "NAGP",
  "वर्धा": "WARD",
  "भंडारा": "BHAN",
  "गोंदिया": "GOND",
  "गडचिरोली": "GADC",
  "चंद्रपूर": "CHAN",
  "अमरावती": "AMRA",
  "अकोला": "AKOL",
  "वाशीम": "WASH",
  "बुलढाणा": "BULD",
  "यवतमाळ": "YAVT"
};

function getCode(dist) {
  if (!dist) return "MAHA";
  const trimmed = dist.trim();
  if (DISTRICT_4_LETTER_CODES[trimmed]) return DISTRICT_4_LETTER_CODES[trimmed];
  for (const [k, v] of Object.entries(DISTRICT_4_LETTER_CODES)) {
    if (trimmed.includes(k) || k.includes(trimmed)) return v;
  }
  return "MAHA";
}

async function fixMemberNumbers() {
  console.log('Fetching all applications from Firestore...');
  const snap = await getDocs(collection(db, 'applications'));
  const docs = [];
  snap.forEach(d => docs.push({ id: d.id, ...d.data() }));

  // Sort approved applications strictly by createdAt timestamp ascending
  const approved = docs
    .filter(d => d.status === 'approved' || Boolean(d.memberNumber))
    .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());

  console.log(`Found ${approved.length} approved applications.`);

  let updatedCount = 0;
  for (let i = 0; i < approved.length; i++) {
    const appDoc = approved[i];
    const seq = i + 1; // 1-indexed: 1, 2, ... 69
    const year = 2026;
    const distCode = getCode(appDoc.district || appDoc.officialDistrict);
    const targetNumber = `MS/${year}/${distCode}/${String(seq).padStart(4, '0')}`;

    if (appDoc.memberNumber !== targetNumber) {
      console.log(`Fixing [${seq}] ${appDoc.fullName}: ${appDoc.memberNumber} -> ${targetNumber}`);
      try {
        await updateDoc(doc(db, 'applications', appDoc.id), {
          memberNumber: targetNumber
        });
        updatedCount++;
      } catch (err) {
        console.error(`Error updating doc ${appDoc.id}:`, err.message);
      }
    } else {
      console.log(`Already correct [${seq}]: ${appDoc.fullName} = ${targetNumber}`);
    }
  }

  console.log(`Completed healing. Total updated: ${updatedCount}`);
}

fixMemberNumbers().then(() => process.exit(0)).catch(e => {
  console.error(e);
  process.exit(1);
});
