import { type Member, type Activity, type Payment, type EngagementMetrics } from '@/lib/db/types';
import { subDays, differenceInDays } from 'date-fns';
import * as stats from 'simple-statistics';

/**
 * Risk factors and their weight in the churn score calculation
 */
const RISK_WEIGHTS = {
  loginFrequency: 0.25,      // 25% weight
  engagementDrop: 0.20,      // 20% weight
  paymentIssues: 0.20,       // 20% weight
  contentConsumption: 0.15,  // 15% weight
  sessionDuration: 0.10,     // 10% weight
  messageActivity: 0.10,     // 10% weight
} as const;

/**
 * Thresholds for determining risk levels
 */
const THRESHOLDS = {
  highRisk: 70,
  mediumRisk: 40,
  lowRisk: 20,
} as const;

export interface ChurnPredictionResult {
  memberId: string;
  churnScore: number;
  confidenceLevel: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskFactors: {
    loginFrequency: number;
    engagementDrop: number;
    paymentIssues: number;
    contentConsumption: number;
    sessionDuration: number;
    messageActivity: number;
  };
  topRiskFactor: string;
  predictedChurnDate: Date | null;
  recommendations: string[];
}

/**
 * Calculate login frequency risk score
 * Higher score = higher risk (less frequent logins)
 */
function calculateLoginFrequencyRisk(
  member: Member,
  recentActivities: Activity[]
): number {
  const now = new Date();
  const last7Days = subDays(now, 7);
  const last30Days = subDays(now, 30);

  const loginsLast7Days = recentActivities.filter(
    (a) => a.type === 'login' && a.createdAt >= last7Days
  ).length;

  const loginsLast30Days = recentActivities.filter(
    (a) => a.type === 'login' && a.createdAt >= last30Days
  ).length;

  // Calculate days since last login
  const daysSinceLastLogin = member.lastSeenAt
    ? differenceInDays(now, member.lastSeenAt)
    : 999;

  let riskScore = 0;

  // No logins in last 7 days = high risk
  if (loginsLast7Days === 0) {
    riskScore += 40;
  } else if (loginsLast7Days < 2) {
    riskScore += 20;
  }

  // Less than 4 logins in 30 days = concerning
  if (loginsLast30Days < 4) {
    riskScore += 30;
  } else if (loginsLast30Days < 8) {
    riskScore += 15;
  }

  // Days since last login penalty
  if (daysSinceLastLogin > 14) {
    riskScore += 30;
  } else if (daysSinceLastLogin > 7) {
    riskScore += 15;
  }

  return Math.min(100, riskScore);
}

/**
 * Calculate engagement drop risk score
 * Compares recent engagement to historical baseline
 */
function calculateEngagementDropRisk(
  recentMetrics: EngagementMetrics[],
  historicalMetrics: EngagementMetrics[]
): number {
  if (historicalMetrics.length < 4) {
    return 0; // Not enough data for comparison
  }

  // Calculate averages for recent period (last 2 weeks)
  const recentAvg = {
    contentViews: stats.mean(recentMetrics.map(m => m.contentViews)),
    messagesSent: stats.mean(recentMetrics.map(m => m.messagesSent)),
    sessionDuration: stats.mean(recentMetrics.map(m => m.sessionDuration)),
  };

  // Calculate historical baseline (30-60 days ago)
  const historicalAvg = {
    contentViews: stats.mean(historicalMetrics.map(m => m.contentViews)),
    messagesSent: stats.mean(historicalMetrics.map(m => m.messagesSent)),
    sessionDuration: stats.mean(historicalMetrics.map(m => m.sessionDuration)),
  };

  // Calculate percentage drops
  const contentViewDrop = ((historicalAvg.contentViews - recentAvg.contentViews) / historicalAvg.contentViews) * 100;
  const messagesDrop = ((historicalAvg.messagesSent - recentAvg.messagesSent) / historicalAvg.messagesSent) * 100;
  const sessionDrop = ((historicalAvg.sessionDuration - recentAvg.sessionDuration) / historicalAvg.sessionDuration) * 100;

  // Weight the drops
  let riskScore = 0;

  if (contentViewDrop > 50) riskScore += 35;
  else if (contentViewDrop > 30) riskScore += 20;
  else if (contentViewDrop > 15) riskScore += 10;

  if (messagesDrop > 60) riskScore += 30;
  else if (messagesDrop > 40) riskScore += 15;
  else if (messagesDrop > 20) riskScore += 8;

  if (sessionDrop > 50) riskScore += 35;
  else if (sessionDrop > 30) riskScore += 20;
  else if (sessionDrop > 15) riskScore += 10;

  return Math.min(100, riskScore);
}

/**
 * Calculate payment issues risk score
 */
function calculatePaymentIssuesRisk(
  payments: Payment[]
): number {
  if (payments.length === 0) return 50; // No payment history = moderate risk

  const recentPayments = payments.slice(0, 6); // Last 6 payments
  const failedPayments = recentPayments.filter(p => p.status === 'failed').length;
  const totalPayments = recentPayments.length;

  let riskScore = 0;

  // Calculate failure rate
  const failureRate = (failedPayments / totalPayments) * 100;

  if (failureRate > 50) {
    riskScore = 80;
  } else if (failureRate > 30) {
    riskScore = 60;
  } else if (failureRate > 10) {
    riskScore = 30;
  } else if (failureRate > 0) {
    riskScore = 15;
  }

  // Check for recent failed payment
  const mostRecentPayment = payments[0];
  if (mostRecentPayment?.status === 'failed') {
    riskScore += 20;
  }

  return Math.min(100, riskScore);
}

/**
 * Calculate content consumption risk score
 */
function calculateContentConsumptionRisk(
  recentActivities: Activity[]
): number {
  const contentViews = recentActivities.filter(a => a.type === 'content_view');
  const downloads = recentActivities.filter(a => a.type === 'download');

  const last7Days = subDays(new Date(), 7);
  const recentContentViews = contentViews.filter(a => a.createdAt >= last7Days).length;
  const recentDownloads = downloads.filter(a => a.createdAt >= last7Days).length;

  let riskScore = 0;

  // Very low content consumption
  if (recentContentViews === 0 && recentDownloads === 0) {
    riskScore = 90;
  } else if (recentContentViews < 2) {
    riskScore = 60;
  } else if (recentContentViews < 5) {
    riskScore = 30;
  }

  return Math.min(100, riskScore);
}

/**
 * Calculate session duration risk score
 */
function calculateSessionDurationRisk(
  recentMetrics: EngagementMetrics[]
): number {
  if (recentMetrics.length === 0) return 50;

  const avgSessionDuration = stats.mean(recentMetrics.map(m => m.sessionDuration));

  let riskScore = 0;

  // Session duration in seconds
  if (avgSessionDuration < 60) {
    riskScore = 80; // Less than 1 minute
  } else if (avgSessionDuration < 180) {
    riskScore = 60; // Less than 3 minutes
  } else if (avgSessionDuration < 300) {
    riskScore = 40; // Less than 5 minutes
  } else if (avgSessionDuration < 600) {
    riskScore = 20; // Less than 10 minutes
  }

  return Math.min(100, riskScore);
}

/**
 * Calculate message activity risk score
 */
function calculateMessageActivityRisk(
  recentActivities: Activity[]
): number {
  const last14Days = subDays(new Date(), 14);
  const recentMessages = recentActivities.filter(
    a => a.type === 'message' && a.createdAt >= last14Days
  ).length;

  let riskScore = 0;

  if (recentMessages === 0) {
    riskScore = 70;
  } else if (recentMessages < 3) {
    riskScore = 40;
  } else if (recentMessages < 7) {
    riskScore = 20;
  }

  return Math.min(100, riskScore);
}

/**
 * Calculate confidence level based on data availability
 */
function calculateConfidenceLevel(
  member: Member,
  activitiesCount: number,
  metricsCount: number,
  paymentsCount: number
): number {
  const daysSinceMemberJoined = differenceInDays(new Date(), member.joinedAt);
  
  let confidence = 50; // Base confidence

  // More historical data = higher confidence
  if (daysSinceMemberJoined > 60) confidence += 20;
  else if (daysSinceMemberJoined > 30) confidence += 10;

  // More activities tracked = higher confidence
  if (activitiesCount > 100) confidence += 15;
  else if (activitiesCount > 50) confidence += 10;
  else if (activitiesCount > 20) confidence += 5;

  // More engagement metrics = higher confidence
  if (metricsCount > 30) confidence += 10;
  else if (metricsCount > 14) confidence += 5;

  // Payment history improves confidence
  if (paymentsCount > 6) confidence += 5;
  else if (paymentsCount > 3) confidence += 3;

  return Math.min(100, confidence);
}

/**
 * Predict churn date based on current trajectory
 */
function predictChurnDate(churnScore: number, member: Member): Date | null {
  if (churnScore < 40) return null; // Not at risk enough to predict

  // Higher score = sooner churn
  const daysUntilChurn = Math.max(1, Math.floor(120 - (churnScore * 1.2)));
  
  return subDays(new Date(), -daysUntilChurn); // Add days to current date
}

/**
 * Generate recommendations based on risk factors
 */
function generateRecommendations(riskFactors: Record<string, number>): string[] {
  const recommendations: string[] = [];

  const sortedFactors = Object.entries(riskFactors)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3); // Top 3 risk factors

  for (const [factor, score] of sortedFactors) {
    if (score < 30) continue;

    switch (factor) {
      case 'loginFrequency':
        recommendations.push('Send re-engagement email highlighting new content');
        recommendations.push('Offer exclusive content or limited-time access');
        break;
      case 'engagementDrop':
        recommendations.push('Schedule 1-on-1 check-in call or message');
        recommendations.push('Survey member about their experience and needs');
        break;
      case 'paymentIssues':
        recommendations.push('Reach out about payment method update');
        recommendations.push('Offer payment plan or alternative billing options');
        break;
      case 'contentConsumption':
        recommendations.push('Share personalized content recommendations');
        recommendations.push('Highlight most popular or relevant content');
        break;
      case 'sessionDuration':
        recommendations.push('Improve content discoverability and navigation');
        recommendations.push('Send curated content digest emails');
        break;
      case 'messageActivity':
        recommendations.push('Invite to community events or discussions');
        recommendations.push('Encourage participation with contests or challenges');
        break;
    }
  }

  return recommendations;
}

/**
 * Main churn prediction function
 */
export async function calculateChurnScore(
  member: Member,
  recentActivities: Activity[],
  recentMetrics: EngagementMetrics[],
  historicalMetrics: EngagementMetrics[],
  payments: Payment[]
): Promise<ChurnPredictionResult> {
  // Calculate individual risk scores
  const riskFactors = {
    loginFrequency: calculateLoginFrequencyRisk(member, recentActivities),
    engagementDrop: calculateEngagementDropRisk(recentMetrics, historicalMetrics),
    paymentIssues: calculatePaymentIssuesRisk(payments),
    contentConsumption: calculateContentConsumptionRisk(recentActivities),
    sessionDuration: calculateSessionDurationRisk(recentMetrics),
    messageActivity: calculateMessageActivityRisk(recentActivities),
  };

  // Calculate weighted churn score
  const churnScore = Math.round(
    riskFactors.loginFrequency * RISK_WEIGHTS.loginFrequency +
    riskFactors.engagementDrop * RISK_WEIGHTS.engagementDrop +
    riskFactors.paymentIssues * RISK_WEIGHTS.paymentIssues +
    riskFactors.contentConsumption * RISK_WEIGHTS.contentConsumption +
    riskFactors.sessionDuration * RISK_WEIGHTS.sessionDuration +
    riskFactors.messageActivity * RISK_WEIGHTS.messageActivity
  );

  // Determine risk level
  let riskLevel: 'low' | 'medium' | 'high' | 'critical';
  if (churnScore >= THRESHOLDS.highRisk) {
    riskLevel = churnScore >= 85 ? 'critical' : 'high';
  } else if (churnScore >= THRESHOLDS.mediumRisk) {
    riskLevel = 'medium';
  } else {
    riskLevel = 'low';
  }

  // Find top risk factor
  const topRiskFactor = Object.entries(riskFactors)
    .sort(([, a], [, b]) => b - a)[0][0];

  // Calculate confidence level
  const confidenceLevel = calculateConfidenceLevel(
    member,
    recentActivities.length,
    recentMetrics.length + historicalMetrics.length,
    payments.length
  );

  // Predict churn date
  const predictedChurnDate = predictChurnDate(churnScore, member);

  // Generate recommendations
  const recommendations = generateRecommendations(riskFactors);

  return {
    memberId: member.id,
    churnScore,
    confidenceLevel,
    riskLevel,
    riskFactors,
    topRiskFactor,
    predictedChurnDate,
    recommendations,
  };
}