// backend/src/utils/transactionLogger.ts

export interface TransactionInput {
  resource: string;
  segment: number;
  amount: string;
  payer?: string;
  recipient?: string;
  nonce?: string;
  timestamp?: string;
  signature?: string;
  chain?: string;
  circleTransferId?: string;
  status?: 'pending' | 'verified' | 'settled' | 'failed' | 'demo';
}

interface TransactionRecord extends TransactionInput {
  id: string;
  status: 'pending' | 'verified' | 'settled' | 'failed' | 'demo';
}

const transactionLog: TransactionRecord[] = [];

// ✅ EXPORTED: Named export for logTransaction
export function logTransaction(tx: TransactionInput): TransactionRecord {
  const entry: TransactionRecord = {
    id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    resource: tx.resource,
    segment: tx.segment,
    amount: tx.amount,
    timestamp: tx.timestamp || new Date().toISOString(),
    status: tx.status || 'verified',
    payer: tx.payer || 'unknown',
    recipient: tx.recipient || 'unknown',
    nonce: tx.nonce || '',
    signature: tx.signature || '',
    chain: tx.chain || 'ARC-TESTNET',
    circleTransferId: tx.circleTransferId,
  };
  
  transactionLog.push(entry);
  console.log(`💸 Transaction logged: ${entry.amount} USDC for segment ${entry.segment} (${entry.id})`);
  return entry;
}

// ✅ EXPORTED: Named export for getTransactionStats
export function getTransactionStats() {
  const settled = transactionLog.filter(tx => 
    tx.status === 'verified' || tx.status === 'settled' || tx.status === 'demo'
  );
  return {
    totalTransactions: transactionLog.length,
    totalVolumeUSD: settled.reduce((sum, tx) => sum + parseFloat(tx.amount), 0).toFixed(6),
    meetsHackathonRequirement: settled.length >= 50,
    recentTransactions: settled.slice(-10),
    note: 'Production: Replace with Prometheus/Grafana for distributed tracing.'
  };
}

export function exportTransactionCSV(): string {
  const header = 'id,resource,segment,amount,timestamp,status,payer,recipient,chain,circleTransferId\n';
  const rows = transactionLog.map(tx => 
    `${tx.id},${tx.resource},${tx.segment},${tx.amount},${tx.timestamp},${tx.status},${tx.payer},${tx.recipient},${tx.chain},${tx.circleTransferId || ''}`
  ).join('\n');
  return header + rows;
}

// ✅ EXPORTED: Default export with all functions
export default { 
  logTransaction, 
  getTransactionStats, 
  exportTransactionCSV 
};