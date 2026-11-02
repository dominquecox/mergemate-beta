import {z} from 'zod';
export const DependencyContext=z.object({headSha:z.string().min(7).max(64),manifests:z.array(z.object({directory:z.string().max(500),names:z.array(z.string().max(214)).max(2000)})).max(32),unavailable:z.array(z.string().max(500)).max(32)});
export type DependencyContext=z.infer<typeof DependencyContext>;
