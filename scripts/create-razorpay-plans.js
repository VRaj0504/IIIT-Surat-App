const id = process.env.RAZORPAY_KEY_ID;
const secret = process.env.RAZORPAY_KEY_SECRET;
if (!id || !secret) {
  console.log('Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET first.');
  process.exit(1);
}
const auth = Buffer.from(`${id}:${secret}`).toString('base64');

const PLANS = [
  { key: 'monthly', period: 'monthly', amount: 1900, name: 'CollegeGo Plus monthly' },
  { key: 'yearly', period: 'yearly', amount: 19900, name: 'CollegeGo Plus yearly' },
];

(async () => {
  for (const p of PLANS) {
    const res = await fetch('https://api.razorpay.com/v1/plans', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        period: p.period,
        interval: 1,
        item: { name: p.name, amount: p.amount, currency: 'INR', description: p.name },
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      console.log(`${p.key}: failed - ${json?.error?.description ?? res.status}`);
      process.exit(1);
    }
    console.log(`${p.key}: ${json.id}`);
  }
})();
