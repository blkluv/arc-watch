// backend/src/routes/auth.ts
import express, { Request, Response } from 'express';
import { generateAuthNonce, authenticateAndLink } from '../services/authService.js';
import { getAddress } from 'viem';

const router = express.Router();

router.get('/nonce', (req: Request, res: Response) => {
  const { address } = req.query;
  if (!address || typeof address !== 'string') {
    return res.status(400).json({ error: 'Missing address' });
  }
  try {
    const checksummed = getAddress(address);
    const nonce = generateAuthNonce(checksummed);
    console.log(`📝 Nonce generated for ${checksummed}: ${nonce}`);
    res.json({ success: true, data: { nonce, address: checksummed } });
  } catch (err: any) {
    console.error('Nonce error:', err);
    res.status(400).json({ error: 'Invalid address format' });
  }
});

router.post('/link', async (req: Request, res: Response) => {
  console.log('🔗 /link called with body:', {
    address: req.body.address,
    signature: req.body.signature ? 'present' : 'missing',
    nonce: req.body.nonce,
    message: req.body.message ? 'present' : 'missing',
  });
  
  try {
    const { address, signature, nonce, message } = req.body; 
    if (!address || !signature || !nonce || !message) {
      console.error('❌ Missing required fields');
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await authenticateAndLink(address, signature, nonce, message);
    console.log('✅ /link success:', result);
    res.json({ success: true, data: result });
  } catch (err: any) {
    console.error('❌ Auth Link Error:', err.message);
    console.error('Stack:', err.stack);
    res.status(401).json({ error: err.message || 'Authentication failed' });
  }
});

export default router;