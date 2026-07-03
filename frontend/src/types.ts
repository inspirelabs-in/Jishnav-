export interface Coupon {
  couponId: number;
  storeName: string;
  couponName: string;
  couponCode: string;
  couponUrl: string;
  couponTypeId: number;
  discount: number;
  discountDisplay: string;
  minOrderAmount: number | null;
  maxDiscount: number | null;
  verified: boolean;
  exclusive: boolean;
  hotOffer: boolean;
  bestOffer: boolean;
  forExistingUser: boolean;
  validityLabel: string;
  validityUrgency: "expires_today" | "expires_soon" | "valid" | "no_expiry" | "expired";
  endDate: string | null;
  isWebResult?: boolean;
}

export interface ChatRecord {
  id: string;
  title: string;
  sessionId: string;
  timestamp: number;
  messages: Message[];
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  coupons?: Coupon[];
  isStreaming?: boolean;
  isWebResult?: boolean;
}
