export interface RazorpayPublicConfig {
  keyId: string;
  enabled: boolean;
}

export async function fetchRazorpayPublicConfig(): Promise<RazorpayPublicConfig> {
  try {
    const res = await fetch('/api/razorpay/public-config');
    const contentType = res.headers.get('content-type');
    if (res.ok && contentType && contentType.includes('application/json')) {
      return await res.json();
    }
  } catch (e) {
    console.warn('Could not fetch razorpay public config:', e);
  }
  try {
    const saved = localStorage.getItem('razorpay_admin_config_v1');
    if (saved) {
      const parsed = JSON.parse(saved);
      return { keyId: parsed.keyId || '', enabled: parsed.enabled ?? true };
    }
  } catch {}
  return { keyId: '', enabled: false };
}

export function loadRazorpaySdk(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false);
    if ((window as any).Razorpay) return resolve(true);

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export interface InitiateRazorpayPaymentParams {
  amount: number; // e.g. 500
  applicationId: string;
  fullName: string;
  phone: string;
  email?: string;
  district?: string;
  onSuccess: (paymentId: string, orderId: string, signature: string, approvedApplication?: any) => void;
  onError: (errorMsg: string) => void;
  onDismiss?: () => void;
}

export async function initiateRazorpayPayment(params: InitiateRazorpayPaymentParams): Promise<void> {
  const isLoaded = await loadRazorpaySdk();
  if (!isLoaded) {
    params.onError('Razorpay पेमेंट गेटवे लोड होऊ शकला नाही. कृपया इंटरनेट कनेक्शन तपासा.');
    return;
  }

  try {
    // 1. Create order on backend
    const orderRes = await fetch('/api/razorpay/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: params.amount,
        applicationId: params.applicationId,
        fullName: params.fullName,
        phone: params.phone,
        email: params.email,
        district: params.district
      })
    });

    const orderData = await orderRes.json();
    if (!orderRes.ok || orderData.status !== 'success') {
      throw new Error(orderData.message || 'ऑर्डर आयडी तयार करता आला नाही.');
    }

    // 2. Configure Razorpay Checkout options
    const options = {
      key: orderData.keyId,
      amount: orderData.amount,
      currency: orderData.currency || 'INR',
      name: 'महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ',
      description: 'वार्षिक व आजीवन सदस्यत्व फी',
      order_id: orderData.orderId,
      prefill: {
        name: params.fullName,
        contact: params.phone,
        email: params.email || ''
      },
      notes: {
        applicationId: params.applicationId,
        phone: params.phone,
        email: params.email || '',
        district: params.district || ''
      },
      theme: {
        color: '#17366d'
      },
      handler: async function (response: any) {
        try {
          // 3. Verify payment signature on backend
          const verifyRes = await fetch('/api/razorpay/verify-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              applicationId: params.applicationId
            })
          });

          const verifyData = await verifyRes.json();
          if (verifyRes.ok && verifyData.verified) {
            params.onSuccess(
              response.razorpay_payment_id,
              response.razorpay_order_id,
              response.razorpay_signature,
              verifyData.application
            );
          } else {
            params.onError(verifyData.message || 'पेमेंट स्वाक्षरी अमान्य आहे (Invalid Payment Signature).');
          }
        } catch (err: any) {
          params.onError('पेमेंट पडताळणीमध्ये त्रुटी: ' + (err.message || 'Error'));
        }
      },
      modal: {
        ondismiss: function () {
          if (params.onDismiss) params.onDismiss();
        }
      }
    };

    const rzp = new (window as any).Razorpay(options);
    rzp.open();
  } catch (err: any) {
    params.onError(err.message || 'पेमेंट सुरू करताना त्रुटी आली.');
  }
}
