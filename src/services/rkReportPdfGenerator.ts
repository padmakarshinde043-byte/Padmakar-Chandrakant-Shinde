import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

export async function generateDeveloperReportPdf(): Promise<void> {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '794px'; // A4 width at 96 DPI
  container.style.backgroundColor = '#ffffff';
  container.style.color = '#102a43';
  container.style.fontFamily = 'Noto Sans Devanagari, sans-serif';
  container.style.padding = '40px';
  container.style.boxSizing = 'border-box';

  const htmlContent = 
    '<div style="border: 3px solid #193568; padding: 30px; border-radius: 12px; background: #fff;">' +
      '<div style="text-align: center; border-bottom: 2px solid #df6b16; padding-bottom: 15px; margin-bottom: 20px;">' +
        '<h1 style="font-size: 22px; color: #193568; margin: 0 0 5px 0; font-weight: bold;">महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ</h1>' +
        '<p style="font-size: 13px; color: #df6b16; margin: 0; font-weight: bold;">तांत्रिक मास्टर रिपोर्ट व डेव्हलपर गाईड (Technical Developer Guide)</p>' +
      '</div>' +
      '<div style="font-size: 12px; line-height: 1.6; color: #243b53;">' +
        '<h2 style="font-size: 15px; color: #193568; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin-top: 15px;">१. प्रकल्प परिचय व टेक्नॉलॉजी स्टॅक</h2>' +
        '<p><strong>प्रोजेक्ट नाव:</strong> mahasangh.in (महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ)</p>' +
        '<p><strong>स्टॅक:</strong> React 18, Vite, TypeScript, Tailwind CSS, Node.js Express 5, Firebase Firestore, Razorpay Webhook & Checkout.</p>' +
        '<h2 style="font-size: 15px; color: #193568; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin-top: 15px;">२. बाहरी पोर्टल्स व सेवा सेटअप (External Portals)</h2>' +
        '<ul style="padding-left: 20px; margin: 5px 0;">' +
          '<li><strong>Firebase Console:</strong> Firestore डेटाबेस व ऑथेंटिकेशन (ai-studio-rknewsite-...).</li>' +
          '<li><strong>Razorpay Dashboard:</strong> Live API Key, Secret व Webhook (https://mahasangh.in/api/razorpay/webhook).</li>' +
          '<li><strong>HostKarle Hosting:</strong> Node.js App (Passenger) + server.cjs स्टार्टअप फाईल.</li>' +
          '<li><strong>GitHub Actions:</strong> FTP Auto-Deploy द्वारा git push वर स्वयंचलित लाईव्ह अपडेट.</li>' +
        '</ul>' +
        '<h2 style="font-size: 15px; color: #193568; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin-top: 15px;">३. मुख्य वैशिष्ट्ये व सुरक्षा</h2>' +
        '<ul style="padding-left: 20px; margin: 5px 0;">' +
          '<li><strong>डिजिटल आय-कार्ड PDF:</strong> मंजूर सदस्यांसाठी हाय-डिफिनिशन PDF आय-कार्ड निर्मिती.</li>' +
          '<li><strong>ड्युप्लिकेट प्रतिबंध:</strong> मोबाईल, ई-मेल किंवा नावानुसार थेट Firestore मध्ये तपासणी करून दुबार फॉर्म भरण्यास प्रतिबंध.</li>' +
          '<li><strong>डेटा बचत ऑप्टिमायझेशन:</strong> ॲडमिन पॅनलमधील रिअल-टाइम लिसनर काढून १ मिनिटाचा ऑटो-रिफ्रेश आणि मॅन्युअल रिफ्रेश.</li>' +
          '<li><strong>पेमेंट सुरक्षा:</strong> Razorpay Signature Verify आणि Webhook द्वारे पक्क्या पेमेंटशिवाय अर्ज मंजुरी नाही.</li>' +
        '</ul>' +
        '<div style="margin-top: 30px; border-top: 1px dashed #cbd5e1; padding-top: 10px; text-align: center; font-size: 11px; color: #627d98;">' +
          '<p>हा तांत्रिक रिपोर्ट नवीन वेब डेव्हलपरसाठी भविष्यातील मार्गदर्शक म्हणून तयार करण्यात आला आहे.</p>' +
        '</div>' +
      '</div>' +
    '</div>';

  container.innerHTML = htmlContent;

  document.body.appendChild(container);
  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
    });
    document.body.removeChild(container);

    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    pdf.addImage(imgData, 'JPEG', 0, 10, pdfWidth, pdfHeight);
    pdf.save('Mahasangh_Technical_Developer_Report.pdf');
  } catch (err) {
    document.body.removeChild(container);
    throw err;
  }
}
