import {expect,it} from 'vitest';
import {BillingPlan,CheckoutRequest} from '../src/billing';
it('rejects arbitrary checkout prices and redirects',()=>{expect(CheckoutRequest.safeParse({priceKey:'attacker'}).success).toBe(false);expect(CheckoutRequest.safeParse({priceKey:'pro_monthly',returnUrl:'https://evil.example'}).success).toBe(false);});
it('validates plan names and renewal timestamps',()=>{expect(BillingPlan.safeParse({plan:'pro',status:'active',renewsAt:null,cancelAt:null}).success).toBe(true);expect(BillingPlan.safeParse({plan:'staff',status:'active',renewsAt:null,cancelAt:null}).success).toBe(false);});
