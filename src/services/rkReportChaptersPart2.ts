import { ReportPageData } from './rkReportChaptersPart1';

const box = (title: string, content: string, border = '#193568', bg = '#f8fafc', titleColor = '#193568') => `
  <div style="border: 1.5px solid ${border}; background: ${bg}; border-radius: 8px; padding: 11px 14px; margin-bottom: 10px;">
    <div style="font-size: 13px; font-weight: 800; color: ${titleColor}; margin-bottom: 5px;">${title}</div>
    <div style="font-size: 11.5px; line-height: 1.58; color: #1e293b;">${content}</div>
  </div>
`;

const tipBox = (title: string, content: string) =>
  box(title, content, '#d97706', '#fffbeb', '#92400e');

const warnBox = (title: string, content: string) =>
  box(title, content, '#dc2626', '#fef2f2', '#991b1b');

const okBox = (title: string, content: string) =>
  box(title, content, '#16a34a', '#f0fdf4', '#166534');

const codeBlock = (code: string) => `
  <div style="background: #0f172a; color: #e2e8f0; font-family: monospace; font-size: 10.3px; line-height: 1.48; padding: 9px 12px; border-radius: 6px; margin: 6px 0 10px 0; white-space: pre-wrap; word-break: break-word;">${code}</div>
`;

const stepList = (items: string[]) => `
  <ol style="margin: 4px 0 10px 0; padding-left: 18px; font-size: 11.5px; line-height: 1.6; color: #1e293b;">
    ${items.map((item) => `<li style="margin-bottom: 5px;">${item}</li>`).join('')}
  </ol>
`;

const bulletList = (items: string[]) => `
  <ul style="margin: 4px 0 10px 0; padding-left: 18px; font-size: 11.5px; line-height: 1.6; color: #1e293b;">
    ${items.map((item) => `<li style="margin-bottom: 5px;">${item}</li>`).join('')}
  </ul>
`;

const tableHtml = (headers: string[], rows: string[][]) => `
  <table style="width: 100%; border-collapse: collapse; margin: 6px 0 10px 0; font-size: 10.6px;">
    <thead>
      <tr style="background: #193568; color: #ffffff;">
        ${headers.map((h) => `<th style="padding: 6px 8px; text-align: left; border: 1px solid #193568;">${h}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${rows
        .map(
          (row, idx) => `
        <tr style="background: ${idx % 2 === 0 ? '#ffffff' : '#f1f5f9'};">
          ${row.map((cell) => `<td style="padding: 6px 8px; border: 1px solid #cbd5e1; vertical-align: top; line-height: 1.45;">${cell}</td>`).join('')}
        </tr>`
        )
        .join('')}
    </tbody>
  </table>
`;

export const REPORT_PAGES_PART_2: ReportPageData[] = [
  // PAGE 24: Chapter 7 - Razorpay Account & Keys
  {
    chapter: 'प्रकरण ७: Razorpay व Webhook',
    title: '७.१ Razorpay अकाउंट, KYC आणि Live API Keys तयार करणे',
    subtitle: 'dashboard.razorpay.com वरून पेमेंट स्वीकारण्यासाठी अधिकृत सेटअप',
    bodyHtml: `
      <p style="font-size: 11.8px; line-height: 1.6; margin: 0 0 8px 0;">
        भारतामध्ये UPI (GPay, PhonePe, Paytm), Debit/Credit Card आणि Netbanking द्वारे कायदेशीररित्या पैसे स्वीकारण्यासाठी <b>Razorpay</b> हे सर्वोत्तम पेमेंट गेटवे आहे.
      </p>
      ${box(
        'पायरी १: Razorpay खाते व KYC पूर्ण करणे',
        stepList([
          '<b>dashboard.razorpay.com</b> वर जाऊन संस्थेच्या/संघाच्या बँक खात्यानुसार Sign Up करा.',
          'संस्थेचे पॅन कार्ड, नोंदणी प्रमाणपत्र (Registration Certificate), बँक खाते तपशील व वेबसाईट लिंक (<code>https://mahasangh.in</code>) देऊन <b>KYC</b> पूर्ण करा.',
          'वेबसाईटवर "About Us", "Contact Us", "Terms", "Privacy Policy" आणि "Refund Policy" अशी माहिती असणे Razorpay अप्रूव्हलसाठी आवश्यक असते (जी आपल्या वेबसाईटच्या Footer मध्ये आधीच आहे).',
        ])
      )}
      ${box(
        'पायरी २: Live API Key ID व Key Secret जनरेट करणे',
        stepList([
          'Razorpay Dashboard च्या डाव्या मेनूवर वरच्या बाजूला <b>Test Mode</b> बंद करून <b>"Live Mode"</b> चालू करा.',
          '<b>Account & Settings → Website and App Settings → API Keys</b> वर जा.',
          '<b>"Generate Live Key"</b> वर क्लिक करा. स्क्रीनवर <b>Key ID</b> (उदा. <code>rzp_live_xxxxxxx</code>) आणि <b>Key Secret</b> (एकदाच दिसणारी गुप्त की) मिळेल — ती सुरक्षित लिहून किंवा डाऊनलोड करून ठेवा.',
          '<b>कुठे टाकायच्या?</b> HostKarle Node.js App → <b>Environment Variables</b> मध्ये <code>RAZORPAY_KEY_ID</code> आणि <code>RAZORPAY_KEY_SECRET</code> म्हणून सेव्ह करा (किंवा ॲडमिन पॅनलमधील Razorpay सेटिंग्जमध्ये).',
        ])
      )}
      ${warnBox(
        'सुरक्षा इशारा',
        '<code>RAZORPAY_KEY_SECRET</code> कधीही <code>src/</code> फोल्डरमधील फ्रंटएंड फाईल्समध्ये किंवा WhatsApp/सार्वजनिक ठिकाणी टाकू नका. ज्याच्याकडे Key Secret असेल तो पैसे परत (Refund) किंवा बनावट पडताळणी करू शकतो.'
      )}
    `,
  },

  // PAGE 25: Chapter 7 - Order Creation Flow
  {
    chapter: 'प्रकरण ७: Razorpay व Webhook',
    title: '७.२ पेमेंट प्रक्रियेचा अचूक क्रम: आधी अर्ज सेव्ह, मग Order व पेमेंट',
    subtitle: 'आपल्या वेबसाईटमध्ये "पैसे न भरता सदस्यत्व मंजूर होणे" ही अडचण कायमची कशी बंद केली?',
    bodyHtml: `
      <p style="font-size: 11.8px; line-height: 1.6; margin: 0 0 8px 0;">
        पूर्वी अनेक सदस्य फक्त "मी पैसे भरले" या खोट्या बटनावर दाबून किंवा अर्धवट पेमेंट करून सदस्यत्व मिळवायचे (~१०% विना-पेमेंट अर्ज). आपण संपूर्ण रचना बदलून <b>१००% सुरक्षित ३-टप्प्यांची प्रक्रिया</b> लागू केली:
      </p>
      ${box(
        'टप्पा १: आधी अर्ज Firestore मध्ये Pending स्थितीत पक्का जतन करणे (Awaited Save)',
        bulletList([
          'जेव्हा सदस्य फॉर्म भरून <b>"अर्ज जतन करा व पेमेंटकडे जा"</b> वर क्लिक करतो, तेव्हा <code>MembershipTab.tsx</code> आधी Firestore मध्ये <code>findExistingApplicationInFirestore()</code> ने तपासते की हा मोबाईल, ई-मेल किंवा नाव आधीच नोंदलेले आहे का.',
          'जर नसेल, तर <code>await onAddApplication(...)</code> पूर्ण होऊन डेटाबेसमध्ये अर्ज <code>status: "pending"</code> सह सेव्ह होतो, आणि <b>नंतरच</b> Razorpay विंडो उघडते.',
          '<b>फायदा:</b> जर पेमेंट करताना इंटरनेट गेले किंवा ब्राउझर बंद पडला, तरी सदस्याचा डेटा आधीच डेटाबेसमध्ये सुरक्षित असतो!',
        ])
      )}
      ${box(
        'टप्पा २: बॅकएंडवर Order ID तयार करणे (/api/razorpay/create-order)',
        bulletList([
          'ब्राउझर थेट Razorpay उघडण्यापूर्वी <code>server.ts</code> ला विनंती करतो.',
          'सर्व्हरवर <code>amount = 220 * 100 = 22000</code> (पैसे स्वरूपात) सेट केले जाते जेणेकरून कोणीही ब्राउझरमधून ₹२२० बदलून ₹१ करू शकणार नाही!',
          'तसेच Razorpay ला पाठवलेल्या <code>notes</code> मध्ये <code>applicationId</code>, <code>fullName</code>, <code>phone</code>, <code>email</code>, <code>district</code> पाठवले जातात — जे पुढे Webhook ला अर्ज शोधण्यासाठी मदत करतात.',
        ])
      )}
    `,
  },

  // PAGE 26: Chapter 7 - Signature Verification
  {
    chapter: 'प्रकरण ७: Razorpay व Webhook',
    title: '७.३ पेमेंट स्वाक्षरी पडताळणी (HMAC-SHA256 Verification) कशी चालते?',
    subtitle: 'ब्राउझर बंद न करता झटपट सदस्यत्व व आय-कार्ड मिळण्यामागील गणित',
    bodyHtml: `
      ${box(
        'पेमेंट यशस्वी होताच पडद्यामागे काय घडते?',
        stepList([
          'युझर GPay / PhonePe / UPI पिन टाकतो आणि पेमेंट यशस्वी होते.',
          'Razorpay पॉपअप आपल्या वेबसाईटला ३ गोष्टी परत देतो: <code>razorpay_order_id</code>, <code>razorpay_payment_id</code>, आणि <code>razorpay_signature</code>.',
          'लगेच <code>src/utils/razorpay.ts</code> या तिन्ही गोष्टी आपल्या बॅकएंड सर्व्हरच्या <code>POST /api/razorpay/verify-payment</code> या मार्गावर पाठवतो.',
          '<b>क्रिप्टोग्राफिक तपासणी (Server-side):</b> आपला सर्व्हर <code>order_id|payment_id</code> यांना आपल्या गुप्त <code>RAZORPAY_KEY_SECRET</code> सोबत <b>HMAC-SHA256</b> ने एकत्र करतो. जर तयार झालेला कोड आणि Razorpay ने दिलेली स्वाक्षरी १००% जुळली, तरच पेमेंट खरे मानले जाते!',
          '<b>त्वरित सर्व्हर अप्रूव्हल:</b> स्वाक्षरी जुळताच सर्व्हरवरच <code>approveApplicationOnServer()</code> चालते → Firestore मध्ये नवीन सलग सदस्य क्रमांक तयार होतो → <code>status: "approved"</code> आणि <code>paymentConfirmed: true</code> सेव्ह होते → युझरला लगेच स्क्रीनवर <b>PDF आय-कार्ड</b> दिसते!',
        ])
      )}
      ${codeBlock(`// server.ts मधील स्वाक्षरी पडताळणी कोड:\nconst text = \`\${razorpay_order_id}|\${razorpay_payment_id}\`;\nconst generatedSignature = crypto\n  .createHmac('sha256', config.keySecret)\n  .update(text)\n  .digest('hex');\nif (generatedSignature !== razorpay_signature) {\n  return res.status(400).json({ verified: false, message: 'फसवणूक रोखली!' });\n}`)}
    `,
  },

  // PAGE 27: Chapter 7 - Razorpay Webhook Setup
  {
    chapter: 'प्रकरण ७: Razorpay व Webhook',
    title: '७.४ Razorpay Webhook सेटअप: Dashboard मध्ये नेमके काय करावे?',
    subtitle: 'पेमेंट झाल्यावर सदस्याचे नेटवर्क तुटले किंवा ब्राउझर बंद झाला तरी ऑटोमॅटिक मंजुरी!',
    bodyHtml: `
      <p style="font-size: 11.8px; line-height: 1.6; margin: 0 0 8px 0;">
        <b>Webhook म्हणजे काय?</b> जेव्हा एखाद्या सदस्याच्या खात्यातून ₹२२० कट होतात, पण त्याच क्षणी त्याचा मोबाईल बंद पडतो किंवा नेटवर्क जाते, तेव्हा ब्राउझर <code>verify-payment</code> कॉल करू शकत नाही. अशा वेळी <b>Razorpay चा सर्व्हर थेट आपल्या HostKarle सर्व्हरला फोन करून (HTTP POST पाठवून) सांगतो की पेमेंट मिळाले आहे!</b>
      </p>
      ${box(
        'Razorpay Dashboard मध्ये Webhook जोडण्याच्या अचूक पायऱ्या',
        stepList([
          '<b>Razorpay Dashboard</b> (Live Mode) मध्ये जा → डाव्या मेनूत <b>Account & Settings → Webhooks</b> उघडा.',
          '<b>"+ Add New Webhook"</b> बटनावर क्लिक करा.',
          '<b>Webhook URL:</b> अगदी अचूक भरा → <code>https://mahasangh.in/api/razorpay/webhook</code>',
          '<b>Secret:</b> इथे तुमचा एक मजबूत गुप्त पासवर्ड टाका (ज्यात स्पेस नको) — आणि हाच पासवर्ड HostKarle Environment Variables मध्ये <code>RAZORPAY_WEBHOOK_SECRET</code> म्हणून सेव्ह करा!',
          '<b>Alert Email:</b> तुमचा ई-मेल टाका (वेबहूक फेल झाल्यास सूचना मिळण्यासाठी).',
          '<b>Active Events (अतिशय महत्त्वाचे!):</b> खालील यादीतून फक्त हे २ इव्हेंट्स टिक करा: <br/>☑ <b><code>payment.captured</code></b> आणि ☑ <b><code>order.paid</code></b>',
          '<b>Create Webhook</b> वर क्लिक करून सेव्ह करा.',
        ])
      )}
      ${tipBox(
        'Webhook URL तपासण्याची खात्री',
        'जर कोणी ब्राउझरमध्ये <code>https://mahasangh.in/api/razorpay/webhook</code> उघडले तर <code>Cannot GET</code> किंवा POST अपेक्षित असल्याचे दिसेल (कारण Razorpay तिथे POST पाठवतो). जर सर्व्हर बंद असेल तर Razorpay Dashboard मध्ये Webhook Logs मध्ये 500 एरर दिसतो.'
      )}
    `,
  },

  // PAGE 28: Chapter 7 - Webhook Technical Inner Workings
  {
    chapter: 'प्रकरण ७: Razorpay व Webhook',
    title: '७.५ Webhook कोडचे बारकावे: express.raw आणि स्वयंचलित पडताळणी',
    subtitle: 'पडद्यामागे server.ts मधील /api/razorpay/webhook कसा अर्ज शोधतो व मंजूर करतो',
    bodyHtml: `
      ${box(
        '१. Webhook साठी express.raw() का गरजेचे असते?',
        `<p style="margin:0 0 6px 0;">सामान्य API साठी Express हा <code>express.json()</code> वापरतो. पण Razorpay Webhook च्या <code>x-razorpay-signature</code> ची तपासणी करण्यासाठी मूळ जसाच्या तसा कच्चा डेटा (Raw JSON Bytes) लागतो. जर आधीच <code>express.json()</code> चालले तर स्वाक्षरी जुळणार नाही! म्हणून <code>server.ts</code> मध्ये आपण ही ओळ सर्वात आधी लिहिली आहे:</p>` +
        codeBlock(`app.use('/api/razorpay/webhook', express.raw({ type: 'application/json' }));\napp.use(express.json({ limit: '10mb' }));`)
      )}
      ${box(
        '२. Webhook अर्ज कसा शोधतो व रक्कम कशी तपासतो?',
        stepList([
          '<b>स्वाक्षरी तपासणी:</b> Razorpay ने पाठवलेला <code>x-razorpay-signature</code> हेडर आणि <code>RAZORPAY_WEBHOOK_SECRET</code> वापरून खात्री करतो की विनंती खऱ्या Razorpay सर्व्हरकडूनच आली आहे.',
          '<b>रक्कम तपासणी:</b> <code>amountPaise >= 22000</code> (म्हणजे किमान ₹२२० मिळालेच पाहिजेत) तपासतो.',
          '<b>अर्ज शोधणे (`findApplicationForPayment`):</b> सर्वप्रथम <code>notes.applicationId</code> ने अर्ज शोधतो; तो नसल्यास <code>phone</code> (१० अंकी मोबाईल) ने शोधतो; आणि शेवटी <code>email</code> ने शोधतो (आधी <code>pending</code> अर्जांना प्राधान्य देतो).',
          '<b>मंजुरी व Fallback ई-मेल:</b> अर्ज <code>approved</code> करून नवीन सदस्य क्रमांक देतो आणि सदस्याने ब्राउझर बंद केला असल्यास त्याला थेट <b>१-क्लिक आय-कार्ड डाऊनलोड लिंकचा ई-मेल</b> स्वतःहून पाठवतो!',
        ])
      )}
    `,
  },

  // PAGE 29: Chapter 8 - Backend server.ts Routes
  {
    chapter: 'प्रकरण ८: बॅकएंड व ई-मेल सर्व्हर',
    title: '८.१ server.ts मधील सर्व ७ API Routes चा संपूर्ण तांत्रिक तक्ता',
    subtitle: 'तुमचा Node.js Express सर्व्हर कोणकोणत्या विनंत्या स्वीकारतो व काय उत्तर देतो',
    bodyHtml: `
      ${tableHtml(
        ['API Endpoint (मार्ग)', 'Method', 'कोण कॉल करते?', 'नेमके काय काम करतो?'],
        [
          ['<code>/api/health</code>', 'GET', 'तुम्ही / मॉनिटर', 'सर्व्हर, Razorpay Key, Webhook Secret, Firebase व SMTP चालू आहेत का हे JSON मध्ये दाखवतो'],
          ['<code>/api/razorpay/public-config</code>', 'GET', 'ब्राउझर (सदस्य)', 'फक्त सार्वजनिक <code>keyId</code> व गेटवे चालू आहे का हे पाठवतो (Secret कधीही पाठवत नाही!)'],
          ['<code>/api/razorpay/admin-config</code>', 'GET / POST', 'ॲडमिन पॅनल', 'Masked की दाखवतो आणि Admin ने नवीन की सेव्ह केल्यास <code>razorpay-config.json</code> मध्ये ठेवतो'],
          ['<code>/api/razorpay/create-order</code>', 'POST', 'MembershipTab', '₹२२० चा अधिकृत Razorpay Order ID तयार करून देतो'],
          ['<code>/api/razorpay/verify-payment</code>', 'POST', 'MembershipTab', 'पेमेंटची HMAC स्वाक्षरी तपासून लगेच Firestore मध्ये सदस्यत्व मंजूर करतो'],
          ['<code>/api/razorpay/webhook</code>', 'POST', 'Razorpay सर्व्हर', 'बॅकग्राउंडला पेमेंट कन्फर्म झाल्याची सूचना स्वीकारून आपोआप अर्ज मंजूर करतो'],
          ['<code>/api/email/send-id-card</code>', 'POST', 'ब्राउझर (पेमेंटनंतर)', 'मंजूर सदस्याचे PDF आय-कार्ड Base64 स्वीकारून SMTP द्वारे त्याच्या ई-मेलवर पाठवतो'],
        ]
      )}
      ${okBox(
        'Frontend आणि Static dist/ सर्व्हिंग',
        'वरील <code>/api/*</code> मार्गांव्यतिरिक्त बाकी कोणतीही लिंक (जसे <code>/</code>, <code>/#admin</code>, <code>/?track=...</code>) उघडली की <code>server.ts</code> Production मोडमध्ये <code>dist/index.html</code> पाठवतो, ज्यामुळे संपूर्ण React वेबसाईट उघडते.'
      )}
    `,
  },

  // PAGE 30: Chapter 8 - esbuild & server.cjs
  {
    chapter: 'प्रकरण ८: बॅकएंड व ई-मेल सर्व्हर',
    title: '८.२ server.ts मधून server.cjs का बनवले आणि esbuild कसे चालते?',
    subtitle: 'scripts/build-server.mjs चे महत्त्व आणि Phusion Passenger सुसंगतता',
    bodyHtml: `
      ${box(
        'server.ts थेट HostKarle वर का वापरता येत नाही?',
        bulletList([
          '<code>server.ts</code> ही <b>TypeScript (.ts)</b> आणि <b>ESM (import/export)</b> मध्ये लिहिलेली आहे.',
          'HostKarle च्या DirectAdmin मधील <b>Phusion Passenger</b> सर्व्हरला थेट TypeScript वाचता येत नाही आणि बऱ्याचदा CommonJS (<code>.cjs</code>) एंट्री फाईल सर्वात स्थिर चालते.',
          'म्हणून आपण <b><code>scripts/build-server.mjs</code></b> ही स्क्रिप्ट लिहिली आहे, जी <b>esbuild</b> वापरून अवघ्या ५० मिलिसेकंदात <code>server.ts</code> मधून शुद्ध Node 20+ सुसंगत <b><code>server.cjs</code></b> बनवते!',
        ])
      )}
      ${codeBlock(`// scripts/build-server.mjs मधील मुख्य सेटिंग:\nawait build({\n  entryPoints: ['server.ts'],\n  bundle: true,\n  platform: 'node',\n  format: 'cjs',\n  target: 'node20',\n  outfile: 'server.cjs',\n  external: ['express', 'cors', 'razorpay', 'firebase', 'firebase/*', 'vite', 'tsx'],\n});`)}
      ${tipBox(
        'External vs Bundled चा नियम (अतिशय महत्त्वाचा धडा!)',
        '<code>external</code> यादीत फक्त अशीच पॅकेजेस ठेवा जी आधीच HostKarle च्या <code>node_modules</code> मध्ये आहेत. जसे आपण <code>nodemailer</code> ला external मधून काढून थेट <code>server.cjs</code> मध्ये बंडल केले — त्यामुळे आता नवीन कोड पुश केल्यावर HostKarle वर <code>Run NPM Install</code> करायला विसरले तरीही सर्व्हर कधीच क्रॅश होत नाही!'
      )}
    `,
  },

  // PAGE 31: Chapter 8 - Custom Domain Email & SMTP
  {
    chapter: 'प्रकरण ८: बॅकएंड व ई-मेल सर्व्हर',
    title: '८.३ HostKarle डोमेन ई-मेल (SMTP) आणि PDF आय-कार्ड ऑटो-डिलिव्हरी',
    subtitle: 'info@mahasangh.in तयार करणे आणि सदस्यांना पेमेंटनंतर ई-मेलवर PDF पाठवणे',
    bodyHtml: `
      ${box(
        'पायरी १: HostKarle DirectAdmin मध्ये अधिकृत ई-मेल तयार करणे',
        stepList([
          'DirectAdmin → <b>E-mail Manager → E-mail Accounts</b> उघडा.',
          '<b>CREATE ACCOUNT</b> वर क्लिक करा → Username मध्ये <code>info</code> (किंवा <code>admin</code>) टाका म्हणजे <code>info@mahasangh.in</code> तयार होईल.',
          'एक मजबूत पासवर्ड ठेवा व Quota पुरेसा (उदा. 500 MB किंवा Unlimited) ठेवून Create करा.',
          '<b>SMTP तपशील:</b> Host: <code>mail.mahasangh.in</code> | Port: <code>465</code> (SSL/TLS Secure: true) | User: <code>info@mahasangh.in</code>.',
        ])
      )}
      ${box(
        'पायरी २: वेबसाईट ई-मेल कशी पाठवते? (Nodemailer + दुबार-ई-मेल रोखणारा गार्ड)',
        bulletList([
          '<b>पेमेंट यशस्वी होताच (Checkout Flow):</b> ब्राउझरमध्ये <code>generateMembershipIdCardPdfBase64()</code> द्वारे सदस्याचे अधिकृत आय-कार्ड PDF तयार होते आणि <code>/api/email/send-id-card</code> वर पाठवले जाते.',
          '<b>सर्व्हर पडताळणी:</b> सर्व्हर आधी Firestore मध्ये तपासतो की अर्ज खरेच <code>approved</code> आणि <code>paymentConfirmed === true</code> आहे का. जर होय, आणि <code>idCardEmailSent !== true</code> असेल, तरच ई-मेल अटॅचमेंटसह पाठवतो!',
          '<b>Webhook Fallback:</b> जर युझरने पेमेंटनंतर ब्राउझर बंद केला असेल, तर Webhook त्याला <b>"आय-कार्ड डाऊनलोड पोर्टल उघडा →"</b> या 1-click लिंकसह (<code>/?track=MEMBER_NO</code>) अभिनंदन ई-मेल पाठवतो.',
        ])
      )}
    `,
  },

  // PAGE 32: Chapter 9 - Frontend Pages Part 1 (Header, Nav, Index)
  {
    chapter: 'प्रकरण ९: वेबसाईट पेजेस अभ्यास',
    title: '९.१ प्रत्येक पानाची रचना — भाग १: Header, Navigation व सुरक्षा',
    subtitle: 'index.html, Header.tsx आणि src/App.tsx कसे सर्व टॅब्स सांभाळतात',
    bodyHtml: `
      ${box(
        '१. Header व मुख्य नेव्हिगेशन (src/components/Header.tsx)',
        bulletList([
          '<b>शीर्ष ओळ:</b> संस्थेचा लोगो (<code>/logo.png</code>), "महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ", व नोंदणी क्रमांक (<code>महा/एनएसके/एन/2427</code>) ठळकपणे दाखवले आहेत.',
          '<b>सिंगल-पेज नेव्हिगेशन (Tab System):</b> ही वेबसाईट Reload न होता एका क्लिकवर टॅब बदलते — <i>मुख्यपृष्ठ, आमच्याबद्दल, उद्दिष्ट्ये, नेतृत्व, नियुक्त्या व शासन निर्णय, बातम्या, सदस्यत्व नोंदणी, संपर्क</i>.',
          '<b>थेट URL लिंक्स (Hash & Query Routing):</b> कोणी <code>mahasangh.in/#admin</code> उघडल्यास थेट Admin पॅनल उघडते; आणि कोणी <code>mahasangh.in/?track=98xxxxxxxx</code> उघडल्यास थेट "अर्जाची स्थिती तपासा" टॅबमध्ये तो नंबर भरून रिझल्ट दिसतो!',
        ])
      )}
      ${box(
        '२. सामग्री संरक्षण व मराठी टायपोग्राफी (index.html + index.css)',
        bulletList([
          '<b>Google Fonts:</b> <code>Rozha One</code>, <code>Yatra One</code>, <code>Noto Sans Devanagari</code> आणि <code>Noto Serif Devanagari</code> लोड केले आहेत — ज्यामुळे संपूर्ण वेबसाईट व PDF वर मराठी अक्षरे व जोडाक्षरे अचूक व देखणी दिसतात.',
          '<b>Right-Click संरक्षण:</b> <code>&lt;body oncontextmenu="return false;"&gt;</code> वापरून अधिकृत लोगो, फोटो आणि प्रमाणपत्रे सहज कॉपी होऊ नयेत म्हणून संरक्षण दिले आहे.',
        ])
      )}
    `,
  },

  // PAGE 33: Chapter 9 - Home, About, Objectives
  {
    chapter: 'प्रकरण ९: वेबसाईट पेजेस अभ्यास',
    title: '९.२ प्रत्येक पानाची रचना — भाग २: मुख्यपृष्ठ, आमच्याबद्दल व उद्दिष्ट्ये',
    subtitle: 'HomeTab.tsx, AboutTab.tsx आणि ObjectivesTab.tsx मधील घटक व डेटा स्रोत',
    bodyHtml: `
      ${box(
        '१. मुख्यपृष्ठ (HomeTab.tsx)',
        bulletList([
          '<b>आकर्षक बॅनर / स्लायडर:</b> संस्थेची ओळख, मुख्य ध्येय वाक्य ("संघटन, सन्मान, समर्पण आणि शैक्षणिक गुणवत्ता") आणि थेट "सदस्यत्व नोंदणी" व "आय-कार्ड डाऊनलोड" बटणे (Quick Action Cards).',
          '<b>ताज्या बातम्या झलक (Latest Ticker/Cards):</b> Firestore मधील ताज्या व Featured बातम्या मुख्यपृष्ठावर लगेच दिसतात.',
          '<b>आकडेवारी व व्हिजिटर काऊंटर (site_stats):</b> एकूण मंजूर सदस्य व भेटींची संख्या दर्शविली जाते.',
        ])
      )}
      ${box(
        '२. आमच्याबद्दल व उद्दिष्ट्ये (AboutTab.tsx, ObjectivesTab.tsx)',
        bulletList([
          'संघाची स्थापना, घटनात्मक उद्दिष्ट्ये, शिक्षण क्षेत्रातील केंद्रप्रमुख व विस्तार अधिकाऱ्यांच्या मागण्या, हक्क व कर्तव्ये यांचे मुद्देसूद सादरीकरण.',
          'Razorpay व सरकारी नियमांनुसार संस्थेची पारदर्शक ओळख, नोंदणी क्रमांक आणि कार्यक्षेत्राचा (संपूर्ण ३६ जिल्हे) उल्लेख.',
        ])
      )}
      ${tipBox(
        'नवीन प्रोजेक्टसाठी UI डिझाईन नियम',
        'रंगसंगती नेहमी ३ मुख्य रंगांत ठेवा: <b>गडद निळा (#0b1e33 / #193568)</b> विश्वासासाठी, <b>भगवा/केशरी (#df6b16)</b> मुख्य बटणांसाठी (CTA), आणि <b>स्वच्छ पांढरा/स्लेट</b> वाचनीयतेसाठी. प्रत्येक कार्डवर पुरेशी मोकळी जागा (Padding) ठेवा.'
      )}
    `,
  },

  // PAGE 34: Chapter 9 - Leadership & Appointments
  {
    chapter: 'प्रकरण ९: वेबसाईट पेजेस अभ्यास',
    title: '९.३ प्रत्येक पानाची रचना — भाग ३: नेतृत्व व शासन निर्णय (Leadership & GR)',
    subtitle: 'LeadershipTab.tsx आणि AppointmentsTab.tsx कसे डायनॅमिक डेटा दाखवतात',
    bodyHtml: `
      ${box(
        '१. राज्य व जिल्हा नेतृत्व (LeadershipTab.tsx)',
        bulletList([
          'राज्य कार्यकारिणी, संस्थापक अध्यक्ष व सर्व जिल्ह्यांच्या अध्यक्षांची व पदाधिकाऱ्यांची माहिती सुबक कार्ड्समध्ये दिसते.',
          '<b>Admin मधून बदल:</b> कोड न बदलता ॲडमिन पॅनलमधील "पदाधिकारी व्यवस्थापन" टॅबमधून नवीन पदाधिकारी जोडता, बदलता किंवा डिलीट करता येतात — डेटा Firestore मधील <code>leadership</code> कलेक्शनमधून येतो.',
        ])
      )}
      ${box(
        '२. नियुक्त्या व शासन निर्णय (AppointmentsTab.tsx)',
        bulletList([
          'शालेय शिक्षण विभागाचे महत्त्वाचे शासन निर्णय (GR), नियुक्ती पत्रे व अधिकृत परिपत्रके तारखेनुसार फिल्टर व शोधासह येथे दिसतात.',
          'डेटा Firestore मधील <code>gov_orders</code> कलेक्शनमध्ये असतो व Admin पॅनलमधून नवीन GR अपलोड/लिंक करता येतात.',
        ])
      )}
    `,
  },

  // PAGE 35: Chapter 9 - News & Circulars + Caching
  {
    chapter: 'प्रकरण ९: वेबसाईट पेजेस अभ्यास',
    title: '९.४ प्रत्येक पानाची रचना — भाग ४: बातम्या, परिपत्रके व झिरो-कॉस्ट कॅशिंग',
    subtitle: 'NewsTab.tsx व अधिकृत लेटरपॅड व्ह्यूमध्ये Firestore खर्च कसा शून्यावर आणला आहे',
    bodyHtml: `
      ${box(
        '१. बातम्या व परिपत्रके टॅबची वैशिष्ट्ये (NewsTab.tsx)',
        bulletList([
          'बातम्या वर्गवारीनुसार (उदा. सर्व, महत्त्वाचे परिपत्रक, आंदोलन, राज्यस्तरीय बैठक) पाहता येतात.',
          'प्रत्येक बातमीवर क्लिक केल्यास संस्थेच्या <b>अधिकृत लेटरपॅड डिझाईनमध्ये</b> पूर्ण परिपत्रक वाचता येते व प्रिंट/शेअर करता येते.',
        ])
      )}
      ${box(
        '२. स्मार्ट localStorage कॅशिंग (fetchNewsCached in src/firebase.ts)',
        `<p style="margin:0 0 6px 0;">जर दिवसाला १०,००० शिक्षकांनी वेबसाईट उघडली, तर दरवेळी Firestore वरून ५० बातम्या वाचल्यास ५ लाख Reads होतील आणि Firebase चे मोफत कोटा संपेल! हे टाळण्यासाठी:</p>` +
        stepList([
          'पहिल्यांदा वेबसाईट उघडल्यावर बातम्या येतात व ब्राउझरच्या <code>localStorage</code> मध्ये <code>mahasangh_news_cache_v2</code> या नावाने ५ ते ३० मिनिटे सेव्ह होतात.',
          'त्यानंतर युझरने पेज कितीही वेळा रिफ्रेश केले तरी डेटा थेट ब्राउझरमधून येतो (<b>Zero Firestore Read Cost</b>).',
          'ॲडमिनने नवीन बातमी टाकताच कॅश कालबाह्य होतो किंवा <b>"ताजे करा"</b> बटनाने ताजी बातमी लगेच दिसते.',
        ])
      )}
    `,
  },

  // PAGE 36: Chapter 9 - Membership Registration Form
  {
    chapter: 'प्रकरण ९: वेबसाईट पेजेस अभ्यास',
    title: '९.५ सदस्यत्व नोंदणी फॉर्म (MembershipTab.tsx): मराठी नियम व ड्युप्लिकेट प्रतिबंध',
    subtitle: 'अर्ज भरण्यापासून ते दुबार नोंदणी रोखून थेट पेमेंटकडे नेण्यापर्यंतची संपूर्ण रचना',
    bodyHtml: `
      ${box(
        '१. फॉर्ममधील इनपुट नियम व स्वयंचलित तपासण्या',
        bulletList([
          '<b>मराठी भाषा सक्ती:</b> नाव, पत्ता, केंद्राचे नाव यांसारख्या फील्ड्समध्ये इंग्रजी अक्षरे (A-Z) टाकल्यास तात्काळ चेतावणी देऊन फक्त मराठी युनिकोडमध्ये भरण्याची सोय केली आहे.',
          '<b>जिल्हा → तालुका डायनॅमिक यादी:</b> जिल्हा निवडताच त्या जिल्ह्याचे नेमके तालुके आपोआप येतात (<code>mahasanghData.ts</code>).',
          '<b>फोटो ऑटो-कॉम्प्रेसर:</b> युझरने ५ MB चा फोटो अपलोड केला तरी <code>imageCompressor.ts</code> त्याला आपोआप ३००x३००px आणि <b>&lt;२०० KB</b> मध्ये लहान करून दाखवतो.',
          '<b>पिवळा हेल्पलाईन बॉक्स:</b> यातून जुनी थेट पेमेंट लिंक काढून फक्त <b>ज्ञानेश्वर नंदनवार सर (9423484305 / 8208494368)</b> यांची मदत संपर्क माहिती ठेवली आहे जेणेकरून कोणीही फॉर्म भरण्यापूर्वी पैसे पाठवू नयेत!',
        ])
      )}
      ${box(
        '२. ड्युप्लिकेट फॉर्म प्रतिबंध व पेमेंट रिकव्हरी (Anti-Duplicate Check)',
        stepList([
          'सबमिट करताना <code>findExistingApplicationInFirestore({ phone, email, fullName })</code> थेट Firestore मध्ये तपासते.',
          '<b>जर अर्ज आधीच Approved असेल:</b> नवीन अर्ज भरू दिला जात नाही; स्क्रीनवर त्यांचा सदस्य क्रमांक दाखवून थेट आय-कार्ड डाऊनलोड करण्याचा संदेश दिसतो!',
          '<b>जर अर्ज आधी भरलेला पण Pending असेल:</b> "तुमचा फॉर्म यापूर्वीच भरलेला आहे" असा स्पष्ट बॉक्स येतो आणि तिथेच <b>"₹२२० पेमेंट पूर्ण करा"</b> हे बटन मिळते — म्हणजे डबल फॉर्म न भरता त्याच जुन्या अर्जावर पेमेंट पूर्ण होते!',
        ])
      )}
    `,
  },

  // PAGE 37: Chapter 9 - Status Track, Directory, Contact, Footer
  {
    chapter: 'प्रकरण ९: वेबसाईट पेजेस अभ्यास',
    title: '९.६ अर्जाची स्थिती, अधिकृत यादी, संपर्क व Footer रचना',
    subtitle: 'आय-कार्ड शोध प्रणाली, सार्वजनिक सदस्य यादी आणि कायदेशीर पाने',
    bodyHtml: `
      ${box(
        '१. अर्जाची स्थिती तपासा व थेट पेमेंट/आय-कार्ड (Status Tracking)',
        bulletList([
          'सदस्य फक्त आपला <b>१० अंकी मोबाईल नंबर</b>, <b>अर्ज क्रमांक</b> किंवा <b>सदस्य क्रमांक</b> टाकून अर्जाची स्थिती पाहू शकतो.',
          'जर अर्ज <b>Approved & Paid</b> असेल → लगेच डिजिटल आय-कार्ड स्क्रीनवर दिसते व १ क्लिकमध्ये PDF डाऊनलोड करता येतो.',
          'जर अर्ज <b>Pending</b> असेल → फक्त "मी पैसे भरले" असे खोटे बटन न देता थेट <b>सुरक्षित Razorpay पेमेंट विंडो</b> उघडणारे बटन दिसते, ज्यामुळे पेमेंट पूर्ण होताच तात्काळ आय-कार्ड मिळते!',
        ])
      )}
      ${box(
        '२. अधिकृत सदस्य यादी (RegisteredMembersDirectory.tsx)',
        'संपूर्ण महाराष्ट्रातील मंजूर आजीवन सदस्यांची यादी जिल्हा व तालुक्यानुसार फिल्टर करून पाहता येते. यातही स्मार्ट कॅशिंग वापरले असल्याने सामान्य युझर्ससाठी सर्व्हरवर अतिरिक्त भार पडत नाही.'
      )}
      ${box(
        '३. संपर्क पेज व Footer (ContactTab.tsx & Footer.tsx)',
        'संपर्क फॉर्ममधील तक्रारी/प्रश्न Firestore मधील <code>contacts</code> मध्ये जमा होतात. Footer मध्ये संस्थेचा पत्ता (पाटणे, मालेगाव, जि. नाशिक), नोंदणी क्र., आणि Payment Gateway नियम (Privacy/Terms/Refund) दिले आहेत.'
      )}
    `,
  },

  // PAGE 38: Chapter 10 - Admin Panel Part 1
  {
    chapter: 'प्रकरण १०: ॲडमिन पॅनल व सुरक्षा',
    title: '१०.१ ॲडमिन पॅनल लॉगिन (RBAC) आणि मोबाईल डेटा बचत प्रणाली',
    subtitle: 'AdminTab.tsx मधील Super Admin vs Sub-Admin व १-मिनिट ऑटो-रिफ्रेश रचना',
    bodyHtml: `
      ${box(
        '१. Role-Based Access Control (RBAC — सुपर ॲडमिन व सह-व्यवस्थापक)',
        bulletList([
          '<b>सुपर ॲडमिन (Super Admin):</b> संपूर्ण वेबसाईटचे अधिकार — Sub-Admins तयार करणे, पासवर्ड बदलणे, Razorpay की बदलणे, सर्व अर्ज एडिट/डिलीट करणे, आणि गुप्त तांत्रिक रिपोर्ट (पिन 3506) पाहणे.',
          '<b>सह-व्यवस्थापक (Sub-Admins):</b> सुपर ॲडमिनने दिलेल्या मर्यादित परवानग्यांनुसार (जसे की फक्त बातम्या टाकणे किंवा अर्ज तपासणे) लॉगिन करू शकतात. डेटा <code>sub_admins</code> कलेक्शनमध्ये सेव्ह असतो.',
        ])
      )}
      ${box(
        '२. मोबाईल डेटा (MB) वाचवण्यासाठी १-मिनिट Auto-Refresh व Manual Refresh',
        stepList([
          '<b>जुनी समस्या:</b> पूर्वी Admin टॅबमध्ये Firestore चा <code>onSnapshot</code> Live Listener सतत चालू असल्यामुळे बॅकग्राउंडला मोबाइलचे शेकडो MB डेटा खर्च होत होते.',
          '<b>नवीन उपाय (<code>src/App.tsx</code> मध्ये):</b> तो सतत चालणारा लिसनर काढून टाकला आहे. आता Admin टॅब उघडल्यावर डेटा <b>एकदाच</b> लोड होतो आणि त्यानंतर दर <b>६० सेकंदांनी (१ मिनिटांनी)</b> एकदा ऑटो-रिफ्रेश होतो.',
          'त्याचबरोबर वर <b>"ताजे करा (Refresh)"</b> हे मॅन्युअल बटन दिले आहे, जे दाबल्यास क्षणात नवीन अर्ज व पेमेंट्स समोर येतात.',
          '<b>अतिशय महत्त्वाचे:</b> या बदलाचा सार्वजनिक सदस्यत्व फॉर्मवर, पेमेंटवर किंवा Webhook वर <b>कोणताही परिणाम होत नाही</b> — ते काम सर्व्हरवर २४ तास रिअल-टाइम चालू असते!',
        ])
      )}
    `,
  },

  // PAGE 39: Chapter 10 - Admin Panel Part 2 (Member Edit Manager)
  {
    chapter: 'प्रकरण १०: ॲडमिन पॅनल व सुरक्षा',
    title: '१०.२ Member Edit Manager — डुप्लिकेट डिलीट करणे व सदस्य क्रमांक दुरुस्ती',
    subtitle: 'MemberEditManager.tsx मधील शक्तिशाली शोध आणि डेटा दुरुस्ती साधने',
    bodyHtml: `
      <p style="font-size: 11.8px; line-height: 1.6; margin: 0 0 8px 0;">
        सदस्यांचे अर्ज मोठ्या संख्येने आल्यानंतर जर कधी कोणाचे नाव चुकले, फोटो बदलायचा असेल, जुन्या पद्धतीने डबल सदस्य क्रमांक (उदा. 0001) मिळाला असेल किंवा दुबार नोंदणी डिलीट करायची असेल, तर त्यासाठी स्वतंत्र <b>"सदस्य दुरुस्ती मॅनेजर"</b> बनवला आहे.
      </p>
      ${box(
        'MemberEditManager.tsx मधील मुख्य सुविधा',
        bulletList([
          '<b>झटपट शोध (Instant Search):</b> सदस्याचे नाव, १० अंकी मोबाईल नंबर, अर्ज क्रमांक किंवा सदस्य क्रमांकाने काही सेकंदांत अर्ज शोधता येतो.',
          '<b>सदस्य क्रमांक एडिट (Member Number Edit):</b> कोणत्याही मंजूर अर्जाचा सदस्य क्रमांक (उदा. <code>MS/NSK/2026/0001</code> बदलून नवीन अचूक क्रमांक) थेट एडिट करून सेव्ह करता येतो.',
          '<b>संपूर्ण वैयक्तिक माहिती व फोटो अपडेट:</b> नाव, जिल्हा, तालुका, केंद्र, पद, पत्ता व पासपोर्ट फोटो देखील अपडेट करता येतो.',
          '<b>डुप्लिकेट अर्ज डिलीट (Safe Delete):</b> खात्री करून दुबार झालेला <code>pending</code> किंवा चुकीचा अर्ज कायमचा काढून टाकता येतो.',
        ])
      )}
      ${warnBox(
        'पैसे न भरलेला अर्ज चुकूनही Approved करू नका!',
        'आपण Admin मधून विना-पेमेंट "Approve" करण्याची जुनी धोकादायक सोय काढून टाकली आहे. फक्त Razorpay द्वारे पक्के पेमेंट कन्फर्म झालेलेच अर्ज Approved होतात, ज्यामुळे हिशोबात १००% पारदर्शकता राहते.'
      )}
    `,
  },

  // PAGE 40: Chapter 10 - Admin Panel Part 3 (Excel, News, Secret Report)
  {
    chapter: 'प्रकरण १०: ॲडमिन पॅनल व सुरक्षा',
    title: '१०.३ Excel Export, सामग्री संपादन आणि गुप्त सुपर-ॲडमिन रिपोर्ट सुरक्षा',
    subtitle: 'xlsx अहवाल, बातम्या/GR संपादन आणि अनलेबल केशरी बटन (PIN 3506) रचना',
    bodyHtml: `
      ${box(
        '१. Admin मधील इतर व्यवस्थापन साधने',
        bulletList([
          '<b>Excel डाऊनलोड (`xlsx` लायब्ररी):</b> सर्व मंजूर व प्रलंबित सदस्यांची जिल्हा-तालुकावार यादी एका क्लिकवर Excel शीटमध्ये डाऊनलोड होते.',
          '<b>बातम्या व शासन निर्णय व्यवस्थापन:</b> नवीन बातमी/GR जोडणे, फोटो अपलोड करणे, जुन्या बातम्या एडिट/डिलीट करणे.',
          '<b>संपर्क संदेश व तक्रारी:</b> युझर्सनी Contact पेजवरून पाठवलेले मेसेज वाचून त्यांचे निवारण करणे.',
          '<b>Razorpay Gateway सेटिंग्ज:</b> गरज पडल्यास Admin पॅनलमधूनही Razorpay Key ID / Secret अपडेट करण्याची सोय.',
        ])
      )}
      ${box(
        '२. गुप्त डेव्हलपर रिपोर्ट बटन व पिन सुरक्षा (केवळ Super Admin साठी)',
        bulletList([
          '<b>कुठे आहे?</b> फक्त <code>currentUser?.isSuperAdmin</code> लॉगिन असतानाच ॲडमिन हेडरमध्ये उजव्या बाजूला एक छोटेसे <b>साधे केशरी रंगाचे चौकोनी बटन</b> दिसते (त्यावर कोणतेही नाव लिहिलेले नाही जेणेकरून इतर Sub-Admin ना ते काय आहे हे समजू नये!).',
          '<b>सुरक्षा पिन:</b> त्यावर क्लिक केल्यास <b>४ अंकी गुप्त पिन (<code>3506</code>)</b> विचारणारी पॉपअप विंडो उघडते.',
          'अचूक पिन टाकल्यानंतरच हे संपूर्ण ४७ पानांचे मराठी तांत्रिक मॅन्युअल PDF तयार होऊन तुमच्या डिव्हाइसवर डाऊनलोड होते.',
        ])
      )}
    `,
  },

  // PAGE 41: Chapter 11 - Digital ID Card PDF Generation
  {
    chapter: 'प्रकरण ११: PDF व मीडिया तंत्रज्ञान',
    title: '११.१ डिजिटल आय-कार्ड PDF (rkPdfGenerator.ts) कसे तयार होते?',
    subtitle: 'ब्राउझरमध्ये मराठी फॉन्ट व उच्च-दर्जाचे ID Card प्रिंट करण्यासाठी वापरलेले तंत्र',
    bodyHtml: `
      <p style="font-size: 11.8px; line-height: 1.6; margin: 0 0 8px 0;">
        <code>jsPDF</code> ही साधी PDF लायब्ररी इंग्रजी अक्षरे छान लिहिते, पण ती थेट मराठी जोडाक्षरे (जसे की "केंद्रप्रमुख", "महाराष्ट्र") फाडून टाकते! ही मोठी तांत्रिक अडचण आपण कशी सोडवली ते समजून घ्या:
      </p>
      ${box(
        'HTML-to-Canvas-to-PDF तंत्र (html2canvas + jsPDF)',
        stepList([
          '<b>Step 1 (अदृश्य HTML कार्ड):</b> <code>rkPdfGenerator.ts</code> ब्राउझरच्या स्क्रीनच्या बाहेर (<code>left: -9999px</code>) एक सुंदर HTML + CSS आय-कार्ड तयार करते ज्यावर Google चा <code>Noto Sans Devanagari</code> फॉन्ट, सदस्याचा पासपोर्ट फोटो, राज्याध्यक्षांची स्वाक्षरी (<code>/sign.jpg</code>), व लोगो लावला जातो.',
          '<b>Step 2 (High-DPI फोटो रूपांतरण):</b> <code>html2canvas</code> हे टूल त्या संपूर्ण HTML कार्डचा अतिशय स्पष्ट (Scale 2x/3x) इमेज स्नॅपशॉट काढते — त्यामुळे सर्व मराठी अक्षरे १००% अचूक दिसतात!',
          '<b>Step 3 (PDF तयार करणे):</b> <code>jsPDF</code> ती स्पष्ट प्रतिमा A4 / कार्ड साईझ PDF पानावर बसवून <code>Mahasangh_ID_...pdf</code> या नावाने डाऊनलोड करते.',
          '<b>Step 4 (Base64 ई-मेल अटॅचमेंट):</b> हेच PDF फाईल म्हणून डाऊनलोड करण्याऐवजी Base64 मजकुरात रूपांतरित करून <code>/api/email/send-id-card</code> ला पाठवले जाते आणि सदस्याच्या ई-मेलवर थेट जोडले जाते!',
        ])
      )}
    `,
  },

  // PAGE 42: Chapter 11 - Image Compression & Media Handling
  {
    chapter: 'प्रकरण ११: PDF व मीडिया तंत्रज्ञान',
    title: '११.२ पासपोर्ट फोटो कॉम्प्रेशन (imageCompressor.ts) व Firestore १ MB नियम',
    subtitle: 'मोठे मोबाइल फोटो आपोआप लहान करून डेटाबेस वेगवान ठेवण्याची पद्धत',
    bodyHtml: `
      ${box(
        'फोटो कॉम्प्रेशन का अनिवार्य आहे?',
        bulletList([
          'आजच्या आधुनिक स्मार्टफोनने काढलेला साधा पासपोर्ट फोटोसुद्धा <b>३ MB ते ८ MB</b> चा असतो.',
          'Google Cloud Firestore च्या एका डॉक्युमेंटची कमाल मर्यादा <b>१ MB (1,048,576 bytes)</b> आहे. जर ५ MB चा फोटो थेट सेव्ह केला तर डेटाबेस एरर येईल आणि वेबसाईट खूप हळू लोड होईल!',
          '<b>उपाय (<code>src/utils/imageCompressor.ts</code>):</b> सदस्य जसा फोटो निवडतो, तसाच ब्राउझरमधील HTML5 <code>&lt;canvas&gt;</code> त्या फोटोची रुंदी-उंची मर्यादित (उदा. कमाल 400px) करून JPEG क्वालिटी वापरून तो <b>५० KB ते १५० KB (&lt;200 KB)</b> मध्ये रूपांतरित करतो!',
        ])
      )}
      ${box(
        'फोटो जतन करण्याचे २ मार्ग (Base64 vs Cloudinary)',
        `<p style="margin:0 0 6px 0;">आपल्या प्रकल्पात सदस्याचे पासपोर्ट फोटो कॉम्प्रेस्ड Base64 Data URL म्हणून थेट <code>applications</code> डॉक्युमेंटमध्ये ठेवले आहेत (ज्यामुळे स्वतंत्र फाइल स्टोरेज बिलाशिवाय आय-कार्ड त्वरित जनरेट होते आणि CORS एरर येत नाही).</p>
         <p style="margin:0;">तसेच मोठ्या बातम्यांच्या इमेजेससाठी <code>src/utils/cloudinary.ts</code> सपोर्टही ठेवला आहे, जेणेकरून भविष्यात मोठे अल्बम जोडायचे असल्यास Cloudinary वापरता येईल.</p>`
      )}
    `,
  },

  // PAGE 43: Chapter 12 - Troubleshooting Part 1
  {
    chapter: 'प्रकरण १२: अडचणी व दुरुस्ती',
    title: '१२.१ तांत्रिक अडचणी व तत्काळ उपाय — भाग १ (सर्व्हर व होस्टिंग)',
    subtitle: 'साईट बंद पडल्यास किंवा Phusion Passenger एरर आल्यास काय तपासावे?',
    bodyHtml: `
      ${tableHtml(
        ['समस्या / एरर संदेश', 'नेमके कारण', 'पायरी-पायरीने कायमचा उपाय'],
        [
          ['<b>Phusion Passenger Error ID (HTTP 500)</b><br/>"Web application could not be started"', '१) नवीन जोडलेले npm पॅकेज HostKarle वर इन्स्टॉल नाही.<br/>२) <code>server.cjs</code> मध्ये सिंटॅक्स किंवा स्टार्टअप एरर.<br/>३) <code>firebase-applet-config.json</code> गहाळ.', '१) DirectAdmin मध्ये <b>Passenger log file</b> (<code>/home/savezpsc/logs/passenger.log</code>) उघडून नेमका एरर वाचा.<br/>२) <b>Run NPM Install</b> दाबून <b>Restart</b> करा.<br/>३) छोटे पॅकेज <code>build-server.mjs</code> मध्ये बंडल ठेवा.'],
          ['<b>/api/health उघडल्यावर JSON ऐवजी पूर्ण HTML पेज दिसते</b>', '<code>public_html</code> मध्ये जुनी <code>index.html</code> पडली आहे किंवा <code>.htaccess</code> मध्ये जुने <code>RewriteRule</code> आहेत.', '<code>public_html</code> मधून सर्व जुन्या फाईल्स काढून फक्त Passenger ची <code>.htaccess</code> ठेवा व त्यातील वरच्या जुन्या Rewrite ओळी काढा.'],
          ['<b>Can\'t acquire lock for app: mahasangh_node</b>', 'आधीचा Restart किंवा NPM Install पूर्ण होण्याआधीच पुन्हा क्लिक केले.', '१-२ मिनिटे थांबा, पेज F5 रिफ्रेश करा आणि मग एकदाच Restart क्लिक करा.'],
          ['<b>वेबसाईट www वर वेगळी व non-www वर वेगळी चालते</b>', 'कॅनॉनिकल रिडायरेक्ट नसणे किंवा SSL दोन्हीवर नसणे.', '<code>index.html</code> मधील <code>www</code> रिडायरेक्ट स्क्रिप्ट तपासा आणि SSL मध्ये दोन्ही नावे टिक करा.'],
        ]
      )}
    `,
  },

  // PAGE 44: Chapter 12 - Troubleshooting Part 2
  {
    chapter: 'प्रकरण १२: अडचणी व दुरुस्ती',
    title: '१२.२ तांत्रिक अडचणी व तत्काळ उपाय — भाग २ (पेमेंट, ई-मेल व डेटा)',
    subtitle: 'Razorpay, Webhook, SMTP Email आणि Firestore संदर्भातील अडचणी कशा सोडवाव्यात',
    bodyHtml: `
      ${tableHtml(
        ['समस्या / एरर संदेश', 'नेमके कारण', 'पायरी-पायरीने कायमचा उपाय'],
        [
          ['<b>पैसे कट झाले पण आय-कार्ड लगेच दिसले नाही</b>', 'पेमेंटनंतर युझरचा नेट कनेक्शन तुटला किंवा ब्राउझर बंद झाला.', '१) <b>अर्जाची स्थिती तपासा</b> मध्ये मोबाईल नंबर टाका.<br/>२) <b>Webhook</b> २-१० सेकंदांत आपोआप अर्ज Approved करतो.<br/>३) तरीही Pending दिसल्यास Razorpay Dashboard मधून Payment ID तपासून स्थिती रिफ्रेश करा.'],
          ['<b>Webhook Logs मध्ये 400 Invalid Signature दिसतो</b>', 'Razorpay Dashboard मधील Webhook Secret आणि HostKarle मधील <code>RAZORPAY_WEBHOOK_SECRET</code> वेगळे आहेत.', 'दोन्ही ठिकाणी अगदी एकसारखा पासवर्ड टाका, HostKarle वर Save → Restart करा.'],
          ['<b>मंजुरीनंतर ई-मेलवर PDF गेले नाही</b>', '<code>SMTP_USER</code> / <code>SMTP_PASS</code> सेट नाही, किंवा सदस्याचा ई-मेल पत्ता चुकीचा आहे.', '<code>https://mahasangh.in/api/health</code> वर <code>"emailConfigured": true</code> आहे का ते तपासा. नसल्यास HostKarle Environment Variables भरा.'],
          ['<b>Admin मध्ये नवीन अर्ज लगेच दिसत नाही</b>', 'डेटा वाचवण्यासाठी Live Listener काढून १-मिनिट Auto-Refresh ठेवला आहे.', 'फक्त ॲडमिन पॅनलमधील वरचे <b>"रिफ्रेश"</b> बटन क्लिक करा; ताजे सर्व अर्ज क्षणात लोड होतील.'],
        ]
      )}
    `,
  },

  // PAGE 45: Chapter 13 - Master AI Prompt for Future Projects
  {
    chapter: 'प्रकरण १३: मास्टर प्रॉम्प्ट व चेकलिस्ट',
    title: '१३.१ भविष्यात नवीन वेबसाईट बनवण्यासाठी तयार "मास्टर प्रॉम्प्ट" (Copy-Paste)',
    subtitle: 'पुढचा कोणताही नवीन प्रोजेक्ट सुरू करताना AI ला सुरुवातीलाच हा संपूर्ण प्रॉम्प्ट द्या!',
    bodyHtml: `
      <p style="font-size: 11.4px; line-height: 1.55; margin: 0 0 6px 0;">
        तुम्हाला भविष्यात दुसरी अशीच पूर्ण-क्षमतेची वेबसाईट बनवायची असेल, तर खालील बॉक्समधील प्रॉम्प्ट तुमच्या नवीन प्रोजेक्टच्या नावानुसार बदलून सुरुवातीलाच दिल्यास कोणतीही गोष्ट मागे राहणार नाही:
      </p>
      ${codeBlock(`"मला [संस्थेचे/प्रोजेक्टचे नाव] साठी एक संपूर्ण Full-Stack मराठी वेबसाईट बनवायची आहे. कृपया खालील तांत्रिक रचनेनुसार सुरुवातीपासून अचूक सेटअप करा:
१. Tech Stack: React 18 + TypeScript + Vite + Tailwind CSS (Frontend) आणि Node.js Express 5 (server.ts ज्यातून esbuild द्वारे CommonJS server.cjs तयार होईल) जे HostKarle DirectAdmin Phusion Passenger वर चालेल.
२. Database: Firebase Cloud Firestore वापरा. सर्व कलेक्शन्सची रचना firebase-blueprint.json मध्ये ठेवा. सर्व्हर व क्लायंट दोघेही तीच कॉन्फिग वापरतील.
३. Anti-Duplicate & Atomic Counter: नोंदणी फॉर्मवर मोबाईल, ई-मेल व नावानुसार आधीच भरलेला अर्ज तपासा; Pending असल्यास दुबार फॉर्म न बनवता थेट पेमेंट पूर्ण करण्याचा पर्याय द्या. सदस्य क्रमांक देण्यासाठी Firestore runTransaction (Atomic Counter) वापरा.
४. Payment & Webhook Security: Razorpay Checkout + Server HMAC-SHA256 (/api/razorpay/verify-payment) आणि Webhook (/api/razorpay/webhook with express.raw) जोडा. पक्क्या पेमेंटशिवाय विना-पेमेंट अर्ज मंजुरीचे कोणतेही बटण देऊ नका.
५. Media & Email: फोटो आपोआप <200KB कॉम्प्रेस करा. मंजुरीनंतर html2canvas + jsPDF ने मराठी उच्च-दर्जाचे PDF आय-कार्ड बनवून बंडल केलेल्या Nodemailer SMTP द्वारे सदस्याला ई-मेल करा.
६. Data/Cost Saving: सामान्य युझर्ससाठी बातम्या/यादी localStorage मध्ये कॅश करा. Admin Panel मध्ये महागडा Live Listener न ठेवता १-मिनिट Auto-Refresh व Manual Refresh बटण ठेवा.
७. Auto-Deploy: .github/workflows/ मध्ये GitHub Actions + FTP Deploy 워크फ्लो द्या जो npm run lint, vite build आणि server.cjs बंडल करून HostKarle वर आपोआप अपलोड करेल."`)}
    `,
  },

  // PAGE 46: Chapter 13 - 35-Point Launch Checklist
  {
    chapter: 'प्रकरण १३: मास्टर प्रॉम्प्ट व चेकलिस्ट',
    title: '१३.२ नवीन प्रोजेक्ट लॉंच करण्यापूर्वीची ३५-मुद्द्यांची अंतिम तपासणी (Checklist)',
    subtitle: 'एकही स्टेप विसरू नये म्हणून प्रोजेक्ट लाईव्ह करताना प्रत्येक बॉक्स समोर बरोबर (✓) करा',
    bodyHtml: `
      ${tableHtml(
        ['विभाग', 'करून घ्यायच्या अनिवार्य तपासण्या (Checklist Items)'],
        [
          ['<b>१. डोमेन व SSL</b><br/>(५ मुद्दे)', '☐ Domain Nameservers HostKarle ला जोडले<br/>☐ DNS मध्ये A, www, mail, MX व SPF रेकॉर्ड तपासले<br/>☐ DirectAdmin मध्ये Secure SSL व Force HTTPS चालू केले<br/>☐ Let\'s Encrypt SSL सर्टिफिकेट इन्स्टॉल केले<br/>☐ <code>index.html</code> मध्ये www → non-www रिडायरेक्ट लावला'],
          ['<b>२. HostKarle Node</b><br/>(६ मुद्दे)', '☐ Node.js 20/22 App (<code>mahasangh_node</code>) तयार केले (Production Mode)<br/>☐ Startup file <code>server.cjs</code> सेट केली<br/>☐ <code>public_html</code> मधील जुन्या HTML फाईल्स काढल्या व <code>.htaccess</code> स्वच्छ केले<br/>☐ सर्व Environment Variables (<code>RAZORPAY_*</code>, <code>SMTP_*</code>) सेव्ह केले<br/>☐ एकदा <b>Run NPM Install</b> चालवले व नंतर Restart केले<br/>☐ Passenger log पाथ सेट केला'],
          ['<b>३. GitHub व FTP</b><br/>(४ मुद्दे)', '☐ Private GitHub Repo व <code>.gitignore</code> सेट केले<br/>☐ HostKarle मध्ये FTP युझर व पाथ तयार केला<br/>☐ GitHub Secrets (<code>FTP_SERVER</code>, <code>FTP_USERNAME</code>, <code>FTP_PASSWORD</code>, <code>FTP_SERVER_DIR</code>) टाकले<br/>☐ <code>hostkarle-deploy.yml</code> हिरव्या टिक (✓) ने यशस्वी तपासले'],
          ['<b>४. Firebase व डेटा</b><br/>(५ मुद्दे)', '☐ नवीन Firebase प्रोजेक्ट व Firestore Database (Mumbai/nam5) तयार केले<br/>☐ <code>firebase-applet-config.json</code> अपडेट केले<br/>☐ <code>settings/member_counter</code> काऊंटर व <code>firestore.rules</code> डिप्लॉय केले<br/>☐ Admin पासवर्ड बदलून Firestore मध्ये सिंक केला<br/>☐ ड्युप्लिकेट चेक व १-मिनिट Admin Auto-Refresh तपासला'],
          ['<b>५. Razorpay व Email</b><br/>(५ मुद्दे)', '☐ Razorpay Live Mode वरून Key ID व Key Secret घेतले<br/>☐ Webhook URL (<code>/api/razorpay/webhook</code>) व Secret जोडले<br/>☐ Webhook Events मध्ये <code>payment.captured</code> व <code>order.paid</code> टिक केले<br/>☐ <code>info@domain</code> ई-मेल बनवून SMTP सेट केले<br/>☐ <code>/api/health</code> वर सर्व <code>true</code> व १ प्रत्यक्ष ₹२२० टेस्ट पेमेंट तपासले'],
        ]
      )}
    `,
  },

  // PAGE 47: Quick Reference Sheet
  {
    chapter: 'प्रकरण १३: मास्टर प्रॉम्प्ट व चेकलिस्ट',
    title: '१३.३ सर्व महत्त्वाचे पत्ते, पोर्टल्स व सेटिंग्जचा जलद संदर्भ तक्ता (Quick Reference)',
    subtitle: 'कोणत्याही क्षणी पाहायची महत्वाची सारांश यादी — सुरक्षित जतन करून ठेवा',
    bodyHtml: `
      ${tableHtml(
        ['पोर्टल / सेवा', 'अधिकृत वेब पत्ता (URL)', 'मुख्य आयडी / फाईल / सेटिंग'],
        [
          ['<b>मुख्य वेबसाईट</b>', '<code>https://mahasangh.in</code>', 'सार्वजनिक पोर्टल व सदस्यत्व नोंदणी'],
          ['<b>ॲडमिन डॅशबोर्ड</b>', '<code>https://mahasangh.in/#admin</code>', 'Super Admin, Sub-Admin, Member Edit Manager, Secret Pin <code>3506</code>'],
          ['<b>सर्व्हर हेल्थ तपासणी</b>', '<code>https://mahasangh.in/api/health</code>', 'सर्व्हिस स्टेटस JSON: Razorpay, Webhook, Firebase, Email'],
          ['<b>HostKarle DirectAdmin</b>', '<code>https://panel.hostkarle.in:2222</code>', 'User: <code>savezpsc</code> | Node App: <code>mahasangh_node</code> | Startup: <code>server.cjs</code>'],
          ['<b>Firebase Console</b>', '<code>https://console.firebase.google.com</code>', 'Project: <code>mh-membership</code> | DB: <code>ai-studio-rknewsite-...</code>'],
          ['<b>Razorpay Dashboard</b>', '<code>https://dashboard.razorpay.com</code>', 'Webhook: <code>https://mahasangh.in/api/razorpay/webhook</code>'],
          ['<b>GitHub Repository</b>', '<code>https://github.com/padmakarshinde043-byte/Padmakar-Chandrakant-Shinde</code>', 'Branch: <code>main</code> | Workflow: <code>hostkarle-deploy.yml</code>'],
          ['<b>SMTP ई-मेल सर्व्हर</b>', '<code>mail.mahasangh.in</code> (Port <code>465</code> SSL)', '<code>/api/email/send-id-card</code> द्वारे ऑटोमॅटिक PDF ई-मेल'],
        ]
      )}
      ${box(
        'अंतिम गुरुमंत्र (Golden Rule for Web Developers)',
        'कोणताही नवीन बदल केल्यावर नेहमी हाच ३-पायऱ्यांचा नियम पाळा:<br/>' +
        '<b>१) टेस्ट करा:</b> <code>npm run lint</code> आणि <code>npm run build</code> मध्ये एकही एरर नाही याची खात्री करा.<br/>' +
        '<b>२) पुश करा:</b> GitHub वर Push करा आणि Actions टॅबमध्ये हिरवी टिक (✓) येईपर्यंत १-२ मिनिटे थांबा.<br/>' +
        '<b>३) पडताळणी करा:</b> थेट <code>https://mahasangh.in/api/health</code> आणि मुख्य पान उघडून खात्री करा.<br/><br/>' +
        '<i>तुमच्या पुढील सर्व यशस्वी वेब डेव्हलपमेंट प्रकल्पांसाठी हार्दिक शुभेच्छा!</i>'
      )}
      <div style="text-align: center; margin-top: 14px; padding: 10px; background: #0b1e33; color: #fde047; border-radius: 8px; font-size: 11.5px; font-weight: 800;">
        महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ — तांत्रिक मास्टर मॅन्युअल समाप्त (पान ४७ / ४७)
      </div>
    `,
  },
];
