import { pgTable, text, timestamp, integer, decimal, jsonb, uuid, boolean, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Members table - Core user tracking
export const members = pgTable('members', {
  id: uuid('id').primaryKey().defaultRandom(),
  whopUserId: text('whop_user_id').notNull().unique(),
  companyId: text('company_id').notNull(),
  experienceId: text('experience_id'),
  joinedAt: timestamp('joined_at').notNull().defaultNow(),
  status: text('status').notNull().default('active'), // active, churned, at_risk
  tier: text('tier'), // free, starter, pro
  lastSeenAt: timestamp('last_seen_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  companyIdIdx: index('members_company_id_idx').on(table.companyId),
  statusIdx: index('members_status_idx').on(table.status),
  lastSeenIdx: index('members_last_seen_idx').on(table.lastSeenAt),
}));

// Activity tracking - All member actions
export const activities = pgTable('activities', {
  id: uuid('id').primaryKey().defaultRandom(),
  memberId: uuid('member_id').notNull().references(() => members.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // login, content_view, message, download, etc.
  metadata: jsonb('metadata'), // Additional context
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  memberIdIdx: index('activities_member_id_idx').on(table.memberId),
  typeIdx: index('activities_type_idx').on(table.type),
  createdAtIdx: index('activities_created_at_idx').on(table.createdAt),
}));

// Payment tracking
export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  memberId: uuid('member_id').notNull().references(() => members.id, { onDelete: 'cascade' }),
  whopPaymentId: text('whop_payment_id').notNull().unique(),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  amountAfterFees: decimal('amount_after_fees', { precision: 10, scale: 2 }),
  currency: text('currency').notNull().default('usd'),
  status: text('status').notNull(), // succeeded, failed, pending
  failureReason: text('failure_reason'),
  processedAt: timestamp('processed_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  memberIdIdx: index('payments_member_id_idx').on(table.memberId),
  statusIdx: index('payments_status_idx').on(table.status),
  processedAtIdx: index('payments_processed_at_idx').on(table.processedAt),
}));

// Churn risk scores
export const churnScores = pgTable('churn_scores', {
  id: uuid('id').primaryKey().defaultRandom(),
  memberId: uuid('member_id').notNull().references(() => members.id, { onDelete: 'cascade' }),
  score: integer('score').notNull(), // 0-100
  confidenceLevel: decimal('confidence_level', { precision: 5, scale: 2 }), // 0-100
  riskFactors: jsonb('risk_factors').notNull(), // {login_frequency: 30, engagement_drop: 25, etc}
  topRiskFactor: text('top_risk_factor'),
  predictedChurnDate: timestamp('predicted_churn_date'),
  calculatedAt: timestamp('calculated_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  memberIdIdx: index('churn_scores_member_id_idx').on(table.memberId),
  scoreIdx: index('churn_scores_score_idx').on(table.score),
  calculatedAtIdx: index('churn_scores_calculated_at_idx').on(table.calculatedAt),
}));

// Engagement metrics - Daily/weekly aggregated stats
export const engagementMetrics = pgTable('engagement_metrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  memberId: uuid('member_id').notNull().references(() => members.id, { onDelete: 'cascade' }),
  date: timestamp('date').notNull(),
  period: text('period').notNull(), // daily, weekly, monthly
  loginCount: integer('login_count').notNull().default(0),
  contentViews: integer('content_views').notNull().default(0),
  messagesSent: integer('messages_sent').notNull().default(0),
  downloadsCount: integer('downloads_count').notNull().default(0),
  sessionDuration: integer('session_duration').notNull().default(0), // in seconds
  featureUsage: jsonb('feature_usage'), // {feature_name: usage_count}
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  memberIdDateIdx: index('engagement_metrics_member_date_idx').on(table.memberId, table.date),
  periodIdx: index('engagement_metrics_period_idx').on(table.period),
}));

// Creator settings
export const creatorSettings = pgTable('creator_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: text('company_id').notNull().unique(),
  whopUserId: text('whop_user_id').notNull(),
  tier: text('tier').notNull().default('free'), // free, starter, pro
  memberLimit: integer('member_limit').notNull().default(50),
  currentMemberCount: integer('current_member_count').notNull().default(0),
  webhookUrl: text('webhook_url'),
  emailNotifications: boolean('email_notifications').notNull().default(true),
  churnAlertThreshold: integer('churn_alert_threshold').notNull().default(70), // Alert when score > this
  emailPreferences: jsonb('email_preferences'), // {daily_digest: true, instant_alerts: true}
  apiKey: text('api_key'),
  whitelabelEnabled: boolean('whitelabel_enabled').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  companyIdIdx: index('creator_settings_company_id_idx').on(table.companyId),
  tierIdx: index('creator_settings_tier_idx').on(table.tier),
}));

// Interventions - Track retention efforts
export const interventions = pgTable('interventions', {
  id: uuid('id').primaryKey().defaultRandom(),
  memberId: uuid('member_id').notNull().references(() => members.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // email, message, offer, etc.
  template: text('template'),
  content: text('content'),
  sentAt: timestamp('sent_at').notNull().defaultNow(),
  openedAt: timestamp('opened_at'),
  clickedAt: timestamp('clicked_at'),
  respondedAt: timestamp('responded_at'),
  outcome: text('outcome'), // success, failed, ignored
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  memberIdIdx: index('interventions_member_id_idx').on(table.memberId),
  typeIdx: index('interventions_type_idx').on(table.type),
  sentAtIdx: index('interventions_sent_at_idx').on(table.sentAt),
}));

// Company analytics - Aggregated company-level metrics
export const companyAnalytics = pgTable('company_analytics', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: text('company_id').notNull(),
  date: timestamp('date').notNull(),
  period: text('period').notNull(), // daily, weekly, monthly
  totalMembers: integer('total_members').notNull().default(0),
  activeMembers: integer('active_members').notNull().default(0),
  newMembers: integer('new_members').notNull().default(0),
  churnedMembers: integer('churned_members').notNull().default(0),
  atRiskMembers: integer('at_risk_members').notNull().default(0),
  mrr: decimal('mrr', { precision: 10, scale: 2 }).notNull().default('0'),
  revenue: decimal('revenue', { precision: 10, scale: 2 }).notNull().default('0'),
  churnRate: decimal('churn_rate', { precision: 5, scale: 2 }), // Percentage
  retentionRate: decimal('retention_rate', { precision: 5, scale: 2 }), // Percentage
  avgEngagementScore: decimal('avg_engagement_score', { precision: 5, scale: 2 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  companyIdDateIdx: index('company_analytics_company_date_idx').on(table.companyId, table.date),
  periodIdx: index('company_analytics_period_idx').on(table.period),
}));

// Relations
export const membersRelations = relations(members, ({ many, one }) => ({
  activities: many(activities),
  payments: many(payments),
  churnScores: many(churnScores),
  engagementMetrics: many(engagementMetrics),
  interventions: many(interventions),
}));

export const activitiesRelations = relations(activities, ({ one }) => ({
  member: one(members, {
    fields: [activities.memberId],
    references: [members.id],
  }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  member: one(members, {
    fields: [payments.memberId],
    references: [members.id],
  }),
}));

export const churnScoresRelations = relations(churnScores, ({ one }) => ({
  member: one(members, {
    fields: [churnScores.memberId],
    references: [members.id],
  }),
}));

export const engagementMetricsRelations = relations(engagementMetrics, ({ one }) => ({
  member: one(members, {
    fields: [engagementMetrics.memberId],
    references: [members.id],
  }),
}));

export const interventionsRelations = relations(interventions, ({ one }) => ({
  member: one(members, {
    fields: [interventions.memberId],
    references: [members.id],
  }),
}));