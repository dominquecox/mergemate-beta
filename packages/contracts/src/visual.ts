import {z} from 'zod';
export const PrVisualAsset=z.object({
 path:z.string().min(1).max(500),side:z.enum(['before','after']),
 dataUrl:z.string().startsWith('data:image/png;base64,').max(8_000_000),
 width:z.number().positive(),height:z.number().positive(),headSha:z.string().regex(/^[a-f0-9]{7,64}$/i),
});
export type PrVisualAsset=z.infer<typeof PrVisualAsset>;
