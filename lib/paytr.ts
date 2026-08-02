import crypto from "node:crypto";

export type PaytrCredentials = {
  merchantId: string;
  merchantKey: string;
  merchantSalt: string;
};

export function getPaytrCredentials(): PaytrCredentials {
  const merchantId = process.env.PAYTR_MERCHANT_ID?.trim();
  const merchantKey = process.env.PAYTR_MERCHANT_KEY?.trim();
  const merchantSalt = process.env.PAYTR_MERCHANT_SALT?.trim();
  if (!merchantId || !merchantKey || !merchantSalt) {
    throw new Error("PayTR ortam değişkenleri tanımlı değil.");
  }
  return { merchantId, merchantKey, merchantSalt };
}

export function createPaytrRequestToken(input: {
  merchantId: string;
  merchantKey: string;
  merchantSalt: string;
  userIp: string;
  merchantOid: string;
  email: string;
  paymentAmount: string;
  userBasket: string;
  noInstallment: string;
  maxInstallment: string;
  currency: string;
  testMode: string;
}) {
  const hashString = `${input.merchantId}${input.userIp}${input.merchantOid}${input.email}${input.paymentAmount}${input.userBasket}${input.noInstallment}${input.maxInstallment}${input.currency}${input.testMode}${input.merchantSalt}`;
  return crypto.createHmac("sha256", input.merchantKey).update(hashString).digest("base64");
}

export function verifyPaytrCallback(input: {
  merchantOid: string;
  status: string;
  totalAmount: string;
  hash: string;
  merchantKey: string;
  merchantSalt: string;
}) {
  const expected = crypto
    .createHmac("sha256", input.merchantKey)
    .update(`${input.merchantOid}${input.merchantSalt}${input.status}${input.totalAmount}`)
    .digest("base64");
  const left = Buffer.from(expected);
  const right = Buffer.from(input.hash);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
