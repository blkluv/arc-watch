import express from 'express';
const pricing = require('../utils/pricing');
const x402Middleware = require('../middleware/x402').createX402Middleware;
const { logTransaction, getTransactionStats } = require('../utils/transactionLogger');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ podcasts: [], message: 'Podcast list endpoint ready' });
});

router.get('/:id/segments', (req, res) => {
  const { id } = req.params;
  const duration = parseInt(req.query.duration as string) || 3600;
  const pricingDetails = pricing.calculateSegmentPricing(duration);
  
  res.json({
    podcastId: id,
    ...pricingDetails,
    note: 'Payment required before each segment via x402'
  });
});

router.get('/pricing/test', (req, res) => {
  const testCases = [
    { duration: 900, desc: '15-min podcast' },
    { duration: 1800, desc: '30-min podcast' },
    { duration: 3600, desc: '60-min podcast' },
    { duration: 7200, desc: '2-hour podcast' }
  ];
  
  const results = testCases.map((tc: any) => ({
    description: tc.desc,
    durationSeconds: tc.duration,
    ...pricing.calculateSegmentPricing(tc.duration)
  }));
  
  res.json({
    config: pricing.DEFAULT_CONFIG,
    hackathonCompliant: pricing.meetsHackathonRequirements(),
    testResults: results
  });
});

router.post('/pricing/validate', (req, res) => {
  const { balanceUSDC, podcastDurationSeconds, pricePerMinuteUSD } = req.body;
  
  if (!balanceUSDC || !podcastDurationSeconds) {
    return res.status(400).json({ error: 'balanceUSDC and podcastDurationSeconds required' });
  }
  
  const config = {
    ...pricing.DEFAULT_CONFIG,
    pricePerMinuteUSD: pricePerMinuteUSD || pricing.DEFAULT_CONFIG.pricePerMinuteUSD
  };
  
  const validation = pricing.validateBalance(balanceUSDC, podcastDurationSeconds, config);
  const pricingDetails = pricing.calculateSegmentPricing(podcastDurationSeconds, config);
  
  res.json({
    validation,
    pricing: pricingDetails,
    canStartStreaming: validation.valid,
    nextAction: validation.valid 
      ? 'Proceed to stream segment 0' 
      : `Deposit ${validation.shortfall} USDC to continue`
  });
});

// PROTECTED STREAM ENDPOINT: Requires x402 nanopayment
router.post('/:id/stream/:segment', 
  (req, res, next) => {
    const { id, segment } = req.params;
    const price = pricing.DEFAULT_CONFIG.pricePerMinuteUSD * 15;
    
    return x402Middleware({
      podcastId: id,
      segmentIndex: parseInt(segment),
      priceUSD: price.toFixed(6)
    })(req, res, next);
  },
  (req, res) => {
    const { id, segment } = req.params;
    const segmentIdx = parseInt(segment);
    
    // Fix: Cast req as any to access x402Payment
    const payment = (req as any).x402Payment;
    
    if (payment) {
      logTransaction({
        resource: id,
        segment: segmentIdx,
        amount: payment.amount
      });
    }
    
    res.json({
      podcastId: id,
      segment: segmentIdx,
      streamUrl: `https://cdn.example.com/podcasts/${id}/segment-${segmentIdx}.mp3`,
      nextSegment: segmentIdx + 1,
      nextPaymentRequired: pricing.DEFAULT_CONFIG.pricePerMinuteUSD * 15,
      paymentLogged: !!payment,
      message: 'Payment verified. Stream segment unlocked.'
    });
  }
);

// GET transaction stats (for hackathon demo)
router.get('/stats', (req, res) => {
  res.json(getTransactionStats());
});

// At bottom of file:
module.exports = router;
