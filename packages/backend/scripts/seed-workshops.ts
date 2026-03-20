/**
 * Seed DynamoDB Workshops table with official AWS workshops.
 * Run with: npx ts-node-dev --transpile-only scripts/seed-workshops.ts
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { workshops } from './workshop-data';
import { workshops2 } from './workshop-data-2';
import { workshops3 } from './workshop-data-3';

const allWorkshops = [...workshops, ...workshops2, ...workshops3];

const region = process.env.AWS_REGION || 'us-east-1';
const prefix = process.env.TABLE_PREFIX || '';
const TABLE = prefix + 'Workshops';
const raw = new DynamoDBClient({ region });
const ddb = DynamoDBDocumentClient.from(raw, { marshallOptions: { removeUndefinedValues: true } });

function analysis(resources: any[], hiddenCosts: any[] = [], warnings: any[] = []) {
  const hourly = resources.reduce((s: number, r: any) => s + r.pricing.hourlyRate, 0);
  return {
    totalCosts: {
      hourlyRate: +hourly.toFixed(4), dailyCost: +(hourly * 24).toFixed(2), monthlyCost: +(hourly * 730).toFixed(2),
      scenarios: [
        { name: 'If deleted after workshop', totalCost: +(hourly * 3).toFixed(2), description: 'Cost if deleted after ~3 hours' },
        { name: 'If left running 1 day', totalCost: +(hourly * 24).toFixed(2), description: 'Cost if left running 24 hours' },
        { name: 'If left running 1 month', totalCost: +(hourly * 730).toFixed(2), description: 'Cost if left running a full month' },
      ],
    },
    resources, hiddenCosts, freeTierEligible: resources.every((r: any) => r.freeTierEligible), warnings, generatedAt: new Date().toISOString(),
  };
}

(async () => {
  console.log('Seeding ' + allWorkshops.length + ' workshops into "' + TABLE + '"...');
  let count = 0;
  for (const w of allWorkshops) {
    const r = w.resources || [];
    const ca = analysis(r,
      r.filter((x: any) => x.resourceType === 'AWS::EC2::NatGateway').map((x: any) => ({ resource: x, reason: 'NAT Gateway 0.045/hr idle', impact: x.pricing.monthlyCost, severity: 'high' })),
      [...r.filter((x: any) => x.resourceType === 'AWS::EC2::NatGateway').map((x: any) => ({ message: 'NAT Gateway (' + x.resourceId + ') 0.045/hr idle', affectedResources: [x.resourceId], severity: 'warning' })),
       ...r.filter((x: any) => x.resourceType === 'AWS::ElasticLoadBalancingV2::LoadBalancer').map((x: any) => ({ message: 'LB (' + x.resourceId + ') ~0.0225/hr idle', affectedResources: [x.resourceId], severity: 'info' }))]
    );
    await ddb.send(new PutCommand({ TableName: TABLE, Item: {
      workshopId: w.workshopId, title: w.title, description: w.description, category: w.category,
      difficulty: w.difficulty, estimatedDuration: w.estimatedDuration, costBadge: w.costBadge,
      lastUpdated: new Date().toISOString(), resources: JSON.stringify(r), costAnalysis: JSON.stringify(ca),
      instructions: w.instructions, sourceUrl: w.sourceUrl || '', lastAnalyzed: new Date().toISOString(),
      popularity: Math.floor(Math.random() * 500) + 50,
    }}));
    count++;
    process.stdout.write('\r  ' + count + '/' + allWorkshops.length);
  }
  console.log('\nDone! Seeded ' + count + ' workshops.');
})();
