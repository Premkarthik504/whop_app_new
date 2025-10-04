import type { InferSelectModel } from 'drizzle-orm';
import * as schema from './schema';

// Infer types from Drizzle schema
export type Member = InferSelectModel<typeof schema.members>;
export type Activity = InferSelectModel<typeof schema.activities>;
export type Payment = InferSelectModel<typeof schema.payments>;
export type ChurnScore = InferSelectModel<typeof schema.churnScores>;
export type EngagementMetrics = InferSelectModel<typeof schema.engagementMetrics>;
export type CreatorSettings = InferSelectModel<typeof schema.creatorSettings>;
export type Intervention = InferSelectModel<typeof schema.interventions>;
export type CompanyAnalytics = InferSelectModel<typeof schema.companyAnalytics>;