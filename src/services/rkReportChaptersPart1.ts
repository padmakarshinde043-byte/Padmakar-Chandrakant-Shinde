export interface ReportPageData {
  chapter: string;
  title: string;
  subtitle?: string;
  bodyHtml: string;
}

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
  <div style="background: #0f172a; color: #e2e8f0; font-family: monospace; font-size: 10.5px; line-height: 1.5; padding: 9px 12px; border-radius: 6px; margin: 6px 0 10px 0; white-space: pre-wrap; word-break: break-word;">${code}</div>
`;

const stepList = (items: string[]) => `
  <ol style="margin: 4px 0 10px 0; padding-left: 18px; font-size: 11.5px; line-height: 1.62; color: #1e293b;">
    ${items.map((item) => `<li style="margin-bottom: 5px;">${item}</li>`).join('')}
  </ol>
`;

const bulletList = (items: string[]) => `
  <ul style="margin: 4px 0 10px 0; padding-left: 18px; font-size: 11.5px; line-height: 1.62; color: #1e293b;">
    ${items.map((item) => `<li style="margin-bottom: 5px;">${item}</li>`).join('')}
  </ul>
`;

const tableHtml = (headers: string[], rows: string[][]) => `
  <table style="width: 100%; border-collapse: collapse; margin: 6px 0 10px 0; font-size: 10.8px;">
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

export const REPORT_PAGES_PART_1: ReportPageData[] = [
  // PAGE 1: Cover Page
  {
    chapter: 'मुखपृष्ठ (COVER)',
    title: 'संपूर्ण तांत्रिक मास्टर मॅन्युअल व डेव्हलपर अभ्यास पुस्तिका',
    subtitle: 'महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ (mahasangh.in) — A ते Z तांत्रिक मार्गदर्शक',
    bodyHtml: `
      <div style="background: linear-gradient(135deg, #0b1e33 0%, #193568 100%); color: #ffffff; border-radius: 12px; padding: 24px 22px; border-bottom: 5px solid #df6b16; margin-bottom: 16px;">
        <div style="font-size: 12px; color: #fde047; font-weight: 800; letter-spacing: 0.5px;">अधिकृत तांत्रिक दस्तावेज (CONFIDENTIAL SUPER-ADMIN EDITION)</div>
        <h2 style="font-size: 22px; margin: 8px 0 8px 0; font-weight: 900; line-height: 1.35;">वेबसाईट निर्माण, सर्व्हर होस्टिंग, डोमेन, डेटाबेस, पेमेंट गेटवे, ई-मेल व ऑटो-डिप्लॉयमेंटचे संपूर्ण मराठी प्रशिक्षण पुस्तक</h2>
        <p style="font-size: 12.5px; color: #e2e8f0; margin: 0; line-height: 1.6;">हे मॅन्युअल खास अशा नवशिक्या व शिकणाऱ्या वेब डेव्हलपरसाठी तयार केले आहे, ज्याला भविष्यात दुसरा नवीन प्रोजेक्ट स्वतःच्या हाताने उभा करताना कोणतीही स्टेप, आयडी, की (Key), सेटिंग किंवा पोर्टलची जोडणी विसरू नये.</p>
      </div>
      ${tableHtml(
        ['घटक (Component)', 'वापरलेले तंत्रज्ञान / पोर्टल', 'मुख्य कार्य'],
        [
          ['<b>मुख्य डोमेन</b>', 'https://mahasangh.in', 'संघाची अधिकृत वेबसाईट (SSL सह)'],
          ['<b>फ्रंटएंड (Frontend)</b>', 'React 18 + Vite + TypeScript + Tailwind CSS', 'सुंदर व मोबाईल-फ्रेंडली मराठी UI'],
          ['<b>बॅकएंड सर्व्हर (Backend)</b>', 'Node.js 22 + Express 5 (server.ts → server.cjs)', 'API, Razorpay पडताळणी, Webhook व Email'],
          ['<b>डेटाबेस (Database)</b>', 'Google Firebase Cloud Firestore (NoSQL)', 'अर्ज, सदस्य यादी, बातम्या, शासन निर्णय, काऊंटर'],
          ['<b>पेमेंट गेटवे (Gateway)</b>', 'Razorpay Checkout + Server Webhook', '₹२२० सुरक्षित पेमेंट व आपोआप मंजुरी'],
          ['<b>ई-मेल सर्व्हर (Email)</b>', 'HostKarle SMTP (mail.mahasangh.in:465) + Nodemailer', 'मंजूर सदस्यांना PDF आय-कार्ड ई-मेल'],
          ['<b>होस्टिंग (Hosting)</b>', 'HostKarle DirectAdmin + Phusion Passenger', 'Node.js ॲप व डिस्ट फाईल्स चालवणे'],
          ['<b>ऑटो-डिप्लॉय (CI/CD)</b>', 'GitHub + GitHub Actions (FTP Deploy)', 'Git Push केल्यावर १-२ मिनिटांत लाईव्ह अपडेट'],
        ]
      )}
      ${tipBox(
        'हे पुस्तक कसे वाचावे व वापरावे?',
        'पुढील सर्व पानांमध्ये या संपूर्ण वेबसाईटमधील <b>प्रत्येक पोर्टल (HostKarle, DirectAdmin, DNS, FTP, public_html, GitHub, Firebase, Razorpay, SMTP)</b> आणि <b>प्रत्येक पेजचा कोड</b> पायरी-पायरीने (Step-by-Step) समजावला आहे. नवीन प्रोजेक्ट बनवताना या पुस्तकातील अनुक्रमाने पायऱ्या पूर्ण केल्यास तुमची वेबसाईट १००% स्वतः चालेल. शेवटच्या प्रकरणामध्ये नवीन प्रोजेक्टसाठी कॉपी-पेस्ट करायचा <b>"मास्टर AI प्रॉम्प्ट"</b> देखील दिला आहे.'
      )}
      <div style="text-align: center; margin-top: 14px; font-size: 11px; color: #475569; border-top: 1px dashed #cbd5e1; padding-top: 10px;">
        <strong>तयार केले:</strong> महासंघ तांत्रिक प्रणाली | <strong>सुरक्षा स्तर:</strong> केवळ सुपर ॲडमिन (PIN Protected) | <strong>आवृत्ती:</strong> २.० (विस्तारित मास्टर आवृत्ती)
      </div>
    `,
  },

  // PAGE 2: Index / Table of Contents
  {
    chapter: 'अनुक्रमणिका (INDEX)',
    title: 'संपूर्ण अभ्यासक्रम अनुक्रमणिका व प्रोजेक्ट मॅप',
    subtitle: 'एकूण १३ प्रकरणे — नवीन प्रोजेक्ट तयार करण्यापासून लाईव्ह होस्टिंग व देखभालीपर्यंत',
    bodyHtml: `
      ${tableHtml(
        ['प्रकरण', 'विषयाचे नाव', 'पाने', 'मुख्य शिकण्याचे मुद्दे'],
        [
          ['<b>प्रकरण १</b>', 'संपूर्ण वेबसाईटचे आर्किटेक्चर व काम करण्याची पद्धत', '३ – ४', 'Browser, Node.js, Firestore, Razorpay संबंध'],
          ['<b>प्रकरण २</b>', 'डोमेन, Nameservers, DNS आणि SSL (HTTPS) सेटअप', '५ – ७', 'Domain जोडणे, A Record, www रिडायरेक्ट'],
          ['<b>प्रकरण ३</b>', 'HostKarle DirectAdmin: Node.js App व public_html', '८ – ११', 'mahasangh_node, SetEnv, Passenger, .htaccess'],
          ['<b>प्रकरण ४</b>', 'HostKarle FTP अकाउंट, File Manager व फोल्डर रचना', '१२ – १४', 'FTP युझर, पाथ, फाईल स्ट्रक्चर'],
          ['<b>प्रकरण ५</b>', 'GitHub व GitHub Actions (FTP Auto-Deploy)', '१५ – १८', 'Secrets, hostkarle-deploy.yml, Build & Push'],
          ['<b>प्रकरण ६</b>', 'Firebase Console, Firestore डेटाबेस व Rules', '१९ – २३', 'Config, Collections, Atomic Counter, MB बचत'],
          ['<b>प्रकरण ७</b>', 'Razorpay Payment Gateway व Webhook सुरक्षा', '२४ – २८', 'API Keys, Order API, HMAC Verify, Webhook'],
          ['<b>प्रकरण ८</b>', 'बॅकएंड सर्व्हर (server.ts), esbuild व SMTP Email', '२९ – ३१', 'सर्व API Routes, server.cjs बंडल, Nodemailer'],
          ['<b>प्रकरण ९</b>', 'सार्वजनिक पेजेस व प्रत्येक टॅबचे सविस्तर वर्णन', '३२ – ३७', 'Home ते Contact पर्यंत प्रत्येक फीचर व नियम'],
          ['<b>प्रकरण १०</b>', 'ॲडमिन पॅनल, Member Edit Manager व डेटा बचत', '३८ – ४०', 'RBAC लॉगिन, १-मिनिट रिफ्रेश, नंबर दुरुस्ती'],
          ['<b>प्रकरण ११</b>', 'डिजिटल आय-कार्ड PDF निर्मिती व फोटो कॉम्प्रेशन', '४१ – ४२', 'jsPDF + html2canvas, <200KB इमेज कॉम्प्रेसर'],
          ['<b>प्रकरण १२</b>', 'तांत्रिक अडचणी व दुरुस्ती (Troubleshooting Guide)', '४३ – ४४', 'Passenger 500, .htaccess, Webhook, Quota'],
          ['<b>प्रकरण १३</b>', 'नवीन प्रोजेक्टसाठी मास्टर AI प्रॉम्प्ट व लॉंच चेकलिस्ट', '४५ – ४७', 'Copy-Paste Prompt व ३५-मुद्द्यांची तपासणी'],
        ]
      )}
      ${box(
        'डेटाचा प्रवास कसा होतो? (End-to-End Request Flow)',
        `<b>१) युझरने mahasangh.in उघडले:</b> डोमेन DNS HostKarle सर्व्हरकडे पाठवतो → Apache + Phusion Passenger हा <code>server.cjs</code> ला रिक्वेस्ट देतो → <code>server.cjs</code> ही <code>dist/index.html</code> ब्राउझरला पाठवतो.<br/>
         <b>२) युझरने अर्ज भरला:</b> React फॉर्म डेटा व कॉम्प्रेस फोटो थेट Google Firebase Firestore (<code>applications</code>) मध्ये सेव्ह होतो.<br/>
         <b>३) युझरने ₹२२० भरले:</b> ब्राउझर <code>/api/razorpay/create-order</code> ला कॉल करतो → Razorpay पॉपअप उघडतो → पेमेंट होताच <code>/api/razorpay/verify-payment</code> व Razorpay चा Webhook सर्व्हरवर स्वाक्षरी तपासतात → सर्व्हर Firestore मध्ये पक्का सदस्य क्रमांक देतो व SMTP द्वारे PDF आय-कार्ड ई-मेल करतो!`
      )}
    `,
  },

  // PAGE 3: Chapter 1 - Architecture Part 1
  {
    chapter: 'प्रकरण १: आर्किटेक्चर',
    title: '१.१ वेबसाईटचे मुख्य ४ भाग व त्यांची कार्यपद्धती',
    subtitle: 'कोणत्याही आधुनिक Full-Stack वेबसाईटचा पाया कसा रचला जातो?',
    bodyHtml: `
      <p style="font-size: 12px; line-height: 1.65; margin: 0 0 10px 0;">
        अनेक नवीन डेव्हलपर्सना प्रश्न पडतो की फक्त HTML/CSS ने वेबसाईट का बनवत नाहीत आणि आपल्याला Node.js, Firebase, Razorpay अशा वेगवेगळ्या गोष्टी का जोडाव्या लागतात? याचे उत्तर खालील ४ थरांमध्ये (Layers) दडलेले आहे:
      </p>
      ${box(
        'स्तर १: फ्रंटएंड (Frontend — जे युझरला स्क्रीनवर दिसते)',
        `<b>फाईल फोल्डर:</b> <code>src/</code> आणि तयार बिल्ड <code>dist/</code><br/>
         <b>तंत्रज्ञान:</b> React 18, TypeScript (.tsx), Tailwind CSS, Vite.<br/>
         <b>कार्य:</b> युझरच्या मोबाईल किंवा संगणकावर दिसणारे बटणे, फॉर्म, फोटो, आय-कार्ड, बातम्या, ॲडमिन पॅनल हे सर्व React तयार करतो. ब्राउझरमध्ये <code>TypeScript</code> थेट चालत नाही; म्हणून <code>vite build</code> कमांड सर्व कोडचे साध्या JavaScript व HTML (<code>dist/</code> फोल्डर) मध्ये रूपांतर करते.`
      )}
      ${box(
        'स्तर २: बॅकएंड सर्व्हर (Backend Server — पडद्यामागील सुरक्षित मेंदू)',
        `<b>फाईल:</b> <code>server.ts</code> (तयार रूप: <code>server.cjs</code>)<br/>
         <b>तंत्रज्ञान:</b> Node.js (v22) + Express 5.<br/>
         <b>बॅकएंड का लागतो?</b> ब्राउझरमधील कोड कोणीही "Inspect / View Source" करून पाहू शकतो. त्यामुळे Razorpay चे <b>Key Secret</b>, <b>Webhook Secret</b>, किंवा <b>Email SMTP Password</b> कधीही फ्रंटएंडमध्ये ठेवता येत नाहीत. ही सर्व गुप्त कामे Node.js सर्व्हरवर होतात. तसेच आपल्या तयार <code>dist/</code> फाईल्स युझरला पोहोचवण्याचे कामही हाच सर्व्हर करतो.`
      )}
      ${box(
        'स्तर ३: क्लाउड डेटाबेस (Cloud Firestore — कायमस्वरूपी तिजोरी)',
        `<b>सेवा:</b> Google Firebase Cloud Firestore.<br/>
         <b>कार्य:</b> होस्टिंग सर्व्हर रीस्टार्ट झाला तरी डेटा जाऊ नये म्हणून सर्व सदस्यांचे अर्ज, फोटो, बातम्या, शासन निर्णय, संपर्क संदेश व ॲडमिन पासवर्ड Google च्या सुरक्षित क्लाउड डेटाबेसमध्ये साठवले जातात. हे डेटाबेस JSON सारख्या डॉक्युमेंट्स स्वरूपात (NoSQL) काम करते.`
      )}
      ${box(
        'स्तर ४: बाह्य सेवा (External APIs — पेमेंट व ई-मेल)',
        `<b>Razorpay API:</b> बँक/UPI पेमेंट घेण्यासाठी व ते खरेच झाले आहे याची क्रिप्टोग्राफिक (HMAC-SHA256) खात्री करण्यासाठी.<br/>
         <b>SMTP Email (Nodemailer):</b> स्वतःच्या डोमेनवरून (उदा. <code>info@mahasangh.in</code>) सदस्याच्या इनबॉक्समध्ये अधिकृत PDF आय-कार्ड पाठवण्यासाठी.`
      )}
    `,
  },

  // PAGE 4: Chapter 1 - Architecture Part 2
  {
    chapter: 'प्रकरण १: आर्किटेक्चर',
    title: '१.२ संपूर्ण प्रोजेक्टची फोल्डर व फाईल रचना (Project Tree)',
    subtitle: 'कोणत्या फोल्डरमध्ये नेमका कोणता कोड ठेवला आहे याची संपूर्ण यादी',
    bodyHtml: `
      <p style="font-size: 11.8px; line-height: 1.6; margin: 0 0 8px 0;">
        भविष्यात कोणताही बदल करायचा असल्यास नेमकी कोणती फाईल उघडायची हे समजण्यासाठी ही प्रोजेक्ट रचना लक्षात ठेवणे आवश्यक आहे:
      </p>
      ${tableHtml(
        ['फाईल / फोल्डर पाथ', 'प्रकार', 'नेमके काय काम करते?'],
        [
          ['<code>index.html</code>', 'एंट्री HTML', 'मराठी Google Fonts, Title, Razorpay Checkout स्क्रिप्ट व www रिडायरेक्ट'],
          ['<code>server.ts</code>', 'बॅकएंड कोड', 'Express सर्व्हर, सर्व <code>/api/*</code> रूट्स, Webhook, SMTP Email, Static <code>dist/</code> सर्व्हिंग'],
          ['<code>scripts/build-server.mjs</code>', 'बिल्ड स्क्रिप्ट', 'esbuild द्वारे <code>server.ts</code> मधून CommonJS <code>server.cjs</code> तयार करते'],
          ['<code>package.json</code>', 'प्रकल्प मॅनिफेस्ट', 'सर्व npm लायब्ररीज (express, firebase, razorpay, jspdf इ.) व स्क्रिप्ट्सची यादी'],
          ['<code>firebase-applet-config.json</code>', 'Firebase कीज', 'प्रोजेक्ट ID, API Key आणि Firestore Database ID (क्लायंट व सर्व्हर दोघे वापरतात)'],
          ['<code>firestore.rules</code>', 'डेटाबेस सुरक्षा', 'Firestore कलेक्शन्सवर वाचन/लेखन नियम लागू करते'],
          ['<code>src/App.tsx</code>', 'मुख्य UI कंट्रोलर', 'सर्व टॅब स्विचिंग, डेटा लोडिंग, ॲडमिन ऑटो-रिफ्रेश व #admin मार्ग'],
          ['<code>src/firebase.ts</code>', 'डेटाबेस लेयर', 'Firestore ला जोडणी, कॅशिंग (<code>fetchNewsCached</code>), व ड्युप्लिकेट तपासणी'],
          ['<code>src/data/mahasanghData.ts</code>', 'डेटा व मॉडेल्स', 'जिल्हे/तालुके याद्या, TypeScript Interfaces, सदस्य क्रमांक फॉरमॅटर'],
          ['<code>src/components/*.tsx</code>', 'विविध पेजेस', 'HomeTab, MembershipTab, AdminTab, MemberEditManager, NewsTab इ.'],
          ['<code>src/services/rkPdfGenerator.ts</code>', 'ID कार्ड PDF', 'मंजूर सदस्यांचे हाय-रिझोल्युशन PDF आय-कार्ड व Base64 तयार करणे'],
          ['<code>src/services/rkReportPdfGenerator.ts</code>', 'डेव्हलपर रिपोर्ट', 'तुम्ही सध्या वाचत असलेले हे संपूर्ण तांत्रिक मॅन्युअल तयार करणारा कोड'],
          ['<code>src/utils/razorpay.ts</code>', 'पेमेंट हेल्पर', 'ऑर्डर बनवणे, Razorpay विंडो उघडणे व स्वाक्षरी पडताळणी करणे'],
          ['<code>src/utils/imageCompressor.ts</code>', 'फोटो कॉम्प्रेसर', 'मोठे पासपोर्ट फोटो आपोआप <200KB साईझमध्ये लहान करणे'],
          ['<code>.github/workflows/hostkarle-deploy.yml</code>', 'CI/CD पाईपलाईन', 'GitHub Push नंतर आपोआप बिल्ड करून HostKarle वर FTP अपलोड करणे'],
        ]
      )}
      ${okBox(
        'डेव्हलपमेंट मोड vs प्रॉडक्शन मोड (Dev vs Production)',
        'AI Studio मध्ये काम करताना <code>npm run dev</code> (<code>tsx server.ts</code>) चालते जे लगेच बदल दाखवते. पण HostKarle च्या लाईव्ह सर्व्हरवर <b>Node.js Production Mode</b> मध्ये आपण थेट तयार केलेली <code>server.cjs</code> फाईल आणि <code>dist/</code> फोल्डर चालवतो, ज्यामुळे वेग खूप जास्त मिळतो आणि सर्व्हरची रॅम कमी वापरली जाते.'
      )}
    `,
  },

  // PAGE 5: Chapter 2 - Domain & DNS Part 1
  {
    chapter: 'प्रकरण २: डोमेन व DNS',
    title: '२.१ नवीन डोमेन खरेदी आणि HostKarle शी जोडण्याची प्रक्रिया',
    subtitle: 'डोमेन रजिस्ट्रार (उदा. GoDaddy / Hostinger / BigRock) ते HostKarle सर्व्हर जोडणी',
    bodyHtml: `
      <p style="font-size: 11.8px; line-height: 1.6; margin: 0 0 8px 0;">
        कोणतीही वेबसाईट इंटरनेटवर सर्वांना दिसण्यासाठी दोन गोष्टी लागतात: <b>१) नाव (Domain — जसे की mahasangh.in)</b> आणि <b>२) जागा (Hosting — जसे की HostKarle)</b>. या दोघांना जोडण्याचे काम <b>Nameservers (NS)</b> आणि <b>DNS Records</b> करतात.
      </p>
      ${box(
        'पायरी १: HostKarle चे Nameservers मिळवणे',
        stepList([
          'HostKarle कडून होस्टिंग घेतल्यावर तुमच्या ई-मेलवर <b>"New Account Information"</b> नावाचा ई-मेल येतो, किंवा HostKarle Client Area → Services → My Hosting मध्ये <b>Nameservers</b> दिसतात.',
          'साधारणपणे HostKarle चे दोन Nameservers असतात (उदा. <code>ns1.hostkarle.in</code> आणि <code>ns2.hostkarle.in</code> किंवा सर्व्हरचे विशिष्ट NS पत्ते).',
          'DirectAdmin मध्ये <b>Account Manager → DNS Management</b> मध्ये जाऊन तुमच्या सर्व्हरचा मुख्य <b>IP Address (उदा. 103.xxx.xxx.xxx)</b> देखील पाहता येतो.',
        ])
      )}
      ${box(
        'पायरी २: डोमेन रजिस्ट्रार पॅनेलमध्ये Nameservers अपडेट करणे',
        stepList([
          'तुम्ही जिथून डोमेन विकत घेतले आहे (GoDaddy / Hostinger / Namecheap / HostKarle) तिथे लॉगिन करा.',
          '<b>My Domains → mahasangh.in → Manage DNS / Nameservers</b> वर क्लिक करा.',
          '"Default Nameservers" बदलून <b>"Custom Nameservers"</b> निवडा.',
          'तिथे HostKarle चे दोन्ही Nameservers (NS1 व NS2) टाकून <b>Save</b> करा.',
          '<b>DNS Propagation वेळ:</b> नवीन Nameservers जगभरात लागू होण्यास ३० मिनिटे ते २४ तास लागू शकतात (सामान्यतः १–२ तासांत काम सुरू होते).',
        ])
      )}
      ${tipBox(
        'जर तुम्हाला Nameservers बदलायचे नसतील (फक्त A Record वापरायचा असेल तर):',
        'जर डोमेनची DNS मॅनेजमेंट दुसऱ्या ठिकाणी (उदा. Cloudflare किंवा GoDaddy DNS) ठेवायची असेल, तर तिथे जाऊन दोन <b>A Records</b> तयार करा:<br/>' +
        '• Host: <code>@</code> → Points to: <b>HostKarle Server IP</b> (TTL: Auto/300)<br/>' +
        '• Host: <code>www</code> → Points to: <b>HostKarle Server IP</b> (किंवा CNAME: <code>mahasangh.in</code>)'
      )}
    `,
  },

  // PAGE 6: Chapter 2 - Domain & DNS Part 2
  {
    chapter: 'प्रकरण २: डोमेन व DNS',
    title: '२.२ DirectAdmin मध्ये Domain Add करणे व Email साठी MX/SPF Records',
    subtitle: 'नवीन डोमेन DirectAdmin मध्ये कसे जोडावे आणि ई-मेल स्पॅममध्ये जाऊ नये म्हणून काय करावे',
    bodyHtml: `
      ${box(
        'पायरी ३: HostKarle DirectAdmin मध्ये Domain सेट करणे',
        stepList([
          '<b>DirectAdmin लॉगिन:</b> ब्राउझरमध्ये <code>https://panel.hostkarle.in:2222</code> उघडा आणि युझरनेम (उदा. <code>savezpsc</code>) व पासवर्ड टाकून लॉगिन करा.',
          '<b>Domain Setup:</b> डाव्या बाजूच्या मेनूमधून <b>Account Manager → Domain Setup</b> वर जा.',
          'जर मुख्य डोमेन आधीपासून नसेल तर <b>Add New</b> क्लिक करून <code>mahasangh.in</code> टाका. डिस्क स्पेस आणि बँडविड्थ "Same as Main Account" किंवा अमर्याद ठेवा.',
          '<b>PHP / Secure SSL टिक करा:</b> Domain सेटिंग्जमध्ये <b>Secure SSL</b> हा पर्याय नेहमी चालू (Checked) ठेवा, जेणेकरून HTTPS चालेल.',
          '<b>Force SSL (HTTPS Redirect):</b> Domain Setup मध्ये डोमेनवर क्लिक करून <b>Force SSL with https redirect</b> ही टिक जरूर चालू करा, जेणेकरून कोणीही <code>http://</code> टाकले तरी ते आपोआप सुरक्षित <code>https://</code> वर जाईल.',
        ])
      )}
      ${box(
        'पायरी ४: DNS Management मधील महत्त्वाचे Records (वेबसाईट + ई-मेलसाठी)',
        `<p style="margin:0 0 6px 0;">DirectAdmin → <b>Account Manager → DNS Management</b> मध्ये खालील रेकॉर्ड्स अचूक असले पाहिजेत:</p>` +
        tableHtml(
          ['Record नाव', 'Type', 'Value (मूल्य)', 'कशासाठी वापरतात?'],
          [
            ['<code>mahasangh.in.</code>', 'A', 'सर्व्हरचा IP Address', 'मुख्य डोमेन सर्व्हरशी जोडण्यासाठी'],
            ['<code>www</code>', 'A किंवा CNAME', 'सर्व्हरचा IP / mahasangh.in.', 'www.mahasangh.in उघडण्यासाठी'],
            ['<code>mail</code>', 'A', 'सर्व्हरचा IP Address', 'SMTP सर्व्हर (mail.mahasangh.in) साठी'],
            ['<code>mahasangh.in.</code>', 'MX (10)', '<code>mail.mahasangh.in.</code>', 'ई-मेल येण्यासाठी आणि जाण्यासाठी'],
            ['<code>mahasangh.in.</code>', 'TXT (SPF)', '<code>v=spf1 a mx ip4:SERVER_IP ~all</code>', 'पाठवलेले आय-कार्ड ई-मेल Spam मध्ये जाऊ नये म्हणून'],
            ['<code>x._domainkey</code>', 'TXT (DKIM)', 'DirectAdmin मधून ऑटो जनरेट', 'ई-मेलला अधिकृत डिजिटल स्वाक्षरी मिळण्यासाठी'],
          ]
        )
      )}
      ${okBox(
        'DNS तपासण्याची सोपी युक्ती',
        'तुमचे डोमेन HostKarle शी योग्यरीत्या जोडले गेले आहे का हे तपासण्यासाठी Google वर <b>dnschecker.org</b> वर जाऊन <code>mahasangh.in</code> टाकून <b>A</b> रेकॉर्ड सर्वत्र हिरव्या टिकमध्ये सर्व्हरचा IP दाखवतो का ते पाहता येते.'
      )}
    `,
  },

  // PAGE 7: Chapter 2 - SSL & Canonical www Redirect
  {
    chapter: 'प्रकरण २: डोमेन व DNS',
    title: '२.३ मोफत SSL सर्टिफिकेट (HTTPS) व www → non-www एकत्रीकरण',
    subtitle: 'ब्राउझरमध्ये "Not Secure" एरर येऊ नये आणि पेमेंट गेटवे अचूक चालावा यासाठी सेटअप',
    bodyHtml: `
      ${box(
        '१. Let\'s Encrypt मोफत SSL सर्टिफिकेट कसे मिळवायचे?',
        stepList([
          'Razorpay पेमेंट गेटवे आणि आधुनिक ब्राउझर <b>HTTPS (कुलूप चिन्ह)</b> शिवाय चालत नाहीत.',
          'DirectAdmin मध्ये <b>Account Manager → SSL Certificates</b> वर क्लिक करा.',
          '<b>"Get automatic certificate from ACME Provider"</b> (Let\'s Encrypt) हा पर्याय निवडा.',
          'लिस्टमध्ये <b><code>mahasangh.in</code></b> आणि <b><code>www.mahasangh.in</code></b> (तसेच हवे असल्यास <code>mail.mahasangh.in</code>) दोन्ही समोर टिक करा.',
          '<b>Save</b> बटनावर क्लिक करा. काही सेकंदांत सर्टिफिकेट इन्स्टॉल झाल्याचा संदेश येईल. हे दर ९० दिवसांनी सर्व्हरवर आपोआप रिन्यू (Auto-Renew) होते.',
        ])
      )}
      ${box(
        '२. www.mahasangh.in ते mahasangh.in एकत्रीकरण (Canonical Redirect)',
        `<p style="margin:0 0 6px 0;"><b>समस्या का येते?</b> जर एकाने <code>https://www.mahasangh.in</code> उघडले आणि दुसऱ्याने <code>https://mahasangh.in</code> उघडले, तर Razorpay Callback, Google Login, आणि Browser <code>localStorage</code> कॅश दोन वेगवेगळ्या साईट समजून गोंधळ घालू शकतात.</p>
         <p style="margin:0 0 6px 0;"><b>उपाय:</b> आपण <code>index.html</code> च्या अगदी सुरुवातीला (<code>&lt;head&gt;</code> मध्ये) ही छोटी स्क्रिप्ट ठेवली आहे:</p>` +
        codeBlock(`<script>\n  if (window.location.hostname === 'www.mahasangh.in') {\n    window.location.replace('https://mahasangh.in' + window.location.pathname + window.location.search + window.location.hash);\n  }\n</script>`) +
        `<p style="margin:0;">यामुळे कोणीही <code>www</code> लावून साईट उघडली तरी सेकंदाच्या हजाराव्या भागात ती मूळ <code>https://mahasangh.in</code> वर जाते आणि प्रत्येक युझरसाठी URL एकसंध राहते.</p>`
      )}
      ${warnBox(
        'महत्त्वाची काळजी: SSL नसताना Let\'s Encrypt फेल झाल्यास?',
        'जर SSL मिळवताना एरर आला, तर तपासा की डोमेनचे Nameservers पूर्ण अपडेट झाले आहेत का, आणि <code>public_html</code> मध्ये असे कोणतेही <code>.htaccess</code> नियम नाहीत ना जे <code>/.well-known/acme-challenge/</code> या फोल्डरला ब्लॉक करत आहेत!'
      )}
    `,
  },

  // PAGE 8: Chapter 3 - HostKarle Node.js Setup Part 1
  {
    chapter: 'प्रकरण ३: HostKarle Node.js',
    title: '३.१ DirectAdmin मधील "Setup Node.js App" संपूर्ण सेटअप',
    subtitle: 'साध्या PHP होस्टिंगवर Node.js Express सर्व्हर कसा तयार करावा व डोमेनशी जोडावा',
    bodyHtml: `
      <p style="font-size: 11.8px; line-height: 1.6; margin: 0 0 8px 0;">
        HostKarle सारख्या CloudLinux सर्व्हरवर Node.js वेबसाईट चालवण्यासाठी <b>"Setup Node.js App"</b> हे टूल वापरतात. हे टूल तुमच्यासाठी स्वतंत्र Node.js व्हर्च्युअल एन्व्हायर्नमेंट आणि Phusion Passenger सर्व्हर तयार करते.
      </p>
      ${box(
        'नवीन Node.js ॲप तयार करण्याच्या नेमक्या पायऱ्या (Create Application)',
        stepList([
          'DirectAdmin मध्ये लॉगिन करून <b>Extra Features → Setup Node.js App</b> उघडा.',
          'वरच्या उजव्या कोपऱ्यातील <b>"CREATE APPLICATION"</b> बटनावर क्लिक करा.',
          'खालील तक्त्याप्रमाणे प्रत्येक रकाना अचूक भरा आणि शेवटी <b>CREATE</b> वर क्लिक करा:',
        ]) +
        tableHtml(
          ['सेटिंग फील्ड नाव', 'आपले नेमके मूल्य (Value)', 'स्पष्टीकरण (का ठेवायचे?)'],
          [
            ['<b>Node.js version</b>', '<code>22.23.2</code> (किंवा 20.x/22.x)', 'आधुनिक JS व Nodemailer साठी Node 20+ आवश्यक'],
            ['<b>Application mode</b>', '<code>Production</code>', 'लाईव्ह साईट वेगवान चालते व <code>NODE_ENV=production</code> मिळतो'],
            ['<b>Application root</b>', '<code>mahasangh_node</code> (पूर्ण पाथ: <code>/home/savezpsc/mahasangh_node</code>)', 'तुमचा सर्व्हर कोड, dist व server.cjs राहण्याचे फोल्डर. हे <b>public_html च्या बाहेर</b> असते!'],
            ['<b>Application URL</b>', '<code>mahasangh.in</code> (पुढील बॉक्स रिकामा ठेवा)', 'मुख्य डोमेनवर वेबसाईट थेट उघडण्यासाठी'],
            ['<b>Application startup file</b>', '<code>server.cjs</code>', 'Passenger सर्व्हर सुरू होताना सर्वप्रथम हीच फाईल चालवतो'],
            ['<b>Passenger log file</b>', '<code>/home/savezpsc/logs/passenger.log</code>', 'सर्व्हरला एरर आल्यास कारण इथे रेकॉर्ड होते'],
          ]
        )
      )}
      ${warnBox(
        'अतिशय महत्त्वाची सुरक्षा टीप: Application Root कधीही public_html ठेवू नका!',
        'तुमचे Node.js फोल्डर (<code>mahasangh_node</code>) नेहमी <code>public_html</code> च्या वरच्या पातळीवर (<code>/home/तुमचे_युझरनेम/mahasangh_node</code>) ठेवा. जर ते <code>public_html</code> मध्ये ठेवले, तर बाहेरचा कोणीही <code>razorpay-config.json</code> किंवा <code>server.cjs</code> सारख्या गुप्त फाईल्स ब्राउझरवरून थेट पाहण्याचा प्रयत्न करू शकतो!'
      )}
    `,
  },

  // PAGE 9: Chapter 3 - HostKarle Environment Variables
  {
    chapter: 'प्रकरण ३: HostKarle Node.js',
    title: '३.२ Environment Variables (गुप्त कीज व पासवर्ड) कसे सेट करावेत',
    subtitle: 'GitHub वर कोड सार्वजनिक असला तरी पासवर्ड सुरक्षित ठेवण्याची व्यावसायिक पद्धत',
    bodyHtml: `
      <p style="font-size: 11.8px; line-height: 1.6; margin: 0 0 8px 0;">
        कोणतीही गुप्त की (Razorpay Key Secret, Webhook Secret, SMTP Password) थेट <code>server.ts</code> किंवा GitHub कोडमध्ये लिहू नये. ती नेहमी HostKarle च्या <b>Environment Variables</b> सेक्शनमध्ये ठेवावी लागते.
      </p>
      ${box(
        'DirectAdmin मध्ये Environment Variables जोडण्याची पद्धत',
        stepList([
          '<b>Setup Node.js App</b> मध्ये तुमच्या <code>mahasangh_node</code> ॲपसमोर असलेल्या <b>Edit (पेन्सिल आयकॉन)</b> वर क्लिक करा.',
          'सर्वात खाली स्क्रोल करा → तिथे <b>"Environment variables"</b> नावाचा विभाग दिसेल.',
          '<b>"+ ADD VARIABLE"</b> बटनावर क्लिक करून खालील तक्त्यातील प्रत्येक Name आणि Value भरा:',
        ]) +
        tableHtml(
          ['Variable Name (अचूक स्पेलिंग)', 'Value कुठून आणायची?', 'कोणते काम करते?'],
          [
            ['<code>RAZORPAY_KEY_ID</code>', 'Razorpay Dashboard → API Keys (<code>rzp_live_...</code>)', 'पेमेंट ऑर्डर व पॉपअप सुरू करण्यासाठी'],
            ['<code>RAZORPAY_KEY_SECRET</code>', 'Razorpay Dashboard → API Keys मधून मिळालेले Secret', 'पेमेंट स्वाक्षरी (HMAC) पडताळणीसाठी'],
            ['<code>RAZORPAY_WEBHOOK_SECRET</code>', 'Razorpay Webhooks सेट करताना तुम्ही ठेवलेला पासवर्ड', 'Webhook खरे असल्याची खात्री करण्यासाठी'],
            ['<code>SMTP_HOST</code>', '<code>mail.mahasangh.in</code>', 'HostKarle चा ई-मेल सर्व्हर पत्ता'],
            ['<code>SMTP_PORT</code>', '<code>465</code>', 'SSL सुरक्षित ई-मेल पोर्ट क्रमांक'],
            ['<code>SMTP_USER</code>', 'उदा. <code>info@mahasangh.in</code>', 'DirectAdmin मध्ये बनवलेला ई-मेल आयडी'],
            ['<code>SMTP_PASS</code>', 'त्या ई-मेल आयडीचा पासवर्ड', 'Nodemailer लॉगिनसाठी'],
            ['<code>SMTP_FROM</code>', '<code>info@mahasangh.in</code>', 'सदस्यांना दिसणारा पाठवणारा पत्ता'],
          ]
        ) +
        `<p style="margin:6px 0 0 0; font-size:11.5px;"><b>४.</b> सर्व व्हेरिएबल्स टाकल्यावर वर जाऊन उजव्या कोपऱ्यातील <b>"SAVE"</b> बटनावर क्लिक करा आणि नंतर <b>"RESTART"</b> दाबा.</p>`
      )}
      ${tipBox(
        'हे DirectAdmin मध्ये कुठे सेव्ह होते?',
        'तुम्ही DirectAdmin मध्ये Environment Variables सेव्ह करता तेव्हा ते तुमच्या डोमेनच्या <code>public_html/.htaccess</code> मध्ये <code>SetEnv VAR_NAME "value"</code> या स्वरूपात आपोआप लिहिले जातात. म्हणूनच <code>.htaccess</code> ची आधीची सिस्टीम कोडिंग कधीही डिलीट करू नये!'
      )}
    `,
  },

  // PAGE 10: Chapter 3 - NPM Install, Restart, Passenger & Lock Errors
  {
    chapter: 'प्रकरण ३: HostKarle Node.js',
    title: '३.३ Run NPM Install, Restart बटण आणि Phusion Passenger लॉजिक',
    subtitle: 'सर्व्हर सुरू कसा होतो, Lock एरर का येतो आणि बंडलिंगमुळे साईट सुरक्षित कशी राहते',
    bodyHtml: `
      ${box(
        '१. Node.js Selector मधील महत्त्वाची बटणे व त्यांचा उपयोग',
        bulletList([
          '<b>Run NPM Install:</b> जेव्हा आपण पहिल्यांदाच प्रकल्प HostKarle वर टाकतो किंवा <code>package.json</code> मध्ये <code>express</code>, <code>razorpay</code>, <code>firebase</code> सारखे मोठे पॅकेज जोडतो, तेव्हा हे बटण दाबावे लागते. हे सर्व्हरवर <code>node_modules</code> फोल्डर डाऊनलोड करते.',
          '<b>Restart:</b> कोड अपलोड झाल्यावर किंवा Environment Variables बदलल्यावर सर्व्हर पुन्हा सुरू करण्यासाठी हे बटण दाबतात.',
          '<b>Stop App / Start App:</b> सर्व्हर पूर्णपणे बंद करून नव्याने सुरू करण्यासाठी.',
        ])
      )}
      ${box(
        '२. "Can\'t acquire lock for app: mahasangh_node" एरर आल्यास काय करावे?',
        `<p style="margin:0 0 6px 0;">जेव्हा तुम्ही एकाच वेळी <b>Run NPM Install</b> किंवा <b>Restart</b> दोनदा क्लिक करता, तेव्हा CloudLinux सर्व्हर एक तात्पुरती लॉक फाईल बनवतो. त्यामुळे दुसऱ्या क्लिकवर हा एरर दिसतो.</p>
         <p style="margin:0;"><b>उपाय:</b> घाबरू नका! फक्त <b>१ ते २ मिनिटे शांतपणे थांबा</b> (मागील काम पूर्ण होऊ द्या), पेज रिफ्रेश (F5) करा आणि मग एकदाच <b>Restart</b> किंवा <b>Run NPM Install</b> दाबा.</p>`
      )}
      ${box(
        '३. Phusion Passenger कसे काम करते व आपण Nodemailer बंडल का केले?',
        `<p style="margin:0 0 6px 0;"><b>Phusion Passenger</b> हे Apache वेब सर्व्हरला Node.js शी जोडणारे इंजिन आहे. जेव्हा कोणी <code>mahasangh.in</code> उघडतो, तेव्हा Passenger तुमची <code>server.cjs</code> फाईल चालू करतो. जर <code>server.cjs</code> मध्ये असा एखादा <code>require("package")</code> असेल जो सर्व्हरच्या <code>node_modules</code> मध्ये नाही, तर Passenger लगेच <b>Error ID (HTTP 500)</b> देऊन सर्व्हर थांबवतो.</p>
         <p style="margin:0;"><b>आपली सुधारणा:</b> म्हणूनच आपण <code>scripts/build-server.mjs</code> मध्ये <code>nodemailer</code> सारखे पॅकेज थेट <code>server.cjs</code> मध्ये <b>बंडल (Bundle)</b> केले आहे जेणेकरून GitHub FTP Auto-Deploy नंतर कधीही सर्व्हरवर क्रॅश येऊ नये!</p>`
      )}
      ${okBox(
        'लॉईव्ह सर्व्हर तपासण्याची मुख्य लिंक (/api/health)',
        'कोणत्याही वेळी तुमचा Node.js सर्व्हर, Razorpay आणि Firebase नीट चालू आहेत का हे तपासण्यासाठी ब्राउझरमध्ये <b><code>https://mahasangh.in/api/health</code></b> उघडा. तिथे <code>{"status":"ok", ...}</code> असे JSON उत्तर दिसले म्हणजे सर्व्हर १००% सुरू आहे!'
      )}
    `,
  },

  // PAGE 11: Chapter 3 - public_html & .htaccess Deep Dive
  {
    chapter: 'प्रकरण ३: HostKarle Node.js',
    title: '३.४ public_html फोल्डर व .htaccess चे नेमके काम (अतिशय महत्त्वाचे!)',
    subtitle: 'public_html मध्ये काय ठेवावे, काय काढून टाकावे आणि /api/health ला HTML का मिळत होता?',
    bodyHtml: `
      <p style="font-size: 11.8px; line-height: 1.6; margin: 0 0 8px 0;">
        जुन्या HTML किंवा PHP वेबसाईट आपण थेट <code>public_html</code> फोल्डरमध्ये ठेवायचो. पण आपली वेबसाईट <b>Node.js App</b> असल्याने <code>public_html</code> बद्दलचा नियम पूर्णपणे वेगळा आहे!
      </p>
      ${warnBox(
        'गंभीर चूक जी टाळायची आहे: public_html मध्ये जुनी index.html ठेवू नका!',
        'जर तुमच्या <code>/domains/mahasangh.in/public_html/</code> फोल्डरमध्ये चुकून जुनी <code>index.html</code> किंवा <code>assets/</code> फाईल्स पडलेल्या असतील, तर Apache सर्व्हर तुमच्या Node.js सर्व्हरकडे न जाता आधीच ती जुनी HTML फाईल दाखवतो! आपल्या प्रकल्पात सुरुवातीला <code>mahasangh.in/api/health</code> उघडल्यावर JSON ऐवजी HTML पान येत होते, त्याचे नेमके कारण हेच होते!'
      )}
      ${box(
        'public_html फोल्डरमध्ये नेमके काय राहिले पाहिजे?',
        stepList([
          '<b>केवळ <code>.htaccess</code> ही एकच फाईल</b> (आणि हवे असल्यास Let\'s Encrypt साठी <code>.well-known</code> फोल्डर). बाकी कोणतीही <code>index.html</code>, <code>dist.zip</code> किंवा जुन्या इमेजेस <code>public_html</code> मध्ये ठेवू नका.',
          '<b>Hidden Files पाहणे:</b> DirectAdmin File Manager मध्ये <code>.htaccess</code> दिसत नसेल, तर वरच्या Settings मध्ये <b>"Show Hidden Files"</b> टिक करा.',
        ])
      )}
      ${box(
        '.htaccess मध्ये काय असावे व काय नसावे?',
        `<p style="margin:0 0 6px 0;">DirectAdmin जेव्हा Node.js App जोडते, तेव्हा ते आपोआप <code># DO NOT REMOVE. CLOUDLINUX PASSENGER CONFIGURATION BEGIN</code> पासून <code>END</code> पर्यंतचा कोड <code>.htaccess</code> मध्ये लिहिते:</p>` +
        codeBlock(`# DO NOT REMOVE. CLOUDLINUX PASSENGER CONFIGURATION BEGIN\nPassengerAppRoot "/home/savezpsc/mahasangh_node"\nPassengerBaseURI "/"\nPassengerNodejs "/home/savezpsc/nodevenv/mahasangh_node/22/bin/node"\nPassengerAppType node\nPassengerStartupFile server.cjs\n# DO NOT REMOVE. CLOUDLINUX PASSENGER CONFIGURATION END`) +
        `<p style="margin:0;">जर याच्या वर किंवा खाली कोणतेही जुने <code>RewriteEngine On</code> किंवा <code>RewriteRule .* /index.html [L]</code> असतील (जे जुन्या React Static होस्टिंगसाठी टाकले होते), तर ते <b>तात्काळ डिलीट करावेत</b>; अन्यथा <code>/api/razorpay/webhook</code> चालणार नाही!</p>`
      )}
    `,
  },

  // PAGE 12: Chapter 4 - FTP Account Setup
  {
    chapter: 'प्रकरण ४: FTP व File Manager',
    title: '४.१ HostKarle DirectAdmin मध्ये FTP Account कसे तयार करावे?',
    subtitle: 'GitHub Actions किंवा FileZilla मधून सर्व्हरवर स्वयंचलित फाईल्स पाठवण्यासाठी FTP जोडणी',
    bodyHtml: `
      <p style="font-size: 11.8px; line-height: 1.6; margin: 0 0 8px 0;">
        <b>FTP (File Transfer Protocol)</b> म्हणजे आपल्या संगणकावरून किंवा GitHub सर्व्हरवरून थेट HostKarle च्या सर्व्हरवर फाईल्स अपलोड करण्याचा मार्ग. प्रत्येक वेळी मॅन्युअली झिप अपलोड न करता GitHub Actions याच FTP अकाउंटने फाईल्स पाठवते.
      </p>
      ${box(
        'HostKarle मध्ये नवीन FTP अकाउंट तयार करण्याची पायरी-पायरी कृती',
        stepList([
          'DirectAdmin मध्ये लॉगिन करून <b>Account Manager → FTP Management</b> वर क्लिक करा.',
          'वरच्या बाजूला असलेल्या <b>"CREATE FTP ACCOUNT"</b> बटनावर क्लिक करा.',
          '<b>FTP Username:</b> तुमचे आवडते नाव टाका (उदा. <code>deploy</code> किंवा <code>github</code>). DirectAdmin त्यापुढे तुमचा मुख्य युझर/डोमेन लावून पूर्ण युझरनेम तयार करते (उदा. <code>deploy@mahasangh.in</code> किंवा मुख्य युझरनेम <code>savezpsc</code> देखील वापरता येते).',
          '<b>Password:</b> एक मजबूत पासवर्ड तयार करा आणि सुरक्षित लिहून ठेवा (ज्यात स्पेशल कॅरेक्टर्स फार किचकट नकोत जेणेकरून GitHub Secrets मध्ये अचूक बसेल).',
          '<b>Path (अतिशय महत्त्वाचे!):</b> जर स्वतंत्र FTP युझर बनवला तर त्याचा पाथ <b>Custom</b> निवडून <code>/home/savezpsc/mahasangh_node</code> द्या. (किंवा मुख्य डायरेक्ट अ‍ॅडमिन FTP वापरत असाल तर पाथ <code>/</code> राहतो आणि GitHub मध्ये <code>FTP_SERVER_DIR</code> हे <code>/mahasangh_node/</code> ठेवावे लागते.)',
          '<b>Create</b> दाबा. तयार झाल्यावर खालील ४ गोष्टी नोट करून ठेवा:',
        ]) +
        tableHtml(
          ['FTP माहिती', 'आपले नेमके उदाहरण', 'वापर कुठे होतो?'],
          [
            ['FTP Host / Server', '<code>panel.hostkarle.in</code> (किंवा सर्व्हर IP)', 'GitHub Secret: <code>FTP_SERVER</code>'],
            ['FTP Username', 'मुख्य युझर <code>savezpsc</code> किंवा <code>user@mahasangh.in</code>', 'GitHub Secret: <code>FTP_USERNAME</code>'],
            ['FTP Password', 'तुम्ही ठेवलेला FTP पासवर्ड', 'GitHub Secret: <code>FTP_PASSWORD</code>'],
            ['Port & Protocol', 'Port <code>21</code> (Standard FTP)', 'FTP-Deploy-Action मध्ये'],
            ['Server Directory', '<code>/mahasangh_node/</code> (किंवा Custom पाथ असल्यास <code>/</code>)', 'GitHub Secret: <code>FTP_SERVER_DIR</code>'],
          ]
        )
      )}
    `,
  },

  // PAGE 13: Chapter 4 - File Manager & Permissions
  {
    chapter: 'प्रकरण ४: FTP व File Manager',
    title: '४.२ DirectAdmin File Manager व फाईल परवानग्या (Permissions)',
    subtitle: 'सर्व्हरवरील फाईल्स पाहणे, एडिट करणे, बॅकअप घेणे आणि सुरक्षित ठेवण्याचे नियम',
    bodyHtml: `
      ${box(
        '१. DirectAdmin File Manager कसे वापरावे?',
        stepList([
          'DirectAdmin मध्ये <b>System Info & Files → File Manager</b> उघडा.',
          'सुरुवातीला तुम्हाला तुमचे होम फोल्डर (<code>/home/savezpsc/</code>) दिसेल. यात <code>domains/</code>, <code>mahasangh_node/</code>, <code>logs/</code> अशी फोल्डर्स असतात.',
          '<b>domains/mahasangh.in/public_html:</b> ही डोमेनची वेब-फोल्डर जागा आहे (इथे फक्त <code>.htaccess</code> राहते).',
          '<b>mahasangh_node:</b> इथे तुमचा संपूर्ण Node.js प्रकल्प चालतो.',
          'कोणतीही फाईल (उदा. <code>.htaccess</code> किंवा <code>razorpay-config.json</code>) एडिट करण्यासाठी त्या फाईलवर राईट-क्लिक करून <b>Edit</b> करा आणि सेव्ह करा.',
        ])
      )}
      ${box(
        '२. Linux फाईल Permissions (परवानग्या) समजून घ्या',
        bulletList([
          '<b>फाईलसाठी (Files):</b> नेहमी <code>644</code> परमिशन असते (सर्व्हर वाचू शकतो, इतर कोणी बदलू शकत नाही).',
          '<b>फोल्डरसाठी (Folders):</b> नेहमी <code>755</code> परमिशन असते.',
          'कधीही कोणत्याही फाईलला <code>777</code> परमिशन देऊ नका; त्यामुळे सुरक्षेचा धोका निर्माण होतो.',
        ])
      )}
      ${tipBox(
        'बॅकअप घेण्याची सोपी पद्धत',
        'महत्त्वाचे बदल करण्यापूर्वी File Manager मध्ये <code>mahasangh_node</code> फोल्डरवर टिक करून वरून <b>Compress / Add to Archive (.tar.gz किंवा .zip)</b> करता येते. यामुळे सर्व फाईल्सचा व डेटाबेस कॉन्फिगचा सुरक्षित बॅकअप मिनिटभरात मिळतो.'
      )}
    `,
  },

  // PAGE 14: Chapter 4 - Folder Anatomy on HostKarle
  {
    chapter: 'प्रकरण ४: FTP व File Manager',
    title: '४.३ सर्व्हरवरील mahasangh_node फोल्डरमधील प्रत्येक फाईलचे महत्त्व',
    subtitle: 'सर्व्हरवर नेमक्या कोणत्या फाईल्स असल्या पाहिजेत आणि कोणत्या चुकूनही डिलीट करू नयेत?',
    bodyHtml: `
      ${tableHtml(
        ['सर्व्हरवरील पाथ (/home/savezpsc/mahasangh_node/...)', 'कोण तयार करतो?', 'जर डिलीट झाले तर काय होईल?'],
        [
          ['<code>dist/</code> (index.html + assets/)', 'GitHub Actions (<code>vite build</code>)', 'वेबसाईट स्क्रीन कोरी दिसेल (404 / Not Found)'],
          ['<code>server.cjs</code>', 'GitHub Actions (<code>build-server.mjs</code>)', 'पूर्ण साईट बंद पडेल व Passenger 500 एरर येईल'],
          ['<code>package.json</code> व <code>package-lock.json</code>', 'GitHub Actions FTP मधून', 'सर्व्हरवर <code>Run NPM Install</code> चालणार नाही'],
          ['<code>firebase-applet-config.json</code>', 'GitHub Actions FTP मधून', 'बॅकएंड सर्व्हर Firestore डेटाबेसला जोडू शकणार नाही'],
          ['<code>node_modules/</code>', 'DirectAdmin मधील <code>Run NPM Install</code>', 'express, razorpay, firebase न मिळाल्याने सर्व्हर क्रॅश होईल (GitHub हे अपलोड करत नाही व डिलीटही करत नाही!)'],
          ['<code>tmp/restart.txt</code>', 'GitHub Actions (दर डिप्लॉयला तारीख बदलते)', 'Phusion Passenger ला सर्व्हर रीस्टार्ट करण्याची सूचना मिळणार नाही'],
          ['<code>razorpay-config.json</code> *(ऐच्छिक)*', 'ॲडमिन पॅनलमधून सेव्ह केल्यास तयार होते', 'जर Admin मधून की सेव्ह केल्या असतील तर त्या जातील (SetEnv असतील तर हरकत नाही)'],
          ['<code>email-config.json</code> *(ऐच्छिक)*', 'मॅन्युअल SMTP फाईल असल्यास', 'GitHub Actions याला <code>exclude</code> ठेवते जेणेकरून पासवर्ड overwrite होऊ नये'],
        ]
      )}
      ${okBox(
        'FTP Deploy मधील स्मार्ट Exclusion (वगळलेले फोल्डर)',
        'आपण GitHub Actions मध्ये <code>dangerous-clean-slate: false</code> आणि <code>exclude</code> यादी वापरली आहे. याचा अर्थ नवीन कोड अपलोड करताना सर्व्हरवर आधीपासून असलेले <code>node_modules/</code>, <code>razorpay-config.json</code>, <code>email-config.json</code> हे <b>कधीही डिलीट होत नाहीत!</b>'
      )}
    `,
  },

  // PAGE 15: Chapter 5 - GitHub & Git Setup
  {
    chapter: 'प्रकरण ५: GitHub व Auto-Deploy',
    title: '५.१ GitHub खाते, Repository तयार करणे व .gitignore चे नियम',
    subtitle: 'तुमच्या कोडचे सुरक्षित स्टोरेज आणि पासवर्ड लीक न होता काम करण्याची पद्धत',
    bodyHtml: `
      ${box(
        '१. GitHub म्हणजे काय आणि नवीन प्रोजेक्टसाठी ते कसे सेट करावे?',
        stepList([
          '<b>github.com</b> वर मोफत खाते तयार करा (आपले सध्याचे खाते: <code>padmakarshinde043-byte</code>).',
          '<b>New Repository</b> क्लिक करून नवीन प्रकल्पाचे नाव द्या (उदा. <code>mahasangh-portal</code>). ते शक्यतो <b>Private</b> ठेवा जेणेकरून तुमचा कोड इतरांना दिसणार नाही.',
          '<b>Branch नाव:</b> मुख्य ब्रँचचे नाव नेहमी <code>main</code> ठेवा.',
          'AI Studio मधील GitHub बटनाद्वारे किंवा लोकल संगणकावर <code>git push origin main</code> करून कोड पुश करा.',
        ])
      )}
      ${box(
        '२. .gitignore फाईल का अत्यंत महत्त्वाची असते?',
        `<p style="margin:0 0 6px 0;">काही फाईल्स खूप मोठ्या असतात (जसे <code>node_modules</code> = ३००+ MB) किंवा त्यात गुप्त पासवर्ड असतात. त्या कधीही GitHub वर पाठवू नयेत. आपल्या <code>.gitignore</code> मध्ये या फाईल्स वगळल्या आहेत:</p>` +
        codeBlock(`.env\n.env.local\nnode_modules\ndist\ndist.zip\ndist.tar.gz\nrazorpay-config.json\nemail-config.json\nserver.cjs\ntmp`) +
        `<p style="margin:0;"><b>फायदा:</b> GitHub Push काही सेकंदांत पूर्ण होतो, रिपॉझिटरी हलकी राहते आणि <code>dist</code> व <code>server.cjs</code> हे दरवेळी ताज्या कोडमधून GitHub Actions स्वतःच तयार करून HostKarle वर पाठवते!</p>`
      )}
    `,
  },

  // PAGE 16: Chapter 5 - GitHub Secrets
  {
    chapter: 'प्रकरण ५: GitHub व Auto-Deploy',
    title: '५.२ GitHub Actions मध्ये Secrets (पासवर्ड) सुरक्षितपणे कसे साठवावेत?',
    subtitle: 'FTP पासवर्ड कोडमध्ये न लिहिता GitHub च्या तिजोरीत ठेवण्याची पद्धत',
    bodyHtml: `
      <p style="font-size: 11.8px; line-height: 1.6; margin: 0 0 8px 0;">
        तुमच्या रिपॉझिटरीमध्ये <code>.github/workflows/hostkarle-deploy.yml</code> ही फाईल ऑटो-डिप्लॉय करते. तिला HostKarle वर लॉगिन करण्यासाठी पासवर्ड लागतो, जो आपण कोडमध्ये न लिहिता <b>GitHub Secrets</b> मध्ये ठेवतो.
      </p>
      ${box(
        'GitHub Secrets सेट करण्याची अचूक प्रक्रिया',
        stepList([
          'GitHub वर तुमची Repository उघडा → वरच्या मेनूमधील <b>Settings</b> टॅबवर क्लिक करा.',
          'डाव्या मेनूमध्ये खाली स्क्रोल करा → <b>Security → Secrets and variables → Actions</b> वर क्लिक करा.',
          '<b>"New repository secret"</b> या हिरव्या बटनावर क्लिक करून खालील ४ Secrets एक-एक करून तयार करा:',
        ]) +
        tableHtml(
          ['Secret Name (अगदी जसेच्या तसे)', 'काय टाकायचे? (Value)', 'उदाहरण'],
          [
            ['<code>FTP_SERVER</code>', 'HostKarle सर्व्हर पत्ता', '<code>panel.hostkarle.in</code>'],
            ['<code>FTP_USERNAME</code>', 'HostKarle FTP युझरनेम', '<code>savezpsc</code> (किंवा पूर्ण FTP युझर)'],
            ['<code>FTP_PASSWORD</code>', 'HostKarle FTP पासवर्ड', 'तुमचा गुप्त पासवर्ड'],
            ['<code>FTP_SERVER_DIR</code>', 'Node ॲपचे सर्व्हरवरील फोल्डर', '<code>/mahasangh_node/</code> (शेवटी / आवश्यक)'],
          ]
        )
      )}
      ${warnBox(
        'काळजी घ्या: FTP_SERVER_DIR चा पाथ चुकल्यास काय होते?',
        'जर तुम्ही मुख्य cPanel/DirectAdmin FTP युझर वापरत असाल, तर लॉगिन केल्यावर तो <code>/home/savezpsc/</code> मध्ये उघडतो — म्हणून <code>FTP_SERVER_DIR</code> मध्ये <code>/mahasangh_node/</code> देणे गरजेचे आहे. पण जर तुम्ही आधीच Custom Path <code>/home/savezpsc/mahasangh_node</code> असलेला स्वतंत्र FTP युझर बनवला असेल, तर तिथे पाथ फक्त <code>/</code> द्यावा लागतो; अन्यथा <code>/mahasangh_node/mahasangh_node/</code> असे दुहेरी फोल्डर तयार होईल!'
      )}
    `,
  },

  // PAGE 17: Chapter 5 - Workflow YAML Explained
  {
    chapter: 'प्रकरण ५: GitHub व Auto-Deploy',
    title: '५.३ .github/workflows/hostkarle-deploy.yml मधील प्रत्येक ओळीचा अर्थ',
    subtitle: 'Git Push केल्याबरोबर पडद्यामागे नेमक्या कोणत्या ८ क्रिया आपोआप घडतात?',
    bodyHtml: `
      <p style="font-size: 11.5px; line-height: 1.58; margin: 0 0 8px 0;">
        तुम्ही जेव्हा AI Studio मधून किंवा संगणकावरून <code>main</code> ब्रँचवर नवीन कोड Push करता, तेव्हा GitHub चा मोफत Ubuntu Linux सर्व्हर सुरू होतो आणि खालील पावले क्रमाने चालवतो:
      </p>
      ${stepList([
        '<b>१. Checkout (`actions/checkout@v4`):</b> GitHub वरून तुमचा ताजा कोड डाऊनलोड करतो.',
        '<b>२. Setup Node.js (`node-version: 22`):</b> तुमच्या HostKarle सर्व्हरशी जुळणारा Node.js 22 सेट करतो.',
        '<b>३. Install Dependencies (`npm install`):</b> <code>package.json</code> मधील सर्व लायब्ररीज डाऊनलोड करतो.',
        '<b>४. TypeScript Check (`npm run lint`):</b> संपूर्ण कोडमध्ये टायपिंग किंवा सिंटॅक्सची चूक नाही ना (<code>tsc --noEmit</code>) हे तपासतो. चूक असल्यास अर्धवट खराब कोड लाईव्ह होऊ देत नाही!',
        '<b>५. Build Frontend & Server (`npx vite build` + `node scripts/build-server.mjs`):</b> React चे <code>dist/</code> फोल्डर आणि बॅकएंडचे <code>server.cjs</code> बंडल तयार करतो.',
        '<b>६. Prepare `deploy_bundle/`:</b> केवळ आवश्यक फाईल्स (<code>dist</code>, <code>server.cjs</code>, <code>package.json</code>, <code>package-lock.json</code>, <code>firebase-applet-config.json</code>) वेगळ्या फोल्डरमध्ये जमा करतो व AI Studio ची तात्पुरती स्क्रिनशॉट फाईल्स (<code>assets/aistudio</code>) काढून टाकतो.',
        '<b>७. Touch `tmp/restart.txt`:</b> <code>tmp/restart.txt</code> फाईलमध्ये आत्ताची तारीख-वेळ लिहितो. ही फाईल सर्व्हरवर बदलली की Phusion Passenger ला समजते की आता सर्व्हर स्वतःहून Restart करायचा आहे!',
        '<b>८. FTP Upload (`SamKirkland/FTP-Deploy-Action@v4.3.5`):</b> केवळ बदललेल्या फाईल्स सुरक्षितपणे HostKarle वर अपलोड करतो.',
      ])}
      ${okBox(
        'मॅन्युअली (Manually) डिप्लॉय रन करायचे असल्यास:',
        'कोणताही कोड न बदलता पुन्हा डिप्लॉय करायचे असल्यास GitHub → <b>Actions</b> टॅब → <b>Build & Deploy to HostKarle (Node.js)</b> → उजवीकडील <b>"Run workflow"</b> बटनावर क्लिक करता येते.'
      )}
    `,
  },

  // PAGE 18: Chapter 5 - Troubleshooting GitHub Actions
  {
    chapter: 'प्रकरण ५: GitHub व Auto-Deploy',
    title: '५.४ GitHub Actions तपासणे व फेल झाल्यास दुरुस्त करण्याच्या टिप्स',
    subtitle: 'Actions टॅबमधील हिरवी टिक (Success) आणि लाल फुली (Failure) ओळखणे',
    bodyHtml: `
      ${box(
        'डिप्लॉय स्टेटस कसा पाहावा?',
        stepList([
          'GitHub वर तुमची Repository उघडा आणि वरच्या पट्टीतील <b>"Actions"</b> टॅबवर क्लिक करा.',
          'प्रत्येक Push नंतर तिथे पिवळे गोल चक्र फिरताना दिसेल (सुमारे १ ते २ मिनिटे लागतात).',
          'जर <b>हिरवी टिक (✓)</b> आली, तर समजा तुमची वेबसाईट HostKarle वर यशस्वीरीत्या अपडेट झाली आहे!',
          'जर <b>लाल फुली (✕)</b> आली, तर त्या नावावर क्लिक करा → <code>build_and_deploy</code> वर क्लिक करा → लाल रंगातील स्टेप उघडून एरर वाचा.',
        ])
      )}
      ${tableHtml(
        ['संभाव्य GitHub Actions एरर', 'नेमके कारण', 'तात्काळ उपाय'],
        [
          ['<code>npm ci</code> error (Missing from lock file)', '<code>package.json</code> बदलले पण <code>package-lock.json</code> अपडेट झाले नाही', 'आपण workflow मध्ये <code>npm install</code> वापरले आहे व <code>npm install --package-lock-only</code> ने lock फाईल सिंक ठेवली आहे.'],
          ['<code>npm run lint</code> failed (TS error)', 'TypeScript मध्ये एखादे नाव किंवा प्रकार चुकला आहे', 'एररमधील फाईल व लाईन नंबर पाहून ती चूक दुरुस्त करा व पुन्हा Push करा.'],
          ['FTP Error: Login authentication failed', 'GitHub Secrets मध्ये <code>FTP_USERNAME</code> किंवा <code>FTP_PASSWORD</code> चुकला आहे', 'DirectAdmin मध्ये पासवर्ड तपासून GitHub Secrets पुन्हा अपडेट करा.'],
          ['FTP Timeout / ECONNREFUSED', 'HostKarle सर्व्हरवरून काही सेकंदांसाठी कनेक्शन तुटले', 'Actions मध्ये वर उजवीकडे <b>Re-run all jobs</b> वर क्लिक करा.'],
        ]
      )}
    `,
  },

  // PAGE 19: Chapter 6 - Firebase Setup Part 1
  {
    chapter: 'प्रकरण ६: Firebase व Firestore',
    title: '६.१ नवीन Firebase Project तयार करणे व वेबसाईटशी जोडणे',
    subtitle: 'console.firebase.google.com वरून नवीन प्रकल्प, Web App व Config मिळवण्याची प्रक्रिया',
    bodyHtml: `
      <p style="font-size: 11.8px; line-height: 1.6; margin: 0 0 8px 0;">
        आपल्या संपूर्ण वेबसाईटचा डेटा साठवण्यासाठी Google Firebase वापरले आहे. नवीन प्रोजेक्ट सुरू करताना खालील पायऱ्या वापराव्यात:
      </p>
      ${box(
        'पायरी १: Firebase Console मध्ये प्रोजेक्ट व Web App तयार करणे',
        stepList([
          '<b>console.firebase.google.com</b> वर Google खात्याने लॉगिन करा.',
          '<b>"Create a project" (किंवा Add project)</b> वर क्लिक करा → प्रोजेक्टचे नाव द्या (उदा. आपल्या सध्याच्या प्रोजेक्टचा ID <code>mh-membership</code> असा आहे).',
          'Project Overview मधील <b>Web आयकॉन (&lt;/&gt;)</b> वर क्लिक करून "Add Firebase to your web app" निवडा आणि App Nickname देऊन Register करा.',
          'स्क्रीनवर एक <code>firebaseConfig</code> कोड दिसेल ज्यात <code>apiKey</code>, <code>authDomain</code>, <code>projectId</code>, <code>storageBucket</code>, <code>messagingSenderId</code>, <code>appId</code> असतात.',
        ])
      )}
      ${box(
        'पायरी २: Cloud Firestore डेटाबेस चालू करणे',
        stepList([
          'डाव्या मेनूमधून <b>Build → Firestore Database</b> वर क्लिक करा आणि <b>Create database</b> दाबा.',
          '<b>Location (Region):</b> भारतातील युझर्ससाठी सर्वात वेगवान रिजन <b><code>asia-south1 (Mumbai)</code></b> किंवा <code>nam5</code> निवडा.',
          'आपल्या प्रोजेक्टमधील Custom Database ID (<code>ai-studio-rknewsite-...</code>) हा <code>firebase-applet-config.json</code> मध्ये ठेवला आहे; तो <code>src/firebase.ts</code> आणि <code>server.ts</code> दोघेही वाचतात!',
        ])
      )}
      ${codeBlock(`// firebase-applet-config.json ची रचना:\n{\n  "projectId": "तुमचा-project-id",\n  "appId": "1:xxxx:web:xxxx",\n  "apiKey": "AIzaSy...",\n  "authDomain": "तुमचा-project-id.firebaseapp.com",\n  "firestoreDatabaseId": "डेटाबेस-id किंवा (default)"\n}`)}
    `,
  },

  // PAGE 20: Chapter 6 - Firestore Collections Schema
  {
    chapter: 'प्रकरण ६: Firebase व Firestore',
    title: '६.२ Firestore डेटाबेसमधील सर्व Collections (तक्त्यांची) रचना',
    subtitle: 'firebase-blueprint.json आणि कोडनुसार डेटाबेसमध्ये नेमके कोणते फोल्डर्स (Collections) आहेत',
    bodyHtml: `
      <p style="font-size: 11.8px; line-height: 1.6; margin: 0 0 8px 0;">
        SQL डेटाबेसमध्ये जसे Tables असतात, तसेच Firestore मध्ये <b>Collections</b> आणि त्यामध्ये <b>Documents</b> असतात. आपल्या वेबसाईटमध्ये खालील ९ कलेक्शन्स वापरली आहेत:
      </p>
      ${tableHtml(
        ['Collection नाव', 'डॉक्युमेंट ID', 'नेमका कोणता डेटा साठवला जातो?'],
        [
          ['<code>applications</code>', '<code>app_...</code> किंवा युनिक ID', 'सर्व सदस्यांचे नोंदणी अर्ज, फोटो (Base64), स्टेटस (<code>pending</code>/<code>approved</code>), सदस्य क्रमांक, पेमेंट संदर्भ'],
          ['<code>settings</code>', '<code>member_counter</code>, <code>admin_auth</code>, इ.', 'ऑटो सदस्य क्रमांक काऊंटर, सुपर ॲडमिन पासवर्ड, वेबसाईट मुख्य सेटिंग्ज'],
          ['<code>sub_admins</code>', 'अ‍ॅडमिन युनिक ID', 'जिल्हा/विभागनिहाय उप-ॲडमिन (Sub-Admins), त्यांचे नाव, ई-मेल, पासवर्ड व परवानग्या'],
          ['<code>news</code>', 'बातमी ID', 'बातम्या, परिपत्रके, दिनांक, वर्गवारी, सारांश, पूर्ण मजकूर व फोटो'],
          ['<code>gov_orders</code>', 'शासन निर्णय ID', 'GR / शासन निर्णय नाव, संदर्भ क्रमांक, दिनांक आणि PDF लिंक/फाईल'],
          ['<code>leadership</code>', 'पदाधिकारी ID', 'राज्य व जिल्हा कार्यकारिणी पदाधिकाऱ्यांची नावे, पदे, फोटो व मोबाईल क्रमांक'],
          ['<code>contacts</code>', 'संदेश ID', 'संपर्क पेजवरून नागरिक/सदस्यांनी पाठवलेले प्रश्न, तक्रारी व अभिप्राय'],
          ['<code>site_stats</code>', '<code>visitors</code> / <code>global</code>', 'वेबसाईटला भेट देणाऱ्यांची संख्या व एकूण ठळक आकडेवारी'],
          ['<code>test</code>', '<code>connection</code>', 'ॲप सुरू झाल्यावर डेटाबेस कनेक्शन चालू आहे का हे तपासण्यासाठी छोटा टेस्ट डॉक्युमेंट'],
        ]
      )}
      ${tipBox(
        'नवीन प्रोजेक्ट बनवताना Firebase Blueprint चे महत्त्व',
        'प्रोजेक्टच्या सुरुवातीलाच <code>firebase-blueprint.json</code> मध्ये प्रत्येक कलेक्शनची आणि त्यातील फील्ड्सची यादी लिहून ठेवल्यास, भविष्यात डेटा मिसमॅच होत नाही आणि कोडिंग करणे खूप सोपे होते.'
      )}
    `,
  },

  // PAGE 21: Chapter 6 - Application Document Fields Deep Dive
  {
    chapter: 'प्रकरण ६: Firebase व Firestore',
    title: '६.३ applications डॉक्युमेंटमधील प्रत्येक फील्डचे स्पष्टीकरण',
    subtitle: 'एका सदस्याच्या अर्जामागे डेटाबेसमध्ये नेमक्या कोणत्या २०+ गोष्टी साठवल्या जातात?',
    bodyHtml: `
      ${tableHtml(
        ['Field नाव', 'प्रकार (Type)', 'अर्थ आणि वापर'],
        [
          ['<code>id</code> / <code>applicationNumber</code>', 'String', 'युनिक डॉक्युमेंट ID व अर्ज क्रमांक (उदा. <code>APP2026...</code>)'],
          ['<code>salutation</code> & <code>fullName</code>', 'String', 'अभिवादन (श्री./श्रीमती) आणि पूर्ण मराठी नाव'],
          ['<code>phone</code>', 'String (10 अंकी)', 'स्वच्छ केलेला १० अंकी मोबाईल नंबर (ड्युप्लिकेट तपासणी व शोधासाठी मुख्य की)'],
          ['<code>email</code>', 'String', 'सदस्याचा ई-मेल (छोट्या अक्षरांत lowercase — ई-मेलवर PDF पाठवण्यासाठी)'],
          ['<code>district</code>, <code>taluka</code>, <code>centerName</code>', 'String', 'जिल्हा, तालुका व केंद्र/शाळेचे नाव (जिल्हानिहाय यादी व सदस्य कोडसाठी)'],
          ['<code>professional</code> & <code>education</code>', 'String', 'संवर्ग/पद (केंद्रप्रमुख/अधिकारी) आणि शैक्षणिक पात्रता'],
          ['<code>photo</code>', 'String (Data URL)', '<200KB मध्ये कॉम्प्रेस केलेला पासपोर्ट फोटो (आय-कार्डवर छापण्यासाठी)'],
          ['<code>status</code>', '<code>pending</code> | <code>approved</code>', 'पैसे भरण्यापूर्वी <code>pending</code>; पक्के पेमेंट होताच <code>approved</code>'],
          ['<code>memberNumber</code>', 'String', 'मंजुरीनंतर मिळणारा अधिकृत क्रमांक (उदा. <code>MS/NSK/2026/0072</code>)'],
          ['<code>paymentConfirmed</code>', 'Boolean', '<b>true</b> म्हणजे Razorpay कडून पक्के पैसे मिळाल्याची हमी!'],
          ['<code>razorpayPaymentId</code> & <code>razorpayOrderId</code>', 'String', 'Razorpay चा <code>pay_...</code> व <code>order_...</code> पुरावा क्रमांक'],
          ['<code>approvedBy</code>', 'String', '<code>razorpay_checkout</code> किंवा <code>razorpay_webhook</code> किंवा <code>admin_verified</code>'],
          ['<code>idCardEmailSent</code> & <code>welcomeEmailSent</code>', 'Boolean', 'एका सदस्याला एकदाच ई-मेल जावा (दुबार ई-मेल टाळण्यासाठी) नोंद'],
          ['<code>createdAt</code> / <code>approvedAt</code>', 'ISO Date String', 'अर्ज भरल्याची व मंजूर झाल्याची अचूक तारीख-वेळ'],
        ]
      )}
    `,
  },

  // PAGE 22: Chapter 6 - Atomic Counter Transaction
  {
    chapter: 'प्रकरण ६: Firebase व Firestore',
    title: '६.४ सलग सदस्य क्रमांक (Atomic Counter) व Duplicate नंबर कसे टाळले?',
    subtitle: 'एकाच वेळी २ सदस्यांनी पेमेंट केले तरी दोघांना एकच नंबर का मिळत नाही?',
    bodyHtml: `
      <p style="font-size: 11.8px; line-height: 1.6; margin: 0 0 8px 0;">
        समजा सकाळी १०:००:०५ वाजता नाशिक आणि पुणे येथील दोन केंद्रप्रमुखांनी एकाच सेकंदाला ₹२२० पेमेंट पूर्ण केले. जर आपण साध्या पद्धतीने "शेवटचा नंबर वाचून +१ करा" असे लिहिले असते, तर दोघांनाही <b>०१०५</b> हाच एकच नंबर मिळाला असता!
      </p>
      ${box(
        'उपाय: Firestore Atomic Transaction (runTransaction) — server.ts मधील रचना',
        stepList([
          'सर्व्हरवर <code>allocateNextMemberNumberOnServer()</code> हे फंक्शन <code>settings/member_counter</code> या एका केंद्रीय डॉक्युमेंटवर <b><code>runTransaction()</code></b> चालवते.',
          '<b>Transaction चा नियम:</b> डेटाबेस एका वेळी फक्त एकाच व्यक्तीसाठी <code>lastMemberNumber</code> (उदा. 71 → 72) वाचून लगेच वाढवतो आणि लॉक सोडतो. दुसऱ्या व्यक्तीची विनंती आपोआप थांबते आणि तिला 72 वाचून पुढचा <b>73</b> क्रमांक मिळतो!',
          'जर कोणाचे पेमेंट आधीच मंजूर (<code>alreadyApproved</code>) असेल आणि Webhook पुन्हा आला, तर कोड नवीन नंबर बनवत नाही — जुनाच नंबर परत पाठवतो (<b>Idempotency</b>).',
        ])
      )}
      ${codeBlock(`// server.ts मधील मूळ लॉजिक (थोडक्यात):\nconst counterRef = doc(db, 'settings', 'member_counter');\nconst nextSeq = await runTransaction(db, async (tx) => {\n  const snap = await tx.get(counterRef);\n  let currentSeq = snap.exists() ? snap.data().lastMemberNumber : 71;\n  const allocated = currentSeq + 1;\n  tx.set(counterRef, { totalApproved: allocated, lastMemberNumber: allocated }, { merge: true });\n  return allocated;\n});`)}
      ${tipBox(
        'महत्त्वाचा सल्ला',
        'Admin मध्ये तुम्ही चुकून एखाद्याला पूर्वी डबल झालेला <code>0001</code> सारखा नंबर दुरुस्त करण्यासाठी आपण स्वतंत्र <b>Member Edit Manager</b> टॅब दिला आहे, जिथून जुन्या अर्जाचा सदस्य क्रमांक सुरक्षितपणे बदलता येतो.'
      )}
    `,
  },

  // PAGE 23: Chapter 6 - Firestore Rules & Data/Cost Saving Strategy
  {
    chapter: 'प्रकरण ६: Firebase व Firestore',
    title: '६.५ Security Rules आणि मोबाईल डेटा / Firebase Quota बचत तंत्र',
    subtitle: 'बिनकामाचे इंटरनेट MB वाचवून वेबसाईट मोफत प्लानमध्ये हजारो युझर्ससाठी कशी चालवावी?',
    bodyHtml: `
      ${box(
        '१. Firestore Security Rules (firestore.rules)',
        `<p style="margin:0 0 6px 0;">Firebase Console → Firestore Database → <b>Rules</b> मध्ये कोणकोणत्या कलेक्शनला वाचता-लिहिता येईल याचे नियम असतात. आपल्या प्रकल्पात <code>firebase-blueprint.json</code> सोबत <code>firestore.rules</code> सिंक ठेवली आहे (<code>applications</code>, <code>news</code>, <code>gov_orders</code>, <code>settings</code>, <code>sub_admins</code>, <code>leadership</code>, <code>contacts</code>, <code>site_stats</code>, <code>test</code>).</p>
         <p style="margin:0;"><i>टीप:</i> भविष्यात मोठ्या प्रमाणावर सुरक्षा कडक करायची असल्यास, केवळ Firebase Auth ने लॉगिन केलेल्या Admin नाच डिलीट/एडिट परवानगी देण्याचे नियम लिहिता येतात.</p>`
      )}
      ${box(
        '२. डेटा व Firebase Reads वाचवणारे ३ सुवर्ण नियम (ज्यामुळे मोबाईलचे MB वाचतात)',
        stepList([
          '<b>सुपर कॅशिंग (localStorage Cache):</b> सामान्य व्हिजिटर जेव्हा बातम्या, शासन निर्णय किंवा अधिकृत सदस्य यादी पाहतो, तेव्हा पहिल्यांदाच डेटा येतो आणि ५–३० मिनिटे ब्राउझरच्या <code>localStorage</code> मध्ये जतन राहतो (<code>fetchNewsCached</code>). म्हणजे पुन्हा पेज उघडल्यास <b>० (शून्य) Firestore Reads</b> लागतात!',
          '<b>रिअल-टाइम लिसनर हटवला (Admin Panel):</b> पूर्वी Admin टॅब उघडल्यावर <code>onSnapshot()</code> सतत सर्व्हरशी डेटा देवाणघेवाण करत होता, त्यामुळे Admin चा मोबाईल डेटा (MB) वेगाने संपत होता. आता आपण तो काढून <b>दर ६० सेकंदांनी ऑटो-रिफ्रेश (<code>setInterval</code>)</b> आणि एक मॅन्युअल <b>"रिफ्रेश"</b> बटन दिले आहे!',
          '<b>केवळ गरजेचा डेटा शोधणे:</b> स्टेटस तपासताना किंवा ड्युप्लिकेट तपासताना पूर्ण डेटाबेस डाऊनलोड न करता थेट <code>where("phone", "==", ...)</code> अशी क्वेरी मारली जाते.',
        ])
      )}
    `,
  },
];
